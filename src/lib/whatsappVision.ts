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
            hardwareNotes?: string | null;
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
                                'MULTI-PIECE DRAWINGS: A single photo may show more than one separate glass panel (e.g. a fixed panel + a door + a ventilator, or several unrelated pieces sketched on one page). Treat each visually distinct panel/outline as its own entry in drawing.pieces, even if they share dimensions or touch each other in the sketch. Do not merge multiple panels into one piece, and do not drop a panel just because some of its details are unclear -- report every piece you can see, leaving fields null where you are unsure.',
                                '',
                                'HOLE AND CUT POSITIONS: These drawings dimension hole/cut positions in different ways depending on the sketch -- read each one as it is actually drawn, using whichever of the following applies:',
                                '  - MOST COMMON: distance from one or two nearby edges (e.g. "20mm from left", "15mm from top"), or marked as centered on an axis (a centerline, or equal tick marks on both sides). Record fromLeft/fromRight/fromTop/fromBottom as the distance from that edge of the panel to the CENTER of the hole/cut -- only fill in the edges that are actually dimensioned, leave the rest null. If marked centered instead of a number, set centeredX and/or centeredY to true rather than guessing a number.',
                                '  - NO NUMBER, BUT NEAR AN EDGE: many drawings place a row or column of holes/cuts close to one edge of the panel with no distance written at all (e.g. a column of holes running down near the left edge). When you can see it is clearly aligned along one specific edge but no number dimensions that distance, set nearEdge to that edge ("left"/"right"/"top"/"bottom") instead of leaving every field null -- this is a real observation (which edge it is near), not a guessed number.',
                                '  - DIMENSIONED FROM ANOTHER HOLE/CUT, NOT AN EDGE: sometimes a single distance is written between two holes/cuts themselves (e.g. two holes stacked vertically with "200mm" written between them), rather than either one being dimensioned from a panel edge. For the second of the pair, set pitchFromIndex to the 0-based index of the other hole/cut in this same array (list the reference one first), set pitchDistance and pitchUnit to that written number, and set pitchAxis to "vertical" if they are stacked one above the other or "horizontal" if side by side.',
                                '  - If a hole or cut has no readable position at all by any of the above (no edge dimension, no visible edge alignment, no pitch to another hole/cut), still include it in the array (never drop it), but leave every position field null.',
                                '  - For a notch cut from a corner, set cutType to "corner_notch" and corner to which corner, plus its width/height. Otherwise use "edge_notch" for a notch cut into an edge (not a corner), or "through_cut" for an internal cutout.',
                                '',
                                'UNITS: Shops often mix units on one drawing -- panel width/height are usually inches, but hole diameters and hole/cut distances are frequently marked in mm. Report widthUnit/heightUnit for the panel, and a separate unit per hole/cut, using whatever unit is actually written next to that number. If no unit is marked, leave it null rather than guessing.',
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
            // an outsized bill.
            max_output_tokens: 2000,
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
                                            required: ['name', 'type', 'width', 'height', 'widthUnit', 'heightUnit', 'thickness', 'quantity', 'holes', 'cuts', 'hardwareNotes'],
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
                                                        required: ['diameter', 'unit', 'fromLeft', 'fromRight', 'fromTop', 'fromBottom', 'centeredX', 'centeredY', 'nearEdge', 'pitchFromIndex', 'pitchDistance', 'pitchUnit', 'pitchAxis'],
                                                        properties: {
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
                                                        },
                                                    },
                                                },
                                                cuts: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: ['cutType', 'corner', 'width', 'height', 'unit', 'fromLeft', 'fromRight', 'fromTop', 'fromBottom', 'centeredX', 'centeredY', 'nearEdge', 'pitchFromIndex', 'pitchDistance', 'pitchUnit', 'pitchAxis'],
                                                        properties: {
                                                            cutType: { type: ['string', 'null'], enum: ['corner_notch', 'edge_notch', 'through_cut', null] },
                                                            corner: { type: ['string', 'null'], enum: ['top_left', 'top_right', 'bottom_left', 'bottom_right', null] },
                                                            width: { type: ['number', 'null'] },
                                                            height: { type: ['number', 'null'] },
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
                                                        },
                                                    },
                                                },
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

    try {
        return JSON.parse(outputText) as WhatsAppImageAnalysis;
    } catch (error) {
        console.error('Failed to parse image analysis JSON:', error);
        return emptyAnalysis('unknown', input.caption || '', true);
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
    const rootUnresolved = items.map((_, i) => i).filter(i => (resolved[i].x == null || resolved[i].y == null) && items[i].pitchFromIndex == null);
    rootUnresolved.forEach((i, orderInGroup) => {
        const fraction = (orderInGroup + 1) / (rootUnresolved.length + 1);
        resolved[i] = { x: rectX + rectW * fraction, y: rectY + rectH / 2, xConfirmed: false, yConfirmed: false };
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
    // (which would break rendering); fall back to plain even-spacing.
    const stillUnresolved = items.map((_, i) => i).filter(i => resolved[i].x == null || resolved[i].y == null);
    stillUnresolved.forEach((i, orderInGroup) => {
        const fraction = (orderInGroup + 1) / (stillUnresolved.length + 1);
        resolved[i] = { x: rectX + rectW * fraction, y: rectY + rectH / 2, xConfirmed: false, yConfirmed: false };
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
};

// Builds an actual rectangle (plus real or best-effort holes/cuts) in the
// exact format GlassDesigner's canvas reads back (GlassPiece.shapes:
// KonvaShape[]), so a drawing extracted from a photo shows up as a real,
// editable drawing instead of an empty canvas. Returns [] when there's no
// width/height to draw from, in which case the piece falls back to today's
// blank-canvas behavior.
//
// Holes/cuts go through resolvePositions() (edge distance/centered -> pitch
// chain -> nearEdge grouping -> last-resort even-spacing, see that function's
// comment). Anything not fully confirmed by a real dimensioned fact is
// tagged positionSource: 'estimated-fallback' so the review UI can flag
// exactly that subset instead of everything.
function buildPieceShapes(piece: VisionPieceLike): KonvaShape[] {
    const widthIn = Number(piece.width) || 0;
    const heightIn = Number(piece.height) || 0;
    if (widthIn <= 0 || heightIn <= 0) return [];

    const rectId = generateUUID();
    const rectX = 50;
    const rectY = 50;
    const rectWidth = toCanvasUnits(widthIn, piece.widthUnit ?? 'inch');
    const rectHeight = toCanvasUnits(heightIn, piece.heightUnit ?? 'inch');
    const shapes: KonvaShape[] = [
        { id: rectId, type: 'glass_rect', x: rectX, y: rectY, width: rectWidth, height: rectHeight },
    ];

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
            holes: (piece.holes || []).length,
            cuts: (piece.cuts || []).length,
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
        pieces: pieces.map((piece, index) => ({
            id: generateUUID(),
            name: piece.name || `Image Piece ${index + 1}`,
            type: piece.type || 'Glass Piece',
            width: Number(piece.width) || 0,
            height: Number(piece.height) || 0,
            thickness: Number(piece.thickness) || 6,
            quantity: Number(piece.quantity) || 1,
            holes: (piece.holes || []).length,
            cuts: (piece.cuts || []).length,
            hardwareNotes: piece.hardwareNotes || '',
            source: 'whatsapp-image',
            // Real, editable canvas geometry -- empty array when there's no
            // width/height to draw from, same as before in that case.
            shapes: buildPieceShapes(piece),
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
