import { calculateDimensionAreaSqft } from '@/lib/units';
import { generateUUID, roundCurrency } from '@/lib/utils';
import type { DesignData, DesignItem } from '@/types';

export type WhatsAppImageAnalysis = {
    classification: 'text_order' | 'drawing' | 'mixed' | 'unknown';
    extractedText: string;
    customerName?: string;
    confidence: number;
    orderLines: Array<{
        description: string;
        quantity?: number;
        unit?: string;
    }>;
    drawing: {
        notes: string;
        pieces: Array<{
            name: string;
            type: string;
            width?: number;
            height?: number;
            thickness?: number;
            quantity?: number;
            holes?: number;
            cuts?: number;
            hardwareNotes?: string;
        }>;
    };
};

const emptyAnalysis = (classification: WhatsAppImageAnalysis['classification'], extractedText = ''): WhatsAppImageAnalysis => ({
    classification,
    extractedText,
    confidence: 0,
    orderLines: [],
    drawing: {
        notes: '',
        pieces: [],
    },
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
                                'Analyze this WhatsApp image sent to a glass shop.',
                                'Classify it as text_order, drawing, mixed, or unknown.',
                                'Extract visible text, order lines, glass drawing dimensions, holes, cuts, thickness, hardware notes, and customer name if visible.',
                                'Use inches for drawing width/height when dimensions appear to be in inches. If unsure, leave numeric fields empty and explain in notes.',
                                'Do not invent dimensions or hardware.',
                                `Sender phone: ${input.fromPhone}`,
                                input.caption ? `Caption: ${input.caption}` : '',
                            ].filter(Boolean).join('\n'),
                        },
                        {
                            type: 'input_image',
                            image_url: input.imageDataUrl,
                        },
                    ],
                },
            ],
            text: {
                format: {
                    type: 'json_schema',
                    name: 'whatsapp_order_image_analysis',
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['classification', 'extractedText', 'confidence', 'orderLines', 'drawing'],
                        properties: {
                            classification: { type: 'string', enum: ['text_order', 'drawing', 'mixed', 'unknown'] },
                            extractedText: { type: 'string' },
                            customerName: { type: 'string' },
                            confidence: { type: 'number' },
                            orderLines: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['description'],
                                    properties: {
                                        description: { type: 'string' },
                                        quantity: { type: 'number' },
                                        unit: { type: 'string' },
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
                                            required: ['name', 'type'],
                                            properties: {
                                                name: { type: 'string' },
                                                type: { type: 'string' },
                                                width: { type: 'number' },
                                                height: { type: 'number' },
                                                thickness: { type: 'number' },
                                                quantity: { type: 'number' },
                                                holes: { type: 'number' },
                                                cuts: { type: 'number' },
                                                hardwareNotes: { type: 'string' },
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
        return emptyAnalysis('unknown', input.caption || '');
    }

    const data = await response.json();
    const outputText = data.output_text || data.output?.flatMap((item: any) => item.content || [])
        .find((content: any) => content.type === 'output_text')?.text;

    if (!outputText) return emptyAnalysis('unknown', input.caption || '');

    try {
        return JSON.parse(outputText) as WhatsAppImageAnalysis;
    } catch (error) {
        console.error('Failed to parse image analysis JSON:', error);
        return emptyAnalysis('unknown', input.caption || '');
    }
}

// GlassDesigner.tsx's canvas (react-konva) uses 10 canvas units per inch --
// e.g. its own createRectShape() does `width: widthIn * 10`. This isn't
// exported from that (client-only, 'use client') component, so it's
// duplicated here deliberately; keep in sync if that scale ever changes.
const CANVAS_UNITS_PER_INCH = 10;
const DEFAULT_HOLE_RADIUS_UNITS = 30; // matches GlassDesigner's manual "Add Hole" default
const DEFAULT_CUT_SIZE_UNITS = 50; // matches GlassDesigner's manual "Add Cut" default

type GeneratedShape = {
    id: string;
    type: 'glass_rect' | 'hole' | 'cut';
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    parentId?: string;
};

// Builds an actual rectangle (plus placeholder holes/cuts) in the exact
// format GlassDesigner's canvas reads back (GlassPiece.shapes: KonvaShape[]),
// so a drawing extracted from a photo shows up as a real, editable drawing
// instead of an empty canvas -- or worse, silently rendering as a circle
// (see below). Returns [] when there's no width/height to draw from, in
// which case the piece falls back to today's blank-canvas behavior.
function buildPieceShapes(piece: { width?: number; height?: number; holes?: number; cuts?: number }): GeneratedShape[] {
    const widthIn = Number(piece.width) || 0;
    const heightIn = Number(piece.height) || 0;
    if (widthIn <= 0 || heightIn <= 0) return [];

    const rectId = generateUUID();
    const rectX = 50;
    const rectY = 50;
    const rectWidth = widthIn * CANVAS_UNITS_PER_INCH;
    const rectHeight = heightIn * CANVAS_UNITS_PER_INCH;
    const shapes: GeneratedShape[] = [
        { id: rectId, type: 'glass_rect', x: rectX, y: rectY, width: rectWidth, height: rectHeight },
    ];

    // Vision analysis only gives hole/cut counts, not positions -- space them
    // evenly as a reasonable starting point. Staff still need to drag these
    // to the actual hardware positions before production.
    const holeCount = Math.max(0, Math.round(Number(piece.holes) || 0));
    for (let i = 0; i < holeCount; i++) {
        const fraction = (i + 1) / (holeCount + 1);
        shapes.push({
            id: generateUUID(),
            type: 'hole',
            x: rectX + rectWidth * fraction,
            y: rectY + rectHeight / 2,
            radius: DEFAULT_HOLE_RADIUS_UNITS,
            parentId: rectId,
        });
    }

    const cutCount = Math.max(0, Math.round(Number(piece.cuts) || 0));
    for (let i = 0; i < cutCount; i++) {
        const fraction = (i + 1) / (cutCount + 1);
        shapes.push({
            id: generateUUID(),
            type: 'cut',
            x: rectX + rectWidth * fraction - DEFAULT_CUT_SIZE_UNITS / 2,
            y: rectY + rectHeight - DEFAULT_CUT_SIZE_UNITS,
            width: DEFAULT_CUT_SIZE_UNITS,
            height: DEFAULT_CUT_SIZE_UNITS,
            parentId: rectId,
        });
    }

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
            holes: 0,
            cuts: 0,
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
            holes: Number(piece.holes) || 0,
            cuts: Number(piece.cuts) || 0,
            quantity,
        } as DesignItem;
    });

    const totalArea = roundCurrency(items.reduce((sum, item) => sum + item.area, 0));
    const holes = pieces.reduce((sum, piece) => sum + (Number(piece.holes) || 0), 0);
    const cuts = pieces.reduce((sum, piece) => sum + (Number(piece.cuts) || 0), 0);
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
            'Review dimensions, hardware, holes and cuts before production.',
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
            holes: Number(piece.holes) || 0,
            cuts: Number(piece.cuts) || 0,
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
