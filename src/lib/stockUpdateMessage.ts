import type { GlassItem } from '@/types';
import { matchGlassGroup, matchHardwareItem, extractTrailingNumber, extractSizeMatch, sizeMatchesItem, sizeLabel } from '@/lib/catalogMatch';
import { extractUnit } from '@/lib/whatsappOrders';
import { convertQuantityForItemUnit } from '@/lib/units';

// Lets an authorized WhatsApp number correct a stock count in one message,
// e.g. "STOCK 12mm Saint Gobain Clear 4x6ft 50" for glass (unlike a rate,
// stock is per exact sheet size, so the message must narrow the make+
// thickness+colour group down to one size), or "STOCK Ozone Top Patch
// Fitting 40" for hardware. This is a plain correction (e.g. after a
// physical stock count) -- for a real purchase received from a supplier,
// use the PURCHASE command instead, which also updates cost accounting.
//
// The number in the message is a count of whatever unit staff actually
// mean by it -- almost always sheets for glass, not the item's own
// internal stock-tracking unit (sqft). Defaulting to the raw number here
// previously set stock directly in sqft terms whenever no unit was named,
// silently shrinking it by roughly the sheet's own area (a 4x6ft sheet is
// 24 sqft, so "50" meant as 50 sheets became 50 sqft instead -- about 2
// sheets). extractUnit already defaults to 'sheets' for a glass
// line with a WxH size and no other unit keyword, matching how staff
// actually write these messages; convertQuantityForItemUnit then converts
// that into the item's own stock unit before it's ever stored.

export type StockUpdateResult =
    | { ok: true; item: GlassItem; label: string; inputQuantity: number; inputUnit: string; stock: number }
    | { ok: false; reason: string };

export function parseAndApplyStockUpdate(text: string, catalogItems: GlassItem[]): StockUpdateResult {
    const trimmed = (text || '').trim();
    if (!trimmed) return { ok: false, reason: 'Empty message.' };

    const hasThickness = /\d+(?:\.\d+)?\s*mm\b/i.test(trimmed);

    if (hasThickness) {
        const glassItems = catalogItems.filter(item => (item.category || 'glass') === 'glass');
        const groupResult = matchGlassGroup(trimmed, glassItems);
        if (!groupResult.ok) return groupResult;

        const sizeMatch = extractSizeMatch(trimmed);
        if (!sizeMatch) {
            return {
                ok: false,
                reason: `Stock updates need an exact size (e.g. "4x6ft") since stock is tracked per size. Sizes for ${groupResult.makes.join('/')} ${groupResult.descriptor} ${groupResult.thickness}mm: ${groupResult.matched.map(sizeLabel).join(', ')}.`,
            };
        }
        const sized = groupResult.matched.filter(item => sizeMatchesItem(sizeMatch.dims, item));
        if (sized.length !== 1) {
            return {
                ok: false,
                reason: sized.length === 0
                    ? `No ${groupResult.makes.join('/')} ${groupResult.descriptor} ${groupResult.thickness}mm item at that size. Sizes available: ${groupResult.matched.map(sizeLabel).join(', ')}.`
                    : `More than one size matched -- say which one. Options: ${sized.map(sizeLabel).join(', ')}.`,
            };
        }

        const item = sized[0];
        const inputQuantity = extractTrailingNumber(trimmed, [groupResult.thicknessRawMatch, sizeMatch.raw]);
        if (inputQuantity == null || inputQuantity < 0) {
            return { ok: false, reason: 'Could not find a stock count in your message (e.g. "... 50").' };
        }
        const inputUnit = extractUnit(trimmed, item);
        const stock = convertQuantityForItemUnit({
            quantity: inputQuantity,
            fromUnit: inputUnit,
            toUnit: item.unit,
            width: item.width,
            height: item.height,
            conversionFactor: item.conversionFactor,
        });

        return {
            ok: true,
            item,
            label: `${groupResult.makes.join('/')} ${groupResult.descriptor} ${groupResult.thickness}mm ${sizeLabel(item)}`,
            inputQuantity,
            inputUnit,
            stock,
        };
    }

    const hardwareItems = catalogItems.filter(item => item.category === 'hardware');
    const hwResult = matchHardwareItem(trimmed, hardwareItems);
    if (!hwResult.ok) return hwResult;

    const inputQuantity = extractTrailingNumber(trimmed);
    if (inputQuantity == null || inputQuantity < 0) {
        return { ok: false, reason: 'Could not find a stock count in your message (e.g. "... 40").' };
    }

    return {
        ok: true,
        item: hwResult.item,
        label: `${hwResult.item.make ? hwResult.item.make + ' ' : ''}${hwResult.item.name}`,
        inputQuantity,
        inputUnit: 'nos',
        stock: inputQuantity,
    };
}

export function formatStockUpdateReply(result: StockUpdateResult): string {
    if (!result.ok) {
        return `Stock update not applied.\n${result.reason}`;
    }
    // Shows both the unit staff actually typed and the item's own stock
    // unit, so a misread (e.g. sheets vs sqft) is obvious immediately in
    // the reply rather than only discoverable later in Inventory.
    if (result.inputUnit === (result.item.unit || 'nos')) {
        return `Stock updated: ${result.label} -> ${result.stock} ${result.inputUnit}`;
    }
    return `Stock updated: ${result.label} -> ${result.inputQuantity} ${result.inputUnit} (${result.stock} ${result.item.unit || 'nos'} in inventory)`;
}
