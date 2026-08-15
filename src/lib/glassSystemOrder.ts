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
    { re: /\b(single\s+(?:glass\s+)?door|single\s+door|sd)\b/i, type: 'single_door' },
    { re: /\b(double\s+(?:glass\s+)?door|double\s+door|dd)\b/i, type: 'double_door' },
    { re: /\b(block|basic)\b/i, type: 'basic' },
    { re: /\b(?:4|four)[-\s]*(?:panel|piece).*\b(?:patio\s+)?sliding\b|\b(?:patio\s+)?sliding.*\b(?:4|four)[-\s]*(?:panel|piece)\b/i, type: 'sliding_4pc_patio' },
    { re: /\b(?:top[-\s]?hung|barn[-\s]?style|exposed\s+roller)\s+(?:glass\s+)?slid(?:er|ing)\b/i, type: 'top_hung_sliding' },
    { re: /\b(?:2|two)[-\s]*(?:panel|piece).*\bshower\s+sliding\b|\bshower\s+sliding(?:\s+(?:system|door))?\b/i, type: 'shower_sliding_2pc' },
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
            'gi',
        );
        const match = Array.from(text.matchAll(expression)).find(candidate => {
            const before = text.slice(Math.max(0, candidate.index! - 12), candidate.index).toLowerCase();
            return !/door\s*$/.test(before);
        });
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

export function parseDoorOpeningDimensions(text: string): { doorWidthIn?: number; doorHeightIn?: number } {
    const read = (label: 'width' | 'height') => {
        const expression = new RegExp(
            String.raw`\bdoor\s+${label}\s*(?:is|[:=\-])?\s*(${NUMBER_SOURCE})\s*(${UNIT_SOURCE})?\b`,
            'i',
        );
        const match = text.match(expression);
        return match ? measurementInches(match[1], match[2]) ?? undefined : undefined;
    };
    return { doorWidthIn: read('width'), doorHeightIn: read('height') };
}

function findGlassType(text: string): string | undefined {
    const labelled = (text.match(/\b(?:glass\s*type|finish|colour|color)\s*(?:is|[:=\-])?\s*([^\n,;]+)/i)
        || text.match(/\bglass\s*[:=]\s*([^\n,;]+)/i))?.[1]
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
    const source = text || '';
    const systemType = findSystemType(source);
    if (!systemType) return false;
    if (findDimensions(source)) return true;
    const door = parseDoorOpeningDimensions(source);
    return (systemType === 'single_door' || systemType === 'double_door')
        && !!door.doorWidthIn
        && !!door.doorHeightIn;
}

export type GlassSystemOrderResult =
    | { ok: true; input: GlassSystemInput; missingCustomerChoices: DoorConfigurationField[] }
    | { ok: false; reason: string };

export type DoorConfigurationField = 'fitting' | 'door_position' | 'hinge_side' | 'swing_direction' | 'sliding_panel_position';

const CUSTOMER_CONFIGURED_DOOR_SYSTEMS = new Set<GlassSystemType>([
    'swing_door',
    'single_door',
    'double_door',
    'sfsd',
    'dfsd',
    'sfdd',
    'dfdd',
    'sliding_door',
    'top_hung_sliding',
    'shower_sliding_2pc',
]);

const CUSTOMER_CONFIGURED_SLIDING_SYSTEMS = new Set<GlassSystemType>([
    'sliding_door',
    'top_hung_sliding',
    'shower_sliding_2pc',
]);

export function parseDoorConfiguration(text: string): Pick<
    GlassSystemInput,
    'pivotStyle' | 'doorPosition' | 'hingeSide' | 'swingDirection' | 'slidingPanelPosition'
> {
    const source = (text || '').toLowerCase();
    const mentionsHinges = /\b(?:side|wall[-\s]?to[-\s]?glass|glass[-\s]?to[-\s]?glass)\s+hinges?\b|\bhinges\b|\bhinged\s+door\b/.test(source)
        && !/\b(?:no|without)\s+(?:side\s+)?hinges?\b/.test(source);
    const mentionsPatch = /\b(?:top\s*(?:and|&)\s*bottom\s*)?patch(?:\s+fittings?)?\b|\bfloor\s*spring\b/.test(source)
        && !/\b(?:no|without)\s+(?:top\s*(?:and|&)\s*bottom\s*)?patch/.test(source);
    const fitting: GlassSystemInput['pivotStyle'] =
        /\bpatch(?:\s+fittings?)?\s+instead\s+of\s+(?:side\s+)?hinges?\b/.test(source)
            ? 'patch'
            : /\b(?:side\s+)?hinges?\s+instead\s+of\s+(?:top\s*(?:and|&)\s*bottom\s*)?patch/.test(source)
                ? 'hinges'
                : mentionsHinges !== mentionsPatch ? (mentionsHinges ? 'hinges' : 'patch') : undefined;
    const positionMatch = source.match(/\bdoor\s+(?:(?:position\s*(?:is|:|-)?|on(?:\s+the)?)\s+)?(left|right|centre|center)\b/)
        || source.match(/\b(left|right|centre|center)\s+(?:side\s+)?door\b/);
    const hingeMatch = source.match(/\b(?:hinge|pivot)\s*side\s*(?:is|:|-)?\s*(left|right)\b/)
        || source.match(/\bhinges?\s+(?:are\s+|on\s+(?:the\s+)?)?(left|right)\b/);
    const swingMatch = source.match(/\b(?:opens?|opening|swing(?:s|ing)?)(?:\s+direction)?(?:\s*(?:is|:|-))?(?:\s+to)?\s+(inwards?|outwards?|inside|outside|both(?:\s+ways?)?|double[-\s]?action)\b/)
        || source.match(/\b(inwards?|outwards?|inside|outside|both(?:\s+ways?)?|double[-\s]?action)\s+(?:opening|swing)\b/);
    const swingValue = swingMatch?.[1];
    const slidingPositionMatch = source.match(/\b(?:moving|sliding)\s+(?:glass\s+)?(?:panel|door|leaf)\s+(?:(?:position\s*(?:is|:|-)?|on(?:\s+the)?)\s+)?(left|right)\b/)
        || source.match(/\b(left|right)\s+(?:side\s+)?(?:moving|sliding)\s+(?:glass\s+)?(?:panel|door|leaf)\b/);

    return {
        ...(fitting ? { pivotStyle: fitting } : {}),
        ...(positionMatch ? {
            doorPosition: positionMatch[1] === 'center' ? 'centre' : positionMatch[1] as GlassSystemInput['doorPosition'],
        } : {}),
        ...(hingeMatch ? { hingeSide: hingeMatch[1] as 'left' | 'right' } : {}),
        ...(swingValue ? {
            swingDirection: /both|double/.test(swingValue)
                ? 'both'
                : /inside|inward/.test(swingValue) ? 'inward' : 'outward',
        } : {}),
        ...(slidingPositionMatch ? { slidingPanelPosition: slidingPositionMatch[1] as 'left' | 'right' } : {}),
    };
}

export function getMissingDoorConfiguration(input: GlassSystemInput): DoorConfigurationField[] {
    if (!CUSTOMER_CONFIGURED_DOOR_SYSTEMS.has(input.systemType)) return [];

    const missing: DoorConfigurationField[] = [];
    if (CUSTOMER_CONFIGURED_SLIDING_SYSTEMS.has(input.systemType)) {
        if (!input.slidingPanelPosition) missing.push('sliding_panel_position');
        return missing;
    }
    if (!input.pivotStyle) missing.push('fitting');
    if ((input.systemType === 'sfsd' || input.systemType === 'sfdd') && !input.doorPosition) {
        missing.push('door_position');
    }
    if (input.systemType !== 'double_door' && input.systemType !== 'sfdd' && input.systemType !== 'dfdd' && !input.hingeSide) {
        missing.push('hinge_side');
    }
    if (!input.swingDirection) missing.push('swing_direction');
    return missing;
}

export function applyDoorConfigurationReply(input: GlassSystemInput, reply: string): GlassSystemInput {
    const originallyMissing = getMissingDoorConfiguration(input);
    let completed = { ...input, ...parseDoorConfiguration(reply) };

    const parseChoice = (field: DoorConfigurationField, rawValue: string): Partial<GlassSystemInput> => {
        const value = rawValue.toLowerCase().trim().replace(/^[\d]+\s*[).:-]\s*/, '').replace(/[.!]+$/g, '').trim();
        if (field === 'fitting') {
            if (/\b(?:side\s+)?hinges?\b/.test(value)) return { pivotStyle: 'hinges' };
            if (/\bpatch(?:\s+fittings?)?\b|\bfloor\s+spring\b/.test(value)) return { pivotStyle: 'patch' };
        }
        if (field === 'swing_direction') {
            if (/^(?:in|inside|inward|inwards)$/.test(value)) return { swingDirection: 'inward' };
            if (/^(?:out|outside|outward|outwards)$/.test(value)) return { swingDirection: 'outward' };
            if (/^(?:both|both\s+ways?|double[-\s]?action|in\s+and\s+out|inside\s+and\s+outside)$/.test(value)) {
                return { swingDirection: 'both' };
            }
        }
        if (/^(?:left|right)$/.test(value)) {
            const side = value as 'left' | 'right';
            if (field === 'door_position') return { doorPosition: side };
            if (field === 'hinge_side') return { hingeSide: side };
            if (field === 'sliding_panel_position') return { slidingPanelPosition: side };
        }
        return {};
    };

    // Customers commonly answer the numbered prompt as a matching list of
    // short values rather than repeating every label. Respect that order.
    const choices = reply.split(/[\n;,]+/).map(value => value.trim()).filter(Boolean);
    if (originallyMissing.length > 1 && choices.length === originallyMissing.length) {
        originallyMissing.forEach((field, index) => {
            completed = { ...completed, ...parseChoice(field, choices[index]) };
        });
    }

    // Once only one question remains, a concise answer is unambiguous:
    // "outwards", "patch", or "right" should finish the conversation.
    const stillMissing = getMissingDoorConfiguration(completed);
    if (stillMissing.length === 1) {
        completed = { ...completed, ...parseChoice(stillMissing[0], reply) };
    }

    return completed;
}

export function buildDoorConfigurationPrompt(orderNumber: string, missing: DoorConfigurationField[]): string {
    const questions = [
        missing.includes('fitting') ? 'Fitting: side hinges or top and bottom patch fittings?' : null,
        missing.includes('door_position') ? 'Door position: left or right?' : null,
        missing.includes('hinge_side') ? 'Hinge/pivot side: left or right?' : null,
        missing.includes('swing_direction') ? 'Opening: inward, outward, or both ways?' : null,
        missing.includes('sliding_panel_position') ? 'Moving panel position when closed (front view): left or right?' : null,
    ].filter(Boolean);
    return [
        `Please confirm the configuration for order ${orderNumber} while viewing it from the customer/front side:`,
        ...questions.map((question, index) => `${index + 1}. ${question}`),
        '',
        missing.includes('sliding_panel_position')
            ? 'Example reply: "Moving sliding panel left".'
            : 'Example reply: "Door right, hinges left, opens outward, side hinges".',
    ].join('\n');
}

export function parseGlassSystemOrder(text: string): GlassSystemOrderResult {
    const t = text || '';
    const systemType = findSystemType(t);
    if (!systemType) {
        return { ok: false, reason: 'No known design type named (B, F, SFSD, DFSD, SFDD, DFDD, door, fixed panel, sliding, shower, or railing).' };
    }

    const doorDimensions = parseDoorOpeningDimensions(t);
    const dimensions = findDimensions(t) || (
        systemType === 'single_door' && doorDimensions.doorWidthIn && doorDimensions.doorHeightIn
            ? { widthIn: doorDimensions.doorWidthIn, heightIn: doorDimensions.doorHeightIn }
            : systemType === 'double_door' && doorDimensions.doorWidthIn && doorDimensions.doorHeightIn
                ? { widthIn: doorDimensions.doorWidthIn * 2, heightIn: doorDimensions.doorHeightIn }
                : null
    );
    if (!dimensions) {
        return { ok: false, reason: 'Width and height were not readable. Use "Width: 48in, Height: 84in" or "48 x 84in".' };
    }
    if (dimensions.widthIn > 400 || dimensions.heightIn > 400) {
        return { ok: false, reason: 'The converted width or height exceeds 400 inches; check the numbers and units.' };
    }

    const thickness = findThickness(t);
    const lower = t.toLowerCase();
    const doorConfiguration = parseDoorConfiguration(t);
    const fixingStyle: 'channel' | 'spider' | 'standoff' =
        /\bspider\b/.test(lower) ? 'spider' : /\bstand\s*off|standoff\b/.test(lower) ? 'standoff' : 'channel';
    const hasLock = !/\bno\s*lock\b/.test(lower);
    const hasHandle = !/\bno\s*handle\b/.test(lower);

    let fixedPanelWidthIn = 0;
    const fixedMatch = t.match(new RegExp(
        String.raw`fixed(?:\s*panel)?(?:\s*width)?\s*(?:is|[:=\-])?\s*(${NUMBER_SOURCE})\s*(${UNIT_SOURCE})?`,
        'i',
    )) || t.match(new RegExp(
        String.raw`(${NUMBER_SOURCE})\s*(${UNIT_SOURCE})?\s*fixed(?:\s*panel)?`,
        'i',
    ));
    if (fixedMatch) fixedPanelWidthIn = measurementInches(fixedMatch[1], fixedMatch[2]) || 0;

    return {
        ok: true,
        input: {
            systemType,
            ...dimensions,
            thickness,
            ...doorConfiguration,
            hasLock,
            hasHandle,
            fixingStyle,
            fixedPanelWidthIn,
            glassType: findGlassType(t),
            ...doorDimensions,
        },
        missingCustomerChoices: getMissingDoorConfiguration({
            systemType,
            ...dimensions,
            thickness,
            ...doorConfiguration,
        }),
    };
}
