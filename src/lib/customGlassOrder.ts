import type { InvoiceItem, PricingConfig } from '@/types';
import { generateUUID } from '@/lib/utils';
import { resolveThicknessRate } from '@/lib/catalogMatch';
import { calculateDimensionAreaSqft } from '@/lib/units';
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
// Matches "Toughen"/"Toughened" (WhatsApp/OCR text frequently drops the
// "-ed" suffix, e.g. "12MM Plain Toughen"), "Toughned" (a real observed
// customer typo dropping the "e" before "n"), and "Tempered" (the same
// glass, common alternate name customers actually use). Used both to detect
// these orders and to strip the word back out when deriving the colour/type
// from the header -- otherwise "Tempered Toughened" would leave "Tempered"
// behind as a bogus "glass type", which then fails to match any
// thickness-pricing row and silently falls back to the generic base rate.
const TOUGHENED_REGEX = /\b(?:toughen(?:ed)?|toughned|tempered)\b/i;
// Same pattern, but with the "g" flag for stripping every occurrence out of
// a header line (e.g. "Tempered Toughened" has two matches) -- kept as a
// separate regex object from TOUGHENED_REGEX above, since a global regex's
// `.test()` calls carry lastIndex state across calls and would otherwise
// make looksLikeCustomGlassOrder's detection flicker between messages.
const TOUGHENED_STRIP_REGEX = /\b(?:toughen(?:ed)?|toughned|tempered)\b/gi;
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

// True whenever "toughened"/"tempered" is named up front -- deliberately
// narrow to that one word (scoped to Toughened Glass only, per the owner)
// rather than a fuzzy heuristic that might misfire on an ordinary catalogue
// order. Does NOT require a thickness -- Toughened Glass is never stocked or
// catalogue-matched regardless, and requiring a thickness here used to send
// thickness-less messages straight into the catalogue matcher instead,
// which silently matched only the first line and dropped the rest (the
// original "only fetched the first item" bug). Missing thickness is instead
// handled by parseCustomGlassOrder returning thickness: null, so the caller
// can ask the customer for it rather than guessing or losing their pieces.
export function looksLikeCustomGlassOrder(text: string): boolean {
    const firstLines = (text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, HEADER_SEARCH_WINDOW).join(' ');
    return TOUGHENED_REGEX.test(firstLines);
}

// Loose "does this message contain at least one WIDTH x HEIGHT size line"
// check -- used by the webhook to catch messages that give real dimensions
// but never name a glass type/category at all (not Toughened, and nothing
// that matched a catalogue item either), so the customer can be told what's
// missing instead of the order silently landing in manual review with no
// reply. Deliberately looser than PIECE_LINE_REGEX above (tolerates OCR
// artifacts like stray inch-mark quotes, "=" instead of "-", a trailing
// "PCS" instead of a bare number) since this is only a heuristic for
// deciding whether to ask the customer, not something used to parse/price
// real pieces.
const LOOSE_DIMENSION_LINE_REGEX = /\d+(?:["']|\s)*(?:\d+\/\d+)?\s*x\s*\d+/i;

export function containsUnidentifiedGlassDimensions(text: string): boolean {
    return (text || '').split('\n').some(line => LOOSE_DIMENSION_LINE_REGEX.test(line));
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

// Reduces a line down to just the colour/type word(s) left after removing
// "toughened"/"tempered", the thickness phrase, and "glass" -- e.g. "12MM
// Plain Toughened" -> "Clear" (via the existing plain->clear synonym),
// "Toughened Brown" -> "Brown", "8mm clear toughned" -> "Clear". Returns
// null when nothing meaningful is left (e.g. the line was only a thickness),
// so callers can tell "no type mentioned" apart from an actual colour.
function deriveGlassTypeOrNull(line: string): string | null {
    let remainder = line.toLowerCase()
        .replace(TOUGHENED_STRIP_REGEX, ' ')
        .replace(THICKNESS_REGEX, ' ')
        .replace(/\bglass\b/gi, ' ');
    const words = remainder
        .split(/[^a-z]+/)
        .filter(Boolean)
        .map(word => CATALOGUE_SYNONYMS[word] || word);
    if (words.length === 0) return null;
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Same as deriveGlassTypeOrNull, but defaults to "Clear" when nothing is
// left -- used for the original header line of a fully-parsed order, where
// the shop's default Toughened colour is a safe assumption once we already
// know it's a Toughened Glass order at all.
function deriveGlassType(headerLine: string): string {
    return deriveGlassTypeOrNull(headerLine) ?? 'Clear';
}

// Parses a short customer reply answering a "what's missing" prompt (e.g.
// "8mm clear toughned", or just "8mm") -- thickness via the same regex used
// for a full order header, glass type via the same word-stripping approach,
// but returns null for whichever piece isn't actually present rather than
// guessing or defaulting, since the caller needs to know if the reply still
// didn't answer the question.
export function parseReplyForMissingInfo(text: string): { thickness: number | null; glassType: string | null } {
    const trimmed = (text || '').trim();
    const thicknessMatch = trimmed.match(THICKNESS_REGEX);
    return {
        thickness: thicknessMatch ? Number(thicknessMatch[1]) : null,
        glassType: deriveGlassTypeOrNull(trimmed),
    };
}

export type CustomGlassPiece = { width: number; height: number; quantity: number };

// Loosely matches OCR'd/handwritten dimension lines with formatting
// PIECE_LINE_REGEX doesn't accept: stray inch-mark quotes ("74\" 5/8"), "="
// instead of "-" before the quantity, and a trailing "PCS"/"pcs" word
// instead of a bare number.
function normalizeOcrDimensionLine(line: string): string {
    return line
        .replace(/["']/g, '')
        .replace(/=/g, '-')
        .replace(/\bpcs\b/gi, '')
        .trim();
}

// Extracts piece sizes from a message that gives real dimensions but names
// no glass type/category at all (so looksLikeCustomGlassOrder's Toughened-
// keyword gate never fires and there's no header line to anchor on) --
// unlike parseCustomGlassOrder, this has no header/thickness search, just
// scans every line for something PIECE_LINE_REGEX (after OCR normalization)
// recognises as a size. Used to capture real geometry immediately instead
// of losing it to a zero-area "manual review" placeholder while the
// customer is asked what type of glass this is.
export function parseDimensionOnlyLines(text: string): CustomGlassPiece[] {
    const pieces: CustomGlassPiece[] = [];
    for (const rawLine of (text || '').split('\n')) {
        const line = rawLine.trim();
        if (!line || SUMMARY_STOP_REGEX.test(line)) continue;

        const match = normalizeOcrDimensionLine(line).match(PIECE_LINE_REGEX);
        if (!match) continue;

        const width = parseInchesWithFraction(match[1]);
        const height = parseInchesWithFraction(match[2]);
        const quantity = match[3] ? Number(match[3]) : 1;
        if (width == null || height == null) continue;

        pieces.push({ width, height, quantity });
    }
    return pieces;
}

export type CustomGlassOrderResult =
    // thickness is null when the message never states one (e.g. just
    // "Tempered Toughened" with no "Nmm") -- pieces/glassType are still
    // fully parsed in that case, since neither depends on thickness; the
    // caller decides how to handle the gap (ask the customer, in the
    // webhook) rather than this module guessing a thickness.
    | { ok: true; thickness: number | null; glassType: string; pieces: CustomGlassPiece[]; unparsedLines: string[] }
    | { ok: false; reason: string };

export function parseCustomGlassOrder(text: string): CustomGlassOrderResult {
    const rawLines = (text || '').split('\n').map(line => line.trim()).filter(Boolean);
    if (rawLines.length === 0) return { ok: false, reason: 'Empty message.' };

    // Find the actual header line rather than assuming line 0 -- a caption
    // like "DRAWING NO." often precedes the real "12mm Plain Toughen" line.
    // Anchored on the "toughened"/"tempered" word rather than a thickness,
    // since the thickness may be missing entirely.
    const headerIndex = rawLines.findIndex((line, idx) => idx < HEADER_SEARCH_WINDOW && TOUGHENED_REGEX.test(line));
    if (headerIndex === -1) {
        return { ok: false, reason: 'Could not find "toughened"/"tempered" near the top of the message.' };
    }
    const headerLine = rawLines[headerIndex];
    // Thickness may appear on the header line itself or elsewhere in the
    // search window (e.g. a separate "12MM" line right above/below it) --
    // null when it's not stated anywhere up front.
    const searchWindowText = rawLines.slice(0, HEADER_SEARCH_WINDOW).join(' ');
    const thicknessMatch = searchWindowText.match(THICKNESS_REGEX);
    const thickness = thicknessMatch ? Number(thicknessMatch[1]) : null;
    const glassType = deriveGlassType(headerLine);

    const pieces: CustomGlassPiece[] = [];
    const unparsedLines: string[] = [];
    for (let i = headerIndex + 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        // A trailing duplicate summary list ("19 pcs" then a repeat of the
        // same pieces with no "-qty"/area prefix) starts here -- it would
        // otherwise match PIECE_LINE_REGEX too (same "WIDTH x HEIGHT"
        // shape) and silently double the order. Stop entirely, don't just
        // skip this one line.
        if (SUMMARY_STOP_REGEX.test(line)) break;

        const match = line.match(PIECE_LINE_REGEX);
        if (!match) {
            // An unrecognised line shouldn't lose every other piece, but it's
            // worth surfacing to the customer/office rather than silently
            // dropping it -- it might be a size we misread, not just noise.
            unparsedLines.push(line);
            continue;
        }

        const width = parseInchesWithFraction(match[1]);
        const height = parseInchesWithFraction(match[2]);
        const quantity = match[3] ? Number(match[3]) : 1;
        if (width == null || height == null) {
            unparsedLines.push(line);
            continue;
        }

        pieces.push({ width, height, quantity });
    }

    if (pieces.length === 0) {
        return { ok: false, reason: 'Could not find any piece dimensions (e.g. "59 6/8 x 120 -1") in the message.' };
    }

    return { ok: true, thickness, glassType, pieces, unparsedLines };
}

// Builds real order line items directly from the parsed pieces -- no
// catalogue item, no CustomDesign row (many of these orders have no sketch
// to show). sourceType: 'design' is what already makes the existing
// "Create PO" flow and requires-design banner (isCustomDesignOrderItem in
// orders/[id]/page.tsx) pick these up automatically, since Toughened Glass
// always needs a supplier purchase order rather than being fulfilled from
// stock. Requires a resolved (non-null) thickness -- the caller must check
// parsed.thickness != null first and ask the customer for it otherwise
// (see buildPendingCustomGlassOrderItems) rather than this function
// guessing a thickness for pricing purposes.
export function buildCustomGlassOrderItems(
    parsed: Extract<CustomGlassOrderResult, { ok: true }> & { thickness: number },
    pricingConfig: PricingConfig,
    taxRate: number,
): InvoiceItem[] {
    const rate = resolveThicknessRate(pricingConfig.thicknessPricing, parsed.thickness, parsed.glassType) ?? Number(pricingConfig.baseRatePerSqft) ?? 0;

    return parsed.pieces.map((piece, index) => {
        // Toughened glass is cut with a rounding allowance -- each edge is
        // rounded up to the next even inch before the area is computed
        // (same convention the custom-design pipeline already uses via
        // calculateDimensionAreaSqft), not the raw width x height.
        const areaSqft = calculateDimensionAreaSqft(piece.width, piece.height, piece.quantity);
        const lineTotal = Math.round(areaSqft * rate * 100) / 100;
        const amount = Math.round((lineTotal / (1 + taxRate / 100)) * 100) / 100;

        return {
            id: generateUUID(),
            itemId: '',
            itemName: `Toughened ${parsed.glassType} Glass ${parsed.thickness}mm`,
            description: `${piece.width}in x ${piece.height}in${piece.quantity > 1 ? ` x ${piece.quantity} pcs` : ''}`,
            type: 'Toughened Glass',
            width: piece.width,
            height: piece.height,
            // quantity must stay equal to sqft for an sqft-unit design item --
            // normalizeDesignItemBillingFields (orderDesignItems.ts) enforces
            // that invariant whenever the order is opened in New/Edit Order,
            // silently overwriting anything else. pieceCount instead carries
            // the real piece count (mostly 1, occasionally 2) for display.
            quantity: areaSqft,
            unit: 'sqft' as const,
            sqft: areaSqft,
            rate,
            rateUnit: 'sqft' as const,
            amount,
            lineTotal,
            sourceType: 'design' as const,
            designPieceId: `custom-toughened-${index + 1}`,
            pieceCount: piece.quantity,
        };
    });
}

// Used when the message named real pieces but never stated a thickness --
// records the exact sizes/quantities the customer asked for (so nothing is
// lost while they're asked to clarify) with rate/amount/lineTotal left at 0
// rather than guessing a thickness, since the shop's rates vary a lot by
// thickness (e.g. ₹85-167/sqft) and guessing wrong would misprice a real
// order. itemName omits "Nmm" to make the pending state visually obvious in
// the order's item list.
export function buildPendingCustomGlassOrderItems(
    parsed: Extract<CustomGlassOrderResult, { ok: true }> & { thickness: null },
): InvoiceItem[] {
    return parsed.pieces.map((piece, index) => {
        const areaSqft = calculateDimensionAreaSqft(piece.width, piece.height, piece.quantity);

        return {
            id: generateUUID(),
            itemId: '',
            itemName: `Toughened ${parsed.glassType} Glass (thickness pending)`,
            description: `${piece.width}in x ${piece.height}in${piece.quantity > 1 ? ` x ${piece.quantity} pcs` : ''}`,
            type: 'Toughened Glass',
            width: piece.width,
            height: piece.height,
            quantity: areaSqft,
            unit: 'sqft' as const,
            sqft: areaSqft,
            rate: 0,
            rateUnit: 'sqft' as const,
            amount: 0,
            lineTotal: 0,
            sourceType: 'design' as const,
            designPieceId: `custom-toughened-${index + 1}`,
            pieceCount: piece.quantity,
        };
    });
}

// Used when a message gives real dimensions but names no glass type at all
// (parseDimensionOnlyLines, not the Toughened-specific header parser) --
// same "record the real pieces, price nothing yet" approach as
// buildPendingCustomGlassOrderItems, just with neither type nor thickness
// known so itemName can't say "Toughened" either.
export function buildUnidentifiedGlassOrderItems(pieces: CustomGlassPiece[]): InvoiceItem[] {
    return pieces.map((piece, index) => {
        const areaSqft = calculateDimensionAreaSqft(piece.width, piece.height, piece.quantity);

        return {
            id: generateUUID(),
            itemId: '',
            itemName: 'Custom Glass (type & thickness pending)',
            description: `${piece.width}in x ${piece.height}in${piece.quantity > 1 ? ` x ${piece.quantity} pcs` : ''}`,
            type: 'Custom Glass',
            width: piece.width,
            height: piece.height,
            quantity: areaSqft,
            unit: 'sqft' as const,
            sqft: areaSqft,
            rate: 0,
            rateUnit: 'sqft' as const,
            amount: 0,
            lineTotal: 0,
            sourceType: 'design' as const,
            designPieceId: `custom-unidentified-${index + 1}`,
            pieceCount: piece.quantity,
        };
    });
}
