import { supabase } from '@/lib/supabase';
import { convertQuantityForItemUnit } from '@/lib/units';
import { roundCurrency } from '@/lib/utils';
import { GlassItem, Unit } from '@/types';

// Any open sale_order -- regardless of source (shop checkout, WhatsApp,
// email intake, or manual staff entry) -- represents real committed demand
// against physical stock, so all of them count as a soft reservation until
// invoiced/cancelled. This is intentionally source-agnostic: an order placed
// via WhatsApp should reduce what the shop shows as available just as much
// as one placed through the cart, or two channels can both "sell" the same
// last sheet.
const RESERVING_ORDER_STATUSES = ['pending', 'approved', 'confirmed', 'processing', 'in_progress', 'supplier_delivered'];

/**
 * Sums quantity reserved per item across all open, not-yet-invoiced sale
 * orders, converted into each item's own stock unit.
 */
export async function getReservedQuantities(items: GlassItem[]): Promise<Map<string, number>> {
    const itemById = new Map(items.map(item => [item.id, item]));
    const reservedByItemId = new Map<string, number>();

    const { data, error } = await supabase
        .from('orders')
        .select('status, items')
        .eq('type', 'sale_order')
        .is('invoice_id', null)
        .in('status', RESERVING_ORDER_STATUSES);

    if (error) {
        console.error('Could not load pending order reservations:', error);
        return reservedByItemId;
    }

    (data || []).forEach(order => {
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

    return reservedByItemId;
}

/**
 * Returns items with .stock replaced by (physical - reserved), plus
 * .physicalStock/.reservedStock/.availableStock for callers that want the
 * breakdown. Used by both the shop's product listing and order-intake
 * validation so every channel sees the same "actually available" number.
 */
export async function withAvailableStock(items: GlassItem[]): Promise<GlassItem[]> {
    const reservedByItemId = await getReservedQuantities(items);

    return items.map(item => {
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
}

/**
 * Checks a requested quantity against an item's stock that already has
 * .stock adjusted for other open orders (i.e. an item returned from
 * withAvailableStock). Used by order-intake channels (WhatsApp, email) to
 * hold a line for staff review instead of silently creating an oversold
 * order when the automated request exceeds what's actually available.
 */
export function hasSufficientAvailableStock(item: GlassItem, quantity: number, unit: Unit): boolean {
    const available = Number(item.stock) || 0;
    const requestedInStockUnit = convertQuantityForItemUnit({
        quantity,
        fromUnit: unit,
        toUnit: item.unit || unit,
        width: item.width || 0,
        height: item.height || 0,
        conversionFactor: item.conversionFactor,
    });

    return requestedInStockUnit <= available + 0.0001;
}
