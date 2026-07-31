'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, Square, Circle as CircleIcon, Move, Layers, RotateCcw, Upload, Images } from 'lucide-react';
import { generateUUID, formatInchesToFraction, parseFractionToInches } from '@/lib/utils';
import { roundToNextEvenInch } from '@/lib/designCalculations';
import { Stage, Layer, Rect, Circle, Transformer, Group, Text, Line, Arrow } from 'react-konva';
import { db } from '@/lib/storage';
import { GlassItem, KonvaShape, GlassPiece } from '@/types';
import { generateGlassSystem, describeGlassSystem, predictImagePieceHardware, type GlassSystemInput, type GlassSystemType } from '@/lib/glassSystemDesigner';
import { validateGlassSafety, type SafetyViolation } from '@/lib/glassSafetyValidator';
import { HARDWARE_CUTOUT_TEMPLATES, getCutoutSpecsForItem, deriveAccessoryGeometry } from '@/lib/fabricationSpecs';
import { calculateGlassEngineering } from '@/lib/glassEngineeringCalculator';
import { generateFactoryBOM } from '@/lib/glassBOMGenerator';

// Dimension-line rendering offsets (renderRectDimensions/getPolygonSideDimensions/
// getVertexAngleInfo below all divide these by the current drawingScale). Named
// here so getPieceBoundingBox (used by centerPieceShapes) can reserve exactly
// the same margin those renderers actually draw into, instead of an
// independently-guessed padding value that could drift out of sync.
const RECT_DIM_OFFSET_PX = 44;
const RECT_DIM_LABEL_HALF_W_PX = 43; // half of labelWidth=86
const RECT_DIM_LABEL_HALF_H_PX = 12; // half of labelHeight=24
const POLYGON_SIDE_DIM_OFFSET_PX = 70;
const VERTEX_ANGLE_OFFSET_PX = 22;

// Default/minimum Stage viewport (CSS pixels). Width grows to fill the
// actual canvas frame container (measured via ResizeObserver, see
// canvasFrameRef/stageViewportWidth state below) so wide multi-section
// drawings use the available space instead of sitting in a fixed 920px
// column with empty margin on either side; this is only the floor for
// narrow containers/before the first measurement. Height stays fixed --
// there is no vertical zoom/pan control today. Logical (world) size scales
// inversely with drawingScale; centerPieceShapes uses this to center a
// piece regardless of the current scale.
const STAGE_VIEWPORT_WIDTH = 920;
const STAGE_VIEWPORT_HEIGHT = 560;
const getStageLogicalSize = (scale: number, viewportWidth: number = STAGE_VIEWPORT_WIDTH, viewportHeight: number = STAGE_VIEWPORT_HEIGHT): { width: number; height: number } => ({
    width: Math.ceil(viewportWidth / scale),
    height: Math.ceil(viewportHeight / scale),
});

// Snap a value in pixels (1 inch = 10 pixels) to the nearest 0.125 inches (1.25 pixels)
const snapToOctalInch = (pixels: number): number => {
    const inches = pixels / 10;
    const snappedInches = Math.round(inches * 8) / 8;
    return snappedInches * 10;
};

// Format pixels to a string representing inches with up to 3 decimal places
const formatInches = (pixels: number): string => {
    const inches = pixels / 10;
    const rounded = Math.round(inches * 1000) / 1000;
    return `${rounded}`;
};

// Format pixels to a string representing inches as fractions (to the nearest 1/8 inch)
const formatInchesFraction = (pixels: number): string => {
    return formatInchesToFraction(pixels / 10);
};

// Parse fraction or decimal string to inches
const parseInches = (input: string): number => {
    return parseFractionToInches(input);
};

// Calculate coordinates for a polygon of N sides fitted into a bounding box of size (width, height)
// For a 4-sided irregular polygon:
// Vertex 0: Top-Left (0, 0)
// Vertex 1: Top-Right (width, 0)  --> Side 1 connects V0 to V1 (Top/Right-ish clockwise)
// Vertex 2: Bottom-Right (width, height)
// Vertex 3: Bottom-Left (0, height)
// Side 1: V0 -> V1 (top edge)
// Side 2: V1 -> V2 (right edge)
// Side 3: V2 -> V3 (bottom edge)
// Side 4: V3 -> V0 (left edge)
// To align with: "side 1 should be left one, side 2 may be top and then follow clockwise":
// Let's order the vertices starting from Bottom-Left, moving up and then clockwise:
// Vertex 0: Bottom-Left (0, height)
// Vertex 1: Top-Left (0, 0)          --> Side 1 is V0 -> V1 (Left Edge)
// Vertex 2: Top-Right (width, 0)      --> Side 2 is V1 -> V2 (Top Edge)
// Vertex 3: Bottom-Right (width, height) --> Side 3 is V2 -> V3 (Right Edge)
// (Side 4 is V3 -> V0, Bottom Edge)
const getPolygonPoints = (sides: number, width: number, height: number): number[] => {
    if (sides === 4) {
        return [
            0, height,      // V0: Bottom-Left
            0, 0,           // V1: Top-Left  (Side 1: V0 -> V1 is Left Edge)
            width, 0,       // V2: Top-Right (Side 2: V1 -> V2 is Top Edge)
            width, height   // V3: Bottom-Right (Side 3: Right Edge, Side 4: Bottom Edge)
        ];
    }
    const rx = width / 2;
    const ry = height / 2;
    const pts: number[] = [];
    for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        pts.push(rx + rx * Math.cos(angle));
        pts.push(ry + ry * Math.sin(angle));
    }
    return pts;
};

// Calculate centroid of a polygon from its relative vertex points
const getCentroid = (points: number[]): { x: number; y: number } => {
    let sumX = 0;
    let sumY = 0;
    const count = points.length / 2;
    for (let i = 0; i < points.length; i += 2) {
        sumX += points[i];
        sumY += points[i+1];
    }
    return { x: sumX / count, y: sumY / count };
};

// Shift polygon points so that minX and minY are 0, adjusting shape position x and y accordingly
const normalizePolygon = (
    shape: KonvaShape,
    points: number[]
): { x: number; y: number; width: number; height: number; points: number[] } => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
        const px = points[i];
        const py = points[i + 1];
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
    }

    // Shift relative points
    const normalizedPoints = points.map((p, i) => {
        return i % 2 === 0 ? p - minX : p - minY;
    });

    return {
        x: shape.x + minX,
        y: shape.y + minY,
        width: maxX - minX,
        height: maxY - minY,
        points: normalizedPoints,
    };
};

const getVertexAngleInfo = (pts: number[], index: number, shapeX: number, shapeY: number, centroid: { x: number, y: number }, drawingScale: number) => {
    const numPoints = pts.length / 2;
    const iprev = (index - 1 + numPoints) % numPoints;
    const inext = (index + 1) % numPoints;
    
    const xc = pts[2 * index];
    const yc = pts[2 * index + 1];
    
    const xp = pts[2 * iprev];
    const yp = pts[2 * iprev + 1];
    
    const xn = pts[2 * inext];
    const yn = pts[2 * inext + 1];
    
    // Vectors
    const vpx = xp - xc;
    const vpy = yp - yc;
    const vnx = xn - xc;
    const vny = yn - yc;
    
    const Lprev = Math.sqrt(vpx * vpx + vpy * vpy);
    const Lnext = Math.sqrt(vnx * vnx + vny * vny);
    
    if (Lprev === 0 || Lnext === 0) return null;
    
    const dot = vpx * vnx + vpy * vny;
    const cosTheta = dot / (Lprev * Lnext);
    const clampedCos = Math.max(-1, Math.min(1, cosTheta));
    const thetaRad = Math.acos(clampedCos);
    const thetaDeg = thetaRad * (180 / Math.PI);
    
    // Bisector calculation
    const upx = vpx / Lprev;
    const upy = vpy / Lprev;
    const unx = vnx / Lnext;
    const uny = vny / Lnext;
    
    let bx = upx + unx;
    let by = upy + uny;
    let Lb = Math.sqrt(bx * bx + by * by);
    
    if (Lb === 0) {
        bx = -upy;
        by = upx;
        Lb = 1;
    } else {
        bx = bx / Lb;
        by = by / Lb;
    }
    
    // Check if the bisector points towards the centroid
    const vcentx = centroid.x - xc;
    const vcenty = centroid.y - yc;
    const dotCent = bx * vcentx + by * vcenty;
    if (dotCent < 0) {
        bx = -bx;
        by = -by;
    }
    
    const offset = VERTEX_ANGLE_OFFSET_PX / drawingScale;
    const textX = shapeX + xc + bx * offset;
    const textY = shapeY + yc + by * offset;
    
    return {
        angle: thetaDeg,
        textX,
        textY,
        text: `${thetaDeg.toFixed(1)}°`
    };
};

// Get side dimensions for polygon
const getPolygonSideDimensions = (shape: KonvaShape, drawingScale: number = 1): Array<{
    id: string;
    hasSplit: boolean;
    arrow1Points?: number[];
    arrow2Points?: number[];
    singleArrowPoints?: number[];
    textX: number;
    textY: number;
    text: string;
    rotation: number;
}> => {
    const pts = shape.points || getPolygonPoints(shape.sides || 4, shape.width || 100, shape.height || 100);
    const centroid = getCentroid(pts);
    const numPoints = pts.length / 2;
    const sideDimensions = [];
    for (let j = 0; j < numPoints; j++) {
        const xs = pts[2 * j];
        const ys = pts[2 * j + 1];
        const xe = pts[2 * ((j + 1) % numPoints)];
        const ye = pts[2 * ((j + 1) % numPoints) + 1];

        const xs_abs = shape.x + xs;
        const ys_abs = shape.y + ys;
        const xe_abs = shape.x + xe;
        const ye_abs = shape.y + ye;

        const dx = xe_abs - xs_abs;
        const dy = ye_abs - ys_abs;
        const L = Math.sqrt(dx * dx + dy * dy);
        if (L < 5) continue;

        const ux = dx / L;
        const uy = dy / L;

        const n1x = -uy;
        const n1y = ux;
        const n2x = uy;
        const n2y = -ux;

        const mx = (xs_abs + xe_abs) / 2;
        const my = (ys_abs + ye_abs) / 2;

        const cx_abs = shape.x + centroid.x;
        const cy_abs = shape.y + centroid.y;

        const vx = cx_abs - mx;
        const vy = cy_abs - my;

        const dot1 = n1x * vx + n1y * vy;
        const nx = dot1 > 0 ? n1x : n2x;
        const ny = dot1 > 0 ? n1y : n2y;

        const offset = POLYGON_SIDE_DIM_OFFSET_PX / drawingScale; // 7 inches scaled – doubled for hole clearance
        const oxs_val = xs_abs + nx * offset;
        const oys_val = ys_abs + ny * offset;
        const oxe_val = xe_abs + nx * offset;
        const oye_val = ye_abs + ny * offset;
        const omx = mx + nx * offset;
        const omy = my + ny * offset;

        const angleRad = Math.atan2(dy, dx);
        let rotation = angleRad * (180 / Math.PI);
        if (rotation > 90) rotation -= 180;
        if (rotation < -90) rotation += 180;

        const textX = omx;
        const textY = omy;
        const text = `${formatInchesFraction(L)}`;

        // Arrow line covers the middle half of the side (1/4 to 3/4)
        const qSx = oxs_val + (oxe_val - oxs_val) * 0.25;
        const qSy = oys_val + (oye_val - oys_val) * 0.25;
        const qEx = oxs_val + (oxe_val - oxs_val) * 0.75;
        const qEy = oys_val + (oye_val - oys_val) * 0.75;
        const halfLen = L / 2;
        const showSplit = halfLen > 100 / drawingScale;

        if (showSplit) {
            const textGap = 40 / drawingScale;
            
            // Arrow 1: from centre toward start (quarter point)
            const arrow1Points = [
                omx - textGap * ux,
                omy - textGap * uy,
                qSx,
                qSy
            ];
            
            // Arrow 2: from centre toward end (three-quarter point)
            const arrow2Points = [
                omx + textGap * ux,
                omy + textGap * uy,
                qEx,
                qEy
            ];

            sideDimensions.push({
                id: `dim-${shape.id}-${j}`,
                hasSplit: true,
                arrow1Points,
                arrow2Points,
                textX,
                textY,
                text,
                rotation,
            });
        } else {
            const singleArrowPoints = [
                qSx,
                qSy,
                qEx,
                qEy
            ];

            sideDimensions.push({
                id: `dim-${shape.id}-${j}`,
                hasSplit: false,
                singleArrowPoints,
                textX,
                textY,
                text,
                rotation,
            });
        }
    }
    return sideDimensions;
};

const RECT_ADJACENCY_TOLERANCE_UNITS = 5; // 0.5 inch -- generous enough to tolerate rounding from the merge/offset math

// True when another glass_rect/glass_polygon in the same piece touches this
// shape's right edge (an interior seam of a connected multi-section run).
// Used to suppress a rect's own height dimension line at seams, since every
// section in a touching run shares the same height -- without this check
// each section would draw an identical, overlapping height callout.
const hasSiblingToTheRight = (shape: KonvaShape, allShapes: KonvaShape[]): boolean => {
    const width = shape.width || 0;
    const height = shape.height || 0;
    return allShapes.some(other => {
        if (other.id === shape.id) return false;
        if (other.type !== 'glass_rect' && other.type !== 'glass_polygon') return false;
        const otherHeight = other.height || 0;
        const touchesRight = Math.abs(other.x - (shape.x + width)) < RECT_ADJACENCY_TOLERANCE_UNITS;
        const verticallyOverlaps = other.y < shape.y + height && other.y + otherHeight > shape.y;
        return touchesRight && verticallyOverlaps;
    });
};

// Render dimensions for rectangle shapes with split line & central text
// showHeightDimension can be set false when this rect sits directly against
// a sibling rect on its right edge (an interior seam within a connected
// multi-section piece) -- every section would otherwise draw its own
// identical height dimension line, cluttering and overlapping at each seam
// where sections touch. Only the rightmost/last section in such a run (or
// any standalone rect) should render the height dimension, giving one clean
// callout for the whole connected run instead of one per section.
const renderRectDimensions = (shape: KonvaShape, scale: number = 1, showHeightDimension: boolean = true): React.ReactNode => {
    const width = shape.width || 0;
    const height = shape.height || 0;
    
    const textGap = RECT_DIM_OFFSET_PX / scale;
    const arrowOffset = RECT_DIM_OFFSET_PX / scale;
    const dimensionColor = '#0e7490';
    const extensionColor = '#67c3d6';

    // Horizontal dim line above the glass
    const cx = shape.x + width / 2;
    const cy = shape.y - arrowOffset;
    const hLineHalf = Math.max(width / 2, 30 / scale);

    // Vertical dim line to the right of the glass
    const hcx = shape.x + width + arrowOffset;
    const hcy = shape.y + height / 2;
    const vLineHalf = Math.max(height / 2, 30 / scale);

    const textFontSize = 14 / scale;
    const labelWidth = (RECT_DIM_LABEL_HALF_W_PX * 2) / scale;
    const labelHeight = (RECT_DIM_LABEL_HALF_H_PX * 2) / scale;
    const showWidthSplit = width > 110 / scale;
    const wText = `${formatInchesFraction(width)}"`;
    
    const showHeightSplit = height > 110 / scale;
    const hText = `${formatInchesFraction(height)}"`;

    return (
        <Group>
            <Line points={[shape.x, shape.y, shape.x, cy]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
            <Line points={[shape.x + width, shape.y, shape.x + width, cy]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
            {showHeightDimension && (
                <>
                    <Line points={[shape.x + width, shape.y, hcx, shape.y]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
                    <Line points={[shape.x + width, shape.y + height, hcx, shape.y + height]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
                </>
            )}
            {/* Horizontal Dimension (Width) */}
            {showWidthSplit ? (
                <>
                    <Arrow
                        points={[cx - textGap, cy, cx - hLineHalf, cy]}
                        stroke={dimensionColor}
                        strokeWidth={2 / scale}
                        pointerAtEnding={true}
                        pointerLength={8 / scale}
                        pointerWidth={8 / scale}
                        fill={dimensionColor}
                        listening={false}
                    />
                    <Arrow
                        points={[cx + textGap, cy, cx + hLineHalf, cy]}
                        stroke={dimensionColor}
                        strokeWidth={2 / scale}
                        pointerAtEnding={true}
                        pointerLength={8 / scale}
                        pointerWidth={8 / scale}
                        fill={dimensionColor}
                        listening={false}
                    />
                </>
            ) : (
                <Arrow
                    points={[cx - hLineHalf, cy, cx + hLineHalf, cy]}
                    stroke={dimensionColor}
                    strokeWidth={2 / scale}
                    pointerAtBeginning={true}
                    pointerAtEnding={true}
                    pointerLength={8 / scale}
                    pointerWidth={8 / scale}
                    fill={dimensionColor}
                    listening={false}
                />
            )}
            <Rect
                x={cx - labelWidth / 2}
                y={cy - labelHeight / 2}
                width={labelWidth}
                height={labelHeight}
                fill="#ffffff"
                stroke="#a3d9e0"
                strokeWidth={1 / scale}
                cornerRadius={6 / scale}
                listening={false}
            />
            <Text
                x={cx - labelWidth / 2}
                y={cy - textFontSize / 2}
                text={wText}
                fontSize={textFontSize}
                fontStyle="bold"
                fill="#0e7490"
                align="center"
                width={labelWidth}
                offsetY={1 / scale}
                listening={false}
            />

            {/* Vertical Dimension (Height) -- suppressed at interior seams of a connected multi-section piece */}
            {showHeightDimension && (
                <>
                    {showHeightSplit ? (
                        <>
                            <Arrow
                                points={[hcx, hcy - textGap, hcx, hcy - vLineHalf]}
                                stroke={dimensionColor}
                                strokeWidth={2 / scale}
                                pointerAtEnding={true}
                                pointerLength={8 / scale}
                                pointerWidth={8 / scale}
                                fill={dimensionColor}
                                listening={false}
                            />
                            <Arrow
                                points={[hcx, hcy + textGap, hcx, hcy + vLineHalf]}
                                stroke={dimensionColor}
                                strokeWidth={2 / scale}
                                pointerAtEnding={true}
                                pointerLength={8 / scale}
                                pointerWidth={8 / scale}
                                fill={dimensionColor}
                                listening={false}
                            />
                        </>
                    ) : (
                        <Arrow
                            points={[hcx, hcy - vLineHalf, hcx, hcy + vLineHalf]}
                            stroke={dimensionColor}
                            strokeWidth={2 / scale}
                            pointerAtBeginning={true}
                            pointerAtEnding={true}
                            pointerLength={8 / scale}
                            pointerWidth={8 / scale}
                            fill={dimensionColor}
                            listening={false}
                        />
                    )}
                    <Rect
                        x={hcx - labelWidth / 2}
                        y={hcy - labelHeight / 2}
                        width={labelWidth}
                        height={labelHeight}
                        fill="#ffffff"
                        stroke="#a3d9e0"
                        strokeWidth={1 / scale}
                        cornerRadius={6 / scale}
                        listening={false}
                    />
                    <Text
                        x={hcx - labelWidth / 2}
                        y={hcy - textFontSize / 2}
                        text={hText}
                        fontSize={textFontSize}
                        fontStyle="bold"
                        fill="#0e7490"
                        align="center"
                        width={labelWidth}
                        offsetY={1 / scale}
                        listening={false}
                    />
                </>
            )}
        </Group>
    );
};

// Render dimensions for circle shapes with split line & central text
const renderCircleDimensions = (shape: KonvaShape, scale: number = 1): React.ReactNode => {
    const radius = shape.radius || 0;
    const diameter = radius * 2;
    
    const textGap = 44 / scale;
    const lineHalf = radius;
    const dimensionColor = '#0e7490';
    const labelWidth = 96 / scale;
    const labelHeight = 24 / scale;
    
    const cx = shape.x;
    const cy = shape.y;
    
    const textFontSize = 14 / scale;
    const showSplit = diameter > 110 / scale;
    const dText = `Ø ${formatInchesFraction(diameter)}"`;

    return (
        <Group>
            {showSplit ? (
                <>
                    <Arrow
                        points={[cx - textGap, cy, cx - lineHalf, cy]}
                        stroke={dimensionColor}
                        strokeWidth={2 / scale}
                        pointerAtEnding={true}
                        pointerLength={8 / scale}
                        pointerWidth={8 / scale}
                        fill={dimensionColor}
                        listening={false}
                    />
                    <Arrow
                        points={[cx + textGap, cy, cx + lineHalf, cy]}
                        stroke={dimensionColor}
                        strokeWidth={2 / scale}
                        pointerAtEnding={true}
                        pointerLength={8 / scale}
                        pointerWidth={8 / scale}
                        fill={dimensionColor}
                        listening={false}
                    />
                </>
            ) : (
                <Arrow
                    points={[cx - lineHalf, cy, cx + lineHalf, cy]}
                    stroke={dimensionColor}
                    strokeWidth={2 / scale}
                    pointerAtBeginning={true}
                    pointerAtEnding={true}
                    pointerLength={8 / scale}
                    pointerWidth={8 / scale}
                    fill={dimensionColor}
                    listening={false}
                />
            )}
            <Rect
                x={cx - labelWidth / 2}
                y={cy - labelHeight / 2}
                width={labelWidth}
                height={labelHeight}
                fill="#ffffff"
                stroke="#a3d9e0"
                strokeWidth={1 / scale}
                cornerRadius={6 / scale}
                listening={false}
            />
            <Text
                x={cx - labelWidth / 2}
                y={cy - textFontSize / 2}
                text={dText}
                fontSize={textFontSize}
                fontStyle="bold"
                fill="#0e7490"
                align="center"
                width={labelWidth}
                offsetY={1 / scale}
                listening={false}
            />
        </Group>
    );
};

// ===========================================================================
// PARALLELOGRAM HELPERS
// ===========================================================================

/**
 * Return the 4 points of a parallelogram as a flat [x0,y0,...] Konva array.
 * Coordinates are RELATIVE to (ox, oy) — call with ox=0, oy=0 inside a Group.
 *
 * LEFT and RIGHT sides are VERTICAL (parallel to Y axis).
 * TOP and BOTTOM sides are skewed UP-RIGHT (right side sits HIGHER than left).
 *
 *   TL (ox,     oy+sk)   ──────►  TR (ox+w, oy)      ← top slopes UP going right
 *   │                                │                   ← both sides vertical, height = h
 *   BL (ox,     oy+h+sk) ──────►  BR (ox+w, oy+h)    ← bottom also slopes UP going right
 *
 * Glass dimensions: width = w, height = h  (area = w × h, same as rectangle)
 */
const getParallelogramPoints = (ox: number, oy: number, w: number, h: number, skewX?: number): number[] => {
    const sk = skewX !== undefined ? skewX : Math.round(h * 0.35);
    return [
        ox,       oy + sk,       // TL – top of left vertical side (lower than TR)
        ox + w,   oy,            // TR – top of right vertical side (higher = skew UP)
        ox + w,   oy + h,        // BR – bottom of right vertical side
        ox,       oy + h + sk,   // BL – bottom of left vertical side
    ];
};

/**
 * Render dimension arrows for a parallelogram.
 * Call this inside the same Group that renders the Line (so all coords are relative to ox=0, oy=0).
 *
 *   Width  arrow → along the BOTTOM edge (BL → BR), offset below
 *   Height arrow → along the LEFT edge  (TL → BL, vertical), offset left
 */
const renderParallelogramDimensions = (w: number, h: number, sk: number, scale: number = 1): React.ReactNode => {
    const skewFactor = 0.7;
    const wr = w * skewFactor;

    const dimOffset = 70 / scale;
    const textFs    = 16 / scale;
    const arrowSW   = 3 / scale;
    const arrowPL   = 10 / scale;
    const arrowPW   = 10 / scale;
    const textW     = 80 / scale;
    const textOffX  = 40 / scale;
    const textOffY  = 9 / scale;
    const textGap   = 40 / scale;

    const wText = `${formatInchesFraction(w)}"`;
    const hText = `${formatInchesFraction(h)}"`;

    // ---- Width arrow along TOP edge (TL → TR), offset INSIDE (below/downward) ----
    const tdx = wr;           const tdy = -sk;
    const tLen = Math.sqrt(tdx * tdx + tdy * tdy);
    const tux = tdx / tLen;   const tuy = tdy / tLen;
    const yShift = dimOffset * (tLen / wr);
    // Middle half of the top edge: from 1/4 to 3/4 along edge direction
    const wQSx = wr * 0.25;  const wQSy = sk * 0.75 + yShift;
    const wQEx = wr * 0.75;  const wQEy = sk * 0.25 + yShift;
    const wMx = wr / 2;       const wMy = sk / 2 + yShift;
    const wRot = Math.atan2(tdy, tdx) * 180 / Math.PI;
    const halfLen = tLen / 2;
    const showWSplit = halfLen > 100 / scale;

    // ---- Height arrow along RIGHT edge (TR → BR, vertical), offset INSIDE (left) ----
    const hx  = wr - dimOffset;
    const hTop = 0;
    const hBot = h;
    const hMid = (hTop + hBot) / 2;
    const vLineHalf = h / 4; // covers middle half
    const showHSplit = vLineHalf * 2 > 100 / scale;

    return (
        <>
            {/* Width arrow along top edge (inside, half-length) */}
            {showWSplit ? (
                <>
                    <Arrow points={[wMx - textGap * tux, wMy - textGap * tuy, wQSx, wQSy]}
                        stroke="#6b7280" strokeWidth={arrowSW} fill="#6b7280"
                        pointerAtEnding={true} pointerLength={arrowPL} pointerWidth={arrowPW} listening={false} />
                    <Arrow points={[wMx + textGap * tux, wMy + textGap * tuy, wQEx, wQEy]}
                        stroke="#6b7280" strokeWidth={arrowSW} fill="#6b7280"
                        pointerAtEnding={true} pointerLength={arrowPL} pointerWidth={arrowPW} listening={false} />
                </>
            ) : (
                <Arrow points={[wQSx, wQSy, wQEx, wQEy]}
                    stroke="#6b7280" strokeWidth={arrowSW} fill="#6b7280"
                    pointerAtBeginning={true} pointerAtEnding={true} pointerLength={arrowPL} pointerWidth={arrowPW} listening={false} />
            )}
            <Text x={wMx} y={wMy} text={wText}
                fontSize={textFs} fontStyle="bold" fill="#374151"
                align="center" width={textW} offsetX={textOffX} offsetY={textOffY}
                rotation={wRot > 90 ? wRot - 180 : wRot < -90 ? wRot + 180 : wRot}
                listening={false}
            />

            {/* Height arrow on right edge (inside, vertical, half-length) */}
            {showHSplit ? (
                <>
                    <Arrow points={[hx, hMid - textGap, hx, hMid - vLineHalf]}
                        stroke="#6b7280" strokeWidth={arrowSW} fill="#6b7280"
                        pointerAtEnding={true} pointerLength={arrowPL} pointerWidth={arrowPW} listening={false} />
                    <Arrow points={[hx, hMid + textGap, hx, hMid + vLineHalf]}
                        stroke="#6b7280" strokeWidth={arrowSW} fill="#6b7280"
                        pointerAtEnding={true} pointerLength={arrowPL} pointerWidth={arrowPW} listening={false} />
                </>
            ) : (
                <Arrow points={[hx, hMid - vLineHalf, hx, hMid + vLineHalf]}
                    stroke="#6b7280" strokeWidth={arrowSW} fill="#6b7280"
                    pointerAtBeginning={true} pointerAtEnding={true} pointerLength={arrowPL} pointerWidth={arrowPW} listening={false} />
            )}
            <Text x={hx} y={hMid} text={hText}
                fontSize={textFs} fontStyle="bold" fill="#374151"
                align="center" width={textW} offsetX={textOffX} offsetY={textOffY}
                rotation={-90}
                listening={false}
            />
        </>
    );
};


// Computes the true visual bounds of a piece: shape geometry plus the
// dimension-line margins those shapes render into (see renderRectDimensions/
// getPolygonSideDimensions/getVertexAngleInfo above), so a piece can be
// positioned without any of its dimension lines/labels landing off-canvas.
const getPieceBoundingBox = (shapes: KonvaShape[], scale: number): { minX: number; minY: number; maxX: number; maxY: number } => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x0: number, y0: number, x1: number, y1: number) => {
        minX = Math.min(minX, x0, x1);
        minY = Math.min(minY, y0, y1);
        maxX = Math.max(maxX, x0, x1);
        maxY = Math.max(maxY, y0, y1);
    };

    shapes.forEach(s => {
        if (s.type === 'glass_rect') {
            const w = s.width || 0, h = s.height || 0;
            // Own geometry, plus the width-dim margin above and height-dim margin to the right.
            expand(
                s.x, s.y - (RECT_DIM_OFFSET_PX + RECT_DIM_LABEL_HALF_H_PX) / scale,
                s.x + w + (RECT_DIM_OFFSET_PX + RECT_DIM_LABEL_HALF_W_PX) / scale, s.y + h,
            );
        } else if (s.type === 'glass_circle') {
            const r = s.radius || 0;
            const pad = (RECT_DIM_OFFSET_PX + RECT_DIM_LABEL_HALF_W_PX) / scale; // renderCircleDimensions uses the same textGap
            expand(s.x - r - pad, s.y - r - pad, s.x + r + pad, s.y + r + pad);
        } else if (s.type === 'glass_polygon' || s.type === 'glass_parallelogram') {
            const pts = s.points || getPolygonPoints(s.sides || 4, s.width || 100, s.height || 100);
            const pad = (POLYGON_SIDE_DIM_OFFSET_PX + 20) / scale; // +20 logical-unit safety pad for label text, not modeled exactly
            for (let i = 0; i < pts.length; i += 2) {
                expand(s.x + pts[i] - pad, s.y + pts[i + 1] - pad, s.x + pts[i] + pad, s.y + pts[i + 1] + pad);
            }
        } else if (s.type === 'hole') {
            const r = s.radius || 0;
            expand(s.x - r, s.y - r, s.x + r, s.y + r);
        } else if (s.type === 'cut' || s.type === 'accessory') {
            const w = s.width || 0, h = s.height || 0;
            expand(s.x, s.y, s.x + w, s.y + h);
        }
    });

    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
};

// Translates every shape in a piece so its full bounding box (shape geometry
// + dimension-line margins) sits centered in the fixed logical viewport --
// fixes the previous top-left-anchored placement where dimension lines could
// render at negative coordinates and get invisibly clipped by the Stage.
// Only x/y are translated; polygon `points` are always stored relative to
// shape.x/y in this codebase's convention, so a piece's internal layout
// (rect + its holes/cuts/accessories) is preserved exactly.
const centerPieceShapes = (shapes: KonvaShape[], stageLogicalWidth: number, stageLogicalHeight: number, scale: number): KonvaShape[] => {
    if (shapes.length === 0) return shapes;
    const bbox = getPieceBoundingBox(shapes, scale);
    const bboxW = bbox.maxX - bbox.minX;
    const bboxH = bbox.maxY - bbox.minY;
    const dx = (stageLogicalWidth - bboxW) / 2 - bbox.minX;
    const dy = (stageLogicalHeight - bboxH) / 2 - bbox.minY;
    return shapes.map(s => ({ ...s, x: snapToOctalInch(s.x + dx), y: snapToOctalInch(s.y + dy) }));
};

const centerSystemPieces = (systemPieces: Array<Omit<GlassPiece, 'id'>>, stageLogicalWidth: number, stageLogicalHeight: number, scale: number): GlassPiece[] => {
    const allShapes = systemPieces.flatMap(p => p.shapes);
    if (allShapes.length === 0) {
        return systemPieces.map(p => ({ id: generateUUID(), ...p }));
    }
    const bbox = getPieceBoundingBox(allShapes, scale);
    const bboxW = bbox.maxX - bbox.minX;
    const bboxH = bbox.maxY - bbox.minY;
    const dx = (stageLogicalWidth - bboxW) / 2 - bbox.minX;
    const dy = (stageLogicalHeight - bboxH) / 2 - bbox.minY;

    return systemPieces.map(p => ({
        id: generateUUID(),
        ...p,
        shapes: p.shapes.map(s => ({
            ...s,
            x: snapToOctalInch(s.x + dx),
            y: snapToOctalInch(s.y + dy)
        }))
    }));
};

interface DesignPreset {
    id: string;
    category: 'Bathroom' | 'Home' | 'Enclosure';
    name: string;
    description: string;
    dimensions: string;
    createPiece?: () => Omit<GlassPiece, 'id'>;
    createPieces?: () => Array<Omit<GlassPiece, 'id'>>;
}

interface PhotoDraft {
    id: string;
    fileName: string;
    previewUrl: string;
    pieceName: string;
    type: string;
    width: string;
    height: string;
    thickness: number;
}

const createRectShape = (widthIn: number, heightIn: number, x = 100, y = 80): KonvaShape => ({
    id: generateUUID(),
    type: 'glass_rect',
    x,
    y,
    width: widthIn * 10,
    height: heightIn * 10
});

const createAccessoryShape = (
    parentId: string,
    accessoryType: 'lock' | 'connector' | 'hinge' | 'profile',
    x: number,
    y: number,
    width: number,
    height: number,
    accessoryName: string
): KonvaShape => {
    const requirement = accessoryType === 'hinge'
        ? { holes: 2, cuts: 1, holeRadiusIn: 0.25, cutAreaSqIn: 6, label: '2 holes + 1 cut' }
        : accessoryType === 'lock'
            ? { holes: 1, cuts: 1, holeRadiusIn: 0.75, cutAreaSqIn: 6, label: '1 hole + 1 cut' }
            : accessoryType === 'connector'
                ? { holes: 2, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: '2 holes' }
                : { holes: 0, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: 'no holes/cuts' };

    return {
        id: generateUUID(),
        type: 'accessory',
        x,
        y,
        width,
        height,
        accessoryType,
        accessoryName,
        parentId,
        accessoryHoleCount: requirement.holes,
        accessoryCutCount: requirement.cuts,
        accessoryHoleRadiusIn: requirement.holeRadiusIn,
        accessoryCutAreaSqIn: requirement.cutAreaSqIn,
        accessoryRequirementLabel: requirement.label
    };
};

const DESIGN_PRESETS: DesignPreset[] = [
    {
        id: 'fixed-door-ventilator-set',
        category: 'Home',
        name: '3 Pc Fixed + Door + Ventilator',
        description: 'Separate fixed side glass, door panel, and ventilator over the door with hinge/lock/connector markers.',
        dimensions: 'Fixed 24" x 84", Door 30" x 72", Ventilator 30" x 12" | 10mm',
        createPieces: () => {
            const fixed = createRectShape(24, 84);
            const door = createRectShape(30, 72);
            const ventilator = createRectShape(30, 12);

            return [
                {
                    name: 'Fixed Side Glass',
                    type: 'Partition',
                    thickness: 10,
                    quantity: 1,
                    shapes: [
                        fixed,
                        createAccessoryShape(fixed.id, 'connector', 95, 120, 40, 20, 'Wall L-Connector'),
                        createAccessoryShape(fixed.id, 'connector', 95, 820, 40, 20, 'Floor L-Connector')
                    ]
                },
                {
                    name: 'Glass Door',
                    type: 'Door',
                    thickness: 10,
                    quantity: 1,
                    shapes: [
                        door,
                        createAccessoryShape(door.id, 'hinge', 95, 190, 30, 25, 'Door Hinge'),
                        createAccessoryShape(door.id, 'hinge', 95, 560, 30, 25, 'Door Hinge'),
                        createAccessoryShape(door.id, 'lock', 375, 420, 25, 25, 'Glass Lock')
                    ]
                },
                {
                    name: 'Door Ventilator',
                    type: 'Window',
                    thickness: 10,
                    quantity: 1,
                    shapes: [
                        ventilator,
                        createAccessoryShape(ventilator.id, 'connector', 105, 85, 40, 20, 'Top L-Connector'),
                        createAccessoryShape(ventilator.id, 'connector', 350, 85, 40, 20, 'Top L-Connector')
                    ]
                }
            ];
        }
    },
    {
        id: 'fixed-door-set',
        category: 'Home',
        name: '2 Pc Fixed + Door',
        description: 'Separate fixed side glass and door panel with common door hardware already positioned.',
        dimensions: 'Fixed 24" x 72", Door 30" x 72" | 10mm',
        createPieces: () => {
            const fixed = createRectShape(24, 72);
            const door = createRectShape(30, 72);

            return [
                {
                    name: 'Fixed Side Glass',
                    type: 'Partition',
                    thickness: 10,
                    quantity: 1,
                    shapes: [
                        fixed,
                        createAccessoryShape(fixed.id, 'connector', 95, 120, 40, 20, 'Wall L-Connector'),
                        createAccessoryShape(fixed.id, 'connector', 95, 700, 40, 20, 'Floor L-Connector')
                    ]
                },
                {
                    name: 'Glass Door',
                    type: 'Door',
                    thickness: 10,
                    quantity: 1,
                    shapes: [
                        door,
                        createAccessoryShape(door.id, 'hinge', 95, 180, 30, 25, 'Door Hinge'),
                        createAccessoryShape(door.id, 'hinge', 95, 580, 30, 25, 'Door Hinge'),
                        createAccessoryShape(door.id, 'lock', 375, 420, 25, 25, 'Glass Lock')
                    ]
                }
            ];
        }
    },
    {
        id: 'shower-door',
        category: 'Enclosure',
        name: 'Shower Door',
        description: 'Door panel with two hinges and one lock already placed.',
        dimensions: '30" x 72" | 10mm',
        createPiece: () => {
            const glass = createRectShape(30, 72);
            return {
                name: 'Shower Door',
                type: 'Door',
                thickness: 10,
                quantity: 1,
                shapes: [
                    glass,
                    createAccessoryShape(glass.id, 'hinge', 95, 180, 30, 25, 'Door Hinge'),
                    createAccessoryShape(glass.id, 'hinge', 95, 580, 30, 25, 'Door Hinge'),
                    createAccessoryShape(glass.id, 'lock', 375, 420, 25, 25, 'Glass Lock')
                ]
            };
        }
    },
    {
        id: 'fixed-shower-panel',
        category: 'Enclosure',
        name: 'Fixed Shower Panel',
        description: 'Fixed partition with two L-connectors for a shower enclosure.',
        dimensions: '36" x 72" | 10mm',
        createPiece: () => {
            const glass = createRectShape(36, 72);
            return {
                name: 'Fixed Shower Panel',
                type: 'Partition',
                thickness: 10,
                quantity: 1,
                shapes: [
                    glass,
                    createAccessoryShape(glass.id, 'connector', 100, 760, 40, 20, 'L-Connector'),
                    createAccessoryShape(glass.id, 'connector', 420, 760, 40, 20, 'L-Connector')
                ]
            };
        }
    },
    {
        id: 'glass-shelf',
        category: 'Home',
        name: 'Glass Shelf',
        description: 'A compact shelf for kitchens, bathrooms, and display units.',
        dimensions: '24" x 8" | 8mm',
        createPiece: () => ({
            name: 'Glass Shelf',
            type: 'Shelf',
            thickness: 8,
            quantity: 1,
            shapes: [createRectShape(24, 8)]
        })
    },
    {
        id: 'table-top',
        category: 'Home',
        name: 'Table Top',
        description: 'A standard rectangular dining or work table top.',
        dimensions: '48" x 30" | 10mm',
        createPiece: () => ({
            name: 'Table Top',
            type: 'Table Top',
            thickness: 10,
            quantity: 1,
            shapes: [createRectShape(48, 30)]
        })
    },
    {
        id: 'railing-panel',
        category: 'Home',
        name: 'Railing Panel',
        description: 'A common rectangular balcony or staircase railing panel.',
        dimensions: '36" x 42" | 12mm',
        createPiece: () => ({
            name: 'Railing Panel',
            type: 'Partition',
            thickness: 12,
            quantity: 1,
            shapes: [createRectShape(36, 42)]
        })
    },
    {
        id: 'sloped-stair-panel',
        category: 'Home',
        name: 'Sloped Stair Panel',
        description: 'A starter panel for staircase railings with an inclined edge.',
        dimensions: '42" x 36" | 12mm',
        createPiece: () => ({
            name: 'Sloped Stair Panel',
            type: 'Partition',
            thickness: 12,
            quantity: 1,
            shapes: [{
                id: generateUUID(),
                type: 'glass_parallelogram',
                x: 100,
                y: 80,
                width: 420,
                height: 360,
                skewX: 120
            }]
        })
    }
];

interface GlassDesignerProps {
    onDesignChange?: (data: any) => void;
    onAreaChange?: (grossArea: number, netArea: number) => void;
    onCanvasReady?: (canvas: HTMLCanvasElement) => void;
    onItemsChange?: (items: any[]) => void;
    onCaptureAllItems?: (captureCallback: () => Promise<Array<{ itemName: string; itemType: string; imageData: string; width?: number; height?: number; }>>) => void;
    initialData?: any;
}

export default function GlassDesigner({ onDesignChange, onAreaChange, onCanvasReady, onItemsChange, onCaptureAllItems, initialData }: GlassDesignerProps) {
    const [pieces, setPiecesState] = useState<GlassPiece[]>([]);
    const [history, setHistory] = useState<GlassPiece[][]>([]);

    const saveHistory = () => {
        setPiecesState(currentPieces => {
            setHistory(prev => {
                const updated = [...prev, JSON.parse(JSON.stringify(currentPieces))];
                if (updated.length > 50) updated.shift();
                return updated;
            });
            return currentPieces;
        });
    };

    const undo = () => {
        if (history.length === 0) return;
        const prevPieces = history[history.length - 1];
        setHistory(h => h.slice(0, -1));
        setPiecesState(prevPieces);
    };

    const setPieces = (newPieces: GlassPiece[] | ((prev: GlassPiece[]) => GlassPiece[])) => {
        setPiecesState(newPieces);
    };

    const [activePieceId, setActivePieceId] = useState<string>('');
    const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
    const [showBOMModal, setShowBOMModal] = useState<boolean>(false);
    const [designerMode, setDesignerMode] = useState<'2d' | 'bom'>('2d');
    // Two drawings off the same design, for the two people who read them:
    // 'hardware' shows the fittings and where they go (installation), while
    // 'fabrication' drops the fittings and shows only the glass prep -- every
    // hole and cut-out, including the ones a fitting implies -- which is what
    // gets sent to the glass supplier.
    const [canvasView] = useState<'hardware' | 'fabrication'>('hardware');

    const selectedShapeId = selectedShapeIds.length > 0 ? selectedShapeIds[selectedShapeIds.length - 1] : null;
    const setSelectedShapeId = (id: string | null) => {
        setSelectedShapeIds(id ? [id] : []);
    };
    const [drawingScale, setDrawingScale] = useState<number>(0.3); // Scale: default 30% keeps common glass pieces inside one viewport
    // The Stage viewport used to render at a fixed 920px CSS width regardless
    // of how wide the actual canvas frame container was, leaving unused
    // empty margin on both sides for wide multi-section drawings. Measured
    // via ResizeObserver below so the Stage (and therefore how much of a
    // wide connected run is visible before scrolling) uses the real
    // available width, with STAGE_VIEWPORT_WIDTH as a floor for narrow
    // containers or before the first measurement.
    const [stageViewportWidth, setStageViewportWidth] = useState<number>(440);
    const canvasFrameRef = useRef<HTMLDivElement>(null);
    const [localInputs, setLocalInputs] = useState<Record<string, string>>({});
    const [focusedField, setFocusedField] = useState<string | null>(null);
    const [polygonSideSpecs, setPolygonSideSpecs] = useState<string[]>(['15', '15', '15', '15']);
    const [fixedCorners, setFixedCorners] = useState<boolean[]>([true, false, false, false]); // Corner 1 to 4 fixed status
    const [holeEdge, setHoleEdge] = useState<'top' | 'bottom' | 'left' | 'right' | 'corners'>('top');
    const [holeCountInput, setHoleCountInput] = useState<number | ''>(4);
    const [hardwareItems, setHardwareItems] = useState<GlassItem[]>([]);
    const groupedHardware = useMemo(() => {
        const map = new Map<string, GlassItem[]>();
        hardwareItems.forEach(item => {
            const brand = item.make || 'Generic / Other';
            if (!map.has(brand)) map.set(brand, []);
            map.get(brand)!.push(item);
        });
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [hardwareItems]);
    const [showSystemModal, setShowSystemModal] = useState(false);
    const [systemInput, setSystemInput] = useState<GlassSystemInput>({
        systemType: 'swing_door', widthIn: 36, heightIn: 84, thickness: 12,
        hingeSide: 'left', pivotStyle: 'hinges', hasLock: true, hasHandle: true, fixedPanelWidthIn: 24, fixingStyle: 'channel',
    });
    const [copiedShapes, setCopiedShapes] = useState<{ main: KonvaShape[]; children: KonvaShape[] } | null>(null);
    const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
    // Legacy support for copiedShape
    const copiedShape = copiedShapes && copiedShapes.main.length > 0 ? { main: copiedShapes.main[0], children: copiedShapes.children } : null;
    const setCopiedShape = (val: { main: KonvaShape; children: KonvaShape[] } | null) => {
        setCopiedShapes(val ? { main: [val.main], children: val.children } : null);
    };
    const stageRef = useRef<any>(null);
    const trRef = useRef<any>(null);
    const exportStagesRef = useRef<Record<string, any>>({});
    const childOffsetsRef = useRef<Array<{ id: string; dx: number; dy: number }>>([]);
    
    // Hidden canvas for PDF export
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

    const initialPiecesJsonRef = useRef<string>('');
    const appliedImageHardwarePredictionRef = useRef(false);

    // Navigation guard checking for unsaved changes
    const isDirty = initialPiecesJsonRef.current !== '' && JSON.stringify(pieces) !== initialPiecesJsonRef.current;

    // Measure the actual canvas frame container so the Stage can use the
    // real available width instead of a fixed 920px column.
    useEffect(() => {
        const frame = canvasFrameRef.current;
        if (!frame) return;
        const FRAME_HORIZONTAL_PADDING_PX = 24; // matches the frame's own padding, see designer-canvas-frame style below
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) return;
            const measuredWidth = Math.floor((entry.contentRect.width - FRAME_HORIZONTAL_PADDING_PX - 12) / 2);
            setStageViewportWidth(Math.max(440, measuredWidth));
        });
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    // The initial-data-loading effect below centers pieces using whatever
    // stageViewportWidth is at that moment, which is still the default
    // (ResizeObserver's first callback hasn't fired yet on first mount) --
    // re-center once the real width is measured (and again on any later
    // resize) so a wide connected run actually uses the newly available
    // space instead of staying anchored to the 920px default. Keeps
    // initialPiecesJsonRef in sync so a resize never shows a false "unsaved
    // changes" state.
    const lastCenteredViewportWidthRef = useRef<number>(440);
    useEffect(() => {
        if (stageViewportWidth === lastCenteredViewportWidthRef.current) return;
        lastCenteredViewportWidthRef.current = stageViewportWidth;
        const { width: logicalWidth, height: logicalHeight } = getStageLogicalSize(drawingScale, stageViewportWidth);
        setPieces(prev => {
            const recentered = prev.map(piece => ({
                ...piece,
                shapes: centerPieceShapes(piece.shapes, logicalWidth, logicalHeight, drawingScale),
            }));
            initialPiecesJsonRef.current = JSON.stringify(recentered);
            return recentered;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stageViewportWidth]);

    useEffect(() => {
        let cancelled = false;
        db.items.getAll()
            .then(items => {
                if (!cancelled) {
                    setHardwareItems(items.filter(item => item.category === 'hardware'));
                }
            })
            .catch(error => console.error('Failed to load hardware items for designer:', error));

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (appliedImageHardwarePredictionRef.current || hardwareItems.length === 0 || pieces.length === 0) return;
        if (!pieces.some(piece => piece.source === 'whatsapp-image' || piece.source === 'email-image')) return;

        appliedImageHardwarePredictionRef.current = true;
        const predicted = predictImagePieceHardware(pieces, hardwareItems);
        if (JSON.stringify(predicted) !== JSON.stringify(pieces)) {
            setPieces(predicted);
        }
    }, [hardwareItems, pieces]);

    useEffect(() => {
        if (!isDirty) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
            return '';
        };

        const handleAnchorClick = (e: MouseEvent) => {
            let target = e.target as HTMLElement | null;
            while (target && target.tagName !== 'A') {
                target = target.parentElement;
            }

            if (target && target.tagName === 'A') {
                const href = target.getAttribute('href');
                if (href && (href.startsWith('/') || href.startsWith(window.location.origin) || !href.includes(':'))) {
                    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                        return;
                    }
                    const confirmLeave = window.confirm("You have unsaved changes in your design. Are you sure you want to leave?");
                    if (!confirmLeave) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('click', handleAnchorClick, true);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('click', handleAnchorClick, true);
        };
    }, [isDirty, pieces]);

    const handleShapeMouseEnter = () => {};
    const handleShapeMouseLeave = () => {};

    const activePiece = pieces.find(p => p.id === activePieceId);
    const activePieceShapes = activePiece?.shapes || [];

    const updateActivePiece = (updates: Partial<GlassPiece>, pieceId?: string) => {
        setPieces(prev => prev.map(p => p.id === (pieceId ?? activePieceId) ? { ...p, ...updates } : p));
    };

    const copyShapes = (shapeIds: string[]) => {
        if (!activePiece) return;
        const mainShapes = activePiece.shapes.filter(s => shapeIds.includes(s.id));
        if (mainShapes.length === 0) return;

        const children: KonvaShape[] = [];
        mainShapes.forEach(mainShape => {
            const isGlass = mainShape.type === 'glass_rect' || mainShape.type === 'glass_circle' || mainShape.type === 'glass_polygon';
            if (isGlass) {
                activePiece.shapes.forEach(shape => {
                    if (!shapeIds.includes(shape.id) && (shape.type === 'hole' || shape.type === 'cut' || shape.type === 'accessory')) {
                        let isInside = false;
                        if (shape.parentId === mainShape.id) {
                            isInside = true;
                        } else if (!shape.parentId) {
                            if (mainShape.type === 'glass_rect' || mainShape.type === 'glass_polygon') {
                                const w = mainShape.width || 0;
                                const h = mainShape.height || 0;
                                if (shape.x >= mainShape.x && shape.x <= mainShape.x + w &&
                                    shape.y >= mainShape.y && shape.y <= mainShape.y + h) {
                                    isInside = true;
                                }
                            } else if (mainShape.type === 'glass_circle') {
                                const r = mainShape.radius || 0;
                                if (shape.x >= mainShape.x - r && shape.x <= mainShape.x + r &&
                                    shape.y >= mainShape.y - r && shape.y <= mainShape.y + r) {
                                    isInside = true;
                                }
                            }
                        }
                        if (isInside && !children.some(c => c.id === shape.id)) {
                            children.push(shape);
                        }
                    }
                });
            }
        });

        setCopiedShapes({ main: mainShapes, children });
    };

    const pasteShapes = () => {
        saveHistory();
        if (!copiedShapes || !activePiece || copiedShapes.main.length === 0) return;
        const deltaX = 20;
        const deltaY = 20;

        const idMap: Record<string, string> = {};
        
        copiedShapes.main.forEach(s => {
            idMap[s.id] = generateUUID();
        });
        copiedShapes.children.forEach(s => {
            idMap[s.id] = generateUUID();
        });

        const pasteShapeObj = (shape: KonvaShape, newId: string) => {
            let newParentId = shape.parentId;
            if (shape.parentId && idMap[shape.parentId]) {
                newParentId = idMap[shape.parentId];
            } else if (!shape.parentId && (shape.type === 'hole' || shape.type === 'cut' || shape.type === 'accessory')) {
                const matchingParent = copiedShapes.main.find(mainShape => {
                    if (mainShape.type === 'glass_rect' || mainShape.type === 'glass_polygon') {
                        const w = mainShape.width || 0;
                        const h = mainShape.height || 0;
                        return (shape.x >= mainShape.x && shape.x <= mainShape.x + w &&
                                shape.y >= mainShape.y && shape.y <= mainShape.y + h);
                    } else if (mainShape.type === 'glass_circle') {
                        const r = mainShape.radius || 0;
                        return (shape.x >= mainShape.x - r && shape.x <= mainShape.x + r &&
                                shape.y >= mainShape.y - r && shape.y <= mainShape.y + r);
                    }
                    return false;
                });
                if (matchingParent) {
                    newParentId = idMap[matchingParent.id];
                }
            }

            const pastedChild: KonvaShape = {
                ...shape,
                id: newId,
                x: shape.x + deltaX,
                y: shape.y + deltaY,
                parentId: newParentId
            };
            if (shape.points) {
                pastedChild.points = [...shape.points];
            }
            return pastedChild;
        };

        const pastedParents = copiedShapes.main.map(s => pasteShapeObj(s, idMap[s.id]));
        const pastedChildren = copiedShapes.children.map(s => pasteShapeObj(s, idMap[s.id]));

        updateActivePiece({
            shapes: [...activePiece.shapes, ...pastedParents, ...pastedChildren]
        });
        setSelectedShapeIds(pastedParents.map(p => p.id));
    };

    const copyShape = (shapeId: string) => copyShapes([shapeId]);
    const pasteShape = () => pasteShapes();

    // Keyboard shortcuts for copy/paste/delete
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                if (selectedShapeIds.length > 0) {
                    copyShapes(selectedShapeIds);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                pasteShapes();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedShapeIds.length > 0) {
                    removeShapes(selectedShapeIds);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedShapeIds, copiedShapes, activePieceId, pieces]);

    // Initialize data
    useEffect(() => {
        const { width: logicalWidth, height: logicalHeight } = getStageLogicalSize(drawingScale, stageViewportWidth);

        let loaded = false;
        if (initialData && initialData.pieces && initialData.pieces.length > 0) {
            // Check if they are old format or new Konva format
            const hasShapes = initialData.pieces[0].shapes !== undefined;
            if (hasShapes) {
                const centered = (initialData.pieces as GlassPiece[]).map(piece => ({
                    ...piece,
                    shapes: centerPieceShapes(piece.shapes, logicalWidth, logicalHeight, drawingScale),
                }));
                setPieces(centered);
                initialPiecesJsonRef.current = JSON.stringify(centered);
            } else {
                // Migrate from the SVG form-based format
                const migrated = initialData.pieces.map((p: any) => {
                    const shapes: KonvaShape[] = [];
                    // Base shape
                    if (p.shape === 'rectangle') {
                        shapes.push({ id: generateUUID(), type: 'glass_rect', x: 50, y: 50, width: p.width * 10, height: p.height * 10 });
                    } else {
                        shapes.push({ id: generateUUID(), type: 'glass_circle', x: 150, y: 150, radius: (p.width * 10) / 2 });
                    }
                    // Holes
                    if (p.holes) {
                        p.holes.forEach((h: any) => shapes.push({ id: generateUUID(), type: 'hole', x: h.cx * 10, y: h.cy * 10, radius: h.radius * 10 }));
                    }
                    // Cuts
                    if (p.cuts) {
                        p.cuts.forEach((c: any) => shapes.push({ id: generateUUID(), type: 'cut', x: c.x * 10, y: c.y * 10, width: c.width * 10, height: c.height * 10 }));
                    }
                    return { ...p, shapes };
                });
                const centered = (migrated as GlassPiece[]).map(piece => ({
                    ...piece,
                    shapes: centerPieceShapes(piece.shapes, logicalWidth, logicalHeight, drawingScale),
                }));
                setPieces(centered);
                initialPiecesJsonRef.current = JSON.stringify(centered);
            }
            setActivePieceId(initialData.pieces[0].id);
            loaded = true;
        }

        if (!loaded) {
            setPieces([]);
            initialPiecesJsonRef.current = JSON.stringify([]);
            setActivePieceId('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData]);

    // Handle transformer attachment
    useEffect(() => {
        if (selectedShapeIds.length === 1 && selectedShapeId && trRef.current && stageRef.current) {
            const activePiece = pieces.find(p => p.id === activePieceId);
            const activeShape = activePiece?.shapes.find(s => s.id === selectedShapeId);
            
            if (activeShape?.type === 'glass_polygon') {
                // Polygon corners are dragged directly via custom anchors, so hide bounding transformer
                trRef.current.nodes([]);
                trRef.current.getLayer()?.batchDraw();
            } else if (activeShape?.type === 'accessory') {
                if (activeShape.accessoryType === 'profile') {
                    const node = stageRef.current.findOne('#' + selectedShapeId);
                    if (node) {
                        trRef.current.nodes([node]);
                        trRef.current.enabledAnchors(['ml', 'mr']); // Only allow horizontal stretching for profile channels
                        trRef.current.getLayer()?.batchDraw();
                    }
                } else {
                    // Locks, hinges, and L-connectors have standard fixed manufacturer sizes, disable resizing
                    trRef.current.nodes([]);
                    trRef.current.getLayer()?.batchDraw();
                }
            } else {
                const node = stageRef.current.findOne('#' + selectedShapeId);
                if (node) {
                    trRef.current.nodes([node]);
                    trRef.current.enabledAnchors(['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']); // Default all
                    trRef.current.getLayer()?.batchDraw();
                } else {
                    trRef.current.nodes([]);
                    trRef.current.getLayer()?.batchDraw();
                }
            }
        } else if (trRef.current) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [selectedShapeIds, pieces, activePieceId]);
    
    // Provide canvas to parent for single-item export
    useEffect(() => {
        if (onCanvasReady && stageRef.current) {
            // Konva stage wraps a canvas. We can get the canvas element.
            const canvas = stageRef.current.toCanvas();
            onCanvasReady(canvas);
        }
    }, [pieces, activePieceId, onCanvasReady]);

    // Setup Multi-item PDF export
    useEffect(() => {
        if (onCaptureAllItems) {
            onCaptureAllItems(async () => {
                const results = [];
                for (const piece of pieces) {
                    const stage = exportStagesRef.current[piece.id];
                    if (stage) {
                        let maxX = 800;
                        let maxY = 600;
                        piece.shapes.forEach(s => {
                            const right = s.x + (s.width || (s.radius ? s.radius * 2 : 0)) + 50;
                            const bottom = s.y + (s.height || (s.radius ? s.radius * 2 : 0)) + 50;
                            if (right > maxX) maxX = right;
                            if (bottom > maxY) maxY = bottom;
                        });

                        results.push({
                            itemName: piece.name,
                            itemType: piece.type,
                            imageData: stage.toDataURL({ pixelRatio: 2, x: 0, y: 0, width: maxX, height: maxY }),
                            width: maxX,
                            height: maxY
                        });
                    }
                }
                return results;
            });
        }
    }, [pieces, onCaptureAllItems]);

    // Calculate Area and notify parent
    useEffect(() => {
        if (pieces.length === 0) return;

        let totalGrossSqFt = 0;
        let totalNetSqFt = 0;
        let globalHoleCount = 0;
        let globalCutCount = 0;

        // PIXELS_PER_INCH for scaling (10 pixels = 1 inch for calculation)
        const PIXELS_PER_INCH = 10;
        const SQ_PIXELS_PER_SQ_INCH = PIXELS_PER_INCH * PIXELS_PER_INCH;

        const mappedItems = pieces.map(p => {
            let grossSqIn = 0;
            let holeSqIn = 0;
            let cutSqIn = 0;
            let holeCount = 0;
            let cutCount = 0;
            const qty = p.quantity || 1;
            let pieceWidthIn = 0;
            let pieceHeightIn = 0;

            p.shapes.forEach(shape => {
                if (shape.type === 'glass_rect' || shape.type === 'glass_polygon' || shape.type === 'glass_parallelogram') {
                    const wIn = (shape.width || 0) / 10;
                    const hIn = (shape.height || 0) / 10;
                    const roundedW = roundToNextEvenInch(wIn);
                    const roundedH = roundToNextEvenInch(hIn);
                    grossSqIn += roundedW * roundedH;
                    if (!pieceWidthIn && !pieceHeightIn) {
                        pieceWidthIn = roundedW;
                        pieceHeightIn = roundedH;
                    }
                } else if (shape.type === 'glass_circle') {
                    const dIn = ((shape.radius || 0) * 2) / 10;
                    const roundedD = roundToNextEvenInch(dIn);
                    grossSqIn += roundedD * roundedD; // Billing area is bounding square of rounded diameter
                    if (!pieceWidthIn && !pieceHeightIn) {
                        pieceWidthIn = roundedD;
                        pieceHeightIn = roundedD;
                    }
                } else if (shape.type === 'hole') {
                    const radiusIn = (shape.radius || 0) / 10;
                    holeSqIn += Math.PI * radiusIn * radiusIn;
                    holeCount++;
                } else if (shape.type === 'cut') {
                    const wIn = (shape.width || 0) / 10;
                    const hIn = (shape.height || 0) / 10;
                    cutSqIn += wIn * hIn;
                    cutCount++;
                } else if (shape.type === 'accessory') {
                    if (shape.accessoryHoleCount !== undefined || shape.accessoryCutCount !== undefined) {
                        const accessoryHoles = Number(shape.accessoryHoleCount) || 0;
                        const accessoryCuts = Number(shape.accessoryCutCount) || 0;
                        const holeRadiusIn = Number(shape.accessoryHoleRadiusIn) || 0.25;
                        holeCount += accessoryHoles;
                        cutCount += accessoryCuts;
                        holeSqIn += accessoryHoles * (Math.PI * holeRadiusIn * holeRadiusIn);
                        cutSqIn += Number(shape.accessoryCutAreaSqIn) || (accessoryCuts * 6);
                    } else if (shape.accessoryType === 'lock') {
                        holeCount += 1;
                        const radiusIn = 0.75; // 1.5 inch cylinder hole
                        holeSqIn += Math.PI * radiusIn * radiusIn;
                    } else if (shape.accessoryType === 'connector') {
                        holeCount += 2;
                        const radiusIn = 0.25; // 0.5 inch screw hole
                        holeSqIn += 2 * (Math.PI * radiusIn * radiusIn);
                    } else if (shape.accessoryType === 'hinge') {
                        cutCount += 1;
                        cutSqIn += 2 * 3; // 2"x3" cutout
                    }
                }
            });

            // Convert to square feet and multiply by quantity
            const grossSqFt = (grossSqIn / 144) * qty;
            const netSqFt = grossSqFt;
            
            totalGrossSqFt += grossSqFt;
            totalNetSqFt += netSqFt;
            globalHoleCount += holeCount * qty;
            globalCutCount += cutCount * qty;

            return {
                id: p.id,
                name: p.name,
                type: p.type,
                thickness: p.thickness,
                quantity: qty,
                width: pieceWidthIn,
                height: pieceHeightIn,
                grossArea: grossSqFt,
                netArea: netSqFt,
                holes: holeCount * qty,
                cuts: cutCount * qty,
                shapes: p.shapes
            };
        });

        // Collect hardware accessories as line items with rates for estimate & order pricing
        const hardwareMap = new Map<string, { id: string; name: string; type: 'Hardware'; quantity: number; rate: number; holes: number; cuts: number }>();
        pieces.forEach(p => {
            const qty = p.quantity || 1;
            p.shapes.forEach(s => {
                if (s.type === 'accessory') {
                    const name = s.accessoryName || s.accessoryType || 'Hardware Fitting';
                    const key = s.hardwareItemId || name;
                    const rate = Number(s.accessoryRate) || 0;
                    const holes = Number(s.accessoryHoleCount) || 0;
                    const cuts = Number(s.accessoryCutCount) || 0;
                    // Per-metre fittings contribute run length, not a piece count.
                    const lengthM = Number(s.accessoryLengthM) || 0;
                    const billedQty = lengthM > 0 ? lengthM * qty : qty;
                    const existing = hardwareMap.get(key);
                    if (existing) {
                        existing.quantity += billedQty;
                    } else {
                        hardwareMap.set(key, {
                            id: key,
                            name,
                            type: 'Hardware',
                            quantity: billedQty,
                            rate,
                            holes,
                            cuts
                        });
                    }
                }
            });
        });

        const hardwareItems = Array.from(hardwareMap.values()).map(hw => ({
            id: hw.id,
            name: hw.name,
            type: 'Hardware',
            quantity: hw.quantity,
            rate: hw.rate,
            amount: hw.rate * hw.quantity,
            cost: hw.rate * hw.quantity,
            holes: hw.holes * hw.quantity,
            cuts: hw.cuts * hw.quantity,
            netArea: 0,
            grossArea: 0
        }));

        const finalMappedItems = [...mappedItems, ...hardwareItems];

        if (onAreaChange) onAreaChange(totalGrossSqFt, totalNetSqFt);
        if (onItemsChange) onItemsChange(finalMappedItems);
        if (onDesignChange) {
            onDesignChange({
                pieces,
                holes: globalHoleCount,
                cuts: globalCutCount,
                items: finalMappedItems
            });
        }
    }, [pieces]);


    const updateShape = (shapeId: string, updates: Partial<KonvaShape>) => {
        const touchesGeometry = (['x', 'y', 'width', 'height', 'radius'] as const).some(key => key in updates);
        setPieces(prevPieces => prevPieces.map(piece => {
            if (!piece.shapes.some(s => s.id === shapeId)) return piece;
            const newShapes = piece.shapes.map(s => {
                if (s.id !== shapeId) return s;
                const merged = { ...s, ...updates };
                if (touchesGeometry && s.positionSource === 'estimated-fallback') {
                    merged.positionSource = undefined;
                }
                return merged;
            });
            return { ...piece, shapes: newShapes };
        }));
    };

    const updateShapesInPieces = (updates: Record<string, Partial<KonvaShape>>) => {
        setPieces(prevPieces => prevPieces.map(p => ({
            ...p,
            shapes: p.shapes.map(s => {
                if (!updates[s.id]) return s;
                const upd = updates[s.id];
                const touchesGeometry = (['x', 'y', 'width', 'height', 'radius'] as const).some(key => key in upd);
                const merged = { ...s, ...upd };
                if (touchesGeometry && s.positionSource === 'estimated-fallback') {
                    merged.positionSource = undefined;
                }
                return merged;
            })
        })));
    };

    const handleShapeClick = (shapeId: string, evt: any) => {
        if (evt) {
            evt.cancelBubble = true;
            const nativeEvent = evt.evt || evt;
            const isMulti = nativeEvent.shiftKey || nativeEvent.ctrlKey || nativeEvent.metaKey;
            if (isMulti) {
                setSelectedShapeIds(prev => {
                    if (prev.includes(shapeId)) {
                        return prev.filter(id => id !== shapeId);
                    } else {
                        return [...prev, shapeId];
                    }
                });
                return;
            }
        }
        setSelectedShapeIds([shapeId]);
    };

    const removeShapes = (shapeIds: string[]) => {
        saveHistory();
        if (!activePiece || shapeIds.length === 0) return;

        let shapesToKeep = [...activePiece.shapes];

        shapeIds.forEach(shapeId => {
            const mainShape = activePiece.shapes.find(s => s.id === shapeId);
            if (!mainShape) return;

            const isGlass = mainShape.type === 'glass_rect' || mainShape.type === 'glass_circle' || mainShape.type === 'glass_polygon';

            shapesToKeep = shapesToKeep.filter(s => s.id !== shapeId);

            if (isGlass) {
                shapesToKeep = shapesToKeep.filter(shape => {
                    if (shape.type === 'hole' || shape.type === 'cut' || shape.type === 'accessory') {
                        let isInside = false;
                        if (shape.parentId === mainShape.id) {
                            isInside = true;
                        } else if (!shape.parentId) {
                            if (mainShape.type === 'glass_rect' || mainShape.type === 'glass_polygon') {
                                const w = mainShape.width || 0;
                                const h = mainShape.height || 0;
                                if (shape.x >= mainShape.x && shape.x <= mainShape.x + w &&
                                    shape.y >= mainShape.y && shape.y <= mainShape.y + h) {
                                    isInside = true;
                                }
                            } else if (mainShape.type === 'glass_circle') {
                                const r = mainShape.radius || 0;
                                if (shape.x >= mainShape.x - r && shape.x <= mainShape.x + r &&
                                    shape.y >= mainShape.y - r && shape.y <= mainShape.y + r) {
                                    isInside = true;
                                }
                            }
                        }
                        return !isInside;
                    }
                    return true;
                });
            }
        });

        updateActivePiece({ shapes: shapesToKeep });
        setSelectedShapeIds([]);
    };

    const duplicateShapes = (shapeIds: string[]) => {
        saveHistory();
        if (!activePiece || shapeIds.length === 0) return;
        const mainShapes = activePiece.shapes.filter(s => shapeIds.includes(s.id));
        if (mainShapes.length === 0) return;

        const deltaX = 20;
        const deltaY = 20;

        const children: KonvaShape[] = [];
        mainShapes.forEach(mainShape => {
            const isGlass = mainShape.type === 'glass_rect' || mainShape.type === 'glass_circle' || mainShape.type === 'glass_polygon';
            if (isGlass) {
                activePiece.shapes.forEach(shape => {
                    if (!shapeIds.includes(shape.id) && (shape.type === 'hole' || shape.type === 'cut' || shape.type === 'accessory')) {
                        let isInside = false;
                        if (shape.parentId === mainShape.id) {
                            isInside = true;
                        } else if (!shape.parentId) {
                            if (mainShape.type === 'glass_rect' || mainShape.type === 'glass_polygon') {
                                const w = mainShape.width || 0;
                                const h = mainShape.height || 0;
                                if (shape.x >= mainShape.x && shape.x <= mainShape.x + w &&
                                    shape.y >= mainShape.y && shape.y <= mainShape.y + h) {
                                    isInside = true;
                                }
                            } else if (mainShape.type === 'glass_circle') {
                                const r = mainShape.radius || 0;
                                if (shape.x >= mainShape.x - r && shape.x <= mainShape.x + r &&
                                    shape.y >= mainShape.y - r && shape.y <= mainShape.y + r) {
                                    isInside = true;
                                }
                            }
                        }
                        if (isInside && !children.some(c => c.id === shape.id)) {
                            children.push(shape);
                        }
                    }
                });
            }
        });

        const idMap: Record<string, string> = {};
        mainShapes.forEach(s => {
            idMap[s.id] = generateUUID();
        });
        children.forEach(s => {
            idMap[s.id] = generateUUID();
        });

        const duplicateShapeObj = (shape: KonvaShape, newId: string) => {
            let newParentId = shape.parentId;
            if (shape.parentId && idMap[shape.parentId]) {
                newParentId = idMap[shape.parentId];
            } else if (!shape.parentId && (shape.type === 'hole' || shape.type === 'cut' || shape.type === 'accessory')) {
                const matchingParent = mainShapes.find(mainShape => {
                    if (mainShape.type === 'glass_rect' || mainShape.type === 'glass_polygon') {
                        const w = mainShape.width || 0;
                        const h = mainShape.height || 0;
                        return (shape.x >= mainShape.x && shape.x <= mainShape.x + w &&
                                shape.y >= mainShape.y && shape.y <= mainShape.y + h);
                    } else if (mainShape.type === 'glass_circle') {
                        const r = mainShape.radius || 0;
                        return (shape.x >= mainShape.x - r && shape.x <= mainShape.x + r &&
                                shape.y >= mainShape.y - r && shape.y <= mainShape.y + r);
                    }
                    return false;
                });
                if (matchingParent) {
                    newParentId = idMap[matchingParent.id];
                }
            }

            const duplicated: KonvaShape = {
                ...shape,
                id: newId,
                x: shape.x + deltaX,
                y: shape.y + deltaY,
                parentId: newParentId
            };
            if (shape.points) {
                duplicated.points = [...shape.points];
            }
            return duplicated;
        };

        const pastedParents = mainShapes.map(s => duplicateShapeObj(s, idMap[s.id]));
        const pastedChildren = children.map(s => duplicateShapeObj(s, idMap[s.id]));

        updateActivePiece({
            shapes: [...activePiece.shapes, ...pastedParents, ...pastedChildren]
        });
        setSelectedShapeIds(pastedParents.map(p => p.id));
    };

    const removeShape = (shapeId: string) => removeShapes([shapeId]);
    const duplicateShape = (shapeId: string) => duplicateShapes([shapeId]);

    const generateAlignedHoles = (edge: 'top' | 'bottom' | 'left' | 'right' | 'corners', count: number) => {
        saveHistory();
        if (!activePiece || !selectedShapeId) return;
        const shape = activePiece.shapes.find(s => s.id === selectedShapeId);
        if (!shape || (shape.type !== 'glass_rect' && shape.type !== 'glass_polygon')) return;

        const width = shape.width || 100;
        const height = shape.height || 100;
        const shapeX = shape.x;
        const shapeY = shape.y;

        const edgeOffset = 20; // 2 inches in pixels
        const cornerOffset = 20; // 2 inches in pixels

        const newHoles: KonvaShape[] = [];

        if (edge === 'top') {
            const step = width / (count + 1);
            for (let i = 0; i < count; i++) {
                newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + (i + 1) * step, y: shapeY + edgeOffset, radius: 15, parentId: shape.id });
            }
        } else if (edge === 'bottom') {
            const step = width / (count + 1);
            for (let i = 0; i < count; i++) {
                newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + (i + 1) * step, y: shapeY + height - edgeOffset, radius: 15, parentId: shape.id });
            }
        } else if (edge === 'left') {
            const step = height / (count + 1);
            for (let i = 0; i < count; i++) {
                newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + edgeOffset, y: shapeY + (i + 1) * step, radius: 15, parentId: shape.id });
            }
        } else if (edge === 'right') {
            const step = height / (count + 1);
            for (let i = 0; i < count; i++) {
                newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + width - edgeOffset, y: shapeY + (i + 1) * step, radius: 15, parentId: shape.id });
            }
        } else if (edge === 'corners') {
            newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + cornerOffset, y: shapeY + cornerOffset, radius: 15, parentId: shape.id });
            newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + width - cornerOffset, y: shapeY + cornerOffset, radius: 15, parentId: shape.id });
            newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + cornerOffset, y: shapeY + height - cornerOffset, radius: 15, parentId: shape.id });
            newHoles.push({ id: generateUUID(), type: 'hole', x: shapeX + width - cornerOffset, y: shapeY + height - cornerOffset, radius: 15, parentId: shape.id });
        }

        updateActivePiece({ shapes: [...activePiece.shapes, ...newHoles] });
    };

    const selectedShape = activePieceShapes.find(s => s.id === selectedShapeId);
    
    // Update local inputs from shape state only if that field is not currently focused/edited
    useEffect(() => {
        if (selectedShape) {
            setLocalInputs(prev => ({
                x: focusedField === 'x' ? prev.x : formatInchesFraction(selectedShape.x),
                y: focusedField === 'y' ? prev.y : formatInchesFraction(selectedShape.y),
                width: focusedField === 'width' ? prev.width : (selectedShape.width !== undefined ? formatInchesFraction(selectedShape.width) : ''),
                height: focusedField === 'height' ? prev.height : (selectedShape.height !== undefined ? formatInchesFraction(selectedShape.height) : ''),
                radius: focusedField === 'radius' ? prev.radius : (selectedShape.radius !== undefined ? formatInchesFraction(selectedShape.radius) : ''),
            }));
        } else {
            setLocalInputs({});
        }
    }, [selectedShapeId, selectedShape?.x, selectedShape?.y, selectedShape?.width, selectedShape?.height, selectedShape?.radius, focusedField]);

    // Synchronize polygonSideSpecs when the selected shape changes
    useEffect(() => {
        if (selectedShape && selectedShape.type === 'glass_polygon') {
            const pts = selectedShape.points || getPolygonPoints(selectedShape.sides || 4, selectedShape.width || 100, selectedShape.height || 100);
            const numPoints = pts.length / 2;
            const newSpecs = [];
            for (let sIdx = 0; sIdx < numPoints; sIdx++) {
                const nextIdx = (sIdx + 1) % numPoints;
                const x1 = pts[2 * sIdx];
                const y1 = pts[2 * sIdx + 1];
                const x2 = pts[2 * nextIdx];
                const y2 = pts[2 * nextIdx + 1];
                const L = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
                newSpecs.push(formatInchesFraction(L));
            }
            setPolygonSideSpecs(newSpecs);
        }
    }, [selectedShapeId]);

    const handleInputChange = (field: string, val: string) => {
        setLocalInputs(prev => ({ ...prev, [field]: val }));
        
        if (val.trim() === '') {
            return;
        }


        const inches = parseInches(val);
        if (isNaN(inches)) return;
        const pixels = snapToOctalInch(inches * 10);
        
        if (selectedShapeId) {
            if (field === 'width') {
                updateShape(selectedShapeId, { width: Math.max(10, pixels) });
            } else if (field === 'height') {
                updateShape(selectedShapeId, { height: Math.max(10, pixels) });
            } else if (field === 'radius') {
                updateShape(selectedShapeId, { radius: Math.max(5, pixels) });
            } else if (field === 'x') {
                updateShape(selectedShapeId, { x: pixels });
            } else if (field === 'y') {
                updateShape(selectedShapeId, { y: pixels });
            }
        }
    };

    const addPiece = () => {
        saveHistory();
        const { width: logicalWidth, height: logicalHeight } = getStageLogicalSize(drawingScale, stageViewportWidth);
        const newPiece: GlassPiece = {
            id: generateUUID(),
            name: `Design Item ${pieces.length + 1}`,
            type: 'Window',
            thickness: 6,
            shapes: centerPieceShapes(
                [{ id: generateUUID(), type: 'glass_rect', x: 100, y: 100, width: 300, height: 200 }],
                logicalWidth, logicalHeight, drawingScale,
            )
        };
        setPieces([...pieces, newPiece]);
        setActivePieceId(newPiece.id);
    };

    const addPresetPiece = (preset: DesignPreset) => {
        saveHistory();
        const { width: logicalWidth, height: logicalHeight } = getStageLogicalSize(drawingScale, stageViewportWidth);
        if (preset.createPieces) {
            const newPieces = centerSystemPieces(preset.createPieces(), logicalWidth, logicalHeight, drawingScale);
            if (newPieces.length === 0) return;
            setPieces([...pieces, ...newPieces]);
            setActivePieceId(newPieces[0].id);
            setSelectedShapeId(null);
            return;
        }

        if (!preset.createPiece) return;
        const piece = preset.createPiece();
        const newPiece: GlassPiece = {
            id: generateUUID(),
            ...piece,
            shapes: centerPieceShapes(piece.shapes, logicalWidth, logicalHeight, drawingScale),
        };
        setPieces([...pieces, newPiece]);
        setActivePieceId(newPiece.id);
        setSelectedShapeId(null);
    };

    // Generates a full system (door/shower/panel/sliding/railing) with all
    // hardware placed at standard positions and sourced from the shop's
    // fitting catalogue, then drops the pieces on the canvas -- same add
    // flow as a preset, but parametric on the entered size/options.
    const addGeneratedSystem = () => {
        saveHistory();
        const generated = generateGlassSystem(systemInput, hardwareItems);
        if (generated.length === 0) return;

        // Compute total width and max height of the system to auto-fit zoom scale
        let totalW = 0, maxH = 0;
        generated.forEach(p => {
            const outline = p.shapes.find(s => s.type === 'glass_rect');
            if (outline) {
                totalW += outline.width || 0;
                maxH = Math.max(maxH, outline.height || 0);
            }
        });

        const targetScale = Math.min(0.4, Math.max(0.12, (stageViewportWidth || 920) / (totalW + 240)));
        setDrawingScale(targetScale);

        const { width: logicalWidth, height: logicalHeight } = getStageLogicalSize(targetScale, stageViewportWidth);

        const newPieces = centerSystemPieces(generated, logicalWidth, logicalHeight, targetScale);
        setPieces(newPieces); // Complete unified multi-piece system assembly on canvas
        setActivePieceId(newPieces[0].id);
        setSelectedShapeId(null);
        setShowSystemModal(false);
    };

    const handlePhotoUpload = (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const drafts: PhotoDraft[] = Array.from(files)
            .filter(file => file.type.startsWith('image/'))
            .map((file, index) => {
                const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '');
                return {
                    id: generateUUID(),
                    fileName: file.name,
                    previewUrl: URL.createObjectURL(file),
                    pieceName: nameWithoutExtension || `Photo Piece ${photoDrafts.length + index + 1}`,
                    type: 'Window',
                    width: '',
                    height: '',
                    thickness: activePiece?.thickness || 10
                };
            });

        if (drafts.length > 0) {
            setPhotoDrafts(prev => [...prev, ...drafts]);
        }
    };

    const updatePhotoDraft = (id: string, updates: Partial<PhotoDraft>) => {
        setPhotoDrafts(prev => prev.map(draft => draft.id === id ? { ...draft, ...updates } : draft));
    };

    const removePhotoDraft = (id: string) => {
        setPhotoDrafts(prev => {
            const draft = prev.find(item => item.id === id);
            if (draft) URL.revokeObjectURL(draft.previewUrl);
            return prev.filter(item => item.id !== id);
        });
    };

    const createPiecesFromPhotos = () => {
        const readyDrafts = photoDrafts
            .map(draft => ({
                ...draft,
                widthIn: parseInches(draft.width),
                heightIn: parseInches(draft.height)
            }))
            .filter(draft => !isNaN(draft.widthIn) && !isNaN(draft.heightIn) && draft.widthIn > 0 && draft.heightIn > 0);

        if (readyDrafts.length === 0) {
            alert('Please add at least one photo with valid width and height before creating drawings.');
            return;
        }

        saveHistory();
        const { width: logicalWidth, height: logicalHeight } = getStageLogicalSize(drawingScale, stageViewportWidth);
        const generatedPieces: GlassPiece[] = readyDrafts.map((draft, index) => ({
            id: generateUUID(),
            name: draft.pieceName || `Photo Piece ${index + 1}`,
            type: draft.type || 'Window',
            thickness: draft.thickness || 10,
            quantity: 1,
            shapes: centerPieceShapes([createRectShape(draft.widthIn, draft.heightIn)], logicalWidth, logicalHeight, drawingScale)
        }));

        setPieces([...pieces, ...generatedPieces]);
        setActivePieceId(generatedPieces[0].id);
        setSelectedShapeId(null);
        photoDrafts.forEach(draft => URL.revokeObjectURL(draft.previewUrl));
        setPhotoDrafts([]);
    };

    const removePiece = (id: string) => {
        saveHistory();
        if (pieces.length <= 1) return;
        const newPieces = pieces.filter(p => p.id !== id);
        setPieces(newPieces);
        if (activePieceId === id) {
            setActivePieceId(newPieces[0].id);
        }
    };

    const handleStageClick = (e: any) => {
        // If clicked on empty space, deselect
        if (e.target === e.target.getStage()) {
            setSelectedShapeId(null);
            return;
        }
    };

    const ensureActivePiece = (): GlassPiece => {
        if (activePiece) return activePiece;
        const newPiece: GlassPiece = {
            id: generateUUID(),
            name: `Design Item 1`,
            type: 'Partition',
            thickness: 12,
            shapes: []
        };
        setPieces(prev => [...prev, newPiece]);
        setActivePieceId(newPiece.id);
        return newPiece;
    };

    const findParentShape = () => {
        if (!activePiece) return null;
        const selectedParent = activePiece.shapes.find(s => selectedShapeIds.includes(s.id) && (s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram'));
        if (selectedParent) return selectedParent;
        return activePiece.shapes.find(s => s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram') || null;
    };

    const addShape = (type: 'glass_rect' | 'glass_circle' | 'hole' | 'cut' | 'glass_polygon' | 'glass_parallelogram') => {
        saveHistory();
        const currentPiece = ensureActivePiece();
        
        let newShape: KonvaShape;
        const id = generateUUID();
        
        if (type === 'glass_rect') {
            newShape = { id, type, x: 50, y: 50, width: 200, height: 150 };
        } else if (type === 'glass_circle') {
            newShape = { id, type, x: 150, y: 150, radius: 100 };
        } else if (type === 'glass_polygon') {
            const sides = 4;
            newShape = { 
                id, 
                type, 
                x: 50, 
                y: 50, 
                width: 150, 
                height: 150, 
                sides,
                points: getPolygonPoints(sides, 150, 150)
            };
        } else if (type === 'glass_parallelogram') {
            newShape = { id, type, x: 50, y: 50, width: 200, height: 150, skewX: 60 };
        } else if (type === 'hole') {
            const parent = findParentShape();
            const parentId = parent ? parent.id : undefined;
            const px = parent ? parent.x + (parent.width ? parent.width / 2 : (parent.radius ? 0 : 50)) : 100;
            const py = parent ? parent.y + (parent.height ? parent.height / 2 : (parent.radius ? 0 : 50)) : 100;
            newShape = { id, type, x: px, y: py, radius: 30, parentId };
        } else {
            // cut
            const parent = findParentShape();
            const parentId = parent ? parent.id : undefined;
            const px = parent ? parent.x + (parent.width ? parent.width / 2 : (parent.radius ? 0 : 50)) : 100;
            const py = parent ? parent.y + (parent.height ? parent.height / 2 : (parent.radius ? 0 : 50)) : 100;
            newShape = { id, type, x: px - 25, y: py - 25, width: 50, height: 50, parentId };
        }
        
        updateActivePiece({ shapes: [...currentPiece.shapes, newShape] }, currentPiece.id);
        setSelectedShapeId(id);
    };

    const inferAccessoryType = (hardware: GlassItem): 'lock' | 'connector' | 'hinge' | 'profile' => {
        const label = `${hardware.name} ${hardware.type || ''} ${hardware.model || ''}`.toLowerCase();
        if (label.includes('hinge')) return 'hinge';
        if (label.includes('lock')) return 'lock';
        if (label.includes('profile') || label.includes('channel')) return 'profile';
        return 'connector';
    };

    const getHardwareRequirement = (type: 'lock' | 'connector' | 'hinge' | 'profile', hardware?: GlassItem) => {
        const label = `${hardware?.name || ''} ${hardware?.type || ''} ${hardware?.model || ''}`.toLowerCase();
        let holes = 0;
        let cuts = 0;
        let holeRadiusIn = 0.25;
        let cutAreaSqIn = 0;

        if (hardware) {
            const spec = getCutoutSpecsForItem(hardware);
            if (spec && spec.id !== 'generic_fitting') {
                holes = spec.holes ? spec.holes.length : 0;
                cuts = spec.notchWidthMm > 0 ? 1 : 0;
                if (holes > 0 && spec.holes[0]) {
                    holeRadiusIn = (spec.holes[0].radiusMm || 6) / 25.4;
                }
                if (cuts > 0) {
                    cutAreaSqIn = Number(((spec.notchWidthMm * spec.notchHeightMm) / 645.16).toFixed(2));
                }
                const parts = [];
                if (holes > 0) parts.push(`${holes} ${holes === 1 ? 'hole' : 'holes'}`);
                if (cuts > 0) parts.push(`${cuts} notch (${spec.notchWidthMm}×${spec.notchHeightMm}mm)`);
                return {
                    holes,
                    cuts,
                    holeRadiusIn,
                    cutAreaSqIn,
                    label: parts.length > 0 ? `${parts.join(', ')} [${spec.brand}]` : `No structural drill preps (${spec.brand})`
                };
            }
        }

        if (type === 'profile' || label.includes('profile') || label.includes('channel')) {
            holes = 0;
            cuts = 0;
        } else if (label.includes('handle') || label.includes('pull') || label.includes('towel')) {
            holes = 2;
            cuts = 0;
            holeRadiusIn = 0.3;
        } else if (label.includes('knob')) {
            holes = 1;
            cuts = 0;
            holeRadiusIn = 0.35;
        } else if (type === 'hinge' || label.includes('hinge')) {
            holes = 2;
            cuts = 1;
            holeRadiusIn = 0.25;
            cutAreaSqIn = 6;
        } else if (type === 'lock' || label.includes('lock') || label.includes('latch')) {
            holes = 1;
            cuts = 1;
            holeRadiusIn = 0.75;
            cutAreaSqIn = 6;
        } else if (label.includes('patch') || label.includes('fitting')) {
            holes = 2;
            cuts = 1;
            holeRadiusIn = 0.25;
            cutAreaSqIn = 6;
        } else {
            holes = 2;
            cuts = 0;
        }

        const parts = [];
        if (holes > 0) parts.push(`${holes} ${holes === 1 ? 'hole' : 'holes'}`);
        if (cuts > 0) parts.push(`${cuts} ${cuts === 1 ? 'cut' : 'cuts'}`);
        return {
            holes,
            cuts,
            holeRadiusIn,
            cutAreaSqIn,
            label: parts.length > 0 ? parts.join(' + ') : 'no holes/cuts'
        };
    };

    const addAccessory = (type: 'lock' | 'connector' | 'hinge' | 'profile', hardware?: GlassItem) => {
        const currentPiece = ensureActivePiece();
        const id = generateUUID();
        let width = 20;
        let height = 20;
        let name = hardware?.name || "Accessory";
        const requirement = getHardwareRequirement(type, hardware);
        
        if (type === 'lock') {
            width = 25; // 2.5 inches
            height = 25;
            name = hardware?.name || "Glass Lock";
        } else if (type === 'connector') {
            width = 40; // 4 inches
            height = 20; // 2 inches
            name = hardware?.name || "L-Connector";
        } else if (type === 'hinge') {
            width = 30; // 3 inches
            height = 25; // 2.5 inches
            name = hardware?.name || "Door Hinge";
        } else if (type === 'profile') {
            width = 120; // 12 inches (1 foot)
            height = 10; // 1 inch
            name = hardware?.name || "Aluminium Profile";
        }
        
        const parent = findParentShape();
        const parentId = parent ? parent.id : undefined;
        const px = parent ? parent.x + (parent.width ? parent.width / 2 : (parent.radius ? 0 : 50)) : 150;
        const py = parent ? parent.y + (parent.height ? parent.height / 2 : (parent.radius ? 0 : 50)) : 150;

        const newShape: KonvaShape = {
            id,
            type: 'accessory',
            x: px - width / 2,
            y: py - height / 2,
            width,
            height,
            accessoryType: type,
            accessoryName: name,
            hardwareItemId: hardware?.id,
            accessoryRate: hardware?.rate,
            accessoryHoleCount: requirement.holes,
            accessoryCutCount: requirement.cuts,
            accessoryHoleRadiusIn: requirement.holeRadiusIn,
            accessoryCutAreaSqIn: requirement.cutAreaSqIn,
            accessoryRequirementLabel: requirement.label,
            parentId
        };
        
        updateActivePiece({ shapes: [...currentPiece.shapes, newShape] }, currentPiece.id);
        setSelectedShapeId(id);
    };

    const updatePolygonSideLength = (shapeId: string, sideIndex: number, newLengthInches: number) => {
        // Handled via local specifications and optimize button
    };

    const triggerPolygonOptimization = (shapeId: string, sideLengthsPx: number[], fixedCornersList: boolean[]) => {
        saveHistory();
        const shape = activePiece?.shapes.find(s => s.id === shapeId);
        if (!shape || shape.type !== 'glass_polygon' || !shape.points) return;

        const pts = [...shape.points];
        
        const fixedIndices = [];
        for (let i = 0; i < 4; i++) {
            if (fixedCornersList[i]) fixedIndices.push(i);
        }

        // helper to get signed area of 4 points to verify clockwise winding
        const getSignedArea = (coords: {x: number, y: number}[]) => {
            let area = 0;
            for (let i = 0; i < 4; i++) {
                const next = (i + 1) % 4;
                area += coords[i].x * coords[next].y - coords[next].x * coords[i].y;
            }
            return area * 0.5;
        };

        // helper to solve for intersection of two circles A (cxA, cyA, rA) and B (cxB, cyB, rB)
        const solveCircleIntersection = (cxA: number, cyA: number, rA: number, cxB: number, cyB: number, rB: number): {x: number, y: number}[] | null => {
            const dx = cxB - cxA;
            const dy = cyB - cyA;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > rA + rB || d < Math.abs(rA - rB) || d === 0) return null;

            const a = (rA * rA - rB * rB + d * d) / (2 * d);
            const h2 = rA * rA - a * a;
            if (h2 < 0) return null;
            const h = Math.sqrt(h2);

            const x2 = cxA + (a * dx) / d;
            const y2 = cyA + (a * dy) / d;

            const sol1 = {
                x: x2 + (h * dy) / d,
                y: y2 - (h * dx) / d
            };
            const sol2 = {
                x: x2 - (h * dy) / d,
                y: y2 + (h * dx) / d
            };
            return [sol1, sol2];
        };

        let solved = false;
        const tempCoords = new Array(4);

        if (fixedIndices.length === 0) {
            fixedIndices.push(1); // Default to Corner 1 (Top-Left)
        }

        if (fixedIndices.length === 1) {
            const fixedAngleIdx = fixedIndices[0];
            const LF = sideLengthsPx[fixedAngleIdx]; // side starting at fixed corner
            const LF_prev = sideLengthsPx[(fixedAngleIdx - 1 + 4) % 4]; // side ending at fixed corner
            const rA = sideLengthsPx[(fixedAngleIdx + 2) % 4]; // opposite side to fixed angle
            const rB = sideLengthsPx[(fixedAngleIdx + 1) % 4]; // side after fixed angle + 1

            let V_fixed = { x: 0, y: 0 };
            let V_prev = { x: 0, y: 0 };
            let V_next = { x: 0, y: 0 };
            const oppIdx = (fixedAngleIdx + 2) % 4;
            const prevIdx = (fixedAngleIdx - 1 + 4) % 4;
            const nextIdx = (fixedAngleIdx + 1) % 4;

            if (fixedAngleIdx === 0) { // Bottom-Left
                V_prev = { x: LF_prev, y: 0 }; // V3
                V_next = { x: 0, y: -LF }; // V1
            } else if (fixedAngleIdx === 1) { // Top-Left
                V_prev = { x: 0, y: LF_prev }; // V0
                V_next = { x: LF, y: 0 }; // V2
            } else if (fixedAngleIdx === 2) { // Top-Right
                V_prev = { x: -LF_prev, y: 0 }; // V1
                V_next = { x: 0, y: LF }; // V3
            } else { // Bottom-Right (3)
                V_prev = { x: 0, y: -LF_prev }; // V2
                V_next = { x: -LF, y: 0 }; // V0
            }

            const intersections = solveCircleIntersection(V_prev.x, V_prev.y, rA, V_next.x, V_next.y, rB);
            if (intersections) {
                const dx = V_next.x - V_prev.x;
                const dy = V_next.y - V_prev.y;
                const cross_fixed = dx * (V_fixed.y - V_prev.y) - dy * (V_fixed.x - V_prev.x);

                for (const sol of intersections) {
                    const cross_sol = dx * (sol.y - V_prev.y) - dy * (sol.x - V_prev.x);
                    if (cross_fixed * cross_sol < 0) {
                        tempCoords[fixedAngleIdx] = V_fixed;
                        tempCoords[prevIdx] = V_prev;
                        tempCoords[nextIdx] = V_next;
                        tempCoords[oppIdx] = sol;
                        solved = true;
                        break;
                    }
                }
            }
        } else if (fixedIndices.length === 2 && Math.abs(fixedIndices[0] - fixedIndices[1]) !== 2) {
            // Adjacent pair (e.g. 0 & 1, 1 & 2, 2 & 3, 3 & 0)
            let B = fixedIndices[0];
            let A = fixedIndices[1];
            if ((B + 1) % 4 !== A) {
                // swap so that A = (B + 1) % 4
                const temp = B;
                B = A;
                A = temp;
            }

            const SB = sideLengthsPx[B]; // connects B to A
            const SA = sideLengthsPx[A]; // connects A to next
            const r2 = sideLengthsPx[(B + 2) % 4];
            const r3 = sideLengthsPx[(B + 3) % 4];

            let V_B = { x: 0, y: 0 };
            let V_A = { x: 0, y: 0 };
            let V_third = { x: 0, y: 0 }; // connects to A
            const thirdIdx = (B + 2) % 4;
            const fourthIdx = (B + 3) % 4;

            if (B === 0) { // Bottom-Left (0) to Top-Left (1)
                V_B = { x: 0, y: SB };
                V_A = { x: 0, y: 0 };
                V_third = { x: SA, y: 0 };
            } else if (B === 1) { // Top-Left (1) to Top-Right (2)
                V_B = { x: 0, y: 0 };
                V_A = { x: SB, y: 0 };
                V_third = { x: SB, y: SA };
            } else if (B === 2) { // Top-Right (2) to Bottom-Right (3)
                V_B = { x: 0, y: 0 };
                V_A = { x: 0, y: SB };
                V_third = { x: -SA, y: SB };
            } else { // Bottom-Right (3) to Bottom-Left (0)
                V_B = { x: 0, y: 0 };
                V_A = { x: -SB, y: 0 };
                V_third = { x: -SB, y: -SA };
            }

            // V_fourth (connected to V_third by r2, and to V_B by r3)
            const intersections = solveCircleIntersection(V_third.x, V_third.y, r2, V_B.x, V_B.y, r3);
            if (intersections) {
                const dx = V_third.x - V_B.x;
                const dy = V_third.y - V_B.y;
                const cross_fixed = dx * (V_A.y - V_B.y) - dy * (V_A.x - V_B.x);

                for (const sol of intersections) {
                    const cross_sol = dx * (sol.y - V_B.y) - dy * (sol.x - V_B.x);
                    if (cross_fixed * cross_sol < 0) {
                        tempCoords[B] = V_B;
                        tempCoords[A] = V_A;
                        tempCoords[thirdIdx] = V_third;
                        tempCoords[fourthIdx] = sol;
                        solved = true;
                        break;
                    }
                }
            }
        } else {
            // Rectangle approximation (opposite corners or 3+ corners)
            const w = (sideLengthsPx[0] + sideLengthsPx[2]) / 2;
            const h = (sideLengthsPx[1] + sideLengthsPx[3]) / 2;
            tempCoords[0] = { x: 0, y: h };
            tempCoords[1] = { x: 0, y: 0 };
            tempCoords[2] = { x: w, y: 0 };
            tempCoords[3] = { x: w, y: h };
            solved = true;
        }

        if (!solved) {
            alert("This combination of side lengths is geometrically impossible to close with the selected 90° corners. Adjust your side dimensions or corner selection.");
            return;
        }

        for (let i = 0; i < 4; i++) {
            pts[2 * i] = tempCoords[i].x;
            pts[2 * i + 1] = tempCoords[i].y;
        }

        // Normalize polygon and guard against NaNs
        const hasNaN = pts.some(val => isNaN(val));
        if (!hasNaN) {
            const normalized = normalizePolygon(shape, pts);
            updateShape(shapeId, {
                x: normalized.x,
                y: normalized.y,
                width: normalized.width,
                height: normalized.height,
                points: normalized.points
            });

            // Sync the inputs with the newly optimized dimensions
            const numPoints = normalized.points.length / 2;
            const newSpecs = [];
            for (let sIdx = 0; sIdx < numPoints; sIdx++) {
                const nextIdx = (sIdx + 1) % numPoints;
                const x1 = normalized.points[2 * sIdx];
                const y1 = normalized.points[2 * sIdx + 1];
                const x2 = normalized.points[2 * nextIdx];
                const y2 = normalized.points[2 * nextIdx + 1];
                const L = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
                newSpecs.push(formatInchesFraction(L));
            }
            setPolygonSideSpecs(newSpecs);
        }
    };

    const updatePolygonCornerAngle = (shapeId: string, vertexIndex: number, newAngleDeg: number) => {
        const shape = activePiece?.shapes.find(s => s.id === shapeId);
        if (!shape || shape.type !== 'glass_polygon' || !shape.points) return;

        const pts = [...shape.points];
        const numPoints = pts.length / 2;

        const xc = pts[2 * vertexIndex];
        const yc = pts[2 * vertexIndex + 1];

        const iprev = (vertexIndex - 1 + numPoints) % numPoints;
        const xp = pts[2 * iprev];
        const yp = pts[2 * iprev + 1];

        const inext = (vertexIndex + 1) % numPoints;
        const xn = pts[2 * inext];
        const yn = pts[2 * inext + 1];

        const vpx = xp - xc;
        const vpy = yp - yc;
        const Lprev = Math.sqrt(vpx * vpx + vpy * vpy);
        if (Lprev === 0) return;

        const prevAngleRad = Math.atan2(vpy, vpx);

        const vnx = xn - xc;
        const vny = yn - yc;
        const Lnext = Math.sqrt(vnx * vnx + vny * vny);
        if (Lnext === 0) return;

        const cross = vpx * vny - vpy * vnx;
        const sign = cross >= 0 ? 1 : -1;

        const targetDiffRad = newAngleDeg * (Math.PI / 180);
        const targetNextAngleRad = prevAngleRad + sign * targetDiffRad;

        pts[2 * inext] = xc + Lnext * Math.cos(targetNextAngleRad);
        pts[2 * inext + 1] = yc + Lnext * Math.sin(targetNextAngleRad);

        // Normalize polygon and guard against NaNs
        const hasNaN = pts.some(val => isNaN(val));
        if (!hasNaN) {
            const normalized = normalizePolygon(shape, pts);
            updateShape(shapeId, {
                x: normalized.x,
                y: normalized.y,
                width: normalized.width,
                height: normalized.height,
                points: normalized.points
            });
        }
    };



    const hardwareLegend = useMemo(() => {
        const legend: Array<{
            id: string;
            code: string;
            accessoryType: 'hinge' | 'lock' | 'profile' | 'connector';
            name: string;
            brand?: string;
            pieceName: string;
            holes: number;
            cuts: number;
            rate?: number;
            predictionReason?: string;
            predictionConfidence?: number;
        }> = [];
        const counts = { hinge: 0, lock: 0, profile: 0, connector: 0 };
        (activePiece ? [activePiece] : []).forEach(p => {
            p.shapes.forEach(s => {
                if (s.type === 'accessory') {
                    const at = s.accessoryType || 'connector';
                    counts[at] = (counts[at] || 0) + 1;
                    const prefix = at === 'hinge' ? 'H' : at === 'lock' ? 'L' : at === 'profile' ? 'P' : 'C';
                    const code = `${prefix}${counts[at]}`;
                    const hwItem = hardwareItems.find(i => i.id === s.hardwareItemId);
                    const brand = hwItem?.make || '';
                    legend.push({
                        id: s.id,
                        code,
                        accessoryType: at,
                        name: s.accessoryName || hwItem?.name || 'Hardware Fitting',
                        brand,
                        pieceName: p.name,
                        holes: Number(s.accessoryHoleCount) || 0,
                        cuts: Number(s.accessoryCutCount) || 0,
                        rate: s.accessoryRate,
                        predictionReason: s.hardwarePredictionReason,
                        predictionConfidence: s.hardwarePredictionConfidence,
                    });
                }
            });
        });
        return legend;
    }, [activePiece, hardwareItems]);
    const showHardwareCalloutCodes = hardwareLegend.length <= 10;

    // Glass prep implied by the placed fittings. A fitting shape only carries
    // hole/cut COUNTS, so the fabrication view turns those into real,
    // positioned holes and notches -- from the fitting's own manufacturer
    // cut-out template when it's a catalogue item, else evenly spread across
    // its footprint. These are read-only: they follow the fitting, so they're
    // corrected by moving the fitting in the hardware view.
    const fittingGlassPrep = useMemo(() => {
        const fittingsById = new Map(hardwareItems.map(hw => [hw.id, hw]));
        const holes: Array<{ key: string; x: number; y: number; radius: number; label: string }> = [];
        const cuts: Array<{ key: string; x: number; y: number; width: number; height: number; label: string }> = [];
        (activePiece ? [activePiece] : []).forEach(piece => {
            piece.shapes.forEach(shape => {
                if (shape.type !== 'accessory') return;
                const geo = deriveAccessoryGeometry(shape, fittingsById);
                const label = shape.accessoryName || 'Fitting';
                geo.holes.forEach((h, i) => holes.push({ key: `${shape.id}-h${i}`, x: h.x, y: h.y, radius: h.radius, label }));
                geo.cuts.forEach((c, i) => cuts.push({ key: `${shape.id}-c${i}`, x: c.x, y: c.y, width: c.width, height: c.height, label }));
            });
        });
        return { holes, cuts };
    }, [activePiece, hardwareItems]);
    const showFabricationHoleSizeLabels = activePieceShapes.filter(shape => shape.type === 'hole').length
        + fittingGlassPrep.holes.length <= 6;
    const showFabricationCutSizeLabels = activePieceShapes.filter(shape => shape.type === 'cut').length
        + fittingGlassPrep.cuts.length <= 4;

    const stageViewportHeight = STAGE_VIEWPORT_HEIGHT;
    const { width: stageLogicalWidth, height: stageLogicalHeight } = getStageLogicalSize(drawingScale, stageViewportWidth);
    const gridColumnCount = Math.ceil(stageLogicalWidth / 20) + 1;
    const gridRowCount = Math.ceil(stageLogicalHeight / 20) + 1;

    return (
        <div className="designer-shell" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Tabs & Primary Add Design Actions */}
            <div className="designer-piece-tabs" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
                {pieces.map(piece => {
                    const needsReviewCount = piece.shapes.filter(s => s.positionSource === 'estimated-fallback').length;
                    const isActive = activePieceId === piece.id;
                    return (
                        <div key={piece.id} style={{ display: 'flex', alignItems: 'center', background: isActive ? 'var(--color-primary)' : 'var(--color-surface-muted, #f8fafc)', borderRadius: '6px', border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border, #cbd5e1)'}`, padding: '0.1rem 0.3rem' }}>
                            <button
                                onClick={() => {
                                    setActivePieceId(piece.id);
                                    setSelectedShapeIds([]);
                                }}
                                style={{ padding: '0.35rem 0.65rem', border: 'none', background: 'transparent', color: isActive ? '#ffffff' : 'var(--color-text-muted, #334155)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                {piece.name}
                                {piece.imageDesignCode && (
                                    <span
                                        title={piece.imageDesignCode === 'B'
                                            ? 'Basic: no automatic hardware or glass preparation'
                                            : 'Single fixed-panel convention'}
                                        style={{
                                            minWidth: '18px',
                                            height: '18px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '4px',
                                            background: isActive ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                                            color: isActive ? '#ffffff' : '#0f172a',
                                            fontSize: '0.68rem',
                                            fontWeight: 800,
                                        }}
                                    >
                                        {piece.imageDesignCode}
                                    </span>
                                )}
                                {needsReviewCount > 0 && (
                                    <span
                                        title={`${needsReviewCount} hole/cut position${needsReviewCount === 1 ? '' : 's'} could not be read from the photo -- verify before production`}
                                        style={{ background: '#f59e0b', color: 'white', borderRadius: '999px', fontSize: '0.7rem', lineHeight: 1, padding: '2px 5px', fontWeight: 600 }}
                                    >
                                        {needsReviewCount}
                                    </span>
                                )}
                            </button>
                            {pieces.length > 1 && (
                                <button
                                    onClick={() => removePiece(piece.id)}
                                    style={{ padding: '0.25rem', color: isActive ? '#fca5a5' : '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    title="Delete Piece"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* Primary Glass Systems Designer Action */}
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowSystemModal(true)}
                    title="Generate parametric doors, shower enclosures, partitions, sliding doors, and railings"
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                >
                    <Plus size={14} /> Glass Systems Designer
                </button>

                {/* Secondary Blank Item Action */}
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addPiece}
                    title="Add a blank design item"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: '6px', cursor: 'pointer' }}
                >
                    + Blank Item
                </button>

                {/* Undo Action */}
                <button 
                    type="button"
                    className="btn btn-secondary" 
                    onClick={undo} 
                    disabled={history.length === 0} 
                    title="Undo Last Action" 
                    style={{ 
                        padding: '0.4rem 0.75rem', 
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        marginLeft: 'auto', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.25rem', 
                        borderRadius: '6px',
                        opacity: history.length === 0 ? 0.5 : 1, 
                        cursor: history.length === 0 ? 'not-allowed' : 'pointer' 
                    }}
                >
                    <RotateCcw size={14} /> Undo
                </button>
            </div>

            <div className="designer-workspace" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                {/* Clean Aligned Single-Row Tool Bar */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--color-surface-muted, #f8fafc)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    width: '100%'
                }}>
                    {/* Primary Action Controls */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Thickness:</span>
                            <select
                                className="input"
                                style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: '0.8rem', padding: '0.3rem 0.5rem', borderRadius: '6px', width: 'auto', fontWeight: 600 }}
                                value={activePiece?.thickness || 12}
                                onChange={e => updateActivePiece({ thickness: Number(e.target.value) })}
                            >
                                <option value={4}>4mm</option>
                                <option value={5}>5mm</option>
                                <option value={6}>6mm</option>
                                <option value={8}>8mm</option>
                                <option value={10}>10mm</option>
                                <option value={12}>12mm</option>
                            </select>
                        </div>

                        <select
                            className="input"
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: 'auto', fontWeight: 600, cursor: 'pointer' }}
                            value=""
                            onChange={(e) => {
                                const shapeType = e.target.value;
                                if (shapeType) addShape(shapeType as any);
                                e.target.value = "";
                            }}
                        >
                            <option value="" disabled>+ Add Shape...</option>
                            <option value="glass_rect">Glass Panel (Rectangle)</option>
                            <option value="glass_circle">Glass Circle</option>
                            <option value="hole">Drill Hole</option>
                            <option value="cut">Cutout Notch</option>
                            <option value="glass_polygon">Irregular Polygon</option>
                        </select>

                        <select
                            className="input"
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: 'auto', fontWeight: 600, cursor: 'pointer' }}
                            value=""
                            onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                if (val === 'lock' || val === 'connector' || val === 'hinge' || val === 'profile') {
                                    addAccessory(val);
                                } else if (val.startsWith('hardware:')) {
                                    const hardware = hardwareItems.find(item => item.id === val.replace('hardware:', ''));
                                    if (hardware) addAccessory(inferAccessoryType(hardware), hardware);
                                }
                                e.target.value = "";
                            }}
                        >
                            <option value="" disabled>+ Place Hardware...</option>
                            {groupedHardware.map(([brand, items]) => (
                                <optgroup key={brand} label={`--- ${brand} ---`}>
                                    {items.map(item => (
                                        <option key={item.id} value={`hardware:${item.id}`}>
                                            {item.name} (₹{Number(item.rate || 0).toFixed(2)})
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                            <optgroup label="Position Markers">
                                <option value="lock">Lock Position</option>
                                <option value="connector">Corner Connector</option>
                                <option value="hinge">Hinge Position</option>
                                <option value="profile">Profile/Channel</option>
                            </optgroup>
                        </select>
                    </div>

                    {/* Job sheet */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0.35rem 0.75rem' }}
                            onClick={() => setDesignerMode(designerMode === 'bom' ? '2d' : 'bom')}
                        >
                            {designerMode === 'bom' ? 'Back to Drawing' : 'Job Sheet'}
                        </button>
                    </div>
                </div>

                {/* Selected Shape Contextual Editor */}
                {selectedShapeIds.length > 0 && (() => {
                    const shape = activePieceShapes.find(s => s.id === selectedShapeId);
                    if (!shape) return null;
                    return (
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            gap: '0.5rem', 
                            background: '#eff6ff', 
                            border: '1px solid #bfdbfe', 
                            padding: '0.6rem 0.8rem', 
                            borderRadius: '8px',
                            width: '100%'
                        }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1d4ed8' }}>
                                        {selectedShapeIds.length > 1 
                                            ? `Selected: ${selectedShapeIds.length} items` 
                                            : `Edit: ${shape.type.replace('glass_', '').toUpperCase()}`}
                                    </span>
                                    
                                    {selectedShapeIds.length === 1 && (
                                        <>
                                            {shape.type === 'glass_polygon' ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                                    {(() => {
                                                        const sideNames = ["Left Edge", "Top Edge", "Right Edge", "Bottom Edge"];
                                                        const pts = shape.points || getPolygonPoints(shape.sides || 4, shape.width || 100, shape.height || 100);
                                                        const numPoints = pts.length / 2;
                                                        const inputs = [];
                                                        for (let sIdx = 0; sIdx < numPoints; sIdx++) {
                                                            const key = `poly-side-${sIdx}`;
                                                            const val = polygonSideSpecs[sIdx] !== undefined ? polygonSideSpecs[sIdx] : '';
                                                            
                                                            inputs.push(
                                                                <div key={`side-input-${sIdx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>{sideNames[sIdx] || `Side ${sIdx + 1}`}:</label>
                                                                    <input 
                                                                        type="text" 
                                                                        className="input" 
                                                                        style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', width: '65px', height: '26px', background: '#ffffff' }} 
                                                                        value={val}
                                                                        onFocus={() => { setFocusedField(key); saveHistory(); }}
                                                                        onBlur={() => setFocusedField(null)}
                                                                        onChange={(e) => {
                                                                            const text = e.target.value;
                                                                            const newSpecs = [...polygonSideSpecs];
                                                                            newSpecs[sIdx] = text;
                                                                            setPolygonSideSpecs(newSpecs);
                                                                        }}
                                                                    />
                                                                </div>
                                                            );
                                                        }
                                                        return inputs;
                                                    })()}
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                                    {shape.width !== undefined && (
                                                        <>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>W:</label>
                                                                <input 
                                                                    type="text" 
                                                                    className="input" 
                                                                    style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', width: '60px', height: '26px', background: '#ffffff' }} 
                                                                    value={localInputs.width || ''} 
                                                                    onFocus={() => { setFocusedField('width'); saveHistory(); }}
                                                                    onBlur={() => setFocusedField(null)}
                                                                    onChange={e => handleInputChange('width', e.target.value)} 
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>H:</label>
                                                                <input 
                                                                    type="text" 
                                                                    className="input" 
                                                                    style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', width: '60px', height: '26px', background: '#ffffff' }} 
                                                                    value={localInputs.height || ''} 
                                                                    onFocus={() => { setFocusedField('height'); saveHistory(); }}
                                                                    onBlur={() => setFocusedField(null)}
                                                                    onChange={e => handleInputChange('height', e.target.value)} 
                                                                />
                                                            </div>
                                                        </>
                                                    )}
                                                    {shape.radius !== undefined && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>R:</label>
                                                            <input 
                                                                type="text" 
                                                                className="input" 
                                                                style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', width: '60px', height: '26px', background: '#ffffff' }} 
                                                                value={localInputs.radius || ''} 
                                                                onFocus={() => { setFocusedField('radius'); saveHistory(); }}
                                                                onBlur={() => setFocusedField(null)}
                                                                onChange={e => handleInputChange('radius', e.target.value)} 
                                                            />
                                                        </div>
                                                    )}
                                                    {shape.type === 'accessory' && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1e40af' }}>Catalog Fitting:</label>
                                                            <select
                                                                className="input"
                                                                style={{ fontSize: '0.75rem', height: '26px', padding: '0.15rem 0.4rem', background: '#ffffff', minWidth: '170px', fontWeight: 600, color: '#0f172a' }}
                                                                value={shape.hardwareItemId || ''}
                                                                onChange={(e) => {
                                                                    const hwId = e.target.value;
                                                                    const hw = hardwareItems.find(item => item.id === hwId);
                                                                    if (hw) {
                                                                        const req = getHardwareRequirement(inferAccessoryType(hw), hw);
                                                                        updateShape(shape.id, {
                                                                            hardwareItemId: hw.id,
                                                                            accessoryName: hw.name,
                                                                            accessoryRate: hw.rate,
                                                                            accessoryType: inferAccessoryType(hw),
                                                                            accessoryHoleCount: req.holes,
                                                                            accessoryCutCount: req.cuts,
                                                                            accessoryHoleRadiusIn: req.holeRadiusIn,
                                                                            accessoryCutAreaSqIn: req.cutAreaSqIn,
                                                                            accessoryRequirementLabel: req.label
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <option value="">Custom / Unlinked Hardware</option>
                                                                {groupedHardware.map(([brand, items]) => (
                                                                    <optgroup key={brand} label={brand}>
                                                                        {items.map(item => (
                                                                            <option key={item.id} value={item.id}>
                                                                                {item.name} (₹{Number(item.rate || 0).toFixed(2)})
                                                                            </option>
                                                                        ))}
                                                                    </optgroup>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                
                                {/* Operations */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: '26px', background: '#ffffff' }} onClick={() => copyShapes(selectedShapeIds)}>
                                        Copy
                                    </button>
                                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: '26px', background: '#ffffff' }} onClick={pasteShapes} disabled={!copiedShapes || copiedShapes.main.length === 0}>
                                        Paste
                                    </button>
                                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: '26px', background: '#ffffff' }} onClick={() => duplicateShapes(selectedShapeIds)}>
                                        Duplicate
                                    </button>
                                    <button className="btn" style={{ 
                                        background: '#fef2f2', 
                                        color: '#dc2626', 
                                        border: '1px solid #fca5a5', 
                                        fontSize: '0.75rem', 
                                        padding: '0.2rem 0.5rem', 
                                        height: '26px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        fontWeight: 600
                                    }} onClick={() => removeShapes(selectedShapeIds)}>
                                        <Trash2 size={12} /> Delete {selectedShapeIds.length > 1 ? `(${selectedShapeIds.length})` : ''}
                                    </button>
                                </div>
                            </div>

                            {/* Auto Hole Aligner Row */}
                            {selectedShapeIds.length === 1 && (shape.type === 'glass_rect' || shape.type === 'glass_polygon') && (
                                <div style={{ 
                                    display: 'flex', 
                                    flexWrap: 'wrap', 
                                    alignItems: 'center', 
                                    gap: '0.5rem', 
                                    borderTop: '1px solid #dbeafe', 
                                    paddingTop: '0.4rem',
                                    marginTop: '0.1rem'
                                }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1d4ed8' }}>Auto Hole Aligner:</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.65rem', color: '#475569' }}>Edge</label>
                                        <select 
                                            className="input" 
                                            style={{ padding: '0.1rem 0.3rem', fontSize: '0.75rem', height: '24px', background: '#ffffff' }} 
                                            value={holeEdge} 
                                            onChange={e => setHoleEdge(e.target.value as any)}
                                        >
                                            <option value="top">Top Edge</option>
                                            <option value="bottom">Bottom Edge</option>
                                            <option value="left">Left Edge</option>
                                            <option value="right">Right Edge</option>
                                            <option value="corners">4 Corners</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.65rem', color: '#475569' }}>Holes</label>
                                        <input 
                                            type="number" 
                                            className="input" 
                                            style={{ padding: '0.1rem 0.3rem', fontSize: '0.75rem', height: '24px', width: '45px', background: '#ffffff' }} 
                                            min={1} 
                                            max={10} 
                                            disabled={holeEdge === 'corners'}
                                            value={holeEdge === 'corners' ? 4 : holeCountInput} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === '') {
                                                    setHoleCountInput('');
                                                } else {
                                                    const parsed = parseInt(val);
                                                    setHoleCountInput(isNaN(parsed) ? '' : parsed);
                                                }
                                            }}
                                            onBlur={() => {
                                                if (!holeCountInput || holeCountInput < 1) {
                                                    setHoleCountInput(1);
                                                }
                                            }}
                                        />
                                    </div>
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', height: '24px', background: '#ffffff' }} 
                                        onClick={() => generateAlignedHoles(holeEdge, holeEdge === 'corners' ? 4 : (typeof holeCountInput === 'number' ? holeCountInput : 2))}
                                    >
                                        Align & Add Holes
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Hidden Stages for PDF Export */}
                <div style={{ position: 'absolute', top: -9999, left: -9999, visibility: 'hidden' }}>
                    {pieces.map(piece => (
                        <Stage 
                            key={`export-${piece.id}`} 
                            width={2000} 
                            height={2000} 
                            ref={(node) => { if (node) exportStagesRef.current[piece.id] = node; }}
                        >
                            <Layer>
                                {/* Render grid lines */}
                                {Array.from({ length: 100 }).map((_, i) => (
                                    <React.Fragment key={`grid-export-${piece.id}-${i}`}>
                                        <Rect x={i * 20} y={0} width={1} height={2000} fill="#e5e7eb" />
                                        <Rect x={0} y={i * 20} width={2000} height={1} fill="#e5e7eb" />
                                    </React.Fragment>
                                ))}

                                {/* Render glass pieces (flat 2D) */}
                                {piece.shapes.filter(s => s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram').map((shape) => {
                                    const isPolygon = shape.type === 'glass_polygon';
                                    const isParallelogram = shape.type === 'glass_parallelogram';
                                    const shapeNeedsReview = shape.positionSource === 'estimated-fallback';
                                    const props = {
                                        id: shape.id, x: shape.x, y: shape.y,
                                        fill: shapeNeedsReview ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)', stroke: shapeNeedsReview ? '#f59e0b' : '#3b82f6', strokeWidth: 1, draggable: false,
                                    };
                                     if (isPolygon) {
                                         const pts = shape.points || getPolygonPoints(shape.sides || 4, shape.width || 100, shape.height || 100);
                                         const centroid = getCentroid(pts);
                                         const numPoints = pts.length / 2;
                                         const angleTexts = [];
                                         for (let i = 0; i < numPoints; i++) {
                                             const angleInfo = getVertexAngleInfo(pts, i, shape.x, shape.y, centroid, 1);
                                             if (angleInfo) {
                                                 angleTexts.push(
                                                     <Text
                                                         key={`export-angle-${shape.id}-${i}`}
                                                         x={angleInfo.textX}
                                                         y={angleInfo.textY}
                                                         text={angleInfo.text}
                                                         fontSize={13}
                                                         fill="#2563eb"
                                                         fontStyle="bold"
                                                         align="center"
                                                         offsetX={24}
                                                         offsetY={6}
                                                         width={48}
                                                         listening={false}
                                                     />
                                                 );
                                             }
                                         }
                                         return (
                                             <Group key={shape.id}>
                                                 <Line {...props} points={pts} closed={true} />
                                                 {getPolygonSideDimensions(shape, 1).map((dim) => (
                                                     <React.Fragment key={dim.id}>
                                                         {dim.hasSplit ? (<>
                                                             <Arrow points={dim.arrow1Points || []} stroke="#6b7280" strokeWidth={3} pointerAtEnding={true} pointerLength={10} pointerWidth={10} fill="#6b7280" listening={false} />
                                                             <Arrow points={dim.arrow2Points || []} stroke="#6b7280" strokeWidth={3} pointerAtEnding={true} pointerLength={10} pointerWidth={10} fill="#6b7280" listening={false} />
                                                         </>) : (
                                                             <Arrow points={dim.singleArrowPoints || []} stroke="#6b7280" strokeWidth={3} pointerAtBeginning={true} pointerAtEnding={true} pointerLength={10} pointerWidth={10} fill="#6b7280" listening={false} />
                                                         )}
                                                         <Text x={dim.textX} y={dim.textY} text={`${dim.text}"`} fontSize={16} fill="#374151" fontStyle="bold" rotation={dim.rotation} align="center" width={80} offsetX={40} offsetY={9} listening={false} />
                                                     </React.Fragment>
                                                 ))}
                                                 {angleTexts}
                                             </Group>
                                         );
                                     }
                                    if (isParallelogram) {
                                        const skewFactor = 0.7;
                                        const w = shape.width || 200;
                                        const h = shape.height || 150;
                                        const sk = shape.skewX !== undefined ? shape.skewX : Math.round(h * 0.35);
                                        const wr = w * skewFactor;
                                        return (
                                            <Group key={shape.id} x={shape.x} y={shape.y}>
                                                <Line
                                                    x={0} y={0}
                                                    points={getParallelogramPoints(0, 0, wr, h, sk)}
                                                    closed={true}
                                                    fill='rgba(59, 130, 246, 0.2)'
                                                    stroke='#3b82f6'
                                                    strokeWidth={1}
                                                    listening={false}
                                                />
                                                {renderParallelogramDimensions(w, h, sk, 1)}
                                            </Group>
                                        );
                                    }
                                    return shape.type === 'glass_rect' ? (
                                        <Group key={shape.id}><Rect {...props} width={shape.width} height={shape.height} />{renderRectDimensions(shape, 1, !hasSiblingToTheRight(shape, piece.shapes))}</Group>
                                    ) : (
                                        <Group key={shape.id}><Circle {...props} radius={shape.radius} />{renderCircleDimensions(shape, 1)}</Group>
                                    );
                                })}

                                {/* Render holes and cuts */}
                                {piece.shapes.filter(s => s.type === 'hole' || s.type === 'cut').map((shape) => {
                                    const isCut = shape.type === 'cut';
                                    const needsReview = shape.positionSource === 'estimated-fallback';
                                    const flagColor = needsReview ? '#f59e0b' : '#ef4444';
                                    const props = { id: shape.id, x: shape.x, y: shape.y, fill: needsReview ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.35)', stroke: flagColor, strokeWidth: 2, dash: [5, 5], draggable: false };
                                    return isCut ? (
                                        <Group key={shape.id}>
                                            <Rect {...props} width={shape.width} height={shape.height} />
                                            <Text x={shape.x + (shape.width || 0) / 2} y={shape.y + (shape.height || 0) / 2} text="C" fill={flagColor} fontSize={10} fontStyle="bold" align="center" width={60} offsetX={30} offsetY={5} listening={false} />
                                            <Text x={shape.x + (shape.width || 0) / 2} y={shape.y + (shape.height || 0) + 4} text={`${formatInchesFraction(shape.width || 0)}" x ${formatInchesFraction(shape.height || 0)}"`} fill={needsReview ? '#b45309' : '#b91c1c'} fontSize={12} fontStyle="bold" align="center" width={200} offsetX={100} listening={false} />
                                        </Group>
                                    ) : (
                                        <Group key={shape.id}>
                                            <Circle {...props} radius={shape.radius} />
                                            <Text x={shape.x} y={shape.y} text="H" fill={flagColor} fontSize={10} fontStyle="bold" align="center" width={60} offsetX={30} offsetY={5} listening={false} />
                                            <Text x={shape.x} y={shape.y + (shape.radius || 0) + 4} text={`Ø ${formatInchesFraction((shape.radius || 0) * 2)}"`} fill={needsReview ? '#b45309' : '#b91c1c'} fontSize={12} fontStyle="bold" align="center" width={160} offsetX={80} listening={false} />
                                        </Group>
                                    );
                                })}
                            </Layer>
                        </Stage>
                    ))}
                </div>

                {/* Canvas Area */}
                <div ref={canvasFrameRef} className="designer-canvas-frame" style={{
                    width: '100%',
                    overflow: 'hidden',
                    background: '#e8edf0',
                    borderRadius: '14px',
                    border: '1px solid rgba(14, 116, 144, 0.22)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 18px 45px rgba(15, 23, 42, 0.08)',
                    padding: '0.65rem',
                    minHeight: '680px',
                    height: 'calc(100vh - 160px)'
                }}>
                    {pieces.length === 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center',
                            background: '#ffffff',
                            padding: '2.5rem 3rem',
                            borderRadius: '12px',
                            border: '1px dashed #cbd5e1',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                            zIndex: 20,
                            maxWidth: '520px',
                            width: '90%'
                        }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📐</div>
                            <h3 style={{ margin: '0 0 0.5rem 0', color: '#0f172a', fontSize: '1.2rem', fontWeight: 700 }}>
                                CAD Design Window Ready
                            </h3>
                            <p style={{ margin: '0 0 1.5rem 0', color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5 }}>
                                Generate complete shower enclosures, sliding doors, and partitions automatically, or add custom glass shapes to start designing.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => setShowSystemModal(true)}
                                    style={{ fontSize: '0.85rem', padding: '0.5rem 1.1rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    <Plus size={16} /> Glass Systems Designer
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => addShape('glass_rect')}
                                    style={{ fontSize: '0.85rem', padding: '0.5rem 1.1rem', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    + Add Panel Shape
                                </button>
                            </div>
                        </div>
                    )}
                    {designerMode === 'bom' ? (() => {
                        const bomReport = generateFactoryBOM(pieces, hardwareItems);
                        return (
                            <div style={{ padding: '1.2rem', overflowY: 'auto', maxHeight: '100%', background: '#ffffff', borderRadius: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>Factory Job Card &amp; Hardware BOM</h2>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem', marginBottom: '1.2rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                                    <div><strong>Total Glass Area:</strong> {bomReport.totalGlassAreaSqM} m² ({(bomReport.totalGlassAreaSqM * 10.7639).toFixed(1)} sqft)</div>
                                    <div><strong>Total Weight:</strong> {bomReport.totalGlassWeightKg} kg</div>
                                    <div><strong>Edge Polishing:</strong> {bomReport.totalPolishingMeters} m</div>
                                </div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '1rem 0 0.5rem', color: '#0369a1' }}>1. Glass Cutting Sizes & Deductions</h3>
                                <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '1.5rem' }}>
                                    <thead>
                                        <tr style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                            <th style={{ padding: '0.5rem' }}>Panel Name</th>
                                            <th style={{ padding: '0.5rem' }}>Thickness</th>
                                            <th style={{ padding: '0.5rem' }}>Raw Size (mm)</th>
                                            <th style={{ padding: '0.5rem' }}>Gaps (T/B/L/R)</th>
                                            <th style={{ padding: '0.5rem' }}>Net Size (mm)</th>
                                            <th style={{ padding: '0.5rem' }}>Holes/Cuts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bomReport.jobCards.map((card, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '0.5rem', fontWeight: 600 }}>{card.pieceName}</td>
                                                <td style={{ padding: '0.5rem' }}>{card.thicknessMm} mm</td>
                                                <td style={{ padding: '0.5rem' }}>{card.rawWidthMm} × {card.rawHeightMm}</td>
                                                <td style={{ padding: '0.5rem', color: '#64748b' }}>-{card.deductions.topGapMm}/-{card.deductions.bottomGapMm}/-{card.deductions.hingeSideGapMm}/-{card.deductions.lockSideGapMm} mm</td>
                                                <td style={{ padding: '0.5rem', fontWeight: 700, color: '#166534' }}>{card.netWidthMm} × {card.netHeightMm}</td>
                                                <td style={{ padding: '0.5rem' }}>{card.holesCount} h / {card.cutsCount} c</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })() : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(440px, 1fr))',
                            gap: '0.75rem',
                            width: '100%',
                            overflowX: 'auto',
                        }}>
                        <section style={{ minWidth: 0, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                            <div style={{ height: '34px', display: 'flex', alignItems: 'center', padding: '0 0.65rem', borderBottom: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                                Hardware layout
                            </div>
                        <Stage
                            width={stageViewportWidth} 
                            height={stageViewportHeight} 
                            scaleX={drawingScale}
                            scaleY={drawingScale}
                            onMouseDown={handleStageClick}
                            onTouchStart={handleStageClick}
                            ref={stageRef}
                        >
                        <Layer>
                            <Rect x={0} y={0} width={stageLogicalWidth} height={stageLogicalHeight} fill="#eef2f4" listening={false} />
                            {/* Render grid lines (cyan-tinted drafting grid; every 5th line stronger) */}
                            {Array.from({ length: gridColumnCount }).map((_, i) => (
                                <Rect key={`grid-v-${i}`} x={i * 20} y={0} width={1} height={stageLogicalHeight} fill={i % 5 === 0 ? 'rgba(14,116,144,0.16)' : 'rgba(14,116,144,0.06)'} listening={false} />
                            ))}
                            {Array.from({ length: gridRowCount }).map((_, i) => (
                                <Rect key={`grid-h-${i}`} x={0} y={i * 20} width={stageLogicalWidth} height={1} fill={i % 5 === 0 ? 'rgba(14,116,144,0.16)' : 'rgba(14,116,144,0.06)'} listening={false} />
                            ))}

                            {/* Render glass pieces (flat 2D) */}
                            {activePieceShapes.filter(s => s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram').map((shape) => {
                                const isSelected = selectedShapeIds.includes(shape.id);
                                const isRect = shape.type === 'glass_rect';
                                const isCircle = shape.type === 'glass_circle';
                                const isPolygon = shape.type === 'glass_polygon';
                                const isParallelogram = shape.type === 'glass_parallelogram';

                                const shapeNeedsReview = shape.positionSource === 'estimated-fallback';
                                const baseProps = {
                                    id: shape.id,
                                    x: shape.x,
                                    y: shape.y,
                                    fill: shapeNeedsReview ? 'rgba(245, 158, 11, 0.18)' : 'rgba(14, 165, 233, 0.10)',
                                    stroke: shapeNeedsReview ? '#f59e0b' : '#0e7490',
                                    strokeWidth: (isSelected ? 3 : 1.5) / drawingScale,
                                    draggable: true,
                                    onClick: (e: any) => handleShapeClick(shape.id, e),
                                    onTap: (e: any) => handleShapeClick(shape.id, e),
                                    onMouseEnter: handleShapeMouseEnter,
                                    onMouseLeave: handleShapeMouseLeave,
                                    onDragStart: (e: any) => {
                                        saveHistory();
                                        if (e.target.id() === shape.id) {
                                            const children: Array<{ id: string; dx: number; dy: number }> = [];
                                            const allShapes = activePieceShapes;
                                            allShapes.forEach(s => {
                                                if (s.id !== shape.id && (s.type === 'hole' || s.type === 'cut' || s.type === 'accessory')) {
                                                    let isInside = false;
                                                    if (s.parentId === shape.id) { isInside = true; }
                                                    else if (!s.parentId) {
                                                        if (shape.type === 'glass_rect' || shape.type === 'glass_polygon' || shape.type === 'glass_parallelogram') {
                                                            const w = shape.width || 0; const h = shape.height || 0;
                                                            if (s.x >= shape.x && s.x <= shape.x + w && s.y >= shape.y && s.y <= shape.y + h) isInside = true;
                                                        } else if (shape.type === 'glass_circle') {
                                                            const r = shape.radius || 0;
                                                            if (s.x >= shape.x - r && s.x <= shape.x + r && s.y >= shape.y - r && s.y <= shape.y + r) isInside = true;
                                                        }
                                                    }
                                                    if (isInside) children.push({ id: s.id, dx: s.x - shape.x, dy: s.y - shape.y });
                                                }
                                            });
                                            childOffsetsRef.current = children;
                                        }
                                    },
                                    onDragMove: (e: any) => {
                                        const newX = e.target.x(); const newY = e.target.y();
                                        const updates: Record<string, Partial<KonvaShape>> = {};
                                        updates[shape.id] = { x: snapToOctalInch(newX), y: snapToOctalInch(newY) };
                                        childOffsetsRef.current.forEach(child => {
                                            updates[child.id] = { x: snapToOctalInch(newX + child.dx), y: snapToOctalInch(newY + child.dy), parentId: shape.id };
                                        });
                                        updateShapesInPieces(updates);
                                    },
                                    onDragEnd: (e: any) => {
                                        const newX = e.target.x(); const newY = e.target.y();
                                        const updates: Record<string, Partial<KonvaShape>> = {};
                                        updates[shape.id] = { x: snapToOctalInch(newX), y: snapToOctalInch(newY) };
                                        childOffsetsRef.current.forEach(child => {
                                            updates[child.id] = { x: snapToOctalInch(newX + child.dx), y: snapToOctalInch(newY + child.dy), parentId: shape.id };
                                        });
                                        updateShapesInPieces(updates);
                                        childOffsetsRef.current = [];
                                    },
                                    onTransformStart: (e: any) => {
                                        saveHistory();
                                    },
                                    onTransform: (e: any) => {
                                        const node = e.target;
                                        const scaleX = node.scaleX(); const scaleY = node.scaleY();
                                        node.scaleX(1); node.scaleY(1);
                                        if (isCircle) {
                                            updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), radius: Math.max(5, snapToOctalInch(node.radius() * scaleX)) });
                                        } else {
                                            updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), width: Math.max(10, snapToOctalInch(node.width() * scaleX)), height: Math.max(10, snapToOctalInch(node.height() * scaleY)) });
                                        }
                                    },
                                    onTransformEnd: (e: any) => {
                                        const node = e.target;
                                        const scaleX = node.scaleX(); const scaleY = node.scaleY();
                                        node.scaleX(1); node.scaleY(1);
                                        if (isCircle) {
                                            updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), radius: Math.max(5, snapToOctalInch(node.radius() * scaleX)) });
                                        } else {
                                            updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), width: Math.max(10, snapToOctalInch(node.width() * scaleX)), height: Math.max(10, snapToOctalInch(node.height() * scaleY)) });
                                        }
                                    },
                                };

                                 if (isPolygon) {
                                     const pts = shape.points || getPolygonPoints(shape.sides || 4, shape.width || 100, shape.height || 100);
                                     const centroid = getCentroid(pts);
                                     const numPoints = pts.length / 2;
                                     const angleTexts = [];
                                     for (let i = 0; i < numPoints; i++) {
                                         const angleInfo = getVertexAngleInfo(pts, i, shape.x, shape.y, centroid, drawingScale);
                                         if (angleInfo) {
                                             angleTexts.push(
                                                 <Text
                                                     key={`angle-${shape.id}-${i}`}
                                                     x={angleInfo.textX}
                                                     y={angleInfo.textY}
                                                     text={angleInfo.text}
                                                     fontSize={13 / drawingScale}
                                                     fill="#2563eb"
                                                     fontStyle="bold"
                                                     align="center"
                                                     offsetX={24 / drawingScale}
                                                     offsetY={6 / drawingScale}
                                                     width={48 / drawingScale}
                                                     listening={false}
                                                 />
                                             );
                                         }
                                     }

                                     return (
                                         <Group key={shape.id}>
                                             <Line {...baseProps} points={pts} closed={true} />
                                             {getPolygonSideDimensions(shape, drawingScale).map((dim) => (
                                                 <React.Fragment key={dim.id}>
                                                     {dim.hasSplit ? (<>
                                                         <Arrow points={dim.arrow1Points || []} stroke="#6b7280" strokeWidth={3 / drawingScale} pointerAtEnding={true} pointerLength={10 / drawingScale} pointerWidth={10 / drawingScale} fill="#6b7280" listening={false} />
                                                         <Arrow points={dim.arrow2Points || []} stroke="#6b7280" strokeWidth={3 / drawingScale} pointerAtEnding={true} pointerLength={10 / drawingScale} pointerWidth={10 / drawingScale} fill="#6b7280" listening={false} />
                                                     </>) : (
                                                         <Arrow points={dim.singleArrowPoints || []} stroke="#6b7280" strokeWidth={3 / drawingScale} pointerAtBeginning={true} pointerAtEnding={true} pointerLength={10 / drawingScale} pointerWidth={10 / drawingScale} fill="#6b7280" listening={false} />
                                                     )}
                                                     <Text x={dim.textX} y={dim.textY} text={`${dim.text}"`} fontSize={16 / drawingScale} fill="#374151" fontStyle="bold" rotation={dim.rotation} align="center" width={80 / drawingScale} offsetX={40 / drawingScale} offsetY={9 / drawingScale} listening={false} />
                                                 </React.Fragment>
                                             ))}
                                             {angleTexts}
                                             {isSelected && pts.reduce<any[]>((acc, val, idx, arr) => {
                                                 if (idx % 2 === 0) {
                                                     const i = idx / 2; const rx = val; const ry = arr[idx + 1];
                                                     acc.push(
                                                         <Circle key={`anchor-${shape.id}-${i}`} x={shape.x + rx} y={shape.y + ry}
                                                             radius={6 / drawingScale} fill="#ef4444" stroke="#ffffff" strokeWidth={2 / drawingScale}
                                                             draggable={true} onMouseEnter={handleShapeMouseEnter} onMouseLeave={handleShapeMouseLeave}
                                                             onDragStart={(e) => { e.cancelBubble = true; saveHistory(); }}
                                                             onDragMove={(e) => {
                                                                 e.cancelBubble = true;
                                                                 const newRelX = e.target.x() - shape.x; const newRelY = e.target.y() - shape.y;
                                                                 const newPts = [...pts];
                                                                 newPts[2 * i] = newRelX; newPts[2 * i + 1] = newRelY;
                                                                 updateShape(shape.id, { points: newPts });
                                                             }}
                                                             onDragEnd={(e) => {
                                                                 e.cancelBubble = true;
                                                                 const newRelX = e.target.x() - shape.x; const newRelY = e.target.y() - shape.y;
                                                                 const newPts = [...pts];
                                                                 newPts[2 * i] = newRelX; newPts[2 * i + 1] = newRelY;
                                                                 const normalized = normalizePolygon(shape, newPts);
                                                                 updateShape(shape.id, { x: snapToOctalInch(normalized.x), y: snapToOctalInch(normalized.y), width: snapToOctalInch(normalized.width), height: snapToOctalInch(normalized.height), points: normalized.points.map(snapToOctalInch) });
                                                             }}
                                                         />
                                                     );
                                                 }
                                                 return acc;
                                             }, [])}
                                         </Group>
                                     );
                                 }

                                if (isParallelogram) {
                                    const skewFactor = 0.7;
                                    const w = shape.width || 200;
                                    const h = shape.height || 150;
                                    const sk = shape.skewX !== undefined ? shape.skewX : Math.round(h * 0.35);
                                    const wr = w * skewFactor;
                                    return (
                                        <Group key={shape.id}>
                                            <Line
                                                id={shape.id}
                                                x={shape.x}
                                                y={shape.y}
                                                points={getParallelogramPoints(0, 0, wr, h, sk)}
                                                closed={true}
                                                fill='rgba(59, 130, 246, 0.2)'
                                                stroke='#3b82f6'
                                                strokeWidth={(isSelected ? 3 : 1) / drawingScale}
                                                draggable={true}
                                                onClick={(e: any) => handleShapeClick(shape.id, e)}
                                                onTap={(e: any) => handleShapeClick(shape.id, e)}
                                                onMouseEnter={handleShapeMouseEnter}
                                                onMouseLeave={handleShapeMouseLeave}
                                                onDragStart={(e: any) => {
                                                    const children: Array<{ id: string; dx: number; dy: number }> = [];
                                                    const allShapes = activePieceShapes;
                                                    allShapes.forEach(s => {
                                                        if (s.id !== shape.id && (s.type === 'hole' || s.type === 'cut' || s.type === 'accessory')) {
                                                            let isInside = false;
                                                            if (s.parentId === shape.id) { isInside = true; }
                                                            else if (!s.parentId && s.x >= shape.x && s.x <= shape.x + wr && s.y >= shape.y && s.y <= shape.y + h + sk) { isInside = true; }
                                                            if (isInside) children.push({ id: s.id, dx: s.x - shape.x, dy: s.y - shape.y });
                                                        }
                                                    });
                                                    childOffsetsRef.current = children;
                                                }}
                                                onDragMove={(e: any) => {
                                                    const nx = snapToOctalInch(e.target.x());
                                                    const ny = snapToOctalInch(e.target.y());
                                                    const updates: Record<string, Partial<KonvaShape>> = {};
                                                    updates[shape.id] = { x: nx, y: ny };
                                                    childOffsetsRef.current.forEach(child => {
                                                        updates[child.id] = { x: snapToOctalInch(nx + child.dx), y: snapToOctalInch(ny + child.dy), parentId: shape.id };
                                                    });
                                                    updateShapesInPieces(updates);
                                                }}
                                                onDragEnd={(e: any) => {
                                                    const nx = snapToOctalInch(e.target.x());
                                                    const ny = snapToOctalInch(e.target.y());
                                                    const updates: Record<string, Partial<KonvaShape>> = {};
                                                    updates[shape.id] = { x: nx, y: ny };
                                                    childOffsetsRef.current.forEach(child => {
                                                        updates[child.id] = { x: snapToOctalInch(nx + child.dx), y: snapToOctalInch(ny + child.dy), parentId: shape.id };
                                                    });
                                                    updateShapesInPieces(updates);
                                                    childOffsetsRef.current = [];
                                                }}
                                                onTransform={(e: any) => {
                                                    const node = e.target;
                                                    const scaleX = node.scaleX();
                                                    const scaleY = node.scaleY();
                                                    node.scaleX(1);
                                                    node.scaleY(1);
                                                    const newWr = wr * scaleX;
                                                    const newW = Math.max(10, snapToOctalInch(newWr / skewFactor));
                                                    const newH = Math.max(10, snapToOctalInch(h * scaleY));
                                                    const newSk = Math.round(newH * 0.35);
                                                    updateShape(shape.id, {
                                                        x: snapToOctalInch(node.x()),
                                                        y: snapToOctalInch(node.y()),
                                                        width: newW,
                                                        height: newH,
                                                        skewX: newSk
                                                    });
                                                }}
                                                onTransformEnd={(e: any) => {
                                                    const node = e.target;
                                                    const scaleX = node.scaleX();
                                                    const scaleY = node.scaleY();
                                                    node.scaleX(1);
                                                    node.scaleY(1);
                                                    const newWr = wr * scaleX;
                                                    const newW = Math.max(10, snapToOctalInch(newWr / skewFactor));
                                                    const newH = Math.max(10, snapToOctalInch(h * scaleY));
                                                    const newSk = Math.round(newH * 0.35);
                                                    updateShape(shape.id, {
                                                        x: snapToOctalInch(node.x()),
                                                        y: snapToOctalInch(node.y()),
                                                        width: newW,
                                                        height: newH,
                                                        skewX: newSk
                                                    });
                                                }}
                                            />
                                            <Group x={shape.x} y={shape.y}>
                                                {renderParallelogramDimensions(w, h, sk, drawingScale)}
                                            </Group>
                                        </Group>
                                    );
                                }
                                return isCircle ? (
                                    <Group key={shape.id}><Circle {...baseProps} radius={shape.radius} />{renderCircleDimensions(shape, drawingScale)}</Group>
                                ) : (
                                    <Group key={shape.id}><Rect {...baseProps} width={shape.width} height={shape.height} />{renderRectDimensions(shape, drawingScale, !hasSiblingToTheRight(shape, activePieceShapes))}</Group>
                                );
                            })}

                            {/* Fabrication view: the glass prep each fitting needs, drawn as
                                real holes/notches instead of the fitting itself. Read-only --
                                reposition the fitting in the hardware view to move these. These
                                are never interactive/draggable, so unlike the manual holes/cuts
                                above, the mark itself can be drawn at a floored minimum size
                                directly -- there's no Konva transform state to corrupt. */}
                            {canvasView === 'fabrication' && fittingGlassPrep.holes.map(h => {
                                const displayRadius = Math.max(h.radius, 9 / drawingScale);
                                const chipW = 76 / drawingScale;
                                const chipH = 18 / drawingScale;
                                const chipY = h.y + displayRadius + 4 / drawingScale;
                                return (
                                    <Group key={h.key} listening={false}>
                                        <Circle x={h.x} y={h.y} radius={displayRadius} fill="rgba(220, 38, 38, 0.25)" stroke="#dc2626" strokeWidth={2 / drawingScale} />
                                        <Line points={[h.x - displayRadius - 5 / drawingScale, h.y, h.x + displayRadius + 5 / drawingScale, h.y]} stroke="#dc2626" strokeWidth={1 / drawingScale} dash={[2 / drawingScale, 2 / drawingScale]} />
                                        <Line points={[h.x, h.y - displayRadius - 5 / drawingScale, h.x, h.y + displayRadius + 5 / drawingScale]} stroke="#dc2626" strokeWidth={1 / drawingScale} dash={[2 / drawingScale, 2 / drawingScale]} />
                                        <Rect x={h.x - chipW / 2} y={chipY} width={chipW} height={chipH} fill="#ffffff" stroke="#dc2626" strokeWidth={1 / drawingScale} cornerRadius={3 / drawingScale} opacity={0.94} />
                                        <Text x={h.x - chipW / 2} y={chipY + chipH / 2 - 6 / drawingScale} text={`Ø ${formatInchesFraction(h.radius * 2)}"`} fontSize={11 / drawingScale} fill="#b91c1c" fontStyle="bold" align="center" width={chipW} />
                                    </Group>
                                );
                            })}
                            {canvasView === 'fabrication' && fittingGlassPrep.cuts.map(c => {
                                const cx = c.x + c.width / 2;
                                const cy = c.y + c.height / 2;
                                const displayW = Math.max(c.width, 18 / drawingScale);
                                const displayH = Math.max(c.height, 18 / drawingScale);
                                const chipW = 90 / drawingScale;
                                const chipH = 18 / drawingScale;
                                // Fittings such as patch sets commonly place a
                                // hole and notch at the same centre. Hole
                                // dimensions sit below the prep mark, so keep
                                // the notch dimensions beside it to prevent
                                // the two fabrication callouts from colliding.
                                const chipX = cx - displayW / 2 - chipW - 4 / drawingScale;
                                const chipY = cy - chipH / 2;
                                return (
                                    <Group key={c.key} listening={false}>
                                        <Rect x={cx - displayW / 2} y={cy - displayH / 2} width={displayW} height={displayH} fill="rgba(37, 99, 235, 0.2)" stroke="#1d4ed8" strokeWidth={2 / drawingScale} dash={[4 / drawingScale, 3 / drawingScale]} />
                                        {showFabricationCutSizeLabels && (
                                            <>
                                                <Rect x={chipX} y={chipY} width={chipW} height={chipH} fill="#ffffff" stroke="#1d4ed8" strokeWidth={1 / drawingScale} cornerRadius={3 / drawingScale} opacity={0.94} />
                                                <Text x={chipX} y={chipY + chipH / 2 - 6 / drawingScale} text={`${formatInchesFraction(c.width)}" x ${formatInchesFraction(c.height)}"`} fontSize={11 / drawingScale} fill="#1d4ed8" fontStyle="bold" align="center" width={chipW} />
                                            </>
                                        )}
                                    </Group>
                                );
                            })}

                            {/* Render accessories (hardware view only -- the fabrication
                                drawing deliberately carries no fitting markers) */}
                            {canvasView === 'hardware' && activePieceShapes.filter(s => s.type === 'accessory').map((shape) => {
                                const isSelected = selectedShapeIds.includes(shape.id);
                                return (
                                    <Group
                                        key={shape.id}
                                        id={shape.id}
                                        x={shape.x}
                                        y={shape.y}
                                        draggable={true}
                                        onDragStart={() => saveHistory()}
                                        onTransformStart={() => saveHistory()}
                                        onClick={(e: any) => handleShapeClick(shape.id, e)}
                                        onTap={(e: any) => handleShapeClick(shape.id, e)}
                                        onMouseEnter={handleShapeMouseEnter}
                                        onMouseLeave={handleShapeMouseLeave}
                                        onDragMove={(e: any) => {
                                            updateShape(shape.id, { 
                                                x: snapToOctalInch(e.target.x()), 
                                                y: snapToOctalInch(e.target.y()) 
                                            });
                                        }}
                                        onDragEnd={(e: any) => {
                                            updateShape(shape.id, { 
                                                x: snapToOctalInch(e.target.x()), 
                                                y: snapToOctalInch(e.target.y()) 
                                            });
                                        }}
                                        onTransform={(e: any) => {
                                            const node = e.target;
                                            const scaleX = node.scaleX();
                                            node.scaleX(1);
                                            updateShape(shape.id, {
                                                x: snapToOctalInch(node.x()),
                                                y: snapToOctalInch(node.y()),
                                                width: Math.max(10, snapToOctalInch((shape.width || 120) * scaleX)),
                                            });
                                        }}
                                        onTransformEnd={(e: any) => {
                                            const node = e.target;
                                            const scaleX = node.scaleX();
                                            node.scaleX(1);
                                            updateShape(shape.id, {
                                                x: snapToOctalInch(node.x()),
                                                y: snapToOctalInch(node.y()),
                                                width: Math.max(10, snapToOctalInch((shape.width || 120) * scaleX)),
                                            });
                                        }}
                                    >
                                        {(() => {
                                            const at = shape.accessoryType;
                                            const pal = at === 'hinge' ? { c: '#1d4ed8', bg: '#ffffff', badgeBg: '#eff6ff' }
                                                : at === 'lock' ? { c: '#b91c1c', bg: '#ffffff', badgeBg: '#fef2f2' }
                                                : at === 'profile' ? { c: '#6d28d9', bg: '#ffffff', badgeBg: '#f5f3ff' }
                                                : { c: '#047857', bg: '#ffffff', badgeBg: '#ecfdf5' };
                                            const mw = at === 'lock' ? 25 : at === 'connector' ? 40 : at === 'profile' ? (shape.width || 120) : 30;
                                            const mh = at === 'profile' ? 10 : at === 'connector' ? 20 : 25;
                                            const holes = Math.min(Number(shape.accessoryHoleCount) || 0, 6);
                                            const cuts = Math.min(Number(shape.accessoryCutCount) || 0, 4);
                                            const marks = holes + cuts;
                                            const gap = 7;
                                            const startX = mw / 2 - ((marks - 1) * gap) / 2;
                                            const midY = mh / 2;

                                            const legendItem = hardwareLegend.find((item: any) => item.id === shape.id);
                                            const codeTag = legendItem ? legendItem.code : 'HW';

                                            return (
                                                <Group>
                                                    {/* Solid high-contrast fitting body */}
                                                    <Rect
                                                        x={0}
                                                        y={0}
                                                        width={mw}
                                                        height={mh}
                                                        fill={pal.bg}
                                                        stroke={pal.c}
                                                        strokeWidth={2 / drawingScale}
                                                        cornerRadius={4}
                                                        shadowColor="#0f172a"
                                                        shadowBlur={4 / drawingScale}
                                                        shadowOpacity={0.18}
                                                    />
                                                    {/* Drill hole dots */}
                                                    {Array.from({ length: holes }).map((_, k) => (
                                                        <Circle key={`hw-h-${k}`} x={startX + k * gap} y={midY} radius={2.5} fill={pal.c} listening={false} />
                                                    ))}
                                                    {/* Cutout notch boxes */}
                                                    {Array.from({ length: cuts }).map((_, k) => (
                                                        <Rect key={`hw-c-${k}`} x={startX + (holes + k) * gap - 2.5} y={midY - 2.5} width={5} height={5} stroke={pal.c} strokeWidth={1.4 / drawingScale} fill={pal.badgeBg} listening={false} />
                                                    ))}

                                                    {showHardwareCalloutCodes && (
                                                        <>
                                                            <Rect
                                                                x={(mw / 2) - (15 / drawingScale)}
                                                                y={mh + (3 / drawingScale)}
                                                                width={30 / drawingScale}
                                                                height={16 / drawingScale}
                                                                fill={pal.c}
                                                                cornerRadius={4 / drawingScale}
                                                                shadowColor="#000000"
                                                                shadowBlur={2 / drawingScale}
                                                                shadowOpacity={0.2}
                                                                listening={false}
                                                            />
                                                            <Text
                                                                x={(mw / 2) - (15 / drawingScale)}
                                                                y={mh + (5 / drawingScale)}
                                                                width={30 / drawingScale}
                                                                text={codeTag}
                                                                fontSize={10 / drawingScale}
                                                                fill="#ffffff"
                                                                fontStyle="bold"
                                                                align="center"
                                                                listening={false}
                                                            />
                                                        </>
                                                    )}
                                                </Group>
                                            );
                                        })()}
                                        {/* Selection highlight border */}
                                        {isSelected && (() => {
                                            let w = shape.width || 20;
                                            let h = shape.height || 20;
                                            if (shape.hardwareItemId) { w = 30; h = 30; }
                                            else if (shape.accessoryType === 'lock') { w = 25; h = 25; }
                                            else if (shape.accessoryType === 'connector') { w = 40; h = 20; }
                                            else if (shape.accessoryType === 'hinge') { w = 30; h = 25; }
                                            else if (shape.accessoryType === 'profile') { w = shape.width || 120; h = 10; }
                                            return (
                                                <Rect
                                                    x={-2}
                                                    y={-2}
                                                    width={w + 4}
                                                    height={h + 4}
                                                    stroke="#3b82f6"
                                                    strokeWidth={1.5 / drawingScale}
                                                    dash={[2, 2]}
                                                    listening={false}
                                                />
                                            );
                                        })()}
                                    </Group>
                                );
                            })}
                            
                            {/* Transformer for Resizing */}
                            {selectedShapeIds.length === 1 && selectedShapeId && (
                                <Transformer
                                    ref={trRef}
                                    boundBoxFunc={(oldBox, newBox) => {
                                        // limit resize
                                        if (newBox.width < 10 || newBox.height < 10) {
                                            return oldBox;
                                        }
                                        return newBox;
                                    }}
                                />
                            )}
                        </Layer>
                    </Stage>
                        </section>
                        <section style={{ minWidth: 0, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                            <div style={{ height: '34px', display: 'flex', alignItems: 'center', padding: '0 0.65rem', borderBottom: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                                Holes and cuts
                            </div>
                            <Stage
                                width={stageViewportWidth}
                                height={stageViewportHeight}
                                scaleX={drawingScale}
                                scaleY={drawingScale}
                            >
                                <Layer>
                                    <Rect x={0} y={0} width={stageLogicalWidth} height={stageLogicalHeight} fill="#f8fafc" listening={false} />
                                    {Array.from({ length: gridColumnCount }).map((_, i) => (
                                        <Rect key={`fab-grid-v-${i}`} x={i * 20} y={0} width={1} height={stageLogicalHeight} fill={i % 5 === 0 ? 'rgba(71,85,105,0.14)' : 'rgba(71,85,105,0.05)'} listening={false} />
                                    ))}
                                    {Array.from({ length: gridRowCount }).map((_, i) => (
                                        <Rect key={`fab-grid-h-${i}`} x={0} y={i * 20} width={stageLogicalWidth} height={1} fill={i % 5 === 0 ? 'rgba(71,85,105,0.14)' : 'rgba(71,85,105,0.05)'} listening={false} />
                                    ))}

                                    {activePieceShapes.filter(shape =>
                                        shape.type === 'glass_rect'
                                        || shape.type === 'glass_circle'
                                        || shape.type === 'glass_polygon'
                                        || shape.type === 'glass_parallelogram'
                                    ).map(shape => {
                                        const common = {
                                            x: shape.x,
                                            y: shape.y,
                                            fill: 'rgba(14, 165, 233, 0.06)',
                                            stroke: '#475569',
                                            strokeWidth: 1.5 / drawingScale,
                                            listening: false,
                                        };
                                        if (shape.type === 'glass_circle') {
                                            return <Group key={`fab-${shape.id}`}><Circle {...common} radius={shape.radius} />{renderCircleDimensions(shape, drawingScale)}</Group>;
                                        }
                                        if (shape.type === 'glass_polygon') {
                                            return <Group key={`fab-${shape.id}`}><Line {...common} points={shape.points || getPolygonPoints(shape.sides || 4, shape.width || 100, shape.height || 100)} closed /></Group>;
                                        }
                                        if (shape.type === 'glass_parallelogram') {
                                            const width = shape.width || 100;
                                            const height = shape.height || 100;
                                            const skew = shape.skewX || 0;
                                            return <Group key={`fab-${shape.id}`}><Line {...common} points={[0, 0, width, 0, width + skew, height, skew, height]} closed />{renderParallelogramDimensions(width, height, skew, drawingScale)}</Group>;
                                        }
                                        return <Group key={`fab-${shape.id}`}><Rect {...common} width={shape.width} height={shape.height} />{renderRectDimensions(shape, drawingScale, !hasSiblingToTheRight(shape, activePieceShapes))}</Group>;
                                    })}

                                    {activePieceShapes.filter(shape => shape.type === 'hole' || shape.type === 'cut').map(shape => {
                                        const needsReview = shape.positionSource === 'estimated-fallback';
                                        const stroke = needsReview ? '#d97706' : '#dc2626';
                                        if (shape.type === 'hole') {
                                            const radius = Math.max(shape.radius || 0, 9 / drawingScale);
                                            return (
                                                <Group key={`fab-${shape.id}`} listening={false}>
                                                    <Circle x={shape.x} y={shape.y} radius={radius} fill="rgba(220,38,38,0.18)" stroke={stroke} strokeWidth={2 / drawingScale} />
                                                    <Line points={[shape.x - radius, shape.y, shape.x + radius, shape.y]} stroke={stroke} strokeWidth={1 / drawingScale} />
                                                    <Line points={[shape.x, shape.y - radius, shape.x, shape.y + radius]} stroke={stroke} strokeWidth={1 / drawingScale} />
                                                    {showFabricationHoleSizeLabels && (
                                                        <Text x={shape.x - 45 / drawingScale} y={shape.y + radius + 4 / drawingScale} width={90 / drawingScale} text={`Ø ${formatInchesFraction((shape.radius || 0) * 2)}"`} fontSize={11 / drawingScale} fill={stroke} fontStyle="bold" align="center" />
                                                    )}
                                                </Group>
                                            );
                                        }
                                        const width = Math.max(shape.width || 0, 18 / drawingScale);
                                        const height = Math.max(shape.height || 0, 18 / drawingScale);
                                        const centerX = shape.x + (shape.width || 0) / 2;
                                        const centerY = shape.y + (shape.height || 0) / 2;
                                        return (
                                            <Group key={`fab-${shape.id}`} listening={false}>
                                                <Rect x={centerX - width / 2} y={centerY - height / 2} width={width} height={height} fill="rgba(37,99,235,0.16)" stroke={stroke} strokeWidth={2 / drawingScale} dash={[4 / drawingScale, 3 / drawingScale]} />
                                                <Text x={centerX - 55 / drawingScale} y={centerY + height / 2 + 4 / drawingScale} width={110 / drawingScale} text={`${formatInchesFraction(shape.width || 0)}" x ${formatInchesFraction(shape.height || 0)}"`} fontSize={11 / drawingScale} fill={stroke} fontStyle="bold" align="center" />
                                            </Group>
                                        );
                                    })}

                                    {fittingGlassPrep.holes.map(h => {
                                        const radius = Math.max(h.radius, 9 / drawingScale);
                                        return (
                                            <Group key={`fab-prep-${h.key}`} listening={false}>
                                                <Circle x={h.x} y={h.y} radius={radius} fill="rgba(220,38,38,0.18)" stroke="#dc2626" strokeWidth={2 / drawingScale} />
                                                <Line points={[h.x - radius, h.y, h.x + radius, h.y]} stroke="#dc2626" strokeWidth={1 / drawingScale} />
                                                <Line points={[h.x, h.y - radius, h.x, h.y + radius]} stroke="#dc2626" strokeWidth={1 / drawingScale} />
                                                {showFabricationHoleSizeLabels && (
                                                    <Text x={h.x - 45 / drawingScale} y={h.y + radius + 4 / drawingScale} width={90 / drawingScale} text={`Ø ${formatInchesFraction(h.radius * 2)}"`} fontSize={11 / drawingScale} fill="#b91c1c" fontStyle="bold" align="center" />
                                                )}
                                            </Group>
                                        );
                                    })}
                                    {fittingGlassPrep.cuts.map(c => {
                                        const centerX = c.x + c.width / 2;
                                        const centerY = c.y + c.height / 2;
                                        const width = Math.max(c.width, 18 / drawingScale);
                                        const height = Math.max(c.height, 18 / drawingScale);
                                        return (
                                            <Group key={`fab-prep-${c.key}`} listening={false}>
                                                <Rect x={centerX - width / 2} y={centerY - height / 2} width={width} height={height} fill="rgba(37,99,235,0.16)" stroke="#1d4ed8" strokeWidth={2 / drawingScale} dash={[4 / drawingScale, 3 / drawingScale]} />
                                                {showFabricationCutSizeLabels && (
                                                    <Text x={centerX - width / 2 - 114 / drawingScale} y={centerY - 6 / drawingScale} width={110 / drawingScale} text={`${formatInchesFraction(c.width)}" x ${formatInchesFraction(c.height)}"`} fontSize={11 / drawingScale} fill="#1d4ed8" fontStyle="bold" align="right" />
                                                )}
                                            </Group>
                                        );
                                    })}
                                </Layer>
                            </Stage>
                        </section>
                        </div>
                    )}
                </div>

                {/* Hardware Callout Schedule Legend Bar */}
                {hardwareLegend.length > 0 && (
                    <div style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '0.65rem 0.9rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                🏷️ Hardware Schedule Legend ({hardwareLegend.length} fittings)
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Click item to select on 2D drawing</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                            {hardwareLegend.map((item: any) => {
                                const at = item.accessoryType;
                                const badgeColor = at === 'hinge' ? '#1d4ed8' : at === 'lock' ? '#b91c1c' : at === 'profile' ? '#6d28d9' : '#047857';
                                const isSelected = selectedShapeIds.includes(item.id);
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedShapeIds([item.id])}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            background: isSelected ? '#eff6ff' : '#f8fafc',
                                            border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            padding: '0.3rem 0.65rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <span style={{
                                            background: badgeColor,
                                            color: '#ffffff',
                                            fontWeight: 700,
                                            fontSize: '0.72rem',
                                            padding: '1px 5px',
                                            borderRadius: '4px'
                                        }}>
                                            {item.code}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                                            {item.name}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            ({item.pieceName})
                                        </span>
                                        {item.predictionReason && (
                                            <span
                                                title={item.predictionReason}
                                                style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}
                                            >
                                                Predicted {Math.round((Number(item.predictionConfidence) || 0) * 100)}%
                                            </span>
                                        )}
                                        {(item.holes > 0 || item.cuts > 0) && (
                                            <span style={{ fontSize: '0.68rem', background: '#e2e8f0', color: '#334155', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                                {item.holes}H {item.cuts}C
                                            </span>
                                        )}
                                        {item.rate ? (
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>
                                                ₹{Number(item.rate).toFixed(2)}
                                            </span>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {showSystemModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto', padding: '1.4rem' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem' }}>Generate from system type</h2>
                        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
                            Places all hardware at standard positions, using your stocked fittings. Review and adjust on the canvas after.
                        </p>

                        <div style={{ display: 'grid', gap: '0.8rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>System type</label>
                                    <select className="input" style={{ width: '100%' }} value={systemInput.systemType}
                                        onChange={e => setSystemInput(s => ({ ...s, systemType: e.target.value as GlassSystemType }))}>
                                        <optgroup label="Shower Enclosures">
                                            <option value="shower_door">Single Shower Door</option>
                                            <option value="shower_inline_3pc">3-Piece Inline Shower (Fixed + Door + Fixed)</option>
                                            <option value="corner_shower_90">90° Corner Shower Enclosure (2-Piece)</option>
                                            <option value="shower_corner_90_3pc">90° Corner Shower Enclosure (3-Piece)</option>
                                            <option value="corner_shower_135">135° Neo-Angle Shower Enclosure (3-Piece)</option>
                                            <option value="shower_sliding_2pc">Frameless Sliding Shower System</option>
                                        </optgroup>
                                        <optgroup label="Commercial & Interior Doors">
                                            <option value="swing_door">Single Swing / Pivot Glass Door</option>
                                            <option value="patch_double_door">Double Patch-Fitting Doors</option>
                                            <option value="basic">B - Basic / Block Glass</option>
                                            <option value="fixed_panel_f">F - Fixed Panel with L Connectors</option>
                                            <option value="sfsd">SFSD - Single Fixed + Single Door</option>
                                            <option value="dfsd">DFSD - Double Fixed + Single Door</option>
                                            <option value="sfdd">SFDD - Single Fixed + Double Door</option>
                                            <option value="dfdd">DFDD - Double Fixed + Double Door</option>
                                            <option value="double_swing_transom_3pc">Double Swing Door with Transom (3-Piece)</option>
                                            <option value="door_with_transom">Swing Door with Overpanel Transom</option>
                                            <option value="office_partition_3pc">Office Glass Partition (3-Piece Modular)</option>
                                            <option value="double_door_transom_sidelites_4pc">Entrance System (Double Door + Transom + Sidelites)</option>
                                            <option value="top_hung_sliding">Top-Hung Barn Slider Door</option>
                                            <option value="sliding_door">Sliding Door with Fixed Panel</option>
                                            <option value="sliding_4pc_patio">4-Panel Folding/Patio Sliding System</option>
                                        </optgroup>
                                        <optgroup label="Structural & Balustrades">
                                            <option value="fixed_panel">Standard Fixed Partition Panel</option>
                                            <option value="spider_facade">Spider Structural Glass Facade (Single Panel)</option>
                                            <option value="spider_facade_4pc">4-Panel Structural Spider Glass Curtain Wall</option>
                                            <option value="railing">Glass Balustrade (Base Channel)</option>
                                            <option value="balustrade_spigots">Spigot Glass Balustrade (Single Panel)</option>
                                            <option value="balustrade_spigots_3pc">3-Panel Glass Balustrade (Heavy Duty Spigots)</option>
                                        </optgroup>
                                    </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>Quick Preset Dimensions</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                    {[
                                        { label: 'Door 30×78"', w: 30, h: 78, t: 10 },
                                        { label: 'Shower 36×72"', w: 36, h: 72, t: 10 },
                                        { label: 'Entrance 72×96"', w: 72, h: 96, t: 12 },
                                        { label: 'Balustrade 48×42"', w: 48, h: 42, t: 12 },
                                        { label: 'Patio 120×96"', w: 120, h: 96, t: 12 }
                                    ].map(preset => (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => setSystemInput(s => ({ ...s, widthIn: preset.w, heightIn: preset.h, thickness: preset.t }))}
                                            style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '5px',
                                                border: '1px solid #cbd5e1',
                                                background: '#f8fafc',
                                                color: '#334155',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            ⚡ {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Width (in)</label>
                                    <input className="input" type="number" min={6} step={0.125} value={systemInput.widthIn}
                                        onChange={e => setSystemInput(s => ({ ...s, widthIn: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Height (in)</label>
                                    <input className="input" type="number" min={6} step={0.125} value={systemInput.heightIn}
                                        onChange={e => setSystemInput(s => ({ ...s, heightIn: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Thick (mm)</label>
                                    <select className="input" value={systemInput.thickness}
                                        onChange={e => setSystemInput(s => ({ ...s, thickness: parseInt(e.target.value, 10) }))}>
                                        <option value={8}>8</option><option value={10}>10</option><option value={12}>12</option>
                                    </select>
                                </div>
                            </div>

                            {(systemInput.systemType === 'swing_door' || systemInput.systemType === 'shower_door' || systemInput.systemType === 'sliding_door') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{systemInput.systemType === 'sliding_door' ? 'Handle side' : 'Hinge side'}</label>
                                    <select className="input" style={{ width: '100%' }} value={systemInput.hingeSide}
                                        onChange={e => setSystemInput(s => ({ ...s, hingeSide: e.target.value as 'left' | 'right' }))}>
                                        <option value="left">Left</option><option value="right">Right</option>
                                    </select>
                                </div>
                            )}

                            {systemInput.systemType === 'swing_door' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Pivot</label>
                                    <select className="input" style={{ width: '100%' }} value={systemInput.pivotStyle}
                                        onChange={e => setSystemInput(s => ({ ...s, pivotStyle: e.target.value as 'patch' | 'hinges' }))}>
                                        <option value="hinges">Wall hinges</option><option value="patch">Patch + floor spring</option>
                                    </select>
                                </div>
                            )}

                            {(systemInput.systemType === 'fixed_panel' || systemInput.systemType === 'railing') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Fixing</label>
                                    <select className="input" style={{ width: '100%' }} value={systemInput.fixingStyle}
                                        onChange={e => setSystemInput(s => ({ ...s, fixingStyle: e.target.value as 'channel' | 'spider' | 'standoff' }))}>
                                        <option value="channel">Channel (no holes)</option>
                                        {systemInput.systemType === 'fixed_panel' && <option value="spider">Spider bolts</option>}
                                        <option value="standoff">Standoffs</option>
                                    </select>
                                </div>
                            )}

                            {(systemInput.systemType === 'shower_door' || systemInput.systemType === 'sliding_door') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Fixed panel width (in, 0 = none)</label>
                                    <input className="input" type="number" min={0} step={0.5} value={systemInput.fixedPanelWidthIn ?? 0}
                                        onChange={e => setSystemInput(s => ({ ...s, fixedPanelWidthIn: parseFloat(e.target.value) || 0 }))} />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                                {systemInput.systemType !== 'basic' && systemInput.systemType !== 'fixed_panel' && systemInput.systemType !== 'fixed_panel_f' && systemInput.systemType !== 'railing' && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={!!systemInput.hasLock} onChange={e => setSystemInput(s => ({ ...s, hasLock: e.target.checked }))} />
                                        {systemInput.systemType === 'shower_door' ? 'Knob' : 'Lock'}
                                    </label>
                                )}
                                {(systemInput.systemType === 'swing_door' || systemInput.systemType === 'sliding_door') && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={!!systemInput.hasHandle} onChange={e => setSystemInput(s => ({ ...s, hasHandle: e.target.checked }))} />
                                        Handle
                                    </label>
                                )}
                            </div>

                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-subtle, #f8fafb)', padding: '0.55rem 0.7rem', borderRadius: '8px' }}>
                                {describeGlassSystem(systemInput, hardwareItems)}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.2rem' }}>
                            <button className="btn" onClick={() => setShowSystemModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={addGeneratedSystem}>Generate</button>
                        </div>
                    </div>
                </div>
            )}

            {showBOMModal && (() => {
                const bomReport = generateFactoryBOM(pieces, hardwareItems);
                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                        <div className="card" style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '1.4rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Factory Job Card & Bill of Materials (BOM)</h2>
                                <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setShowBOMModal(false)}>✕</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1rem', background: '#f8fafc', padding: '0.8rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                <div><strong>Net Glass Area:</strong> {bomReport.totalGlassAreaSqM} m² ({(bomReport.totalGlassAreaSqM * 10.7639).toFixed(1)} sqft)</div>
                                <div><strong>Total Glass Weight:</strong> {bomReport.totalGlassWeightKg} kg</div>
                                <div><strong>Edge Polishing:</strong> {bomReport.totalPolishingMeters} m</div>
                            </div>

                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '1rem 0 0.4rem', color: '#0369a1' }}>1. Glass Panel Net Cutting Sizes & Deductions</h3>
                            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                                <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                            <th style={{ padding: '0.4rem' }}>Panel Name</th>
                                            <th style={{ padding: '0.4rem' }}>Thickness</th>
                                            <th style={{ padding: '0.4rem' }}>Raw Size (mm)</th>
                                            <th style={{ padding: '0.4rem' }}>Gaps (T/B/L/R)</th>
                                            <th style={{ padding: '0.4rem' }}>Net Size (mm)</th>
                                            <th style={{ padding: '0.4rem' }}>Holes/Cuts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bomReport.jobCards.map((card, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '0.4rem', fontWeight: 600 }}>{card.pieceName}</td>
                                                <td style={{ padding: '0.4rem' }}>{card.thicknessMm} mm</td>
                                                <td style={{ padding: '0.4rem' }}>{card.rawWidthMm} × {card.rawHeightMm}</td>
                                                <td style={{ padding: '0.4rem', color: '#64748b' }}>-{card.deductions.topGapMm}/-{card.deductions.bottomGapMm}/-{card.deductions.hingeSideGapMm}/-{card.deductions.lockSideGapMm} mm</td>
                                                <td style={{ padding: '0.4rem', fontWeight: 700, color: '#166534' }}>{card.netWidthMm} × {card.netHeightMm}</td>
                                                <td style={{ padding: '0.4rem' }}>{card.holesCount} h / {card.cutsCount} c</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '1rem 0 0.4rem', color: '#d97706' }}>2. Hardware Itemized Bill of Materials (BOM)</h3>
                            {bomReport.hardwareBOM.length === 0 ? (
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No hardware accessories attached yet.</p>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#fef3c7', color: '#92400e' }}>
                                                <th style={{ padding: '0.4rem' }}>Item Description</th>
                                                <th style={{ padding: '0.4rem' }}>Role</th>
                                                <th style={{ padding: '0.4rem' }}>Qty</th>
                                                <th style={{ padding: '0.4rem' }}>Rate (₹)</th>
                                                <th style={{ padding: '0.4rem' }}>Amount (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bomReport.hardwareBOM.map((hw, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                    <td style={{ padding: '0.4rem', fontWeight: 600 }}>{hw.name}</td>
                                                    <td style={{ padding: '0.4rem', color: '#64748b' }}>{hw.role}</td>
                                                    <td style={{ padding: '0.4rem' }}>{hw.quantity}</td>
                                                    <td style={{ padding: '0.4rem' }}>₹{hw.estimatedRate}</td>
                                                    <td style={{ padding: '0.4rem', fontWeight: 700 }}>₹{hw.totalAmount}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.2rem' }}>
                                <button className="btn btn-primary" onClick={() => setShowBOMModal(false)}>Close</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
