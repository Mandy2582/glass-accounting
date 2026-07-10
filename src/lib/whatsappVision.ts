import { calculateDimensionAreaSqft } from '@/lib/units';
import { generateUUID, roundCurrency } from '@/lib/utils';
import type { DesignData, DesignItem, KonvaShape } from '@/types';

export type LengthUnit = 'inch' | 'mm';

// A hole's position is normally dimensioned by hand from one or two nearby
// edges (e.g. "20mm from left, 15mm from top"), or marked centered on an
// axis. Only the edges actually dimensioned on the drawing should be filled
// in -- everything else stays null rather than guessed.
export type VisionHole = {
    diameter?: number | null;
    unit?: LengthUnit | null;
    fromLeft?: number | null;
    fromRight?: number | null;
    fromTop?: number | null;
    fromBottom?: number | null;
    centeredX?: boolean | null;
    centeredY?: boolean | null;
};

export type VisionCut = {
    cutType?: 'corner_notch' | 'edge_notch' | 'through_cut' | null;
    corner?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | null;
    width?: number | null;
    height?: number | null;
    unit?: LengthUnit | null;
    fromLeft?: number | null;
    fromRight?: number | null;
    fromTop?: number | null;
    fromBottom?: number | null;
    centeredX?: boolean | null;
    centeredY?: boolean | null;
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
                                'HOLE AND CUT POSITIONS: These drawings are normally dimensioned by hand from one or two nearby edges (e.g. "20mm from left", "15mm from top"), or marked as centered on an axis (a centerline, or equal tick marks on both sides). For every hole and every cut you find:',
                                '  - Record fromLeft/fromRight/fromTop/fromBottom as the distance from that edge of the panel to the CENTER of the hole/cut. Only fill in the edges that are actually dimensioned -- leave the rest null. Never invent or estimate a distance that is not marked on the drawing.',
                                '  - If a hole/cut is marked as centered on an axis instead of given a numeric distance, set centeredX and/or centeredY to true for that axis rather than guessing a number.',
                                '  - If a hole or cut has no readable position at all, still include it in the array (never drop it), but leave every position field null.',
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
                                                        required: ['diameter', 'unit', 'fromLeft', 'fromRight', 'fromTop', 'fromBottom', 'centeredX', 'centeredY'],
                                                        properties: {
                                                            diameter: { type: ['number', 'null'] },
                                                            unit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
                                                            fromLeft: { type: ['number', 'null'] },
                                                            fromRight: { type: ['number', 'null'] },
                                                            fromTop: { type: ['number', 'null'] },
                                                            fromBottom: { type: ['number', 'null'] },
                                                            centeredX: { type: ['boolean', 'null'] },
                                                            centeredY: { type: ['boolean', 'null'] },
                                                        },
                                                    },
                                                },
                                                cuts: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: ['cutType', 'corner', 'width', 'height', 'unit', 'fromLeft', 'fromRight', 'fromTop', 'fromBottom', 'centeredX', 'centeredY'],
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

// Resolves one axis (x or y) of a hole/cut's position from whatever the
// drawing actually dimensioned: centered wins if marked, else distance from
// the near edge, else distance from the far edge (computed backwards from
// rectSize), else unresolved (null) -- never guessed.
function placeOnAxis(
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

function placeHole(hole: VisionHole, rectX: number, rectY: number, rectW: number, rectH: number): { x: number | null; y: number | null; radius: number; extracted: boolean } {
    const diameterUnits = hole.diameter != null ? toCanvasUnits(hole.diameter, hole.unit) : DEFAULT_HOLE_RADIUS_UNITS * 2;
    const x = placeOnAxis(hole.fromLeft, hole.fromRight, hole.centeredX, hole.unit, rectX, rectW);
    const y = placeOnAxis(hole.fromTop, hole.fromBottom, hole.centeredY, hole.unit, rectY, rectH);
    return { x, y, radius: diameterUnits / 2, extracted: x != null && y != null };
}

function placeCut(cut: VisionCut, rectX: number, rectY: number, rectW: number, rectH: number): { x: number | null; y: number | null; width: number; height: number; extracted: boolean } {
    const width = cut.width != null ? toCanvasUnits(cut.width, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
    const height = cut.height != null ? toCanvasUnits(cut.height, cut.unit) : DEFAULT_CUT_SIZE_UNITS;

    if (cut.cutType === 'corner_notch' && cut.corner) {
        const x = cut.corner.includes('left') ? rectX : rectX + rectW - width;
        const y = cut.corner.startsWith('top') ? rectY : rectY + rectH - height;
        return { x, y, width, height, extracted: true };
    }

    // Top-left corner of the cut, so the axis math resolves the cut's center
    // then offsets back by half its size.
    const cx = placeOnAxis(cut.fromLeft, cut.fromRight, cut.centeredX, cut.unit, rectX, rectW);
    const cy = placeOnAxis(cut.fromTop, cut.fromBottom, cut.centeredY, cut.unit, rectY, rectH);
    const x = cx != null ? cx - width / 2 : null;
    const y = cy != null ? cy - height / 2 : null;
    return { x, y, width, height, extracted: x != null && y != null };
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
// Holes/cuts whose position was actually readable from the drawing (edge
// distance or centered marking) are placed at that real position. Anything
// that couldn't be read falls back to even-spacing -- but only spaced among
// other unresolved shapes, never overlapping a slot already taken by a real
// extracted position -- and is tagged positionSource: 'estimated-fallback'
// so the review UI can flag exactly that subset instead of everything.
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

    const holePlacements = (piece.holes || []).map(hole => ({ hole, placement: placeHole(hole, rectX, rectY, rectWidth, rectHeight) }));
    const [extractedHoles, fallbackHoles] = partition(holePlacements, entry => entry.placement.extracted);
    extractedHoles.forEach(({ placement }) => {
        shapes.push({ id: generateUUID(), type: 'hole', x: placement.x!, y: placement.y!, radius: placement.radius, parentId: rectId });
    });
    fallbackHoles.forEach(({ placement }, i) => {
        const fraction = (i + 1) / (fallbackHoles.length + 1);
        shapes.push({
            id: generateUUID(),
            type: 'hole',
            x: rectX + rectWidth * fraction,
            y: rectY + rectHeight / 2,
            radius: placement.radius,
            parentId: rectId,
            positionSource: 'estimated-fallback',
        });
    });

    const cutPlacements = (piece.cuts || []).map(cut => ({ cut, placement: placeCut(cut, rectX, rectY, rectWidth, rectHeight) }));
    const [extractedCuts, fallbackCuts] = partition(cutPlacements, entry => entry.placement.extracted);
    extractedCuts.forEach(({ placement }) => {
        shapes.push({ id: generateUUID(), type: 'cut', x: placement.x!, y: placement.y!, width: placement.width, height: placement.height, parentId: rectId });
    });
    fallbackCuts.forEach(({ placement }, i) => {
        const fraction = (i + 1) / (fallbackCuts.length + 1);
        shapes.push({
            id: generateUUID(),
            type: 'cut',
            x: rectX + rectWidth * fraction - placement.width / 2,
            y: rectY + rectHeight - placement.height,
            width: placement.width,
            height: placement.height,
            parentId: rectId,
            positionSource: 'estimated-fallback',
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
