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

function extractQuantity(line: string): number {
    const match = line.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s*(?:sheets?|pcs?|pieces?|nos|sets?|pair|sq\.?\s*ft|sqft|sqm|sq\.?\s*m))?/i);
    return match ? Number(match[1]) || 1 : 1;
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
    return item?.unit || 'nos';
}

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value: string): string[] {
    return normalize(value)
        .split(/\s+/)
        .filter(token => token.length > 1 && !['mm', 'the', 'and', 'for', 'pcs', 'nos', 'set'].includes(token));
}
