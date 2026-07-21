import type { GlassItem } from '@/types';
import { extractQuantity, extractUnit } from '@/lib/whatsappOrders';
import { matchGlassGroup, matchHardwareItem, extractSizeMatch, sizeMatchesItem, sizeLabel } from '@/lib/catalogMatch';

// Lets an authorized WhatsApp number record a purchase from a supplier in
// one message:
//   PURCHASE ABC Traders
//   12mm Saint Gobain Clear 4x6ft - 50 sheets @800
//   Ozone Top Patch Fitting - 20 @750
// First line is the supplier name (this module only extracts the name --
// resolving/creating the actual Party record needs a DB read, done by the
// caller). Every line after that is one item: description + quantity +
// "@<purchase rate>" (required and explicit -- unlike rate-update's rate,
// a purchase line already has both a quantity number and a price number in
// it, so guessing which is which would risk a wrong financial entry).
// Building the real Invoice and updating stock/cost accounting is the
// caller's job too (via the existing db.invoices.add pipeline) -- this
// module only parses.

export type ParsedPurchaseLine =
    | { ok: true; raw: string; item: GlassItem; quantity: number; rate: number; unit: string }
    | { ok: false; raw: string; reason: string };

export type PurchaseMessageResult =
    | { ok: true; supplierName: string; lines: ParsedPurchaseLine[] }
    | { ok: false; reason: string };

export function parsePurchaseMessage(text: string, catalogItems: GlassItem[]): PurchaseMessageResult {
    const rawLines = (text || '').split('\n').map(line => line.trim()).filter(Boolean);
    if (rawLines.length === 0) return { ok: false, reason: 'Empty message.' };

    const supplierName = rawLines[0];
    const itemLines = rawLines.slice(1);
    if (itemLines.length === 0) {
        return {
            ok: false,
            reason: 'No item lines found. Format: first line is the supplier name, then one item per line, e.g. "12mm Saint Gobain Clear 4x6ft - 50 sheets @800".',
        };
    }

    const glassItems = catalogItems.filter(item => (item.category || 'glass') === 'glass');
    const hardwareItems = catalogItems.filter(item => item.category === 'hardware');
    const lines = itemLines.map(raw => parsePurchaseItemLine(raw, glassItems, hardwareItems));

    return { ok: true, supplierName, lines };
}

function extractPurchaseRate(text: string): number | null {
    const match = text.match(/@\s*([\d,]+(?:\.\d+)?)/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parsePurchaseItemLine(raw: string, glassItems: GlassItem[], hardwareItems: GlassItem[]): ParsedPurchaseLine {
    const hasThickness = /\d+(?:\.\d+)?\s*mm\b/i.test(raw);

    if (hasThickness) {
        const groupResult = matchGlassGroup(raw, glassItems);
        if (!groupResult.ok) return { ok: false, raw, reason: groupResult.reason };

        const sizeMatch = extractSizeMatch(raw);
        if (!sizeMatch) {
            return {
                ok: false,
                raw,
                reason: `A purchase line needs an exact size (e.g. "4x6ft"). Sizes for ${groupResult.makes.join('/')} ${groupResult.descriptor} ${groupResult.thickness}mm: ${groupResult.matched.map(sizeLabel).join(', ')}.`,
            };
        }
        const sized = groupResult.matched.filter(item => sizeMatchesItem(sizeMatch.dims, item));
        if (sized.length !== 1) {
            return {
                ok: false,
                raw,
                reason: sized.length === 0
                    ? `No ${groupResult.makes.join('/')} ${groupResult.descriptor} ${groupResult.thickness}mm item at that size.`
                    : `More than one size matched -- say which one. Options: ${sized.map(sizeLabel).join(', ')}.`,
            };
        }
        const item = sized[0];

        const rate = extractPurchaseRate(raw);
        if (rate == null || !(rate > 0)) {
            return { ok: false, raw, reason: 'Could not find a purchase rate (e.g. "@800") in this line.' };
        }

        return { ok: true, raw, item, quantity: extractQuantity(raw), rate, unit: extractUnit(raw, item) };
    }

    const hwResult = matchHardwareItem(raw, hardwareItems);
    if (!hwResult.ok) return { ok: false, raw, reason: hwResult.reason };

    const rate = extractPurchaseRate(raw);
    if (rate == null || !(rate > 0)) {
        return { ok: false, raw, reason: 'Could not find a purchase rate (e.g. "@750") in this line.' };
    }

    return { ok: true, raw, item: hwResult.item, quantity: extractQuantity(raw), rate, unit: 'nos' };
}
