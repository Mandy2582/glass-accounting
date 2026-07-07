import { NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { Order } from '@/types';

type PaymentReferenceBody = {
    orderNumber?: string;
    phone?: string;
    reference?: string;
};

function normalizeText(value: unknown): string {
    return String(value || '').trim().toUpperCase();
}

function digitsOnly(value: unknown): string {
    return String(value || '').replace(/\D/g, '');
}

function isPhoneMatch(inputPhone: string, partyPhone: string): boolean {
    const inputDigits = digitsOnly(inputPhone);
    const partyDigits = digitsOnly(partyPhone);

    if (inputDigits.length < 6 || partyDigits.length < 6) return false;

    return partyDigits.endsWith(inputDigits) || inputDigits.endsWith(partyDigits.slice(-10));
}

function matchesOrderNumber(order: Order, orderNumber: string): boolean {
    const normalized = normalizeText(orderNumber);
    const possibleNumbers = [
        order.number,
        order.soNumber,
        order.generalNumber,
    ].map(normalizeText);

    return possibleNumbers.some(value => value === normalized);
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as PaymentReferenceBody | null;
        const orderNumber = String(body?.orderNumber || '').trim();
        const phone = String(body?.phone || '').trim();
        const reference = String(body?.reference || '').trim();

        if (!orderNumber || !phone || !reference) {
            return NextResponse.json({ message: 'Order number, phone number and payment reference are required.' }, { status: 400 });
        }

        if (digitsOnly(phone).length < 6) {
            return NextResponse.json({ message: 'Enter at least the last 6 digits of the phone number.' }, { status: 400 });
        }

        if (reference.length < 4) {
            return NextResponse.json({ message: 'Please enter a valid payment reference / UTR.' }, { status: 400 });
        }

        const [orders, parties] = await Promise.all([
            db.orders.getAll(),
            db.parties.getAll(),
        ]);

        const order = orders.find(candidate => (
            candidate.type === 'sale_order' && matchesOrderNumber(candidate, orderNumber)
        ));

        if (!order) {
            return NextResponse.json({ found: false, message: 'No customer order was found for this order number.' }, { status: 404 });
        }

        const party = parties.find(candidate => candidate.id === order.partyId);
        const knownPhone = party?.phone || '';

        if (!isPhoneMatch(phone, knownPhone)) {
            return NextResponse.json({ found: false, message: 'The phone number does not match this order.' }, { status: 404 });
        }

        if ((order.paymentStatus || 'unpaid') === 'paid') {
            return NextResponse.json({ message: 'This order is already marked paid.' }, { status: 400 });
        }

        const timestamp = new Date().toLocaleString('en-IN');
        const safeReference = reference.replace(/\s+/g, ' ').slice(0, 240);
        const existingNotes = order.notes || '';
        if (existingNotes.toLowerCase().includes(safeReference.toLowerCase())) {
            return NextResponse.json({
                success: true,
                message: 'This payment reference is already submitted for verification.',
            });
        }

        const updatedOrder: Order = {
            ...order,
            notes: [
                existingNotes,
                `[Payment confirmation - ${timestamp}] ${safeReference}`,
            ].filter(Boolean).join('\n'),
        };

        await db.orders.update(updatedOrder);

        return NextResponse.json({
            success: true,
            message: 'Payment reference submitted for verification.',
        });
    } catch (error) {
        console.error('Payment reference submission failed:', error);
        return NextResponse.json({ message: 'Could not submit payment reference right now.' }, { status: 500 });
    }
}
