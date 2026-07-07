import { NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { convertQuantityForItemUnit } from '@/lib/units';
import { roundCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const RESERVING_ORDER_STATUSES = new Set(['pending', 'confirmed', 'processing', 'in_progress', 'supplier_delivered']);

const isOnlineCustomerOrder = (notes?: string) => {
    const normalizedNotes = (notes || '').toLowerCase();
    return normalizedNotes.includes('source: online shop') || normalizedNotes.includes('order type: customer checkout');
};

export async function GET() {
    try {
        const [items, reservationResult] = await Promise.all([
            db.items.getShopProducts(300),
            supabase
                .from('orders')
                .select('status, notes, items')
                .eq('type', 'sale_order')
                .is('invoice_id', null)
                .in('status', Array.from(RESERVING_ORDER_STATUSES)),
        ]);
        const itemById = new Map(items.map(item => [item.id, item]));
        const reservedByItemId = new Map<string, number>();

        if (reservationResult.error) {
            console.error('Could not load pending online reservations:', reservationResult.error);
        }

        (reservationResult.data || [])
            .filter(order => isOnlineCustomerOrder(order.notes))
            .forEach(order => {
                (order.items || []).forEach((line: any) => {
                    const item = itemById.get(line.itemId);
                    if (!item) return;

                    const reservedQuantity = convertQuantityForItemUnit({
                        quantity: Number(line.quantity) || 0,
                        fromUnit: line.unit,
                        toUnit: item.unit || line.unit,
                        width: line.width || item.width || 0,
                        height: line.height || item.height || 0,
                        conversionFactor: item.conversionFactor,
                    });

                    if (!Number.isFinite(reservedQuantity) || reservedQuantity <= 0) return;
                    reservedByItemId.set(item.id, roundCurrency((reservedByItemId.get(item.id) || 0) + reservedQuantity));
                });
            });

        const reservedItems = items.map(item => {
            const physicalStock = Number(item.stock) || 0;
            const reservedStock = roundCurrency(reservedByItemId.get(item.id) || 0);
            const availableStock = roundCurrency(Math.max(0, physicalStock - reservedStock));
            return {
                ...item,
                stock: availableStock,
                physicalStock,
                reservedStock,
                availableStock,
            };
        });

        return NextResponse.json({ items: reservedItems }, {
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            },
        });
    } catch (error) {
        console.error('Could not load shop products:', error);
        return NextResponse.json(
            { items: [], error: 'Could not load shop products' },
            { status: 500 },
        );
    }
}
