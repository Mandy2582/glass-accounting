import type { GlassItem } from '@/types';

// Lets an authorized WhatsApp number reprice a whole product line in one
// message -- e.g. "12mm Saint Gobain Clear 85" -- instead of editing every
// size by hand. The catalogue's own naming convention is
// "{make} {color/type descriptor} Glass {thickness}mm {WxH}ft", and every
// size sharing the same make+thickness+descriptor is priced identically per
// sqft, so the whole point is to find every item matching that combination
// regardless of size and set them all to the new rate at once.

export type RateUpdateResult =
    | { ok: true; matched: GlassItem[]; descriptor: string; thickness: number; make: string; rate: number }
    | { ok: false; reason: string };

function normalize(value: string): string {
    return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOPWORDS = new Set(['mm', 'the', 'and', 'for', 'glass', 'rs', 'rupees', 'per', 'sqft', 'sq', 'ft', 'rate', 'price', 'update', 'set', 'to', 'at']);

function tokenize(value: string): string[] {
    return normalize(value).split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// Reduces a catalogue item's name down to just its color/type descriptor,
// e.g. "Saint Gobain Reflective Gold Glass 5mm 4x6ft" -> "reflective gold".
// This is what distinguishes items that share a make+thickness but are
// priced differently (Reflective Gold vs Reflective Brown, both "type":
// "Reflective Glass" in the catalogue's own broader category field).
function deriveDescriptor(item: GlassItem): string {
    let s = normalize(item.name);
    if (item.make) s = s.replace(normalize(item.make), ' ');
    if (item.thickness) s = s.replace(new RegExp(`\\b${item.thickness}\\s*mm\\b`, 'g'), ' ');
    s = s.replace(/\bglass\b/g, ' ');
    // WxH-ft size suffix, e.g. "4x6ft", "5.4x8ft".
    s = s.replace(/\b\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*ft\b/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
}

// Explicit price markers are checked first ("Rs 85", "85/sqft", "@85") so a
// thickness-looking number never gets mistaken for the rate and vice versa.
// Falls back to "the one number left after removing the thickness" when no
// marker is present, since staff will often just write "12mm Saint Gobain
// Clear 85" with no unit at all.
function extractRate(text: string, thicknessMatch: string | null): number | null {
    const patterns = [
        /(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)/i,
        /([\d,]+(?:\.\d+)?)\s*(?:\/|per)\s*sq\s*\.?\s*f?t?/i,
        /@\s*([\d,]+(?:\.\d+)?)/,
    ];
    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) return Number(m[1].replace(/,/g, ''));
    }

    const withoutThickness = thicknessMatch ? text.replace(thicknessMatch, ' ') : text;
    const numbers = withoutThickness.match(/[\d,]+(?:\.\d+)?/g) || [];
    if (numbers.length === 1) return Number(numbers[0].replace(/,/g, ''));
    return null;
}

export function parseAndApplyRateUpdate(text: string, catalogItems: GlassItem[]): RateUpdateResult {
    const trimmed = (text || '').trim();
    if (!trimmed) return { ok: false, reason: 'Empty message.' };

    const thicknessRegex = /(\d+(?:\.\d+)?)\s*mm\b/i;
    const thicknessRawMatch = trimmed.match(thicknessRegex);
    if (!thicknessRawMatch) {
        return { ok: false, reason: 'Could not find a thickness (e.g. "12mm") in your message. Format: <thickness>mm <make> <color/type> <rate>' };
    }
    const thickness = Number(thicknessRawMatch[1]);

    const glassItems = catalogItems.filter(item => (item.category || 'glass') === 'glass');
    const knownMakes = Array.from(new Set(glassItems.map(item => item.make).filter((m): m is string => !!m)));
    const normalizedText = normalize(trimmed);
    const matchedMake = knownMakes.find(make => normalizedText.includes(normalize(make)));
    if (!matchedMake) {
        return {
            ok: false,
            reason: `Could not identify the make/brand. Known makes: ${knownMakes.join(', ') || '(none in catalogue yet)'}.`,
        };
    }

    const rate = extractRate(trimmed, thicknessRawMatch[0]);
    if (rate == null || !(rate > 0)) {
        return { ok: false, reason: 'Could not find a price in your message (e.g. "Rs 85" or "85/sqft").' };
    }

    const candidates = glassItems.filter(item => item.make === matchedMake && Number(item.thickness) === thickness);
    if (candidates.length === 0) {
        return { ok: false, reason: `No ${matchedMake} items at ${thickness}mm found in inventory.` };
    }

    // Descriptor tokens: whatever words are left after removing the make
    // name, the thickness phrase, and whatever the rate pattern matched.
    let remainder = normalizedText.replace(normalize(matchedMake), ' ').replace(normalize(thicknessRawMatch[0]), ' ');
    remainder = remainder.replace(new RegExp(String(rate).replace('.', '\\.'), 'g'), ' ');
    const descriptorTokens = tokenize(remainder);

    const byDescriptor = new Map<string, GlassItem[]>();
    candidates.forEach(item => {
        const descriptor = deriveDescriptor(item);
        byDescriptor.set(descriptor, [...(byDescriptor.get(descriptor) || []), item]);
    });
    const descriptors = Array.from(byDescriptor.keys());

    let chosenDescriptor: string;
    if (descriptorTokens.length === 0) {
        if (descriptors.length === 1) {
            chosenDescriptor = descriptors[0];
        } else {
            return {
                ok: false,
                reason: `${matchedMake} ${thickness}mm has more than one type/color -- say which one. Options: ${descriptors.join(' | ')}.`,
            };
        }
    } else {
        const scored = descriptors
            .map(descriptor => {
                const descriptorWords = new Set(tokenize(descriptor));
                const overlap = descriptorTokens.filter(t => descriptorWords.has(t)).length;
                return { descriptor, overlap };
            })
            .filter(entry => entry.overlap > 0)
            .sort((a, b) => b.overlap - a.overlap);

        if (scored.length === 0) {
            return {
                ok: false,
                reason: `Could not match "${descriptorTokens.join(' ')}" to a type/color for ${matchedMake} ${thickness}mm. Options: ${descriptors.join(' | ')}.`,
            };
        }
        chosenDescriptor = scored[0].descriptor;
    }

    const matched = byDescriptor.get(chosenDescriptor) || [];
    return { ok: true, matched, descriptor: chosenDescriptor, thickness, make: matchedMake, rate };
}

// Pulls just the "WxHft" size suffix off a catalogue item's name (already
// human-readable there) rather than recomputing it from width/height, which
// use rounded common-size labels (e.g. 64in wide is named "5.4x8ft", not the
// exact 5.33ft) that aren't worth re-deriving here.
function sizeLabel(item: GlassItem): string {
    const match = item.name.match(/(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*ft)\s*$/i);
    return match ? match[1] : item.name;
}

export function formatRateUpdateReply(result: RateUpdateResult): string {
    if (!result.ok) {
        return `Rate update not applied.\n${result.reason}`;
    }
    const sizes = result.matched.map(sizeLabel).join(', ');
    return [
        `Rate updated: ${result.make} ${result.descriptor} ${result.thickness}mm -> Rs ${result.rate}/sqft`,
        `Applied to ${result.matched.length} size${result.matched.length === 1 ? '' : 's'}: ${sizes}`,
    ].join('\n');
}
