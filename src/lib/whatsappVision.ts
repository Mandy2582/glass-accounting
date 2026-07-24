import sharp from 'sharp';
import { calculateDimensionAreaSqft } from '@/lib/units';
import { generateUUID, roundCurrency } from '@/lib/utils';
import type { DesignData, DesignItem, KonvaShape } from '@/types';

export type LengthUnit = 'inch' | 'mm';

// A hole's position is normally dimensioned by hand in one of three ways:
//   1. Distance from one or two nearby edges (e.g. "20mm from left, 15mm
//      from top"), or marked centered on an axis -- fromLeft/fromRight/
//      fromTop/fromBottom/centeredX/centeredY.
//   2. No number at all, but clearly drawn close to one edge of the panel by
//      convention (e.g. a column of holes running near the left edge with no
//      dimension marking the distance) -- nearEdge.
//   3. A distance measured from ANOTHER hole/cut rather than from an edge
//      (e.g. two holes with a single "200mm" pitch written between them) --
//      pitchFromIndex/pitchDistance/pitchUnit/pitchAxis.
// Only the fields actually shown on the drawing should be filled in --
// everything else stays null rather than guessed.
type PositionFields = {
    unit?: LengthUnit | null;
    fromLeft?: number | null;
    fromRight?: number | null;
    fromTop?: number | null;
    fromBottom?: number | null;
    centeredX?: boolean | null;
    centeredY?: boolean | null;
    nearEdge?: 'left' | 'right' | 'top' | 'bottom' | null;
    pitchFromIndex?: number | null;
    pitchDistance?: number | null;
    pitchUnit?: LengthUnit | null;
    pitchAxis?: 'horizontal' | 'vertical' | null;
};

export type VisionHole = PositionFields & {
    diameter?: number | null;
};

export type VisionCut = PositionFields & {
    cutType?: 'corner_notch' | 'edge_notch' | 'through_cut' | null;
    corner?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | null;
    width?: number | null;
    height?: number | null;
};

// A panel isn't always a plain rectangle -- some drawings show one or more
// corners cut off at an angle (a "taper", often labeled as such, common on
// railing glass following a staircase rake). horizontalCut/verticalCut are
// how far the diagonal cut runs in along each of that corner's two edges;
// only fill these in when the drawing actually gives both measurements --
// many drawings only label "Taper" with no numbers at all (the exact angle
// is meant to be matched on site), in which case leave them null rather than
// guessing a size.
export type VisionCornerTaper = {
    corner: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
    horizontalCut?: number | null;
    verticalCut?: number | null;
    unit?: LengthUnit | null;
};

export type WhatsAppImageAnalysis = {
    classification: 'text_order' | 'drawing' | 'mixed' | 'unknown';
    extractedText: string;
    customerName?: string | null;
    confidence: number;
    orderLines: Array<{
        description: string;
        quantity?: number | null;
        unit?: string | null;
    }>;
    drawing: {
        notes: string;
        pieces: Array<{
            name: string;
            type: string;
            width?: number | null;
            height?: number | null;
            widthUnit?: LengthUnit | null;
            heightUnit?: LengthUnit | null;
            thickness?: number | null;
            quantity?: number | null;
            holes: VisionHole[];
            cuts: VisionCut[];
            tapers: VisionCornerTaper[];
            // True when this piece is cut from the same continuous sheet/run
            // as the immediately preceding piece in this array (adjoining
            // sections sharing one top/bottom edge, divided only by cut
            // lines -- e.g. a multi-section railing or shopfront run).
            // Connected pieces are drawn together on one shared canvas at
            // their real relative widths instead of separate tabs; genuinely
            // separate/independent panels (a door drawn apart from a
            // sidelite, unrelated pieces on the same page) should leave this
            // null/false.
            connectedToPrevious?: boolean | null;
            hardwareNotes?: string | null;
            // Approximate bounding box of this piece within the photo, as
            // fractions of the image's own width/height (0 = left/top edge,
            // 1 = right/bottom edge). Used to crop a zoomed-in view of just
            // this panel for a focused second-pass hole/cut recount --
            // asking the model to divide attention across every panel in a
            // busy multi-section photo at once is exactly where hole counts
            // drift (confirmed against a real 3-panel drawing: two plainer
            // panels were each over-counted by 2, while the one panel with
            // an explicit distance label came out exactly right). Null when
            // the piece's location in the photo can't be told at all.
            imageRegion?: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
        }>;
    };
    // True only when the vision call itself errored/couldn't be parsed --
    // as opposed to a successful call that genuinely classified the image as
    // 'unknown'. Callers should fail open (keep for review) on a real
    // failure instead of treating it the same as "vision looked and this
    // isn't an order".
    analysisFailed?: boolean;
};

const emptyAnalysis = (classification: WhatsAppImageAnalysis['classification'], extractedText = '', analysisFailed = false): WhatsAppImageAnalysis => ({
    classification,
    extractedText,
    confidence: 0,
    orderLines: [],
    drawing: {
        notes: '',
        pieces: [],
    },
    analysisFailed,
});

// Shared position-reading rules for holes/cuts -- used verbatim by both the
// main multi-piece analysis prompt and the single-panel verification prompt
// below, so the two calls never drift out of sync on how a position is read.
const HOLE_CUT_POSITION_GUIDANCE = [
    'HOLE AND CUT POSITIONS: These drawings dimension hole/cut positions in different ways depending on the sketch -- read each one as it is actually drawn, using whichever of the following applies:',
    '  - CUT SIZE vs CUT DISTANCE: a cut is usually drawn as a small shaded/hatched rectangle. Its SIZE is written against its own sides (width above or below it, height beside it -- e.g. "8" above and "8" beside it means an 8 x 8 cut). A number attached to an arrow running from a panel edge to the cut (e.g. 6" with an upward arrow from the bottom edge) is the cut\'s DISTANCE from that edge (fromBottom/fromLeft/etc.), NOT its width or height -- never use an edge-distance number as a cut dimension.',
    '  - MOST COMMON: distance from one or two nearby edges (e.g. "20mm from left", "15mm from top"), or marked as centered on an axis (a centerline, or equal tick marks on both sides). Record fromLeft/fromRight/fromTop/fromBottom as the distance from that edge of the panel to the CENTER of the hole/cut -- only fill in the edges that are actually dimensioned, leave the rest null. If marked centered instead of a number, set centeredX and/or centeredY to true rather than guessing a number.',
    '  - IMPORTANT -- determine fromTop vs fromBottom (and fromLeft vs fromRight) by which edge the dimension line actually starts from, NOT by which way its arrowhead points. A dimension line is very often drawn starting at the bottom edge with the arrow pointing upward toward the hole/cut -- that is still a distance FROM THE BOTTOM (fromBottom), even though the arrow points up. Trace the line back to the edge it touches to decide which field to fill in.',
    '  - NO NUMBER, BUT NEAR AN EDGE: many drawings place a row or column of holes/cuts close to one edge of the panel with no distance written at all (e.g. a column of holes running down near the left edge). When you can see it is clearly aligned along one specific edge but no number dimensions that distance, set nearEdge to that edge ("left"/"right"/"top"/"bottom") instead of leaving every field null -- this is a real observation (which edge it is near), not a guessed number.',
    '  - DIMENSIONED FROM ANOTHER HOLE/CUT, NOT AN EDGE: sometimes a single distance is written between two holes/cuts themselves (e.g. two holes stacked vertically with "200mm" written between them), rather than either one being dimensioned from a panel edge. For the second of the pair, set pitchFromIndex to the 0-based index of the other hole/cut in this same array (list the reference one first), set pitchDistance and pitchUnit to that written number, and set pitchAxis to "vertical" if they are stacked one above the other or "horizontal" if side by side.',
    '  - If a hole or cut has no readable position at all by any of the above (no edge dimension, no visible edge alignment, no pitch to another hole/cut), still include it in the array (never drop it), but leave every position field null.',
    '  - For a notch cut from a corner, set cutType to "corner_notch" and corner to which corner, plus its width/height. Otherwise use "edge_notch" for a notch cut into an edge (not a corner), or "through_cut" for an internal cutout.',
    '  - DO NOT MERGE NEARBY CUTS: a section can have more than one separate hatched/shaded cut area near the same corner or edge (e.g. a small notch right at the corner AND a larger cut a few inches away from it). Each hatched shape is its own cuts[] entry with its own size and own position numbers -- never combine two different hatched shapes into a single entry, and never let one cut\'s size number bleed into another cut\'s position number just because they are drawn close together.',
].join('\n');

const HOLE_CUT_UNITS_GUIDANCE = 'UNITS: Shops often mix units on one drawing -- panel width/height are usually inches, but hole diameters and hole/cut distances are frequently marked in mm. Report a unit per hole/cut using whatever unit is actually written next to that number. If no unit is marked, leave it null rather than guessing.';

// A hatched/shaded rectangle on these drawings is one of two very different
// things, and confusing them is a real, observed failure mode (a focused
// single-panel crop with no other context to fall back on is especially
// prone to defaulting every hatch mark it sees into cuts[] instead of
// correctly recognising plain hardware): hinge/patch/lock hardware markers
// (small, often repeated at regular intervals near panel edges, e.g. at
// top and bottom of a door) versus an actual glass cutout. The distinguishing
// signal is a labeled dimension.
const HARDWARE_VS_CUT_GUIDANCE = 'HARDWARE HATCHING IS NOT A CUT: A hatched/shaded rectangle is only a real cut/notch (cuts[] entry) if it has its own explicit width AND height dimension written directly against it (e.g. "cut 27 4/8" with a "19" beside it). A hatched mark with NO dimension numbers of its own -- especially small ones repeated near the top/bottom of a door or panel edge -- is hinge/patch/lock HARDWARE, not a cut and not a hole. Do not report undimensioned hardware hatching in cuts[] or holes[] at all; mention it in hardwareNotes instead if that field is available to you.';

// Shared JSON-schema fragments for a single hole/cut entry -- reused by both
// the main multi-piece schema and the single-panel verification schema so
// the two response shapes can never drift apart.
const HOLE_SCHEMA_PROPERTIES = {
    diameter: { type: ['number', 'null'] },
    unit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
    fromLeft: { type: ['number', 'null'] },
    fromRight: { type: ['number', 'null'] },
    fromTop: { type: ['number', 'null'] },
    fromBottom: { type: ['number', 'null'] },
    centeredX: { type: ['boolean', 'null'] },
    centeredY: { type: ['boolean', 'null'] },
    nearEdge: { type: ['string', 'null'], enum: ['left', 'right', 'top', 'bottom', null] },
    pitchFromIndex: { type: ['number', 'null'] },
    pitchDistance: { type: ['number', 'null'] },
    pitchUnit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
    pitchAxis: { type: ['string', 'null'], enum: ['horizontal', 'vertical', null] },
} as const;
const HOLE_SCHEMA_REQUIRED = Object.keys(HOLE_SCHEMA_PROPERTIES);

const CUT_SCHEMA_PROPERTIES = {
    cutType: { type: ['string', 'null'], enum: ['corner_notch', 'edge_notch', 'through_cut', null] },
    corner: { type: ['string', 'null'], enum: ['top_left', 'top_right', 'bottom_left', 'bottom_right', null] },
    width: { type: ['number', 'null'] },
    height: { type: ['number', 'null'] },
    ...HOLE_SCHEMA_PROPERTIES,
} as const;
const CUT_SCHEMA_REQUIRED = Object.keys(CUT_SCHEMA_PROPERTIES);

export async function analyzeWhatsAppImage(input: {
    imageDataUrl: string;
    caption?: string;
    fromPhone: string;
}): Promise<WhatsAppImageAnalysis> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return emptyAnalysis('unknown', input.caption || '');
    }

    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
    // Reasoning models (gpt-5 family, o-series) think before answering --
    // that markedly improves systematic counting/reading tasks like "find
    // every small circle on this busy hand drawing", which non-reasoning
    // models chronically under-report. Their reasoning tokens count against
    // max_output_tokens, so the cap must be much higher than the JSON
    // answer alone needs.
    const isReasoningModel = /^(gpt-5|o\d)/.test(model);
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: [
                                'Analyze this photo of a hand-marked engineering/order drawing sent to a glass shop.',
                                'Classify it as text_order, drawing, mixed, or unknown.',
                                '',
                                'MULTI-PIECE DRAWINGS: A single photo may show more than one separate glass panel (e.g. a fixed panel + a door + a ventilator, or several unrelated pieces sketched on one page, or several adjoining sections cut from one continuous sheet like a shopfront or railing run). Treat each visually distinct panel/outline as its own entry in drawing.pieces -- do not merge multiple panels into one piece, and do not drop a panel just because some of its details are unclear or repetitive-looking. CHECK EVERY SINGLE SECTION for holes and cuts individually, even ones that look plain or identical to a neighboring section -- it is a common mistake to carefully read the two end sections of a multi-section run (which often have extra hardware markings) and then skip the plainer middle sections entirely; every section that has holes or cuts marked on it must have them reported, not just the ones with the most detail.',
                                '  - If adjoining sections are cut from one continuous sheet (sharing one unbroken top and bottom edge, divided only by vertical cut lines, with a single overall width dimension spanning all of them), set connectedToPrevious to true on every section after the first one in that run, so they get drawn together on one shared canvas instead of separate tabs. Leave it null/false for genuinely separate, independent pieces (e.g. a door drawn apart from a fixed sidelite).',
                                '',
                                'COUNT EVERY HOLE INDIVIDUALLY: each small circle ("o") drawn on the glass is one hole. Scan methodically -- along the top edge, bottom edge, left edge, right edge and interior of EVERY section -- and report one holes[] entry per circle. Never compress repeats: if five sections each show 2 circles at the top and 2 at the bottom, that is 20 separate entries, not 5. Miscounting holes (both too few and too many) is the single most common mistake on these drawings; recount the circles before finalizing and make sure the holes array length matches your count.',
                                'BEFORE writing the final answer, go section by section and, for each section, count the circles along each of its four edges separately (e.g. "section 3: top edge 2, bottom edge 2, left edge 0, right edge 0 = 4 total") and make sure that per-section total matches how many holes[] entries you actually write for that section -- a section is not "the same as its neighbor", each one must be counted from what is actually drawn on it, even if two sections look identical at a glance.',
                                '',
                                HOLE_CUT_POSITION_GUIDANCE,
                                '',
                                HARDWARE_VS_CUT_GUIDANCE,
                                '',
                                'PANEL SHAPE / TAPERED CORNERS: A panel is not always a plain rectangle. If one or more corners are drawn cut off at an angle instead of square (often labeled "Taper", common on railing glass following a staircase rake), add an entry to tapers for each such corner with corner set to which one. Many drawings only label this qualitatively with no measurement at all (the angle is matched on site, not on paper) -- in that case leave horizontalCut and verticalCut null, do not guess a size. Only fill in horizontalCut (how far the cut runs in along the horizontal edge from that corner) and verticalCut (how far it runs in along the vertical edge from that corner) when the drawing actually gives both of those two measurements for that corner.',
                                '',
                                'IMAGE REGION: For each piece, also report imageRegion -- the approximate bounding box of that specific panel within this photo, as fractions of the image\'s total width/height (0 = left/top edge of the photo, 1 = right/bottom edge), e.g. {"xMin": 0.05, "yMin": 0.2, "xMax": 0.35, "yMax": 0.9}. This is used afterwards to zoom into just this panel for a careful hole/cut recount, so accuracy here matters a lot -- trace that panel\'s OWN drawn outline/boundary lines in the photo to find its real edges, do NOT assume multiple panels are evenly-sized thirds/halves of the photo just because there are 2 or 3 of them (real panels are very often uneven widths -- use the drawing\'s own width dimensions, if labeled, as a cross-check). The box should tightly bound that panel\'s own outline and nothing more -- not the whole photo, and not overlapping into a neighboring panel. Leave it null only if you genuinely cannot tell where this piece is in the photo.',
                                '',
                                `${HOLE_CUT_UNITS_GUIDANCE} Also report widthUnit/heightUnit for the panel itself the same way.`,
                                '',
                                'Extract visible text, order lines, thickness, hardware notes, and customer name if visible.',
                                'Do not invent dimensions, positions, or hardware that are not visibly marked.',
                                `Sender phone: ${input.fromPhone}`,
                                input.caption ? `Caption: ${input.caption}` : '',
                            ].filter(Boolean).join('\n'),
                        },
                        {
                            type: 'input_image',
                            image_url: input.imageDataUrl,
                            // WhatsApp photos are often full camera resolution;
                            // 'high' detail tiles the whole image (more tokens,
                            // sharper reading of small dimensions/handwriting).
                            // 'low' is a flat ~85 tokens regardless of size --
                            // much cheaper, but risks misreading fine print on
                            // a busy drawing. Override via env if the accuracy
                            // trade-off is worth it for your usage pattern.
                            detail: (process.env.OPENAI_VISION_DETAIL as 'low' | 'high' | 'auto' | undefined) || 'auto',
                        },
                    ],
                },
            ],
            // Structured-output mode bounds the JSON *shape* but not the
            // length of free-text fields (extractedText, notes) -- cap this
            // as a guardrail against a single unusually busy image running up
            // an outsized bill. Reasoning models need far more headroom since
            // their (invisible) reasoning tokens draw from the same budget;
            // 2000 would starve the reasoning and truncate the JSON answer.
            max_output_tokens: isReasoningModel ? 10000 : 2000,
            ...(isReasoningModel ? { reasoning: { effort: 'medium' } } : {}),
            text: {
                format: {
                    type: 'json_schema',
                    name: 'whatsapp_order_image_analysis',
                    // OpenAI's strict structured-output mode requires every key
                    // in `properties` to also appear in `required` -- optional
                    // fields must instead be modeled as nullable types (the
                    // model returns null, rather than omitting the key). This
                    // schema previously left several fields out of `required`
                    // while still declaring them optional in the type above,
                    // which OpenAI rejects outright (every image analysis call
                    // was failing silently as a result).
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['classification', 'extractedText', 'customerName', 'confidence', 'orderLines', 'drawing'],
                        properties: {
                            classification: { type: 'string', enum: ['text_order', 'drawing', 'mixed', 'unknown'] },
                            extractedText: { type: 'string' },
                            customerName: { type: ['string', 'null'] },
                            confidence: { type: 'number' },
                            orderLines: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['description', 'quantity', 'unit'],
                                    properties: {
                                        description: { type: 'string' },
                                        quantity: { type: ['number', 'null'] },
                                        unit: { type: ['string', 'null'] },
                                    },
                                },
                            },
                            drawing: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['notes', 'pieces'],
                                properties: {
                                    notes: { type: 'string' },
                                    pieces: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            additionalProperties: false,
                                            required: ['name', 'type', 'width', 'height', 'widthUnit', 'heightUnit', 'thickness', 'quantity', 'holes', 'cuts', 'tapers', 'connectedToPrevious', 'hardwareNotes', 'imageRegion'],
                                            properties: {
                                                name: { type: 'string' },
                                                type: { type: 'string' },
                                                width: { type: ['number', 'null'] },
                                                height: { type: ['number', 'null'] },
                                                widthUnit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
                                                heightUnit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
                                                thickness: { type: ['number', 'null'] },
                                                quantity: { type: ['number', 'null'] },
                                                holes: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: HOLE_SCHEMA_REQUIRED,
                                                        properties: HOLE_SCHEMA_PROPERTIES,
                                                    },
                                                },
                                                cuts: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: CUT_SCHEMA_REQUIRED,
                                                        properties: CUT_SCHEMA_PROPERTIES,
                                                    },
                                                },
                                                imageRegion: {
                                                    type: ['object', 'null'],
                                                    additionalProperties: false,
                                                    required: ['xMin', 'yMin', 'xMax', 'yMax'],
                                                    properties: {
                                                        xMin: { type: 'number' },
                                                        yMin: { type: 'number' },
                                                        xMax: { type: 'number' },
                                                        yMax: { type: 'number' },
                                                    },
                                                },
                                                tapers: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: ['corner', 'horizontalCut', 'verticalCut', 'unit'],
                                                        properties: {
                                                            corner: { type: 'string', enum: ['top_left', 'top_right', 'bottom_left', 'bottom_right'] },
                                                            horizontalCut: { type: ['number', 'null'] },
                                                            verticalCut: { type: ['number', 'null'] },
                                                            unit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
                                                        },
                                                    },
                                                },
                                                connectedToPrevious: { type: ['boolean', 'null'] },
                                                hardwareNotes: { type: ['string', 'null'] },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    strict: true,
                },
            },
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error('OpenAI image analysis failed:', detail);
        return emptyAnalysis('unknown', input.caption || '', true);
    }

    const data = await response.json();
    if (data.usage) {
        console.log(`OpenAI vision usage (${model}):`, data.usage);
    }
    const outputText = data.output_text || data.output?.flatMap((item: any) => item.content || [])
        .find((content: any) => content.type === 'output_text')?.text;

    if (!outputText) return emptyAnalysis('unknown', input.caption || '', true);

    let result: WhatsAppImageAnalysis;
    try {
        result = JSON.parse(outputText) as WhatsAppImageAnalysis;
    } catch (error) {
        console.error('Failed to parse image analysis JSON:', error);
        return emptyAnalysis('unknown', input.caption || '', true);
    }

    // Second pass: for each piece with real geometry and a usable image
    // region, re-read its holes/cuts from a zoomed crop of just that panel
    // instead of trusting the first pass's count across the whole (often
    // multi-panel) photo. Confirmed against a real 3-panel drawing that this
    // is exactly where counts drift: two plainer panels were each
    // over-counted by 2 holes, while the one panel with an explicit distance
    // label came out exactly right in the first pass already -- the model
    // is accurate when it has something to anchor a count against, and
    // drifts when it has to divide attention across a busy multi-panel
    // photo with nothing but freehand circles to count. Runs in parallel so
    // wall-clock latency stays close to one extra call rather than growing
    // with piece count; any failure/timeout/missing-region on a given piece
    // just keeps that piece's first-pass holes/cuts unchanged (fail-open --
    // this is a verification step, never a reason to lose data).
    if (result.classification === 'drawing' || result.classification === 'mixed') {
        const verifications = await Promise.allSettled(
            result.drawing.pieces.map(piece => verifyPieceHolesAndCuts(input.imageDataUrl, piece))
        );
        result.drawing.pieces = result.drawing.pieces.map((piece, i) => {
            const outcome = verifications[i];
            if (outcome.status === 'fulfilled' && outcome.value) {
                return { ...piece, holes: outcome.value.holes, cuts: outcome.value.cuts };
            }
            if (outcome.status === 'rejected') {
                console.error(`[whatsapp-vision] Per-panel verification failed for "${piece.name}", keeping first-pass holes/cuts:`, outcome.reason);
            }
            return piece;
        });
    }

    return result;
}

// Crops the original photo down to one piece's imageRegion (padded so a
// hole/cut sitting right at the panel's own edge isn't clipped), returning a
// new data URL for the focused verification call. Returns null on any
// failure (corrupt region, unreadable image, etc.) so the caller can fall
// back to the first pass's reading instead of erroring the whole analysis.
async function cropImageRegion(imageDataUrl: string, region: { xMin: number; yMin: number; xMax: number; yMax: number }): Promise<string | null> {
    try {
        const match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (!match) return null;

        const buffer = Buffer.from(match[1], 'base64');
        const image = sharp(buffer);
        const metadata = await image.metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        if (!width || !height) return null;

        const regionWidth = region.xMax - region.xMin;
        const regionHeight = region.yMax - region.yMin;
        if (!(regionWidth > 0) || !(regionHeight > 0)) return null;

        // 12% padding on each side -- generous enough that a hole/cut drawn
        // close to the panel's own outline survives the crop, without
        // pulling in so much of the neighboring panel that it reintroduces
        // the same divided-attention problem this pass exists to avoid.
        const padX = regionWidth * 0.12;
        const padY = regionHeight * 0.12;
        const xMin = Math.max(0, region.xMin - padX);
        const yMin = Math.max(0, region.yMin - padY);
        const xMax = Math.min(1, region.xMax + padX);
        const yMax = Math.min(1, region.yMax + padY);

        const left = Math.round(xMin * width);
        const top = Math.round(yMin * height);
        const cropWidth = Math.round((xMax - xMin) * width);
        const cropHeight = Math.round((yMax - yMin) * height);
        if (cropWidth <= 0 || cropHeight <= 0 || left + cropWidth > width || top + cropHeight > height) return null;

        const cropped = await image.extract({ left, top, width: cropWidth, height: cropHeight }).jpeg({ quality: 92 }).toBuffer();
        return `data:image/jpeg;base64,${cropped.toString('base64')}`;
    } catch (error) {
        console.error('[whatsapp-vision] Failed to crop image region:', error);
        return null;
    }
}

// Focused second-pass extraction: given a zoomed crop of ONE already-
// identified panel, recount its holes/cuts in isolation. Reuses the exact
// same position-reading rules and JSON schema as the main call (see
// HOLE_CUT_POSITION_GUIDANCE/HOLE_SCHEMA_PROPERTIES/CUT_SCHEMA_PROPERTIES
// above) so the two calls can never disagree on how a position is encoded --
// only the framing differs (one panel in isolation, not several at once).
async function verifyPieceHolesAndCuts(
    fullImageDataUrl: string,
    piece: WhatsAppImageAnalysis['drawing']['pieces'][number],
): Promise<{ holes: VisionHole[]; cuts: VisionCut[] } | null> {
    if (!piece.imageRegion) return null;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const croppedImageDataUrl = await cropImageRegion(fullImageDataUrl, piece.imageRegion);
    if (!croppedImageDataUrl) return null;

    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
    const isReasoningModel = /^(gpt-5|o\d)/.test(model);

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: [
                                'This is a zoomed-in crop showing ONE glass panel from a larger hand-marked order drawing (other panels, if any, have been cropped out -- only count what is visible in THIS image). This crop may include a small sliver of a neighboring panel at its very edge (deliberate padding to avoid clipping) -- ignore anything that clearly belongs to a different panel outline, and only report holes/cuts that belong to the main panel filling most of this crop.',
                                'Recount every hole (small circle, "o") visible in this crop, precisely and independently of any earlier reading.',
                                'COUNT EVERY HOLE INDIVIDUALLY: scan methodically along the top edge, bottom edge, left edge, right edge, and interior, and report one holes[] entry per circle. Recount before finalizing and make sure the holes array length matches what is actually visible.',
                                '',
                                HARDWARE_VS_CUT_GUIDANCE,
                                '',
                                HOLE_CUT_POSITION_GUIDANCE,
                                '',
                                HOLE_CUT_UNITS_GUIDANCE,
                                `This crop is of the panel named "${piece.name}".`,
                            ].filter(Boolean).join('\n'),
                        },
                        {
                            type: 'input_image',
                            image_url: croppedImageDataUrl,
                            detail: (process.env.OPENAI_VISION_DETAIL as 'low' | 'high' | 'auto' | undefined) || 'auto',
                        },
                    ],
                },
            ],
            max_output_tokens: isReasoningModel ? 6000 : 1500,
            ...(isReasoningModel ? { reasoning: { effort: 'medium' } } : {}),
            text: {
                format: {
                    type: 'json_schema',
                    name: 'whatsapp_panel_hole_cut_verification',
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['holes', 'cuts'],
                        properties: {
                            holes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: HOLE_SCHEMA_REQUIRED,
                                    properties: HOLE_SCHEMA_PROPERTIES,
                                },
                            },
                            cuts: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: CUT_SCHEMA_REQUIRED,
                                    properties: CUT_SCHEMA_PROPERTIES,
                                },
                            },
                        },
                    },
                    strict: true,
                },
            },
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error(`[whatsapp-vision] Per-panel verification call failed for "${piece.name}":`, detail);
        return null;
    }

    const data = await response.json();
    if (data.usage) {
        console.log(`[whatsapp-vision] Per-panel verification usage (${model}, "${piece.name}"):`, data.usage);
    }
    const outputText = data.output_text || data.output?.flatMap((item: any) => item.content || [])
        .find((content: any) => content.type === 'output_text')?.text;
    if (!outputText) return null;

    try {
        return JSON.parse(outputText) as { holes: VisionHole[]; cuts: VisionCut[] };
    } catch (error) {
        console.error(`[whatsapp-vision] Failed to parse per-panel verification JSON for "${piece.name}":`, error);
        return null;
    }
}

// GlassDesigner.tsx's canvas (react-konva) uses 10 canvas units per inch --
// e.g. its own createRectShape() does `width: widthIn * 10`. This isn't
// exported from that (client-only, 'use client') component, so it's
// duplicated here deliberately; keep in sync if that scale ever changes.
const CANVAS_UNITS_PER_INCH = 10;
const MM_PER_INCH = 25.4;
const DEFAULT_HOLE_RADIUS_UNITS = 30; // matches GlassDesigner's manual "Add Hole" default
const DEFAULT_CUT_SIZE_UNITS = 50; // matches GlassDesigner's manual "Add Cut" default

function toCanvasUnits(value: number, unit: LengthUnit | null | undefined): number {
    // No unit tagged -- assume inches, matching the existing panel-dimension
    // convention. Never trust the model to do this conversion itself.
    const inches = unit === 'mm' ? value / MM_PER_INCH : value;
    return inches * CANVAS_UNITS_PER_INCH;
}

function partition<T>(items: T[], predicate: (item: T) => boolean): [T[], T[]] {
    return [items.filter(predicate), items.filter(item => !predicate(item))];
}

const EDGE_INSET_UNITS = 20; // 2 inches -- matches GlassDesigner's manual "Align & Add Holes" edge offset default

// Resolves one axis (x or y) of a position from an explicit edge distance or
// centered marking only -- never a guess. Returns null when nothing was
// dimensioned on this axis.
function resolveExplicitAxis(
    fromNear: number | null | undefined,
    fromFar: number | null | undefined,
    centered: boolean | null | undefined,
    unit: LengthUnit | null | undefined,
    rectNear: number,
    rectSize: number,
): number | null {
    if (centered) return rectNear + rectSize / 2;
    if (fromNear != null) return rectNear + toCanvasUnits(fromNear, unit);
    if (fromFar != null) return rectNear + rectSize - toCanvasUnits(fromFar, unit);
    return null;
}

type ResolvedAxis = { x: number | null; y: number | null; xConfirmed: boolean; yConfirmed: boolean };

// Resolves the CENTER position of every hole/cut in a piece. Confidence-wise
// there are three kinds of result: (a) a real dimensioned fact (edge
// distance/centered, or a pitch chained entirely off real facts), (b) a
// qualitative-but-real observation with no exact number (nearEdge), and (c) a
// pure guess (last-resort even-spacing). Only (a) counts as confirmed (no
// review flag); (b) and (c) are flagged positionSource: 'estimated-fallback'
// by the caller. The actual pass order is chosen so pitch-chain anchors
// always have a position to chain off of before the chain is resolved:
//   1. Explicit edge distance / centered marking.
//   2. nearEdge grouping -- shapes with no number at all but a visually
//      observed edge (e.g. a column of holes running near the left edge with
//      no distance marked) are evenly spaced along that specific edge
//      instead of the old generic center/bottom-edge guess, grouped
//      separately per edge so e.g. a left-edge column and a bottom-edge row
//      on the same piece don't get lumped into one line. Items that
//      themselves chain off another via pitchFromIndex are skipped here.
//   3. Last-resort even-spacing for any remaining "root" item (no pitch
//      reference of its own) -- guarantees every potential pitch anchor has
//      a real position before step 4 runs.
//   4. Pitch chain -- a distance measured from another hole/cut in the same
//      array rather than from an edge (e.g. "200mm" written between two
//      holes), resolved now that every non-chained item has a position.
//      Confidence is inherited from whichever axis of the reference shape it
//      was chained from: only the *spacing* between the pair is a hard fact
//      from the drawing, not the pair's absolute position on the panel, so a
//      pitch chained off an unconfirmed anchor stays unconfirmed.
//   5. Final safety net for a pitchFromIndex pointing out of range or at a
//      cycle, so no shape is ever left without a position.
function resolvePositions<T extends PositionFields>(
    items: T[], rectX: number, rectY: number, rectW: number, rectH: number,
): ResolvedAxis[] {
    const resolved: ResolvedAxis[] = items.map(item => {
        const x = resolveExplicitAxis(item.fromLeft, item.fromRight, item.centeredX, item.unit, rectX, rectW);
        const y = resolveExplicitAxis(item.fromTop, item.fromBottom, item.centeredY, item.unit, rectY, rectH);
        return { x, y, xConfirmed: x != null, yConfirmed: y != null };
    });

    // Pass 2: nearEdge groups -- only for shapes still fully unresolved and
    // not themselves a pitch-chain dependent (pitch is a more specific
    // signal, resolved in pass 4 below once its anchor has a position).
    (['left', 'right', 'top', 'bottom'] as const).forEach(edge => {
        const group = items
            .map((_, i) => i)
            .filter(i => items[i].nearEdge === edge && items[i].pitchFromIndex == null && resolved[i].x == null && resolved[i].y == null);
        group.forEach((i, orderInGroup) => {
            const fraction = (orderInGroup + 1) / (group.length + 1);
            if (edge === 'left') resolved[i] = { x: rectX + EDGE_INSET_UNITS, y: rectY + rectH * fraction, xConfirmed: false, yConfirmed: false };
            else if (edge === 'right') resolved[i] = { x: rectX + rectW - EDGE_INSET_UNITS, y: rectY + rectH * fraction, xConfirmed: false, yConfirmed: false };
            else if (edge === 'top') resolved[i] = { x: rectX + rectW * fraction, y: rectY + EDGE_INSET_UNITS, xConfirmed: false, yConfirmed: false };
            else resolved[i] = { x: rectX + rectW * fraction, y: rectY + rectH - EDGE_INSET_UNITS, xConfirmed: false, yConfirmed: false };
        });
    });

    // Pass 3: last-resort even-spacing, but ONLY for "root" items that have
    // no pitch-chain reference of their own -- this guarantees every
    // potential pitch anchor has a real position before pass 4 tries to
    // chain off it. Items that themselves reference another via
    // pitchFromIndex are deliberately excluded here; they wait for pass 4.
    // Only the axis that's actually missing gets guessed here -- a shape
    // dimensioned on one axis only (e.g. "6 from bottom" with no horizontal
    // dimension) must keep that real value; overwriting both axes wholesale
    // would silently discard a confirmed fact just because its other axis
    // wasn't given.
    const rootUnresolved = items.map((_, i) => i).filter(i => (resolved[i].x == null || resolved[i].y == null) && items[i].pitchFromIndex == null);
    rootUnresolved.forEach((i, orderInGroup) => {
        const fraction = (orderInGroup + 1) / (rootUnresolved.length + 1);
        const next = { ...resolved[i] };
        if (next.x == null) { next.x = rectX + rectW * fraction; next.xConfirmed = false; }
        if (next.y == null) { next.y = rectY + rectH / 2; next.yConfirmed = false; }
        resolved[i] = next;
    });

    // Pass 4: pitch chains. By this point every non-chained item has some
    // position, so any valid pitchFromIndex reference now resolves. Iterate
    // up to items.length times so chains of any length (a chains off b
    // chains off c, ...) resolve regardless of array order.
    for (let pass = 0; pass < items.length; pass++) {
        let changed = false;
        items.forEach((item, i) => {
            if (resolved[i].x != null && resolved[i].y != null) return;
            if (item.pitchFromIndex == null || item.pitchDistance == null) return;
            const ref = resolved[item.pitchFromIndex];
            if (!ref || ref.x == null || ref.y == null) return;
            const dist = toCanvasUnits(item.pitchDistance, item.pitchUnit ?? item.unit);
            const next = { ...resolved[i] };
            if (item.pitchAxis === 'horizontal') {
                if (next.x == null) { next.x = ref.x + dist; next.xConfirmed = ref.xConfirmed; changed = true; }
                if (next.y == null) { next.y = ref.y; next.yConfirmed = false; changed = true; }
            } else {
                if (next.y == null) { next.y = ref.y + dist; next.yConfirmed = ref.yConfirmed; changed = true; }
                if (next.x == null) { next.x = ref.x; next.xConfirmed = false; changed = true; }
            }
            resolved[i] = next;
        });
        if (!changed) break;
    }

    // Pass 5: final safety net -- a pitchFromIndex pointing out of range or
    // at a cycle would otherwise leave a shape with no position at all
    // (which would break rendering); fall back to plain even-spacing. As in
    // pass 3, only fill in whichever axis is actually still missing.
    const stillUnresolved = items.map((_, i) => i).filter(i => resolved[i].x == null || resolved[i].y == null);
    stillUnresolved.forEach((i, orderInGroup) => {
        const fraction = (orderInGroup + 1) / (stillUnresolved.length + 1);
        const next = { ...resolved[i] };
        if (next.x == null) { next.x = rectX + rectW * fraction; next.xConfirmed = false; }
        if (next.y == null) { next.y = rectY + rectH / 2; next.yConfirmed = false; }
        resolved[i] = next;
    });

    return resolved;
}

type VisionPieceLike = {
    width?: number | null;
    height?: number | null;
    widthUnit?: LengthUnit | null;
    heightUnit?: LengthUnit | null;
    holes?: VisionHole[] | null;
    cuts?: VisionCut[] | null;
    tapers?: VisionCornerTaper[] | null;
};

const CORNER_ORDER: Array<'top_left' | 'top_right' | 'bottom_right' | 'bottom_left'> = ['top_left', 'top_right', 'bottom_right', 'bottom_left'];

// Builds the outline of a panel as a polygon point list (cycling top_left ->
// top_right -> bottom_right -> bottom_left, relative to the shape's own x/y,
// matching GlassDesigner's existing polygon convention) when at least one
// corner has a fully measured taper (both horizontalCut and verticalCut
// given). Returns null when there's nothing measurable to build from, in
// which case the caller keeps a plain rectangle -- a taper that's only
// qualitatively labeled (no numbers) can't be turned into real geometry
// without inventing a size.
function buildTaperedOutline(widthUnits: number, heightUnits: number, tapers: VisionCornerTaper[]): number[] | null {
    const measured = new Map<string, VisionCornerTaper>();
    tapers.forEach(taper => {
        if (taper.corner && taper.horizontalCut != null && taper.verticalCut != null) {
            measured.set(taper.corner, taper);
        }
    });
    if (measured.size === 0) return null;

    const W = widthUnits;
    const H = heightUnits;
    const points: number[] = [];
    CORNER_ORDER.forEach(corner => {
        const taper = measured.get(corner);
        if (!taper) {
            if (corner === 'top_left') points.push(0, 0);
            else if (corner === 'top_right') points.push(W, 0);
            else if (corner === 'bottom_right') points.push(W, H);
            else points.push(0, H);
            return;
        }
        const h = toCanvasUnits(taper.horizontalCut!, taper.unit);
        const v = toCanvasUnits(taper.verticalCut!, taper.unit);
        // Each corner is replaced by two points: the one on the edge shared
        // with the previous corner in this cycle, then the one on the edge
        // shared with the next -- so the resulting list still winds
        // consistently around the shape with no crossed edges.
        if (corner === 'top_left') points.push(0, v, h, 0);
        else if (corner === 'top_right') points.push(W - h, 0, W, v);
        else if (corner === 'bottom_right') points.push(W, H - v, W - h, H);
        else points.push(h, H, 0, H - v);
    });
    return points;
}

// Builds an actual rectangle (or tapered-corner polygon) plus real or
// best-effort holes/cuts in the exact format GlassDesigner's canvas reads
// back (GlassPiece.shapes: KonvaShape[]), so a drawing extracted from a photo
// shows up as a real, editable drawing instead of an empty canvas. Returns []
// when there's no width/height to draw from, in which case the piece falls
// back to today's blank-canvas behavior.
//
// Holes/cuts go through resolvePositions() (edge distance/centered -> pitch
// chain -> nearEdge grouping -> last-resort even-spacing, see that function's
// comment). Anything not fully confirmed by a real dimensioned fact is
// tagged positionSource: 'estimated-fallback' so the review UI can flag
// exactly that subset instead of everything. The panel's own outline shape
// gets the same flag when a taper was noted but couldn't be measured (no
// numbers to build real geometry from), so "this piece's shape itself needs
// a manual fix" surfaces through the identical tab-badge/amber-highlight
// mechanism as an unresolved hole or cut.
function buildPieceShapes(piece: VisionPieceLike): KonvaShape[] {
    const widthIn = Number(piece.width) || 0;
    const heightIn = Number(piece.height) || 0;
    if (widthIn <= 0 || heightIn <= 0) return [];

    const rectId = generateUUID();
    const rectX = 50;
    const rectY = 50;
    const rectWidth = toCanvasUnits(widthIn, piece.widthUnit ?? 'inch');
    const rectHeight = toCanvasUnits(heightIn, piece.heightUnit ?? 'inch');

    const tapers = piece.tapers || [];
    const outlinePoints = buildTaperedOutline(rectWidth, rectHeight, tapers);
    const hasUnmeasurableTaper = tapers.some(taper => taper.corner && (taper.horizontalCut == null || taper.verticalCut == null));

    const outlineShape: KonvaShape = outlinePoints
        ? { id: rectId, type: 'glass_polygon', x: rectX, y: rectY, width: rectWidth, height: rectHeight, points: outlinePoints, sides: outlinePoints.length / 2 }
        : {
            id: rectId, type: 'glass_rect', x: rectX, y: rectY, width: rectWidth, height: rectHeight,
            ...(hasUnmeasurableTaper ? { positionSource: 'estimated-fallback' as const } : {}),
        };
    const shapes: KonvaShape[] = [outlineShape];

    const holes = piece.holes || [];
    const holePositions = resolvePositions(holes, rectX, rectY, rectWidth, rectHeight);
    holes.forEach((hole, i) => {
        const pos = holePositions[i];
        const diameterUnits = hole.diameter != null ? toCanvasUnits(hole.diameter, hole.unit) : DEFAULT_HOLE_RADIUS_UNITS * 2;
        shapes.push({
            id: generateUUID(), type: 'hole', x: pos.x!, y: pos.y!, radius: diameterUnits / 2, parentId: rectId,
            ...(pos.xConfirmed && pos.yConfirmed ? {} : { positionSource: 'estimated-fallback' as const }),
        });
    });

    // Corner-notch cuts are placed directly from the named corner (a
    // high-confidence, non-numeric read) and never go through
    // resolvePositions -- everything else (edge-distance/centered/pitch/
    // nearEdge/fallback) is handled identically to holes, using the same
    // CENTER semantics, then offset back to the rect's top-left corner.
    const cuts = piece.cuts || [];
    const [cornerNotchCuts, otherCuts] = partition(cuts, cut => cut.cutType === 'corner_notch' && !!cut.corner);
    cornerNotchCuts.forEach(cut => {
        const width = cut.width != null ? toCanvasUnits(cut.width, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        const height = cut.height != null ? toCanvasUnits(cut.height, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        const x = cut.corner!.includes('left') ? rectX : rectX + rectWidth - width;
        const y = cut.corner!.startsWith('top') ? rectY : rectY + rectHeight - height;
        shapes.push({ id: generateUUID(), type: 'cut', x, y, width, height, parentId: rectId });
    });

    const cutPositions = resolvePositions(otherCuts, rectX, rectY, rectWidth, rectHeight);
    otherCuts.forEach((cut, i) => {
        const pos = cutPositions[i];
        const width = cut.width != null ? toCanvasUnits(cut.width, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        const height = cut.height != null ? toCanvasUnits(cut.height, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        shapes.push({
            id: generateUUID(), type: 'cut', x: pos.x! - width / 2, y: pos.y! - height / 2, width, height, parentId: rectId,
            ...(pos.xConfirmed && pos.yConfirmed ? {} : { positionSource: 'estimated-fallback' as const }),
        });
    });

    return shapes;
}

type MergedPieceGroup = {
    name: string;
    type: string;
    thickness: number;
    quantity: number;
    holes: number;
    cuts: number;
    hardwareNotes: string;
    shapes: KonvaShape[];
};

// Groups consecutive pieces marked connectedToPrevious into a single canvas
// entry, placing each member's rectangle side by side (left to right, in
// array order) at its real width offset, so an adjoining multi-section run
// (e.g. 5 panels cut from one continuous sheet) renders together on one
// shared canvas instead of separate tabs -- staff can then see at a glance
// whether a hole/cut lines up correctly against its neighboring section,
// rather than checking each section in isolation. Every member's holes/cuts
// stay correctly attached to their own rectangle (parentId) and simply move
// with it. This only affects the canvas grouping -- billing (the `items`
// array in buildDesignDataFromImageAnalysis) is built separately, one entry
// per original piece, so merging pieces here never changes area/cost counts.
function mergeConnectedPieceGroups(
    pieces: Array<{ name: string; type: string; thickness: number; quantity: number; holes: number; cuts: number; hardwareNotes: string; shapes: KonvaShape[]; connectedToPrevious?: boolean | null }>,
): MergedPieceGroup[] {
    const groups: Array<typeof pieces> = [];
    pieces.forEach(piece => {
        if (piece.connectedToPrevious && groups.length > 0) {
            groups[groups.length - 1].push(piece);
        } else {
            groups.push([piece]);
        }
    });

    return groups.map(group => {
        let cumulativeWidthUnits = 0;
        const mergedShapes: KonvaShape[] = [];
        group.forEach(piece => {
            const dx = cumulativeWidthUnits;
            const outline = piece.shapes.find(s => s.type === 'glass_rect' || s.type === 'glass_polygon');
            piece.shapes.forEach(shape => mergedShapes.push({ ...shape, x: shape.x + dx }));
            cumulativeWidthUnits += outline?.width ?? 0;
        });

        const first = group[0];
        return {
            name: group.length > 1 ? `${first.name} (${group.length} connected sections)` : first.name,
            type: first.type,
            thickness: first.thickness,
            quantity: first.quantity,
            holes: group.reduce((sum, piece) => sum + piece.holes, 0),
            cuts: group.reduce((sum, piece) => sum + piece.cuts, 0),
            hardwareNotes: group.map(piece => piece.hardwareNotes).filter(Boolean).join('; '),
            shapes: mergedShapes,
        };
    });
}

export function buildDesignDataFromImageAnalysis(analysis: WhatsAppImageAnalysis): {
    drawingData: DesignData;
    totalArea: number;
    grossArea: number;
    holes: number;
    cuts: number;
    items: DesignItem[];
} {
    const pieces = analysis.drawing.pieces.length
        ? analysis.drawing.pieces
        : [{
            name: 'Review Piece 1',
            type: 'Glass Piece',
            width: undefined,
            height: undefined,
            thickness: undefined,
            quantity: 1,
            holes: [],
            cuts: [],
            tapers: [],
            connectedToPrevious: false,
            hardwareNotes: analysis.drawing.notes || analysis.extractedText,
        }];

    const items: DesignItem[] = pieces.map((piece, index) => {
        const quantity = Number(piece.quantity) || 1;
        const width = Number(piece.width) || 0;
        const height = Number(piece.height) || 0;
        const area = width > 0 && height > 0
            ? calculateDimensionAreaSqft(width, height, quantity)
            : 0;

        return {
            id: generateUUID(),
            name: piece.name || `Image Piece ${index + 1}`,
            type: piece.type || 'Glass Piece',
            thickness: Number(piece.thickness) || 6,
            shapes: [],
            area,
            cost: 0,
            // Not part of the strict DesignItem type, but the design editor's
            // cost breakdown reads these extra fields (it treats items as
            // `any[]`) -- without them a reopened draft shows 0 holes/cuts
            // and quantity 1 regardless of what was actually extracted.
            netArea: area,
            // Totals across this piece's quantity, matching what `area`
            // already is (calculateDimensionAreaSqft multiplies by quantity)
            // and what GlassDesigner stores for editor-built designs. Billing
            // in orderDesignItems.ts relies on that convention holding for
            // both producers.
            holes: (piece.holes || []).length * quantity,
            cuts: (piece.cuts || []).length * quantity,
            quantity,
        } as DesignItem;
    });

    const totalArea = roundCurrency(items.reduce((sum, item) => sum + item.area, 0));
    const holes = pieces.reduce((sum, piece) => sum + (piece.holes || []).length, 0);
    const cuts = pieces.reduce((sum, piece) => sum + (piece.cuts || []).length, 0);
    const maxWidth = Math.max(...pieces.map(piece => Number(piece.width) || 0), 800);
    const maxHeight = Math.max(...pieces.map(piece => Number(piece.height) || 0), 600);

    const drawingData: DesignData = {
        shapes: [],
        dimensions: {
            width: maxWidth,
            height: maxHeight,
            unit: 'inch',
        },
        holes: [],
        cuts: [],
        notes: [
            'Created from WhatsApp image/drawing.',
            analysis.drawing.notes,
            analysis.extractedText ? `Extracted text: ${analysis.extractedText}` : '',
            'Review dimensions, hardware, and any flagged (amber) holes/cuts before production.',
        ].filter(Boolean).join('\n'),
        items,
        // Built per original piece first (unmerged -- items[] above already
        // captured accurate per-piece billing independently of this), then
        // grouped through mergeConnectedPieceGroups so consecutive
        // connectedToPrevious pieces land on one shared canvas instead of
        // separate tabs.
        pieces: mergeConnectedPieceGroups(pieces.map((piece, index) => ({
            name: piece.name || `Image Piece ${index + 1}`,
            type: piece.type || 'Glass Piece',
            thickness: Number(piece.thickness) || 6,
            quantity: Number(piece.quantity) || 1,
            holes: (piece.holes || []).length,
            cuts: (piece.cuts || []).length,
            hardwareNotes: piece.hardwareNotes || '',
            connectedToPrevious: piece.connectedToPrevious,
            // Real, editable canvas geometry -- empty array when there's no
            // width/height to draw from, same as before in that case.
            shapes: buildPieceShapes(piece),
        }))).map(group => ({
            id: generateUUID(),
            name: group.name,
            type: group.type,
            thickness: group.thickness,
            quantity: group.quantity,
            holes: group.holes,
            cuts: group.cuts,
            hardwareNotes: group.hardwareNotes,
            source: 'whatsapp-image',
            shapes: group.shapes,
        })),
    };

    return {
        drawingData,
        totalArea,
        grossArea: totalArea,
        holes,
        cuts,
        items,
    };
}
