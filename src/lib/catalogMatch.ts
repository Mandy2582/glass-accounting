import type { GlassItem } from '@/types';
import { CATALOGUE_SYNONYMS, KNOWN_GLASS_COLOURS, GLASS_CATEGORY_TOKENS, extractDimensionPair as extractSizePair, sizeMatchesItem } from '@/lib/whatsappOrders';

// Shared matching engine behind every WhatsApp catalogue command (rate,
// stock, purchase). Glass items are matched as a GROUP first --
// make+thickness+colour/type -- since every size within that group shares
// one selling price (the shop's own pricing convention), which is exactly
// the granularity a RATE update needs. Stock and purchase then narrow that
// group down to one exact sheet size via extractSizePair/sizeMatchesItem,
// since stock counts and purchase quantities are inherently per-size.
// Hardware has no thickness/size axis at all and is matched directly by
// name/type/make/model.

function normalize(value: string): string {
    return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOPWORDS = new Set(['mm', 'the', 'and', 'for', 'glass', 'rs', 'rupees', 'per', 'sqft', 'sq', 'ft', 'rate', 'stock', 'price', 'purchase', 'update', 'set', 'to', 'at']);

function tokenize(value: string): string[] {
    return normalize(value)
        .split(/\s+/)
        .map(token => CATALOGUE_SYNONYMS[token] || token)
        .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

// Business priority when no make is named: Gold Plus and Asahi are the
// shop's default glass brands (matches whatsappOrders.ts's
// orderCandidatesByBrandPriority comment) -- Saint Gobain is only ever
// used when asked for by name.
export const GLASS_DEFAULT_MAKES = ['Gold Plus', 'Asahi'];

export function resolveMakes(text: string, knownMakes: string[]): string[] {
    const normalizedText = normalize(text);
    const explicit = knownMakes.find(make => normalizedText.includes(normalize(make)));
    if (explicit) return [explicit];
    return GLASS_DEFAULT_MAKES.filter(make => knownMakes.includes(make));
}

// Reduces a catalogue item's name down to just its color/type descriptor,
// e.g. "Saint Gobain Reflective Gold Glass 5mm 4x6ft" -> "reflective gold".
// This is what distinguishes items that share a make+thickness but are
// priced differently (Reflective Gold vs Tinted Grey).
export function deriveDescriptor(item: GlassItem): string {
    let s = normalize(item.name);
    if (item.make) s = s.replace(normalize(item.make), ' ');
    if (item.thickness) s = s.replace(new RegExp(`\\b${item.thickness}\\s*mm\\b`, 'g'), ' ');
    s = s.replace(/\bglass\b/g, ' ');
    s = s.replace(/\b\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*ft\b/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
}

export type GlassGroupMatch =
    | { ok: true; matched: GlassItem[]; descriptor: string; thickness: number; makes: string[]; thicknessRawMatch: string }
    | { ok: false; reason: string };

export function matchGlassGroup(text: string, glassItems: GlassItem[]): GlassGroupMatch {
    const thicknessRegex = /(\d+(?:\.\d+)?)\s*mm\b/i;
    const thicknessMatch = text.match(thicknessRegex);
    if (!thicknessMatch) {
        return { ok: false, reason: 'Could not find a thickness (e.g. "12mm") in your message.' };
    }
    const thickness = Number(thicknessMatch[1]);

    const knownMakes = Array.from(new Set(glassItems.map(item => item.make).filter((m): m is string => !!m)));
    const makes = resolveMakes(text, knownMakes);
    if (makes.length === 0) {
        return {
            ok: false,
            reason: `Could not identify the make/brand, and no default (Gold Plus/Asahi) items exist to fall back to. Known makes: ${knownMakes.join(', ') || '(none in catalogue yet)'}.`,
        };
    }

    const candidates = glassItems.filter(item => makes.includes(item.make || '') && Number(item.thickness) === thickness);
    if (candidates.length === 0) {
        return { ok: false, reason: `No ${makes.join('/')} items at ${thickness}mm found in inventory.` };
    }

    const normalizedText = normalize(text);
    let remainder = normalizedText.replace(normalize(thicknessMatch[0]), ' ');
    makes.forEach(make => { remainder = remainder.replace(normalize(make), ' '); });
    const descriptorTokens = tokenize(remainder);

    const byDescriptor = new Map<string, GlassItem[]>();
    candidates.forEach(item => {
        const descriptor = deriveDescriptor(item);
        byDescriptor.set(descriptor, [...(byDescriptor.get(descriptor) || []), item]);
    });
    const descriptors = Array.from(byDescriptor.keys());

    // Same "bare colour implies Tinted" tie-break as whatsappOrders.ts --
    // deriveDescriptor doesn't strip the category word, so a Tinted and a
    // Reflective item of the same colour produce different descriptor
    // strings ("tinted grey" vs "reflective grey"), but a bare "grey" with
    // no category word scores an equal 1-word overlap against both unless
    // nudged. Only applies when the message names a colour with no
    // category word, and the bonus is too small to override a real
    // category/colour mismatch.
    const preferTinted = !descriptorTokens.some(t => GLASS_CATEGORY_TOKENS.includes(t))
        && descriptorTokens.some(t => KNOWN_GLASS_COLOURS.includes(t));

    let chosenDescriptor: string;
    if (descriptorTokens.length === 0) {
        if (descriptors.length === 1) {
            chosenDescriptor = descriptors[0];
        } else {
            return {
                ok: false,
                reason: `${makes.join('/')} ${thickness}mm has more than one type/colour -- say which one. Options: ${descriptors.join(' | ')}.`,
            };
        }
    } else {
        const scored = descriptors
            .map(descriptor => {
                const descriptorWords = tokenize(descriptor);
                const overlap = descriptorTokens.filter(t => descriptorWords.includes(t)).length;
                const tieBreak = preferTinted && descriptorWords.includes('tinted') ? 0.5 : 0;
                return { descriptor, score: overlap + tieBreak, overlap };
            })
            .filter(entry => entry.overlap > 0)
            .sort((a, b) => b.score - a.score);

        if (scored.length === 0) {
            return {
                ok: false,
                reason: `Could not match "${descriptorTokens.join(' ')}" to a type/colour for ${makes.join('/')} ${thickness}mm. Options: ${descriptors.join(' | ')}.`,
            };
        }
        chosenDescriptor = scored[0].descriptor;
    }

    const matched = byDescriptor.get(chosenDescriptor) || [];
    return { ok: true, matched, descriptor: chosenDescriptor, thickness, makes, thicknessRawMatch: thicknessMatch[0] };
}

export type HardwareMatch =
    | { ok: true; item: GlassItem }
    | { ok: false; reason: string };

// Hardware has no thickness/size axis -- matched directly on name/type/
// make/model token overlap, same scoring shape as whatsappOrders.ts's
// findCandidateItems but without the glass-only colour/size logic.
export function matchHardwareItem(text: string, hardwareItems: GlassItem[]): HardwareMatch {
    const lineTokens = tokenize(text);
    if (!lineTokens.length) return { ok: false, reason: 'Could not read an item description in your message.' };

    const scored = hardwareItems
        .map(item => {
            const haystack = tokenize(`${item.name} ${item.type || ''} ${item.make || ''} ${item.model || ''}`);
            const score = haystack.filter(token => lineTokens.includes(token)).length;
            return { item, score };
        })
        .filter(entry => entry.score >= 2)
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
        return { ok: false, reason: 'Could not match a hardware item to your message.' };
    }

    const topScore = scored[0].score;
    const tied = scored.filter(entry => entry.score === topScore);
    if (tied.length > 1) {
        const names = tied.map(entry => `${entry.item.make ? entry.item.make + ' ' : ''}${entry.item.name}`).join(' | ');
        return { ok: false, reason: `More than one hardware item matches -- say which one. Options: ${names}.` };
    }

    return { ok: true, item: scored[0].item };
}

// Explicit markers are checked first ("Rs 85", "85/sqft", "@85") so a
// thickness-looking number is never mistaken for the value being set, and
// vice versa. Falls back to "the one number left after removing the
// excluded match" when no marker is present, since staff will often just
// write "12mm Saint Gobain Clear 85" with no unit at all.
export function extractTrailingNumber(text: string, exclude?: Array<string | null | undefined> | string | null): number | null {
    const patterns = [
        /(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)/i,
        /([\d,]+(?:\.\d+)?)\s*(?:\/|per)\s*sq\s*\.?\s*f?t?/i,
        /@\s*([\d,]+(?:\.\d+)?)/,
    ];
    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) return Number(m[1].replace(/,/g, ''));
    }

    const excludeList = Array.isArray(exclude) ? exclude : exclude ? [exclude] : [];
    let withoutExclusion = text;
    excludeList.forEach(match => { if (match) withoutExclusion = withoutExclusion.replace(match, ' '); });
    const numbers = withoutExclusion.match(/[\d,]+(?:\.\d+)?/g) || [];
    if (numbers.length === 1) return Number(numbers[0].replace(/,/g, ''));
    return null;
}

// Pulls just the "WxHft" size suffix off a catalogue item's name (already
// human-readable there) rather than recomputing it from width/height.
export function sizeLabel(item: GlassItem): string {
    const match = item.name.match(/(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*ft)\s*$/i);
    return match ? match[1] : item.name;
}

// Same size-pair extraction as whatsappOrders.ts's extractDimensionPair,
// but also returns the raw matched substring -- stock/purchase messages
// need to exclude that substring (alongside the thickness match) before
// falling back to "the one number left" for the stock count/quantity.
const SIZE_MATCH_REGEX = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i;
export function extractSizeMatch(text: string): { dims: { a: number; b: number }; raw: string } | null {
    const m = text.match(SIZE_MATCH_REGEX);
    if (!m) return null;
    return { dims: { a: Number(m[1]), b: Number(m[2]) }, raw: m[0] };
}

export { extractSizePair, sizeMatchesItem };
