import type { GlassSystemInput, GlassSystemType } from '@/lib/glassSystemDesigner';
import { convertLengthToInches } from '@/lib/units';

// Parses a plain WhatsApp/email specification into the same parametric input
// used by the canvas designer. Both compact shop notation and labelled fields
// are accepted, for example:
//   "SFSD 96 x 108 inch 12mm toughened clear"
//   "Design: F, Width: 1200mm, Height: 2100mm, Thickness: 10mm, Glass: clear"
// A known design type and both dimensions are mandatory, which prevents an
// ordinary catalogue line from being mistaken for a drawing request.

const NUMBER_SOURCE = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?`;
const UNIT_SOURCE = String.raw`mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|met(?:er|re)s?|m|ft|feet|foot|'|inches|inch|in|"`;
const MM_VALUE_RE = /(\d+(?:\.\d+)?)\s*mm\b/gi;

const SYSTEM_PHRASES: Array<{ re: RegExp; type: GlassSystemType }> = [
    { re: /\b(single\s+fixed(?:\s+panel)?\s*(?:and|\+)?\s*single\s+door|sfsd)\b/i, type: 'sfsd' },
    { re: /\b(double\s+fixed(?:\s+panels?)?\s*(?:and|\+)?\s*single\s+door|dfsd)\b/i, type: 'dfsd' },
    { re: /\b(single\s+fixed(?:\s+panel)?\s*(?:and|\+)?\s*double\s+door|sfdd)\b/i, type: 'sfdd' },
    { re: /\b(double\s+fixed(?:\s+panels?)?\s*(?:and|\+)?\s*double\s+door|dfdd)\b/i, type: 'dfdd' },
    { re: /\b(block|basic)\b/i, type: 'basic' },
    { re: /\bshower\b/i, type: 'shower_door' },
    { re: /\bsliding\b/i, type: 'sliding_door' },
    { re: /\b(railing|balustrade|baluster)\b/i, type: 'railing' },
    { re: /\b(fixed\s*panel|partition|fixed\s*glass)\b/i, type: 'fixed_panel_f' },
    { re: /\b(swing|pivot)\s*door\b/i, type: 'swing_door' },
    { re: /\bglass\s*door\b/i, type: 'swing_door' },
    { re: /\bdoor\b/i, type: 'swing_door' },
];

function parsePositiveNumber(raw: string): number | null {
    const trimmed = raw.trim();
    const fraction = trimmed.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
    if (fraction) {
        const denominator = Number(fraction[3]);
        if (!denominator) return null;
        return Number(fraction[1]) + Number(fraction[2]) / denominator;
    }
    const value = Number(trimmed);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeLengthUnit(raw: string | undefined): string {
    const unit = String(raw || 'inch').toLowerCase();
    if (unit === "'" || /^(ft|feet|foot)$/.test(unit)) return 'ft';
    if (/^mm|^millimet/.test(unit)) return 'mm';
    if (/^cm|^centimet/.test(unit)) return 'cm';
    if (unit === 'm' || /^met/.test(unit)) return 'm';
    return 'inch';
}

function measurementInches(rawValue: string, rawUnit?: string): number | null {
    const value = parsePositiveNumber(rawValue);
    if (value == null) return null;
    const inches = convertLengthToInches(value, normalizeLengthUnit(rawUnit));
    return Number.isFinite(inches) && inches > 0 ? Number(inches.toFixed(3)) : null;
}

function findSystemType(text: string): GlassSystemType | null {
    // Single-letter owner codes only count when labelled or placed alone on a
    // line. This keeps an incidental letter B/F in prose from creating an order.
    const labelledCode = text.match(/\b(?:design\s*type|design|drawing\s*type)\s*[:=\-]?\s*(SFSD|DFSD|SFDD|DFDD|B|F)\b/i)?.[1]?.toUpperCase();
    const standaloneCode = text.match(/^\s*(SFSD|DFSD|SFDD|DFDD|B|F)\s*$/im)?.[1]?.toUpperCase();
    const code = labelledCode || standaloneCode;
    if (code === 'B') return 'basic';
    if (code === 'F') return 'fixed_panel_f';
    if (code) return code.toLowerCase() as GlassSystemType;

    return SYSTEM_PHRASES.find(candidate => candidate.re.test(text))?.type || null;
}

function findDimensions(text: string): { widthIn: number; heightIn: number } | null {
    const labelled = (label: 'width' | 'height') => {
        const short = label === 'width' ? 'w' : 'h';
        const expression = new RegExp(
            String.raw`\b(?:${label}|${short})\s*(?:is|[:=\-])?\s*(${NUMBER_SOURCE})\s*(${UNIT_SOURCE})?\b`,
            'i',
        );
        const match = text.match(expression);
        return match ? { value: match[1], unit: match[2] } : null;
    };

    const width = labelled('width');
    const height = labelled('height');
    if (width && height) {
        const widthIn = measurementInches(width.value, width.unit || height.unit);
        const heightIn = measurementInches(height.value, height.unit || width.unit);
        return widthIn && heightIn ? { widthIn, heightIn } : null;
    }

    const compact = text.match(new RegExp(
        String.raw`(${NUMBER_SOURCE})\s*(${UNIT_SOURCE})?\s*[x×*]\s*(${NUMBER_SOURCE})\s*(${UNIT_SOURCE})?`,
        'i',
    ));
    if (!compact) return null;
    const widthIn = measurementInches(compact[1], compact[2] || compact[4]);
    const heightIn = measurementInches(compact[3], compact[4] || compact[2]);
    return widthIn && heightIn ? { widthIn, heightIn } : null;
}

function findGlassType(text: string): string | undefined {
    const labelled = text.match(/\b(?:glass\s*type|glass|finish|colour|color)\s*(?:is|[:=\-])?\s*([^\n,;]+)/i)?.[1]
        ?.replace(/\b(?:thickness|design|width|height)\b.*$/i, '')
        .trim();
    if (labelled) return labelled;

    const lower = text.toLowerCase();
    const knownFinishes: Array<[RegExp, string]> = [
        [/\b(?:toughened|tempered)\s+clear\b|\bclear\s+(?:toughened|tempered)\b/, 'Toughened Clear'],
        [/\b(?:tinted\s+)?grey\b|\bgray\b/, 'Toughened Tinted Grey'],
        [/\b(?:tinted\s+)?bronze\b/, 'Toughened Tinted Bronze'],
        [/\bfrosted\b|\bacid\s*etched\b/, 'Toughened Frosted'],
        [/\breflective\s+blue\b/, 'Toughened Reflective Blue'],
        [/\breflective\s+green\b/, 'Toughened Reflective Green'],
        [/\bclear\b/, 'Toughened Clear'],
    ];
    return knownFinishes.find(([pattern]) => pattern.test(lower))?.[1];
}

function findThickness(text: string): number {
    const labelled = text.match(/\b(?:glass\s*)?thickness\s*(?:is|[:=\-])?\s*(\d+(?:\.\d+)?)\s*mm\b/i);
    if (labelled) return Number(labelled[1]);

    // Metric width/height values also end in "mm". Only a plausible glass
    // thickness may be inferred from an unlabelled mm value.
    const candidates = Array.from(text.matchAll(MM_VALUE_RE))
        .map(match => Number(match[1]))
        .filter(value => Number.isFinite(value) && value >= 2 && value <= 30);
    return candidates.at(-1) ?? 12;
}

export function looksLikeGlassSystemOrder(text: string): boolean {
    return findSystemType(text || '') != null && findDimensions(text || '') != null;
}

export type GlassSystemOrderResult =
    | { ok: true; input: GlassSystemInput }
    | { ok: false; reason: string };

export function parseGlassSystemOrder(text: string): GlassSystemOrderResult {
    const t = text || '';
    const systemType = findSystemType(t);
    if (!systemType) {
        return { ok: false, reason: 'No known design type named (B, F, SFSD, DFSD, SFDD, DFDD, door, fixed panel, sliding, shower, or railing).' };
    }

    const dimensions = findDimensions(t);
    if (!dimensions) {
        return { ok: false, reason: 'Width and height were not readable. Use "Width: 48in, Height: 84in" or "48 x 84in".' };
    }
    if (dimensions.widthIn > 400 || dimensions.heightIn > 400) {
        return { ok: false, reason: 'The converted width or height exceeds 400 inches; check the numbers and units.' };
    }

    const thickness = findThickness(t);
    const lower = t.toLowerCase();
    const hingeSide: 'left' | 'right' = /\bright\b/.test(lower) && !/\bleft\b/.test(lower) ? 'right' : 'left';
    const pivotStyle: 'patch' | 'hinges' = /\b(patch|floor\s*spring)\b/.test(lower) ? 'patch' : 'hinges';
    const fixingStyle: 'channel' | 'spider' | 'standoff' =
        /\bspider\b/.test(lower) ? 'spider' : /\bstand\s*off|standoff\b/.test(lower) ? 'standoff' : 'channel';
    const hasLock = !/\bno\s*lock\b/.test(lower);
    const hasHandle = !/\bno\s*handle\b/.test(lower);

    let fixedPanelWidthIn = 0;
    const fixedMatch = lower.match(/fixed(?:\s*panel)?\s*(\d+(?:\.\d+)?)/) || lower.match(/(\d+(?:\.\d+)?)\s*(?:in|")?\s*fixed/);
    if (fixedMatch) fixedPanelWidthIn = Number(fixedMatch[1]) || 0;

    return {
        ok: true,
        input: {
            systemType,
            ...dimensions,
            thickness,
            hingeSide,
            pivotStyle,
            hasLock,
            hasHandle,
            fixingStyle,
            fixedPanelWidthIn,
            glassType: findGlassType(t),
        },
    };
}
