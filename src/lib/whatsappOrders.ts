import { calculateLineAmounts, convertRateForItemUnit, convertQuantityForItemUnit, formatUnitLabel } from '@/lib/units';
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
    // 'out_of_stock' is a resolved, priced line (so it can still be quoted)
    // for a quantity that no matching catalogue item -- across any brand --
    // currently has available stock to cover.
    confidence: 'matched' | 'review' | 'out_of_stock';
};

export function parseWhatsAppOrderText(text: string, items: GlassItem[]): ParsedWhatsAppOrderLine[] {
    const rawLines = text
        .split(/\n|,/)
        .map(line => insertMissingSpaces(line.trim()))
        .filter(Boolean);

    return groupShorthandLines(rawLines, items)
        .filter(raw => !isPureNoise(raw, items))
        .flatMap(raw => resolveLine(raw, items));
}

// Customers often type the thickness tight against the next word with no
// space ("5mmblack" meaning "5mm black") -- this breaks both thickness
// extraction (the mm-boundary regex needs a non-letter after "mm") and
// catalogue token matching (the whole glued string becomes one meaningless
// token). Insert the space back before any other parsing sees the line.
function insertMissingSpaces(line: string): string {
    return line.replace(/(\d+(?:\.\d+)?\s*mm)(?=[a-zA-Z])/gi, '$1 ');
}

// A line with a thickness/colour but no size or quantity of its own ("3.5mm
// plain") is very often followed by a separate line that's just the size
// and quantity ("4*8-30") -- a common shorthand where the descriptor and
// the order details are typed on consecutive lines rather than one. Merge
// such a pair into a single line before matching so the descriptor's
// thickness/colour and the following line's size/quantity are read
// together, instead of two independently-unresolvable fragments.
function groupShorthandLines(rawLines: string[], items: GlassItem[]): string[] {
    const result: string[] = [];
    let i = 0;
    while (i < rawLines.length) {
        const current = rawLines[i];
        const hasDims = extractDimensionPair(current) !== undefined;
        const looksLikeDescriptor = !hasDims
            && (extractThicknessMm(current) !== undefined || findCandidateItems(current, items).length > 0);

        if (looksLikeDescriptor && i + 1 < rawLines.length) {
            const next = rawLines[i + 1];
            const nextIsBareContinuation = extractThicknessMm(next) === undefined
                && extractDimensionPair(next) !== undefined;
            if (nextIsBareContinuation) {
                result.push(`${current} ${next}`);
                i += 2;
                continue;
            }
        }

        result.push(current);
        i += 1;
    }
    return result;
}

// A line with no digits at all and no catalogue-token overlap carries zero
// order information ("Book my order", "Hi", "please confirm") -- reporting
// it as an unmatched "needs review" row with a guessed quantity of 1 is
// pure noise, not a real line item to review.
function isPureNoise(raw: string, items: GlassItem[]): boolean {
    const hasDigit = /\d/.test(raw);
    if (hasDigit) return false;
    return findCandidateItems(raw, items).length === 0;
}

function resolveLine(raw: string, items: GlassItem[]): ParsedWhatsAppOrderLine[] {
    const candidates = findCandidateItems(raw, items);
    const quantity = extractQuantity(raw);

    if (!candidates.length) {
        const unit = extractUnit(raw, undefined);
        return [buildLine(raw, undefined, quantity, unit, 'review')];
    }

    const unit = extractUnit(raw, candidates[0].item);
    const requestedBrand = detectRequestedBrand(raw);
    const scoped = requestedBrand
        ? (() => {
            const sameBrand = candidates.filter(entry => (entry.item.make || '').toLowerCase() === requestedBrand.toLowerCase());
            return sameBrand.length ? sameBrand : candidates;
        })()
        : candidates;

    // Brand substitution only makes sense across items that are actually the
    // SAME requested spec (colour/type/thickness/size) in a different brand
    // -- e.g. two brands' "Reflective Blue 8mm 6x8ft". Without this, a size-
    // filtered pool that also loosely matches an unrelated colour/type in
    // another brand (any 6x8ft "Reflective ___" clears the token-overlap
    // bar) could get pulled in as a false substitute just because Saint
    // Gobain was deprioritised. Since brand isn't part of the score when the
    // customer doesn't name one, a genuine cross-brand match of the same
    // spec scores identically -- so only the top-scoring tier is eligible.
    const topScore = scoped[0].score;
    const sameSpec = scoped.filter(entry => entry.score === topScore).map(entry => entry.item);

    const prioritized = orderCandidatesByBrandPriority(sameSpec);
    const { allocations, remaining } = allocateQuantity(quantity, unit, prioritized);

    const lines = allocations.map(({ item, quantity: allocatedQty }) => buildLine(raw, item, allocatedQty, unit, 'matched'));

    if (remaining > 0.0001) {
        // Nothing (or not enough) in stock anywhere -- still resolve to a
        // priced line naming the best-matching item, flagged as out of
        // stock, so the order can go to a customer as a quotation instead of
        // silently dropping the request or blocking the whole order.
        lines.push(buildLine(raw, prioritized[0], remaining, unit, 'out_of_stock'));
    }

    return lines;
}

function buildLine(
    raw: string,
    item: GlassItem | undefined,
    quantity: number,
    unit: Unit,
    confidence: ParsedWhatsAppOrderLine['confidence']
): ParsedWhatsAppOrderLine {
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
        confidence,
    };
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
        description: line.confidence === 'out_of_stock' ? `${line.raw} (Out of stock)` : line.raw,
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
            const status = line.confidence === 'matched'
                ? 'matched'
                : line.confidence === 'out_of_stock'
                    ? 'NOT AVAILABLE -- out of stock'
                    : 'needs review';
            return `- ${name}: ${line.quantity} ${formatUnitLabel(line.unit)} (${status})`;
        })
        .join('\n');
}

// Which of the 3 catalogue brands (if any) the customer explicitly named --
// when present, substitution across brands is skipped and only that brand's
// stock is considered, since the customer asked for it specifically.
function detectRequestedBrand(line: string): string | undefined {
    const normalized = normalize(line);
    if (/\bsaint\s*gobain\b|\bgobain\b/.test(normalized)) return 'Saint Gobain';
    if (/\bgold\s*plus\b|\bgoldplus\b/.test(normalized)) return 'Gold Plus';
    if (/\basahi\b|\bais\b/.test(normalized)) return 'Asahi';
    return undefined;
}

// Business priority when the customer doesn't name a brand: Gold Plus and
// Asahi are preferred over Saint Gobain, and between the two, whichever
// currently has more available stock goes first so it gets fully used up
// before the next one is touched. Any other/generic make (e.g. the original
// non-branded catalogue) sits in between; Saint Gobain always goes last
// regardless of its own stock level.
function orderCandidatesByBrandPriority(candidates: GlassItem[]): GlassItem[] {
    const byMake = new Map<string, GlassItem>();
    for (const item of candidates) {
        const make = item.make || 'General';
        if (!byMake.has(make)) byMake.set(make, item);
    }

    const goldPlus = byMake.get('Gold Plus');
    const asahi = byMake.get('Asahi');
    const saintGobain = byMake.get('Saint Gobain');
    const others = Array.from(byMake.entries())
        .filter(([make]) => !['Gold Plus', 'Asahi', 'Saint Gobain'].includes(make))
        .map(([, item]) => item);

    const preferredPair = [goldPlus, asahi]
        .filter((item): item is GlassItem => !!item)
        .sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0));

    return [...preferredPair, ...others, ...(saintGobain ? [saintGobain] : [])];
}

// Greedily draws the requested quantity from each candidate's available
// stock (items are expected to already carry availableStock in .stock, via
// withAvailableStock) in priority order, moving to the next candidate only
// once the current one is used up -- this is what completes an order across
// makes ("if one of make stocks is utilised then move to another make").
function allocateQuantity(
    requestedQuantity: number,
    unit: Unit,
    candidates: GlassItem[]
): { allocations: Array<{ item: GlassItem; quantity: number }>; remaining: number } {
    let remaining = requestedQuantity;
    const allocations: Array<{ item: GlassItem; quantity: number }> = [];

    for (const item of candidates) {
        if (remaining <= 0.0001) break;

        const requestedInStockUnit = convertQuantityForItemUnit({
            quantity: remaining,
            fromUnit: unit,
            toUnit: item.unit || unit,
            width: item.width,
            height: item.height,
            conversionFactor: item.conversionFactor,
        });
        const availableInStockUnit = Number(item.stock) || 0;
        const takenInStockUnit = Math.min(requestedInStockUnit, availableInStockUnit);
        if (takenInStockUnit <= 0.0001) continue;

        const takenInRequestedUnit = convertQuantityForItemUnit({
            quantity: takenInStockUnit,
            fromUnit: item.unit || unit,
            toUnit: unit,
            width: item.width,
            height: item.height,
            conversionFactor: item.conversionFactor,
        });

        allocations.push({ item, quantity: takenInRequestedUnit });
        remaining = roundCurrency(remaining - takenInRequestedUnit);
    }

    return { allocations, remaining: Math.max(0, remaining) };
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

// True when the line's requested WxH (assumed to be in feet, as customers
// always type it) matches this item's own stored sheet size (in inches),
// in either width/height order. A small tolerance covers the 5'4" size,
// which customers type as "5.4x8" (5.4 feet, not 5'4.8").
function sizeMatchesItem(dims: { a: number; b: number } | undefined, item: GlassItem): boolean {
    if (!dims || !item.width || !item.height) return false;
    const itemFeetA = item.width / 12;
    const itemFeetB = item.height / 12;
    const tolerance = 0.2;
    const matchesInOrder = Math.abs(dims.a - itemFeetA) < tolerance && Math.abs(dims.b - itemFeetB) < tolerance;
    const matchesSwapped = Math.abs(dims.a - itemFeetB) < tolerance && Math.abs(dims.b - itemFeetA) < tolerance;
    return matchesInOrder || matchesSwapped;
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

// Protects a decimal point between two digits (e.g. "3.5mm") before the
// non-alphanumeric strip below would otherwise split it into "3" and "5mm"
// -- the leading "3" then gets silently dropped as a length-1 token by
// tokenize()'s filter, turning a 3.5mm thickness into a 5mm one. "p" is an
// arbitrary safe placeholder (never appears in a numeric thickness), and is
// applied consistently to both the customer's line and the catalogue
// item's own tokenized fields, so "3.5mm" matches "3.5mm" on both sides.
function protectDecimals(value: string): string {
    return value.replace(/(\d)\.(\d)/g, '$1p$2');
}

function normalize(value: string): string {
    return protectDecimals(value.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
}

// Shop-floor slang for catalogue terms customers actually type, none of
// which appear anywhere in the catalogue's own naming (item name/type/make
// use "Clear Float"/"Standard Clear" etc., never "plain"). "ref"/"r" cover
// how customers actually abbreviate Reflective glass -- they always name it
// explicitly, just never spell it out. "black" covers dark grey glass
// commonly called "black" by customers even though there's no separate
// black product -- the catalogue's own colour term is "grey".
const CATALOGUE_SYNONYMS: Record<string, string> = {
    plain: 'clear',
    plane: 'clear',
    simple: 'clear',
    tuff: 'toughened',
    tuffen: 'toughened',
    tempered: 'toughened',
    mirror: 'mirror',
    ref: 'reflective',
    refl: 'reflective',
    r: 'reflective',
    black: 'grey',
};

function tokenize(value: string): string[] {
    return normalize(value)
        .split(/\s+/)
        .map(token => CATALOGUE_SYNONYMS[token] || token)
        .filter(token => token.length > 1 && !['mm', 'the', 'and', 'for', 'pcs', 'nos', 'set'].includes(token));
}

// Colour words that appear across the Tinted/Reflective catalogue. Used
// only to detect "the customer named a colour but no category" -- see
// preferTinted in findCandidateItems below.
const KNOWN_GLASS_COLOURS = ['grey', 'gray', 'bronze', 'brown', 'gold', 'golden', 'blue', 'green', 'silver', 'aqua', 'ocean', 'pearl', 'royal', 'white'];
const GLASS_CATEGORY_TOKENS = ['reflective', 'tinted', 'mirror', 'toughened', 'clear', 'fluted', 'frosted'];

// Returns every catalogue item that plausibly matches the line, best score
// first. When the line states an explicit size and at least one match at
// that size exists, non-matching sizes are excluded entirely -- previously
// size was never part of scoring at all, so "6x8" in the message could
// silently resolve to a 4x6 item just because it happened to sort first.
function findCandidateItems(line: string, items: GlassItem[]): Array<{ item: GlassItem; score: number }> {
    const lineTokens = tokenize(line);
    if (!lineTokens.length) return [];

    const dims = extractDimensionPair(line);

    // Unlike Reflective (always named explicitly, if only as "ref"/"r"),
    // customers ordering Tinted glass almost never say "tinted" -- they
    // just name the colour ("grey", "bronze"). Without help, a bare colour
    // scores identically against the Tinted and the Reflective item
    // sharing that colour (colour + thickness match either way), leaving
    // the tie to resolve arbitrarily. preferTinted only applies a small
    // fractional bonus (below the smallest possible real-token-match gap
    // of 1) so it can settle an exact tie between equally-plausible
    // candidates, but can never outweigh an actual colour mismatch (e.g. a
    // customer asking for "gold", which only exists as Reflective, must
    // never fall back to a same-thickness Tinted Bronze item just because
    // of this bonus).
    const preferTinted = !lineTokens.some(token => GLASS_CATEGORY_TOKENS.includes(token))
        && lineTokens.some(token => KNOWN_GLASS_COLOURS.includes(token));

    const ranked = items
        .map(item => {
            const haystack = tokenize(`${item.name} ${item.type || ''} ${item.make || ''} ${item.model || ''} ${item.thickness || ''}mm`);
            const matches = haystack.filter(token => lineTokens.includes(token)).length;
            const exactName = normalize(line).includes(normalize(item.name));
            const tintedTieBreak = preferTinted && haystack.includes('tinted') ? 0.5 : 0;
            return { item, score: matches + (exactName ? 5 : 0) + tintedTieBreak };
        })
        .filter(entry => entry.score >= 2)
        .sort((a, b) => b.score - a.score);

    if (dims) {
        const sizeMatched = ranked.filter(entry => sizeMatchesItem(dims, entry.item));
        if (sizeMatched.length > 0) return sizeMatched;
    }

    return ranked;
}
