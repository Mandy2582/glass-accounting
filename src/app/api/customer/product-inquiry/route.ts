import { NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { generateUUID, roundCurrency } from '@/lib/utils';
import { Order, Party } from '@/types';

type ProductInquiryBody = {
    itemId?: string;
    name?: string;
    phone?: string;
    email?: string;
    message?: string;
    preferredContact?: string;
};

function clean(value: unknown): string {
    return String(value || '').trim();
}

function phoneDigits(value: string): string {
    return value.replace(/\D/g, '');
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

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as ProductInquiryBody | null;
        const itemId = clean(body?.itemId);
        const name = clean(body?.name);
        const phone = clean(body?.phone);
        const email = clean(body?.email);
        const message = clean(body?.message);
        const preferredContact = clean(body?.preferredContact) || 'Phone call';

        if (!itemId || !name || !phone) {
            return NextResponse.json({ message: 'Product, name and phone number are required.' }, { status: 400 });
        }

        if (phoneDigits(phone).length < 10) {
            return NextResponse.json({ message: 'Please enter a valid phone number.' }, { status: 400 });
        }

        const [items, parties] = await Promise.all([
            db.items.getAll(),
            db.parties.getAll(),
        ]);

        const item = items.find(candidate => candidate.id === itemId);
        if (!item) {
            return NextResponse.json({ message: 'This product is no longer available.' }, { status: 404 });
        }

        let customer = findCustomerByPhone(parties, phone);
        if (!customer) {
            customer = {
                id: generateUUID(),
                name,
                type: 'customer',
                phone,
                email: email || undefined,
                address: '',
                balance: 0,
            };
            await db.parties.add(customer);
        } else {
            customer = {
                ...customer,
                name: name || customer.name,
                phone: phone || customer.phone,
                email: email || customer.email,
            };
            await db.parties.update(customer);
        }

        const [orderNumber, generalNumber] = await Promise.all([
            db.orders.generateNextOrderNumber('sale_order', customer.name),
            db.orders.generateNextGeneralNumber(),
        ]);
        const today = new Date().toISOString().split('T')[0];
        const unit = item.rateUnit || item.unit || (item.category === 'hardware' ? 'nos' : 'sqft');

        const order: Order = {
            id: generateUUID(),
            type: 'sale_order',
            number: orderNumber,
            generalNumber,
            soNumber: orderNumber,
            date: today,
            partyId: customer.id,
            partyName: customer.name,
            items: [{
                id: generateUUID(),
                itemId: item.id,
                itemName: `Product enquiry - ${item.name}`,
                description: [
                    `Customer asked about catalogue product: ${item.name}`,
                    item.make ? `Make: ${item.make}` : '',
                    item.model ? `Model: ${item.model}` : '',
                    item.type ? `Type: ${item.type}` : '',
                    item.thickness ? `Thickness: ${item.thickness}mm` : '',
                    item.width && item.height ? `Size: ${item.width}" x ${item.height}"` : '',
                    `Listed rate: ${roundCurrency(item.rate)} per ${unit}`,
                ].filter(Boolean).join(' | '),
                make: item.make,
                model: item.model,
                type: item.category === 'hardware' ? 'Hardware' : item.type,
                warehouse: 'Warehouse A',
                width: item.width || 0,
                height: item.height || 0,
                quantity: 1,
                unit,
                sqft: 0,
                rate: roundCurrency(item.rate || 0),
                amount: 0,
                lineTotal: 0,
                sourceType: 'text',
            }],
            subtotal: 0,
            taxRate: 18,
            taxAmount: 0,
            total: 0,
            status: 'pending',
            notes: [
                'Online product enquiry',
                `Phone: ${phone}`,
                email ? `Email: ${email}` : '',
                `Preferred contact: ${preferredContact}`,
                message ? `Customer message: ${message}` : '',
                'This is an enquiry only. Confirm stock, final rate, size, hardware and delivery before converting to a billable order.',
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
            message: 'Product enquiry submitted.',
        });
    } catch (error) {
        console.error('Product enquiry failed:', error);
        return NextResponse.json({ message: 'Could not submit product enquiry right now.' }, { status: 500 });
    }
}
