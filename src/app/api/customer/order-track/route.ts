import { NextResponse } from 'next/server';
import { db, designsDb } from '@/lib/storage';
import { Order, OrderStatus } from '@/types';
import { roundCurrency } from '@/lib/utils';

const STATUS_LABELS: Record<OrderStatus, string> = {
    pending: 'Order received',
    approved: 'Approved',
    supplier_ordered: 'In production',
    supplier_delivered: 'Ready for delivery',
    customer_delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

const STATUS_ORDER: OrderStatus[] = [
    'pending',
    'approved',
    'supplier_ordered',
    'supplier_delivered',
    'customer_delivered',
    'completed',
];

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

function buildProgress(status: OrderStatus, requiresDesign: boolean) {
    if (status === 'cancelled') {
        return [
            { key: 'received', label: 'Order received', done: true, current: false },
            { key: 'cancelled', label: 'Cancelled', done: false, current: true },
        ];
    }

    const currentIndex = Math.max(0, STATUS_ORDER.indexOf(status));

    return STATUS_ORDER.map((stepStatus, index) => {
        const isDesignStep = stepStatus === 'supplier_ordered' && requiresDesign;
        return {
            key: stepStatus,
            label: isDesignStep ? 'Design / production' : STATUS_LABELS[stepStatus],
            done: index < currentIndex || status === 'completed',
            current: index === currentIndex && status !== 'completed',
        };
    });
}

function getLatestPaymentConfirmation(notes?: string) {
    if (!notes) return '';
    const lines = notes.split('\n').filter(line => line.includes('[Payment confirmation'));
    return lines[lines.length - 1] || '';
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as { orderNumber?: string; phone?: string } | null;
        const orderNumber = body?.orderNumber?.trim() || '';
        const phone = body?.phone?.trim() || '';

        if (!orderNumber || !phone) {
            return NextResponse.json({ message: 'Order number and phone number are required.' }, { status: 400 });
        }

        if (digitsOnly(phone).length < 6) {
            return NextResponse.json({ message: 'Enter at least the last 6 digits of the phone number.' }, { status: 400 });
        }

        const [orders, parties, designs] = await Promise.all([
            db.orders.getAll(),
            db.parties.getAll(),
            designsDb.getAll(),
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

        const orderDesigns = designs.filter(design => design.orderId === order.id);
        const totalSqft = order.items.reduce((sum, item) => sum + (Number(item.sqft) || 0), 0);
        const deliveredToCustomer = Number(order.deliveredToCustomer || 0);
        const deliveredToUs = Number(order.deliveredToUs || 0);
        const paymentConfirmation = getLatestPaymentConfirmation(order.notes);

        return NextResponse.json({
            found: true,
            order: {
                number: order.number,
                generalNumber: order.generalNumber || null,
                date: order.date,
                expectedDelivery: order.deliveryDate || null,
                status: order.status,
                statusLabel: STATUS_LABELS[order.status],
                paymentStatus: order.paymentStatus || 'unpaid',
                paymentConfirmationSubmitted: Boolean(paymentConfirmation),
                paymentConfirmationText: paymentConfirmation.replace(/^\[Payment confirmation[^\]]*\]\s*/, ''),
                total: roundCurrency(order.total || 0),
                paidAmount: roundCurrency(order.paidAmount || 0),
                balanceAmount: roundCurrency(Math.max(0, (order.total || 0) - (order.paidAmount || 0))),
                itemCount: order.items.length,
                items: order.items.map(item => ({
                    name: item.itemName || item.description || 'Order item',
                    description: item.description || '',
                    quantity: roundCurrency(Number(item.quantity) || 0),
                    unit: item.unit || 'nos',
                    pieceCount: item.pieceCount ?? null,
                    sqft: roundCurrency(Number(item.sqft) || 0),
                    rate: roundCurrency(Number(item.rate) || 0),
                    amount: roundCurrency(Number(item.lineTotal || item.amount) || 0),
                    width: roundCurrency(Number(item.width) || 0),
                    height: roundCurrency(Number(item.height) || 0),
                })),
                totalSqft: roundCurrency(totalSqft),
                deliveredToUs: roundCurrency(deliveredToUs),
                deliveredToCustomer: roundCurrency(deliveredToCustomer),
                supplierDeliveryDate: order.supplierDeliveryDate || null,
                customerDeliveryDate: order.customerDeliveryDate || null,
                customerName: order.partyName,
                requiresDesign: Boolean(order.requiresDesign || orderDesigns.length > 0),
                designCount: orderDesigns.length,
                designStatus: orderDesigns[0]?.status || null,
                progress: buildProgress(order.status, Boolean(order.requiresDesign || orderDesigns.length > 0)),
            },
        });
    } catch (error) {
        console.error('Order tracking lookup failed:', error);
        return NextResponse.json({ message: 'Could not check this order right now.' }, { status: 500 });
    }
}
