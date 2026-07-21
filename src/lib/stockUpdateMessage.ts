import type { GlassItem } from '@/types';
import { matchGlassGroup, matchHardwareItem, extractTrailingNumber, extractSizeMatch, sizeMatchesItem, sizeLabel } from '@/lib/catalogMatch';

// Lets an authorized WhatsApp number correct a stock count in one message,
// e.g. "STOCK 12mm Saint Gobain Clear 4x6ft 50" for glass (unlike a rate,
// stock is per exact sheet size, so the message must narrow the make+
// thickness+colour group down to one size), or "STOCK Ozone Top Patch
// Fitting 40" for hardware. This is a plain correction (e.g. after a
// physical stock count) -- for a real purchase received from a supplier,
// use the PURCHASE command instead, which also updates cost accounting.

export type StockUpdateResult =
    | { ok: true; item: GlassItem; label: string; stock: number }
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

        const stock = extractTrailingNumber(trimmed, [groupResult.thicknessRawMatch, sizeMatch.raw]);
        if (stock == null || stock < 0) {
            return { ok: false, reason: 'Could not find a stock count in your message (e.g. "... 50").' };
        }

        return {
            ok: true,
            item: sized[0],
            label: `${groupResult.makes.join('/')} ${groupResult.descriptor} ${groupResult.thickness}mm ${sizeLabel(sized[0])}`,
            stock,
        };
    }

    const hardwareItems = catalogItems.filter(item => item.category === 'hardware');
    const hwResult = matchHardwareItem(trimmed, hardwareItems);
    if (!hwResult.ok) return hwResult;

    const stock = extractTrailingNumber(trimmed);
    if (stock == null || stock < 0) {
        return { ok: false, reason: 'Could not find a stock count in your message (e.g. "... 40").' };
    }

    return {
        ok: true,
        item: hwResult.item,
        label: `${hwResult.item.make ? hwResult.item.make + ' ' : ''}${hwResult.item.name}`,
        stock,
    };
}

export function formatStockUpdateReply(result: StockUpdateResult): string {
    if (!result.ok) {
        return `Stock update not applied.\n${result.reason}`;
    }
    return `Stock updated: ${result.label} -> ${result.stock} ${result.item.unit || 'nos'}`;
}
