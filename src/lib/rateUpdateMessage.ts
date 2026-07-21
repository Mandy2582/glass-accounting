import type { GlassItem } from '@/types';
import { matchGlassGroup, matchHardwareItem, extractTrailingNumber, sizeLabel } from '@/lib/catalogMatch';

// Lets an authorized WhatsApp number reprice a whole product line in one
// message -- e.g. "RATE 12mm Saint Gobain Clear 85" for glass (every size
// sharing that make+thickness+colour prices identically per sqft), or
// "RATE Ozone Top Patch Fitting 900" for hardware (thickness-less, priced
// per piece). Dispatches on whether the message contains a thickness.

export type RateUpdateResult =
    | { ok: true; matched: GlassItem[]; label: string; rate: number; rateUnit: 'sqft' | 'nos' }
    | { ok: false; reason: string };

export function parseAndApplyRateUpdate(text: string, catalogItems: GlassItem[]): RateUpdateResult {
    const trimmed = (text || '').trim();
    if (!trimmed) return { ok: false, reason: 'Empty message.' };

    const hasThickness = /\d+(?:\.\d+)?\s*mm\b/i.test(trimmed);

    if (hasThickness) {
        const glassItems = catalogItems.filter(item => (item.category || 'glass') === 'glass');
        const groupResult = matchGlassGroup(trimmed, glassItems);
        if (!groupResult.ok) return groupResult;

        const rate = extractTrailingNumber(trimmed, groupResult.thicknessRawMatch);
        if (rate == null || !(rate > 0)) {
            return { ok: false, reason: 'Could not find a price in your message (e.g. "Rs 85" or "85/sqft").' };
        }

        return {
            ok: true,
            matched: groupResult.matched,
            label: `${groupResult.makes.join('/')} ${groupResult.descriptor} ${groupResult.thickness}mm`,
            rate,
            rateUnit: 'sqft',
        };
    }

    const hardwareItems = catalogItems.filter(item => item.category === 'hardware');
    const hwResult = matchHardwareItem(trimmed, hardwareItems);
    if (!hwResult.ok) return hwResult;

    const rate = extractTrailingNumber(trimmed);
    if (rate == null || !(rate > 0)) {
        return { ok: false, reason: 'Could not find a price in your message (e.g. "Rs 900").' };
    }

    return {
        ok: true,
        matched: [hwResult.item],
        label: `${hwResult.item.make ? hwResult.item.make + ' ' : ''}${hwResult.item.name}`,
        rate,
        rateUnit: 'nos',
    };
}

export function formatRateUpdateReply(result: RateUpdateResult): string {
    if (!result.ok) {
        return `Rate update not applied.\n${result.reason}`;
    }
    if (result.rateUnit === 'nos') {
        return `Rate updated: ${result.label} -> Rs ${result.rate} each`;
    }
    const sizes = result.matched.map(sizeLabel).join(', ');
    return [
        `Rate updated: ${result.label} -> Rs ${result.rate}/sqft`,
        `Applied to ${result.matched.length} size${result.matched.length === 1 ? '' : 's'}: ${sizes}`,
    ].join('\n');
}
