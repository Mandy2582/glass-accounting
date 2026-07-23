import type { InvoiceItem, PricingConfig } from '@/types';
import { generateUUID } from '@/lib/utils';
import { calculateLineAmounts } from '@/lib/units';
import { resolveThicknessRate } from '@/lib/catalogMatch';
import { CATALOGUE_SYNONYMS } from '@/lib/whatsappOrders';

// Toughened Glass isn't stocked -- it's made to order at whatever exact
// size the customer asks for (never one of the catalogue's fixed sheet
// sizes), always sourced via a supplier purchase order, and priced by
// thickness + colour (Settings' thickness-pricing rows, via
// resolveThicknessRate) rather than matched against a catalogue item.
// These orders arrive as a header line ("12MM Plain Toughened") followed
// by one line per piece ("[area] WIDTH x HEIGHT -QTY", sizes in inches,
// sometimes with an eighths-of-an-inch fraction like "6/8"), and often end
// with a duplicate summary list of the same pieces starting from an
// "N pcs" line -- that summary must be recognised and ignored, not
// re-parsed as more (wrong) pieces.

const THICKNESS_REGEX = /(\d+(?:\.\d+)?)\s*mm\b/i;
// Matches "Toughen" and "Toughened" -- WhatsApp/OCR text frequently drops
// the "-ed" suffix (e.g. "12MM Plain Toughen"), which the exact-word
// "toughened" match previously missed entirely, silently falling through
// to the catalogue-matching parser (the "only fetched the first item" bug).
const TOUGHENED_REGEX = /\btoughen(?:ed)?\b/i;
const SUMMARY_STOP_REGEX = /^\s*\d+(?:\.\d+)?\s*pcs\b/i;
// Leading area figure (if present) is the source's own rough number, not
// trusted -- area is recomputed from width x height instead. Width/height
// each accept a whole number optionally followed by an eighths-style
// fraction ("59 6/8"); the trailing "-QTY" is optional (defaults to 1).
const PIECE_LINE_REGEX = /^\s*(?:[\d.]+\s+)?(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*x\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*(?:-\s*(\d+))?\s*$/i;

// How many leading non-empty lines count as "up front" for both detection
// and header parsing -- images are often captioned with something like
// "DRAWING NO." before the actual "12mm Plain Toughen" line, so this can't
// assume line 0 is always the header.
const HEADER_SEARCH_WINDOW = 5;

// True only when the message clearly names both a thickness and
// "toughened"/"toughen" up front -- deliberately narrow (scoped to
// Toughened Glass only, per the owner) rather than a fuzzy heuristic that
// might misfire on an ordinary catalogue order.
export function looksLikeCustomGlassOrder(text: string): boolean {
    const firstLines = (text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, HEADER_SEARCH_WINDOW).join(' ');
    return THICKNESS_REGEX.test(firstLines) && TOUGHENED_REGEX.test(firstLines);
}

// Parses "120", "59.75", or "59 6/8" (whole number, optionally followed by
// a fraction) into a plain decimal number of inches.
function parseInchesWithFraction(raw: string): number | null {
    const trimmed = raw.trim();
    const fractionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
    if (fractionMatch) {
        const whole = Number(fractionMatch[1]);
        const numerator = Number(fractionMatch[2]);
        const denominator = Number(fractionMatch[3]);
        if (!denominator) return null;
        return whole + numerator / denominator;
    }
    const plain = Number(trimmed);
    return Number.isFinite(plain) && plain > 0 ? plain : null;
}

// Reduces the header line down to just the colour/type word(s) left after
// removing "toughened", the thickness phrase, and "glass" -- e.g. "12MM
// Plain Toughened" -> "Clear" (via the existing plain->clear synonym),
// "Toughened Brown" -> "Brown". Defaults to "Clear" when nothing is left,
// since that's the shop's default Toughened colour.
function deriveGlassType(headerLine: string): string {
    let remainder = headerLine.toLowerCase()
        .replace(TOUGHENED_REGEX, ' ')
        .replace(THICKNESS_REGEX, ' ')
        .replace(/\bglass\b/gi, ' ');
    const words = remainder
        .split(/[^a-z]+/)
        .filter(Boolean)
        .map(word => CATALOGUE_SYNONYMS[word] || word);
    if (words.length === 0) return 'Clear';
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export type CustomGlassPiece = { width: number; height: number; quantity: number };

export type CustomGlassOrderResult =
    | { ok: true; thickness: number; glassType: string; pieces: CustomGlassPiece[] }
    | { ok: false; reason: string };

export function parseCustomGlassOrder(text: string): CustomGlassOrderResult {
    const rawLines = (text || '').split('\n').map(line => line.trim()).filter(Boolean);
    if (rawLines.length === 0) return { ok: false, reason: 'Empty message.' };

    // Find the actual header line rather than assuming line 0 -- a caption
    // like "DRAWING NO." often precedes the real "12mm Plain Toughen" line.
    const headerIndex = rawLines.findIndex((line, idx) => idx < HEADER_SEARCH_WINDOW && THICKNESS_REGEX.test(line));
    if (headerIndex === -1) {
        return { ok: false, reason: 'Could not find a thickness (e.g. "12mm") near the top of the message.' };
    }
    const headerLine = rawLines[headerIndex];
    const thicknessMatch = headerLine.match(THICKNESS_REGEX)!;
    const thickness = Number(thicknessMatch[1]);
    const glassType = deriveGlassType(headerLine);

    const pieces: CustomGlassPiece[] = [];
    for (let i = headerIndex + 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        // A trailing duplicate summary list ("19 pcs" then a repeat of the
        // same pieces with no "-qty"/area prefix) starts here -- it would
        // otherwise match PIECE_LINE_REGEX too (same "WIDTH x HEIGHT"
        // shape) and silently double the order. Stop entirely, don't just
        // skip this one line.
        if (SUMMARY_STOP_REGEX.test(line)) break;

        const match = line.match(PIECE_LINE_REGEX);
        if (!match) continue; // an unrecognised line shouldn't lose every other piece

        const width = parseInchesWithFraction(match[1]);
        const height = parseInchesWithFraction(match[2]);
        const quantity = match[3] ? Number(match[3]) : 1;
        if (width == null || height == null) continue;

        pieces.push({ width, height, quantity });
    }

    if (pieces.length === 0) {
        return { ok: false, reason: 'Could not find any piece dimensions (e.g. "59 6/8 x 120 -1") in the message.' };
    }

    return { ok: true, thickness, glassType, pieces };
}

// Builds real order line items directly from the parsed pieces -- no
// catalogue item, no CustomDesign row (many of these orders have no sketch
// to show). sourceType: 'design' is what already makes the existing
// "Create PO" flow and requires-design banner (isCustomDesignOrderItem in
// orders/[id]/page.tsx) pick these up automatically, since Toughened Glass
// always needs a supplier purchase order rather than being fulfilled from
// stock.
export function buildCustomGlassOrderItems(
    parsed: Extract<CustomGlassOrderResult, { ok: true }>,
    pricingConfig: PricingConfig,
    taxRate: number,
): InvoiceItem[] {
    const rate = resolveThicknessRate(pricingConfig.thicknessPricing, parsed.thickness, parsed.glassType) ?? Number(pricingConfig.baseRatePerSqft) ?? 0;

    return parsed.pieces.map((piece, index) => {
        const areaSqft = Math.round((piece.width / 12) * (piece.height / 12) * piece.quantity * 100) / 100;
        const calculated = calculateLineAmounts({
            width: piece.width,
            height: piece.height,
            quantity: areaSqft,
            unit: 'sqft',
            rate,
            rateUnit: 'sqft',
            taxRate,
        });

        return {
            id: generateUUID(),
            itemId: '',
            itemName: `Toughened ${parsed.glassType} Glass ${parsed.thickness}mm`,
            description: `${piece.width}in x ${piece.height}in${piece.quantity > 1 ? ` x ${piece.quantity} pcs` : ''}`,
            type: 'Toughened Glass',
            width: piece.width,
            height: piece.height,
            quantity: areaSqft,
            unit: 'sqft' as const,
            sqft: areaSqft,
            rate,
            rateUnit: 'sqft' as const,
            amount: calculated.amount,
            lineTotal: calculated.lineTotal,
            sourceType: 'design' as const,
            designPieceId: `custom-toughened-${index + 1}`,
        };
    });
}
