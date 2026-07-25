import type { GlassSystemInput, GlassSystemType } from '@/lib/glassSystemDesigner';

// Detects and parses a "generate me a standard glass system" order from a
// WhatsApp/text message -- e.g. "shower door 30 x 72 12mm" or "sliding door
// 48x84 10mm hinge right". When a system type + a width x height are both
// present, the order intake can generate the full standard hardware layout
// (via generateGlassSystem) instead of trying to read holes off a photo.
//
// Deliberately keyword-anchored and conservative: it only fires when the
// message clearly names one of the known system types AND gives a size, so
// an ordinary catalogue or custom-cut order isn't hijacked.

// Order matters: more specific phrases are tested before the generic
// "door"/"glass", so "shower door" -> shower_door (not swing_door), and
// "sliding door" -> sliding_door.
const SYSTEM_KEYWORDS: Array<{ re: RegExp; type: GlassSystemType }> = [
    { re: /\bshower\b/i, type: 'shower_door' },
    { re: /\bsliding\b/i, type: 'sliding_door' },
    { re: /\b(railing|balustrade|baluster)\b/i, type: 'railing' },
    { re: /\b(fixed\s*panel|partition|fixed\s*glass)\b/i, type: 'fixed_panel' },
    { re: /\b(swing|pivot)\s*door\b/i, type: 'swing_door' },
    { re: /\bglass\s*door\b/i, type: 'swing_door' },
    { re: /\bdoor\b/i, type: 'swing_door' },
];

const THICKNESS_RE = /(\d+(?:\.\d+)?)\s*mm\b/i;
// WIDTH x HEIGHT with optional eighths-style fractions ("30 4/8 x 72"),
// tolerating stray inch quotes and "X"/"*" as the separator.
const SIZE_RE = /(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*(?:in|inch|")?\s*[x×*]\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*(?:in|inch|")?/i;

function parseInchesWithFraction(raw: string): number | null {
    const trimmed = raw.trim();
    const frac = trimmed.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
    if (frac) {
        const denom = Number(frac[3]);
        if (!denom) return null;
        return Number(frac[1]) + Number(frac[2]) / denom;
    }
    const plain = Number(trimmed);
    return Number.isFinite(plain) && plain > 0 ? plain : null;
}

export function looksLikeGlassSystemOrder(text: string): boolean {
    const t = text || '';
    return SYSTEM_KEYWORDS.some(k => k.re.test(t)) && SIZE_RE.test(t);
}

export type GlassSystemOrderResult =
    | { ok: true; input: GlassSystemInput }
    | { ok: false; reason: string };

// Parses a message into a GlassSystemInput ready for generateGlassSystem.
// Options are read when hinted ("hinge right", "patch", "no lock", "with
// handle", "fixed 24"); otherwise sensible per-type defaults are used.
export function parseGlassSystemOrder(text: string): GlassSystemOrderResult {
    const t = text || '';

    const match = SYSTEM_KEYWORDS.find(k => k.re.test(t));
    if (!match) return { ok: false, reason: 'No known glass system type named (shower door, sliding door, swing door, fixed panel, railing).' };

    const size = t.match(SIZE_RE);
    if (!size) return { ok: false, reason: 'No width x height size found (e.g. "30 x 72").' };
    const widthIn = parseInchesWithFraction(size[1]);
    const heightIn = parseInchesWithFraction(size[2]);
    if (widthIn == null || heightIn == null) return { ok: false, reason: 'Could not read the width x height numbers.' };

    const thicknessMatch = t.match(THICKNESS_RE);
    const thickness = thicknessMatch ? Number(thicknessMatch[1]) : 12;

    const lower = t.toLowerCase();
    const hingeSide: 'left' | 'right' = /\bright\b/.test(lower) && !/\bleft\b/.test(lower) ? 'right' : 'left';
    const pivotStyle: 'patch' | 'hinges' = /\b(patch|floor\s*spring)\b/.test(lower) ? 'patch' : 'hinges';
    const fixingStyle: 'channel' | 'spider' | 'standoff' =
        /\bspider\b/.test(lower) ? 'spider' : /\bstand\s*off|standoff\b/.test(lower) ? 'standoff' : 'channel';
    // Default hardware present unless explicitly negated.
    const hasLock = !/\bno\s*lock\b/.test(lower);
    const hasHandle = !/\bno\s*handle\b/.test(lower);

    // Optional adjoining fixed panel ("... fixed 24" / "with 24 fixed panel").
    let fixedPanelWidthIn = 0;
    const fixedMatch = lower.match(/fixed(?:\s*panel)?\s*(\d+(?:\.\d+)?)/) || lower.match(/(\d+(?:\.\d+)?)\s*(?:in|")?\s*fixed/);
    if (fixedMatch) fixedPanelWidthIn = Number(fixedMatch[1]) || 0;

    const input: GlassSystemInput = {
        systemType: match.type,
        widthIn,
        heightIn,
        thickness,
        hingeSide,
        pivotStyle,
        hasLock,
        hasHandle,
        fixingStyle,
        fixedPanelWidthIn,
    };
    return { ok: true, input };
}
