import { NextResponse } from 'next/server';
import { calculateCost, roundToNextEvenInch } from '@/lib/designCalculations';
import { db } from '@/lib/storage';
import { generateUUID, roundCurrency } from '@/lib/utils';
import { Order, Party } from '@/types';

type CustomQuoteBody = {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    projectType?: string;
    width?: number;
    height?: number;
    unit?: 'inch' | 'ft' | 'mm' | 'cm' | 'm';
    thickness?: number;
    quantity?: number;
    holes?: number;
    cuts?: number;
    finish?: string;
    edgeWork?: string;
    preferredDate?: string;
    notes?: string;
    attachments?: Array<{
        name?: string;
        size?: number;
        type?: string;
        dataUrl?: string;
    }>;
};

function clean(value: unknown): string {
    return String(value || '').trim();
}

function toNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function phoneDigits(value: string): string {
    return value.replace(/\D/g, '');
}

function dimensionToInches(value: number, unit: CustomQuoteBody['unit']) {
    if (unit === 'ft') return value * 12;
    if (unit === 'mm') return value / 25.4;
    if (unit === 'cm') return value / 2.54;
    if (unit === 'm') return value * 39.37007874;
    return value;
}

function findCustomerByPhone(parties: Party[], phone: string) {
    const digits = phoneDigits(phone);
    if (digits.length < 6) return null;

    return parties.find(party => {
        const partyDigits = phoneDigits(party.phone);
        return party.type === 'customer' && partyDigits.length >= 6 && (
            partyDigits.endsWith(digits) || digits.endsWith(partyDigits.slice(-10))
        );
    }) || null;
}

function getSafeAttachments(attachments: CustomQuoteBody['attachments']) {
    return (attachments || [])
        .filter(file => (
            clean(file.name) &&
            clean(file.type).startsWith('image/') &&
            clean(file.dataUrl).startsWith('data:image/') &&
            Number(file.size || 0) <= 700 * 1024
        ))
        .slice(0, 4)
        .map(file => ({
            name: clean(file.name).replace(/[\[\]]/g, '').slice(0, 120),
            size: Number(file.size || 0),
            type: clean(file.type).slice(0, 80),
            dataUrl: clean(file.dataUrl),
        }));
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as CustomQuoteBody | null;
        const name = clean(body?.name);
        const phone = clean(body?.phone);
        const email = clean(body?.email);
        const address = clean(body?.address);
        const projectType = clean(body?.projectType) || 'Custom glass';
        const unit = body?.unit || 'inch';
        const width = toNumber(body?.width);
        const height = toNumber(body?.height);
        const thickness = toNumber(body?.thickness, 10);
        const quantity = Math.max(1, Math.floor(toNumber(body?.quantity, 1)));
        const holes = Math.max(0, Math.floor(toNumber(body?.holes, 0)));
        const cuts = Math.max(0, Math.floor(toNumber(body?.cuts, 0)));
        const finish = clean(body?.finish) || 'Clear';
        const edgeWork = clean(body?.edgeWork) || 'Standard edge';
        const preferredDate = clean(body?.preferredDate);
        const notes = clean(body?.notes);
        const attachments = getSafeAttachments(body?.attachments);

        if (!name || !phone || !address) {
            return NextResponse.json({ message: 'Name, phone number and address are required.' }, { status: 400 });
        }

        if (phoneDigits(phone).length < 10) {
            return NextResponse.json({ message: 'Please enter a valid phone number.' }, { status: 400 });
        }

        if (width <= 0 || height <= 0 || thickness <= 0) {
            return NextResponse.json({ message: 'Width, height and thickness must be valid.' }, { status: 400 });
        }

        const widthInches = dimensionToInches(width, unit);
        const heightInches = dimensionToInches(height, unit);
        const billedWidthInches = roundToNextEvenInch(widthInches);
        const billedHeightInches = roundToNextEvenInch(heightInches);
        const areaSqft = roundCurrency((billedWidthInches * billedHeightInches / 144) * quantity);

        const [pricing, thicknessPricing, parties] = await Promise.all([
            db.settings.getPricing(),
            db.settings.getThicknessPricing(),
            db.parties.getAll(),
        ]);

        const cost = calculateCost(areaSqft, holes * quantity, cuts * quantity, 'simple', thickness, {
            ...pricing,
            thicknessPricing,
        }, false);

        let customer = findCustomerByPhone(parties, phone);
        if (!customer) {
            customer = {
                id: generateUUID(),
                name,
                type: 'customer',
                phone,
                address,
                balance: 0,
                email: email || undefined,
            };
            await db.parties.add(customer);
        } else {
            customer = {
                ...customer,
                name: name || customer.name,
                phone: phone || customer.phone,
                address: address || customer.address,
                email: email || customer.email,
            };
            await db.parties.update(customer);
        }

        const [orderNumber, generalNumber] = await Promise.all([
            db.orders.generateNextOrderNumber('sale_order', customer.name),
            db.orders.generateNextGeneralNumber(),
        ]);
        const today = new Date().toISOString().split('T')[0];
        const total = roundCurrency(cost.total);

        const order: Order = {
            id: generateUUID(),
            type: 'sale_order',
            number: orderNumber,
            generalNumber,
            soNumber: orderNumber,
            date: today,
            deliveryDate: preferredDate || undefined,
            partyId: customer.id,
            partyName: customer.name,
            items: [{
                id: generateUUID(),
                itemId: 'online-custom-glass-quote',
                itemName: `${projectType} - ${thickness}mm ${finish}`,
                description: [
                    `Entered size: ${width} x ${height} ${unit}`,
                    `Billed size: ${billedWidthInches}" x ${billedHeightInches}"`,
                    `Quantity: ${quantity}`,
                    `Area: ${areaSqft.toFixed(2)} sqft`,
                    `Finish: ${finish}`,
                    `Edge work: ${edgeWork}`,
                    `Holes: ${holes} per piece`,
                    `Cuts: ${cuts} per piece`,
                    `Rate: ${roundCurrency(cost.thicknessRate)} per sqft`,
                ].join(' | '),
                width: billedWidthInches,
                height: billedHeightInches,
                quantity: areaSqft,
                unit: 'sqft',
                sqft: areaSqft,
                rate: roundCurrency(cost.thicknessRate),
                amount: total,
                lineTotal: total,
                sourceType: 'text',
            }],
            subtotal: total,
            taxRate: 18,
            taxAmount: 0,
            total,
            status: 'pending',
            requiresDesign: true,
            notes: [
                'Online custom glass quote request',
                `Phone: ${phone}`,
                email ? `Email: ${email}` : '',
                `Site address: ${address}`,
                preferredDate ? `Preferred date: ${preferredDate}` : '',
                notes ? `Customer note: ${notes}` : '',
                attachments.length ? `[CUSTOMER_ATTACHMENTS:${JSON.stringify(attachments)}]` : '',
            ].filter(Boolean).join('\n'),
            paidAmount: 0,
            paymentStatus: 'unpaid',
        };

        await db.orders.add(order);

        return NextResponse.json({
            success: true,
            orderId: order.id,
            orderNumber,
            generalNumber,
            total,
            areaSqft,
            message: 'Custom glass quote request submitted.',
        });
    } catch (error) {
        console.error('Custom glass quote request failed:', error);
        return NextResponse.json({ message: 'Could not submit custom quote request right now.' }, { status: 500 });
    }
}
