import { calculateLineAmounts, convertRateForItemUnit, formatUnitLabel } from '@/lib/units';
import { generateUUID, roundCurrency } from '@/lib/utils';
import type { GlassItem, InvoiceItem, Unit } from '@/types';

export type ParsedWhatsAppOrderLine = {
    id: string;
    raw: string;
    item?: GlassItem;
    quantity: number;
    unit: Unit;
    rate: number;
    amount: number;
    lineTotal: number;
    sqft: number;
    confidence: 'matched' | 'review';
};

export function parseWhatsAppOrderText(text: string, items: GlassItem[]): ParsedWhatsAppOrderLine[] {
    return text
        .split(/\n|,/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(raw => {
            const item = findBestItem(raw, items);
            const quantity = extractQuantity(raw);
            const unit = extractUnit(raw, item);
            const rate = item
                ? convertRateForItemUnit({
                    rate: item.rate || 0,
                    fromUnit: item.rateUnit || item.unit,
                    toUnit: unit,
                    width: item.width,
                    height: item.height,
                    conversionFactor: item.conversionFactor,
                })
                : 0;
            const calculation = calculateLineAmounts({
                width: item?.width,
                height: item?.height,
                quantity,
                unit,
                rate,
                taxRate: 18,
                conversionFactor: item?.conversionFactor,
            });

            return {
                id: generateUUID(),
                raw,
                item,
                quantity,
                unit,
                rate,
                amount: calculation.amount,
                lineTotal: calculation.lineTotal,
                sqft: calculation.sqft,
                confidence: item ? 'matched' : 'review',
            };
        });
}

export function getWhatsAppOrderTotals(lines: ParsedWhatsAppOrderLine[]) {
    const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.amount, 0));
    const total = roundCurrency(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    return {
        subtotal,
        taxAmount: roundCurrency(total - subtotal),
        total,
    };
}

export function parsedLineToInvoiceItem(line: ParsedWhatsAppOrderLine): InvoiceItem {
    if (!line.item) {
        throw new Error(`Cannot convert unmatched WhatsApp row to order item: ${line.raw}`);
    }

    return {
        id: generateUUID(),
        itemId: line.item.id,
        itemName: line.item.name,
        description: line.raw,
        make: line.item.make,
        model: line.item.model,
        type: line.item.type,
        warehouse: 'Main Warehouse',
        width: line.item.width || 0,
        height: line.item.height || 0,
        quantity: line.quantity,
        unit: line.unit,
        sqft: line.sqft,
        rate: line.rate,
        amount: line.amount,
        lineTotal: line.lineTotal,
        sourceType: 'text',
    };
}

export function summarizeParsedWhatsAppLines(lines: ParsedWhatsAppOrderLine[]): string {
    if (!lines.length) return 'No catalogue rows detected.';

    return lines
        .map(line => {
            const name = line.item?.name || line.raw;
            const status = line.item ? 'matched' : 'needs review';
            return `- ${name}: ${line.quantity} ${formatUnitLabel(line.unit)} (${status})`;
        })
        .join('\n');
}

function findBestItem(line: string, items: GlassItem[]): GlassItem | undefined {
    const lineTokens = tokenize(line);
    if (!lineTokens.length) return undefined;

    const ranked = items
        .map(item => {
            const haystack = tokenize(`${item.name} ${item.type || ''} ${item.make || ''} ${item.model || ''} ${item.thickness || ''}mm`);
            const matches = haystack.filter(token => lineTokens.includes(token)).length;
            const exactName = normalize(line).includes(normalize(item.name));
            return { item, score: matches + (exactName ? 5 : 0) };
        })
        .filter(entry => entry.score >= 2)
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.item;
}

// A thickness like "4mm" or a size pair like "4x8"/"4*8" must never be
// mistaken for the order quantity -- both are extremely common in how glass
// orders are actually typed ("4mm plain 4*8 - 10" meaning ten 4x8ft sheets
// of 4mm clear glass, not a quantity of 4).
function extractThicknessMm(line: string): number | undefined {
    const match = line.match(/(\d+(?:\.\d+)?)\s*mm\b/i);
    return match ? Number(match[1]) : undefined;
}

function extractDimensionPair(line: string): { a: number; b: number } | undefined {
    const match = line.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
    return match ? { a: Number(match[1]), b: Number(match[2]) } : undefined;
}

function extractQuantity(line: string): number {
    // Prefer an explicit trailing quantity, e.g. "... - 10" or "... x 10" at
    // the end of the line -- the standard shorthand for "spec - count".
    const trailing = line.match(/[-x×]\s*(\d+(?:\.\d+)?)\s*(?:sheets?|pcs?|pieces?|nos|sets?|pair)?\s*$/i);
    if (trailing) return Number(trailing[1]) || 1;

    // Next, a number explicitly tagged with a unit keyword.
    const withUnit = line.match(/(\d+(?:\.\d+)?)\s*(?:sheets?|pcs?|pieces?|nos|sets?|pair|sq\.?\s*ft|sqft|sqm|sq\.?\s*m)\b/i);
    if (withUnit) return Number(withUnit[1]) || 1;

    // Last resort: the first standalone number that isn't the thickness or
    // part of a WxH dimension pair.
    const thickness = extractThicknessMm(line);
    const dims = extractDimensionPair(line);
    const excluded = new Set([thickness, dims?.a, dims?.b].filter((n): n is number => n !== undefined));
    const numbers = [...line.matchAll(/\d+(?:\.\d+)?/g)].map(m => Number(m[0]));
    const candidate = numbers.find(n => !excluded.has(n));
    return candidate ?? 1;
}

function extractUnit(line: string, item?: GlassItem): Unit {
    const lower = line.toLowerCase();
    if (/sq\.?\s*ft|sqft|square feet/.test(lower)) return 'sqft';
    if (/sq\.?\s*m|sqm|square metre|square meter/.test(lower)) return 'sqm';
    if (/sheets?/.test(lower)) return 'sheets';
    if (/sets?/.test(lower)) return 'sets';
    if (/pair/.test(lower)) return 'pair';
    if (/pcs?|pieces?/.test(lower)) return 'pcs';
    if (/nos/.test(lower)) return 'nos';
    // A WxH pattern ("4x8", "4*8") with no explicit unit strongly implies
    // "N sheets of that size" for a fixed-size sheet product, not raw sqft.
    if (item?.width && item?.height && extractDimensionPair(line)) return 'sheets';
    return item?.unit || 'nos';
}

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Shop-floor slang for catalogue terms customers actually type, none of
// which appear anywhere in the catalogue's own naming (item name/type/make
// use "Clear Float"/"Standard Clear" etc., never "plain").
const CATALOGUE_SYNONYMS: Record<string, string> = {
    plain: 'clear',
    plane: 'clear',
    simple: 'clear',
    tuff: 'toughened',
    tuffen: 'toughened',
    tempered: 'toughened',
    mirror: 'mirror',
};

function tokenize(value: string): string[] {
    return normalize(value)
        .split(/\s+/)
        .map(token => CATALOGUE_SYNONYMS[token] || token)
        .filter(token => token.length > 1 && !['mm', 'the', 'and', 'for', 'pcs', 'nos', 'set'].includes(token));
}
