import { NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { generateUUID } from '@/lib/utils';
import { Order, Party } from '@/types';

type MeasurementRequestBody = {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    projectType?: string;
    preferredDate?: string;
    preferredTime?: string;
    approximateSize?: string;
    message?: string;
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

function getSafeAttachments(attachments: MeasurementRequestBody['attachments']) {
    return (attachments || [])
        .filter(file => (
            clean(file.name) &&
            clean(file.type).startsWith('image/') &&
            clean(file.dataUrl).startsWith('data:image/') &&
            Number(file.size || 0) <= 700 * 1024
        ))
        .slice(0, 3)
        .map(file => ({
            name: clean(file.name).replace(/[\[\]]/g, '').slice(0, 120),
            size: Number(file.size || 0),
            type: clean(file.type).slice(0, 80),
            dataUrl: clean(file.dataUrl),
        }));
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as MeasurementRequestBody | null;
        const name = clean(body?.name);
        const phone = clean(body?.phone);
        const email = clean(body?.email);
        const address = clean(body?.address);
        const projectType = clean(body?.projectType) || 'Site measurement';
        const preferredDate = clean(body?.preferredDate);
        const preferredTime = clean(body?.preferredTime);
        const approximateSize = clean(body?.approximateSize);
        const message = clean(body?.message);
        const attachments = getSafeAttachments(body?.attachments);

        if (!name || !phone || !address) {
            return NextResponse.json({ message: 'Name, phone number and site address are required.' }, { status: 400 });
        }

        if (phoneDigits(phone).length < 10) {
            return NextResponse.json({ message: 'Please enter a valid phone number.' }, { status: 400 });
        }

        const parties = await db.parties.getAll();
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
            const shouldUpdate = (
                customer.name !== name ||
                customer.address !== address ||
                (email && customer.email !== email)
            );

            if (shouldUpdate) {
                customer = {
                    ...customer,
                    name: name || customer.name,
                    address: address || customer.address,
                    email: email || customer.email,
                };
                await db.parties.update(customer);
            }
        }

        const [orderNumber, generalNumber] = await Promise.all([
            db.orders.generateNextOrderNumber('sale_order'),
            db.orders.generateNextGeneralNumber(),
        ]);
        const today = new Date().toISOString().split('T')[0];

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
                itemId: 'site-measurement-request',
                itemName: `Site measurement - ${projectType}`,
                description: [
                    `Project type: ${projectType}`,
                    approximateSize ? `Approx size: ${approximateSize}` : '',
                    preferredDate ? `Preferred date: ${preferredDate}` : '',
                    preferredTime ? `Preferred time: ${preferredTime}` : '',
                    message ? `Details: ${message}` : '',
                ].filter(Boolean).join(' | '),
                width: 0,
                height: 0,
                quantity: 1,
                unit: 'nos',
                sqft: 0,
                rate: 0,
                amount: 0,
                lineTotal: 0,
                sourceType: 'text',
            }],
            subtotal: 0,
            taxRate: 18,
            taxAmount: 0,
            total: 0,
            status: 'pending',
            requiresDesign: false,
            notes: [
                'Online site measurement request',
                `Phone: ${phone}`,
                email ? `Email: ${email}` : '',
                `Site address: ${address}`,
                preferredDate || preferredTime ? `Preferred slot: ${[preferredDate, preferredTime].filter(Boolean).join(' ')}` : '',
                attachments.length ? `[CUSTOMER_ATTACHMENTS:${JSON.stringify(attachments)}]` : '',
            ].filter(Boolean).join('\n'),
            paidAmount: 0,
            paymentStatus: 'unpaid',
        };

        await db.orders.add(order);

        return NextResponse.json({
            success: true,
            orderNumber,
            generalNumber,
            message: 'Site measurement request submitted.',
        });
    } catch (error) {
        console.error('Site measurement request failed:', error);
        return NextResponse.json({ message: 'Could not submit the measurement request right now.' }, { status: 500 });
    }
}
