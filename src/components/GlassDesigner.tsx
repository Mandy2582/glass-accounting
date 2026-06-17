'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Square, Circle as CircleIcon, Move, Layers, RotateCcw, Upload, Images } from 'lucide-react';
import { generateUUID, formatInchesToFraction, parseFractionToInches } from '@/lib/utils';
import { roundToNextEvenInch } from '@/lib/designCalculations';
import { Stage, Layer, Rect, Circle, Transformer, Group, Text, Line, Arrow } from 'react-konva';
import { db } from '@/lib/storage';
import { GlassItem } from '@/types';

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
    
    const offset = 22 / drawingScale;
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

        const offset = 70 / drawingScale; // 7 inches scaled – doubled for hole clearance
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

// Render dimensions for rectangle shapes with split line & central text
const renderRectDimensions = (shape: KonvaShape, scale: number = 1): React.ReactNode => {
    const width = shape.width || 0;
    const height = shape.height || 0;
    
    const textGap = 44 / scale;
    const arrowOffset = 44 / scale;
    const dimensionColor = '#2563eb';
    const extensionColor = '#93c5fd';
    
    // Horizontal dim line above the glass
    const cx = shape.x + width / 2;
    const cy = shape.y - arrowOffset;
    const hLineHalf = Math.max(width / 2, 30 / scale);
    
    // Vertical dim line to the right of the glass
    const hcx = shape.x + width + arrowOffset;
    const hcy = shape.y + height / 2;
    const vLineHalf = Math.max(height / 2, 30 / scale);
    
    const textFontSize = 14 / scale;
    const labelWidth = 86 / scale;
    const labelHeight = 24 / scale;
    const showWidthSplit = width > 110 / scale;
    const wText = `${formatInchesFraction(width)}"`;
    
    const showHeightSplit = height > 110 / scale;
    const hText = `${formatInchesFraction(height)}"`;

    return (
        <Group>
            <Line points={[shape.x, shape.y, shape.x, cy]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
            <Line points={[shape.x + width, shape.y, shape.x + width, cy]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
            <Line points={[shape.x + width, shape.y, hcx, shape.y]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
            <Line points={[shape.x + width, shape.y + height, hcx, shape.y + height]} stroke={extensionColor} strokeWidth={1.2 / scale} listening={false} />
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
                stroke="#bfdbfe"
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
                fill="#1d4ed8"
                align="center"
                width={labelWidth}
                offsetY={1 / scale}
                listening={false}
            />

            {/* Vertical Dimension (Height) */}
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
                stroke="#bfdbfe"
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
                fill="#1d4ed8"
                align="center"
                width={labelWidth}
                offsetY={1 / scale}
                listening={false}
            />
        </Group>
    );
};

// Render dimensions for circle shapes with split line & central text
const renderCircleDimensions = (shape: KonvaShape, scale: number = 1): React.ReactNode => {
    const radius = shape.radius || 0;
    const diameter = radius * 2;
    
    const textGap = 44 / scale;
    const lineHalf = radius;
    const dimensionColor = '#2563eb';
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
                stroke="#bfdbfe"
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
                fill="#1d4ed8"
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


interface KonvaShape {
    id: string;
    type: 'glass_rect' | 'glass_circle' | 'hole' | 'cut' | 'glass_polygon' | 'glass_parallelogram' | 'accessory';
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    sides?: number;
    points?: number[];
    skewX?: number;
    accessoryType?: 'lock' | 'connector' | 'hinge' | 'profile';
    accessoryName?: string;
    parentId?: string;
    hardwareItemId?: string;
    accessoryRate?: number;
    accessoryHoleCount?: number;
    accessoryCutCount?: number;
    accessoryHoleRadiusIn?: number;
    accessoryCutAreaSqIn?: number;
    accessoryRequirementLabel?: string;
}

interface GlassPiece {
    id: string;
    name: string;
    type: string;
    thickness: number;
    quantity?: number;
    shapes: KonvaShape[];
}

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

    const selectedShapeId = selectedShapeIds.length > 0 ? selectedShapeIds[selectedShapeIds.length - 1] : null;
    const setSelectedShapeId = (id: string | null) => {
        setSelectedShapeIds(id ? [id] : []);
    };
    const [drawingScale, setDrawingScale] = useState<number>(0.3); // Scale: default 30% keeps common glass pieces inside one viewport
    const [localInputs, setLocalInputs] = useState<Record<string, string>>({});
    const [focusedField, setFocusedField] = useState<string | null>(null);
    const [polygonSideSpecs, setPolygonSideSpecs] = useState<string[]>(['15', '15', '15', '15']);
    const [fixedCorners, setFixedCorners] = useState<boolean[]>([true, false, false, false]); // Corner 1 to 4 fixed status
    const [holeEdge, setHoleEdge] = useState<'top' | 'bottom' | 'left' | 'right' | 'corners'>('top');
    const [holeCountInput, setHoleCountInput] = useState<number | ''>(4);
    const [hardwareItems, setHardwareItems] = useState<GlassItem[]>([]);
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

    // Navigation guard checking for unsaved changes
    const isDirty = initialPiecesJsonRef.current !== '' && JSON.stringify(pieces) !== initialPiecesJsonRef.current;

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

    const updateActivePiece = (updates: Partial<GlassPiece>) => {
        setPieces(pieces.map(p => p.id === activePieceId ? { ...p, ...updates } : p));
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
        let loaded = false;
        if (initialData && initialData.pieces && initialData.pieces.length > 0) {
            // Check if they are old format or new Konva format
            const hasShapes = initialData.pieces[0].shapes !== undefined;
            if (hasShapes) {
                setPieces(initialData.pieces);
                initialPiecesJsonRef.current = JSON.stringify(initialData.pieces);
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
                setPieces(migrated);
                initialPiecesJsonRef.current = JSON.stringify(migrated);
            }
            setActivePieceId(initialData.pieces[0].id);
            loaded = true;
        }
        
        if (!loaded) {
            const defaultPiece: GlassPiece = {
                id: generateUUID(),
                name: 'Window 1',
                type: 'Window',
                thickness: 6,
                shapes: [
                    { id: generateUUID(), type: 'glass_rect', x: 100, y: 100, width: 300, height: 200 }
                ]
            };
            setPieces([defaultPiece]);
            initialPiecesJsonRef.current = JSON.stringify([defaultPiece]);
            setActivePieceId(defaultPiece.id);
        }
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

        if (onAreaChange) onAreaChange(totalGrossSqFt, totalNetSqFt);
        if (onItemsChange) onItemsChange(mappedItems);
        if (onDesignChange) {
            onDesignChange({
                pieces,
                holes: globalHoleCount,
                cuts: globalCutCount,
            });
        }
    }, [pieces]);


    const updateShape = (shapeId: string, updates: Partial<KonvaShape>) => {
        if (!activePiece) return;
        const newShapes = activePiece.shapes.map(s => s.id === shapeId ? { ...s, ...updates } : s);
        updateActivePiece({ shapes: newShapes });
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

    const selectedShape = pieces.flatMap(p => p.shapes).find(s => s.id === selectedShapeId);
    
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
        const newPiece: GlassPiece = {
            id: generateUUID(),
            name: `Piece ${pieces.length + 1}`,
            type: 'Window',
            thickness: 6,
            shapes: [
                { id: generateUUID(), type: 'glass_rect', x: 100, y: 100, width: 300, height: 200 }
            ]
        };
        setPieces([...pieces, newPiece]);
        setActivePieceId(newPiece.id);
    };

    const addPresetPiece = (preset: DesignPreset) => {
        saveHistory();
        const presetPieces = preset.createPieces ? preset.createPieces() : preset.createPiece ? [preset.createPiece()] : [];
        const newPieces: GlassPiece[] = presetPieces.map(piece => ({
            id: generateUUID(),
            ...piece
        }));
        if (newPieces.length === 0) return;
        setPieces([...pieces, ...newPieces]);
        setActivePieceId(newPieces[0].id);
        setSelectedShapeId(null);
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
        const generatedPieces: GlassPiece[] = readyDrafts.map((draft, index) => ({
            id: generateUUID(),
            name: draft.pieceName || `Photo Piece ${index + 1}`,
            type: draft.type || 'Window',
            thickness: draft.thickness || 10,
            quantity: 1,
            shapes: [createRectShape(draft.widthIn, draft.heightIn)]
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

    const findParentShape = () => {
        if (!activePiece) return null;
        const selectedParent = activePiece.shapes.find(s => selectedShapeIds.includes(s.id) && (s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram'));
        if (selectedParent) return selectedParent;
        return activePiece.shapes.find(s => s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram') || null;
    };

    const addShape = (type: 'glass_rect' | 'glass_circle' | 'hole' | 'cut' | 'glass_polygon' | 'glass_parallelogram') => {
        saveHistory();
        if (!activePiece) return;
        
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
        
        updateActivePiece({ shapes: [...activePiece.shapes, newShape] });
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
        if (!activePiece) return;
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
        
        updateActivePiece({ shapes: [...activePiece.shapes, newShape] });
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

    if (!activePiece) return <div>Loading designer...</div>;

    const stageViewportWidth = 920;
    const stageViewportHeight = 560;
    const stageLogicalWidth = Math.ceil(stageViewportWidth / drawingScale);
    const stageLogicalHeight = Math.ceil(stageViewportHeight / drawingScale);
    const gridColumnCount = Math.ceil(stageLogicalWidth / 20) + 1;
    const gridRowCount = Math.ceil(stageLogicalHeight / 20) + 1;

    return (
        <div className="designer-shell" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Tabs */}
            <div className="designer-piece-tabs" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.35rem', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
                {pieces.map(piece => (
                    <div key={piece.id} style={{ display: 'flex', alignItems: 'center', background: activePieceId === piece.id ? 'var(--color-primary)' : 'var(--color-bg)', borderRadius: '4px', border: activePieceId === piece.id ? 'none' : '1px solid var(--color-border)' }}>
                        <button
                            className={`btn ${activePieceId === piece.id ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActivePieceId(piece.id)}
                            style={{ padding: '0.5rem 1rem', border: 'none', background: 'transparent', color: activePieceId === piece.id ? 'white' : 'inherit' }}
                        >
                            {piece.name}
                        </button>
                        {pieces.length > 1 && (
                            <button
                                onClick={() => removePiece(piece.id)}
                                style={{ padding: '0.5rem', color: activePieceId === piece.id ? '#fca5a5' : '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                title="Delete Piece"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                ))}
                <button className="btn btn-secondary" onClick={addPiece} title="Add New Piece" style={{ padding: '0.5rem' }}>
                    <Plus size={16} /> Add Piece
                </button>
                <button 
                    className="btn btn-secondary" 
                    onClick={undo} 
                    disabled={history.length === 0} 
                    title="Undo Last Action" 
                    style={{ 
                        padding: '0.5rem 1rem', 
                        marginLeft: 'auto', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.25rem', 
                        opacity: history.length === 0 ? 0.5 : 1, 
                        cursor: history.length === 0 ? 'not-allowed' : 'pointer' 
                    }}
                >
                    <RotateCcw size={16} /> Undo
                </button>
            </div>

            <div className="designer-workspace">
                <aside className="designer-side-panel">
                <section className="designer-photo-import">
                    <div className="designer-photo-import-header">
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Bulk From Photos</h3>
                        </div>
                        <label className="btn btn-secondary designer-upload-button">
                            <Upload size={16} /> Upload photos
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    handlePhotoUpload(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    </div>

                    {photoDrafts.length === 0 ? (
                        <div className="designer-photo-empty">
                            <Images size={18} />
                            <span>No photos added</span>
                        </div>
                    ) : (
                        <>
                            <div className="designer-photo-grid">
                                {photoDrafts.map(draft => (
                                    <div className="designer-photo-card" key={draft.id}>
                                        <img src={draft.previewUrl} alt={draft.fileName} />
                                        <div className="designer-photo-fields">
                                            <input
                                                className="input"
                                                value={draft.pieceName}
                                                placeholder="Piece name"
                                                onChange={e => updatePhotoDraft(draft.id, { pieceName: e.target.value })}
                                            />
                                            <div className="designer-photo-field-row">
                                                <input
                                                    className="input"
                                                    value={draft.width}
                                                    placeholder="Width inches"
                                                    onChange={e => updatePhotoDraft(draft.id, { width: e.target.value })}
                                                />
                                                <input
                                                    className="input"
                                                    value={draft.height}
                                                    placeholder="Height inches"
                                                    onChange={e => updatePhotoDraft(draft.id, { height: e.target.value })}
                                                />
                                            </div>
                                            <div className="designer-photo-field-row">
                                                <select
                                                    className="input"
                                                    value={draft.type}
                                                    onChange={e => updatePhotoDraft(draft.id, { type: e.target.value })}
                                                >
                                                    <option value="Window">Window</option>
                                                    <option value="Door">Door</option>
                                                    <option value="Partition">Partition</option>
                                                    <option value="Table Top">Table Top</option>
                                                    <option value="Shelf">Shelf</option>
                                                </select>
                                                <select
                                                    className="input"
                                                    value={draft.thickness}
                                                    onChange={e => updatePhotoDraft(draft.id, { thickness: Number(e.target.value) })}
                                                >
                                                    <option value={4}>4mm</option>
                                                    <option value={5}>5mm</option>
                                                    <option value={6}>6mm</option>
                                                    <option value={8}>8mm</option>
                                                    <option value={10}>10mm</option>
                                                    <option value={12}>12mm</option>
                                                </select>
                                            </div>
                                            <button type="button" className="btn btn-secondary" onClick={() => removePhotoDraft(draft.id)}>
                                                <Trash2 size={14} /> Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="designer-photo-actions">
                                <button type="button" className="btn btn-primary" onClick={createPiecesFromPhotos}>
                                    <Plus size={16} /> Create drawings from photos
                                </button>
                                <span>{photoDrafts.length} uploaded photo{photoDrafts.length === 1 ? '' : 's'}</span>
                            </div>
                        </>
                    )}
                </section>

                {/* Horizontal Toolbar / Menu */}
                {activePiece && (
                    <div className="designer-toolbar" style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.38rem', 
                        background: 'var(--color-bg)', 
                        padding: '0.52rem', 
                        borderRadius: '8px', 
                        border: '1px solid var(--color-border)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        {/* Row 1: Piece Settings */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', alignItems: 'end', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.35rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Piece Name</label>
                                <input type="text" className="input" style={{ width: '100%' }} value={activePiece.name} onChange={e => updateActivePiece({ name: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Type</label>
                                <select className="input" style={{ width: '100%' }} value={activePiece.type} onChange={e => updateActivePiece({ type: e.target.value })}>
                                    <option value="Window">Window</option>
                                    <option value="Door">Door</option>
                                    <option value="Partition">Partition</option>
                                    <option value="Table Top">Table Top</option>
                                    <option value="Mirror">Mirror</option>
                                    <option value="Shelf">Shelf</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Thickness</label>
                                <select className="input" style={{ width: '100%' }} value={activePiece.thickness} onChange={e => updateActivePiece({ thickness: Number(e.target.value) })}>
                                    <option value={4}>4mm</option>
                                    <option value={5}>5mm</option>
                                    <option value={6}>6mm</option>
                                    <option value={8}>8mm</option>
                                    <option value={10}>10mm</option>
                                    <option value={12}>12mm</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Quantity</label>
                                <input 
                                    type="number" 
                                    className="input" 
                                    style={{ width: '100%' }}
                                    min={1} 
                                    value={activePiece.quantity !== undefined ? activePiece.quantity : ''} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === '') {
                                            updateActivePiece({ quantity: '' as any });
                                        } else {
                                            const parsed = parseInt(val);
                                            updateActivePiece({ quantity: isNaN(parsed) ? '' as any : parsed });
                                        }
                                    }} 
                                    onBlur={() => {
                                        if (!activePiece.quantity || activePiece.quantity < 1) {
                                            updateActivePiece({ quantity: 1 });
                                        }
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Predefined Design</label>
                                <select
                                    className="input"
                                    style={{ width: '100%' }}
                                    value=""
                                    onChange={(e) => {
                                        const preset = DESIGN_PRESETS.find(item => item.id === e.target.value);
                                        if (preset) addPresetPiece(preset);
                                        e.target.value = '';
                                    }}
                                >
                                    <option value="" disabled>Select predefined design...</option>
                                    {DESIGN_PRESETS.map(preset => (
                                        <option key={preset.id} value={preset.id}>
                                            {preset.name} - {preset.dimensions}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Add Tools & Accessories */}
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr',
                            gap: '0.65rem', 
                            alignItems: 'flex-end', 
                            borderBottom: selectedShapeId ? '1px solid var(--color-border)' : 'none', 
                            paddingBottom: selectedShapeId ? '0.45rem' : '0' 
                        }}>
                            {/* Add Shapes Dropdown */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Add Shapes</label>
                                <select
                                    className="input"
                                    style={{ width: '100%' }}
                                    value=""
                                    onChange={(e) => {
                                        const shapeType = e.target.value;
                                        if (shapeType) {
                                            addShape(shapeType as any);
                                        }
                                        e.target.value = ""; // Reset dropdown
                                    }}
                                >
                                    <option value="" disabled>Select Shape to Add...</option>
                                    <option value="glass_rect">Glass (Rectangle)</option>
                                    <option value="glass_circle">Circle</option>
                                    <option value="hole">Hole</option>
                                    <option value="cut">Cut</option>
                                    <option value="glass_polygon">Irregular Polygon (4 Sides)</option>
                                    <option value="glass_parallelogram">Parallelogram</option>
                                </select>
                            </div>

                            {/* Add Hardware Dropdown */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Place Hardware</label>
                                <select
                                    className="input"
                                    style={{ width: '100%' }}
                                    value=""
                                    onChange={(e) => {
                                        const val = e.target.value;
	                                        if (!val) return;
	                                        if (val === 'lock' || val === 'connector' || val === 'hinge' || val === 'profile') {
	                                            addAccessory(val);
	                                        } else if (val.startsWith('hardware:')) {
	                                            const hardware = hardwareItems.find(item => item.id === val.replace('hardware:', ''));
	                                            if (hardware) {
	                                                addAccessory(inferAccessoryType(hardware), hardware);
	                                            }
	                                        }
	                                        e.target.value = ""; // Reset select
	                                    }}
	                                >
	                                    <option value="" disabled>Choose catalogue hardware or marker...</option>
		                                    {hardwareItems.length > 0 && (
		                                        <optgroup label="Catalogue hardware">
		                                            {hardwareItems.map(item => {
                                                        const hardwareType = inferAccessoryType(item);
                                                        const requirement = getHardwareRequirement(hardwareType, item);
                                                        return (
                                                            <option key={item.id} value={`hardware:${item.id}`}>
                                                                {item.name}{item.make ? ` - ${item.make}` : ''}{item.model ? ` ${item.model}` : ''} - {requirement.label} (₹{Number(item.rate || 0).toFixed(2)})
                                                            </option>
                                                        );
                                                    })}
		                                        </optgroup>
		                                    )}
	                                    <optgroup label="Placement marker - choose catalogue later">
	                                        <option value="lock">Lock position</option>
	                                        <option value="connector">L-Connector position</option>
	                                        <option value="hinge">Hinge position</option>
	                                        <option value="profile">Profile/channel position</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>

                        {activePiece.shapes.some(shape => shape.type === 'accessory') && (
                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.5rem',
                                alignItems: 'center',
                                padding: '0.65rem 0.75rem',
                                borderRadius: '8px',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.18)'
                            }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e' }}>
                                    Hardware positions:
                                </span>
	                                {activePiece.shapes
	                                    .filter(shape => shape.type === 'accessory')
                                        .map(shape => (
	                                    <span key={shape.id} className="badge badge-warning" style={{ fontSize: '0.68rem' }}>
	                                        {shape.accessoryName || shape.accessoryType || 'Hardware'} ({shape.accessoryRequirementLabel || 'holes/cuts'})
	                                    </span>
	                                ))}
                            </div>
                        )}

                        {/* Row 3: Edit Selected Shape (Contextual) */}
                        {selectedShapeIds.length > 0 && (() => {
                            const shape = activePiece.shapes.find(s => s.id === selectedShapeId);
                            if (!shape) return null;
                            return (
                                <div style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    gap: '0.5rem', 
                                    background: 'rgba(59, 130, 246, 0.04)', 
                                    border: '1px solid rgba(59, 130, 246, 0.15)', 
                                    padding: '0.75rem', 
                                    borderRadius: '6px',
                                    marginTop: '0.25rem'
                                }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                                            {selectedShapeIds.length > 1 
                                                ? `Selected: ${selectedShapeIds.length} items` 
                                                : `Edit: ${shape.type.replace('glass_', '').toUpperCase()}`}
                                        </span>
                                        
                                        {selectedShapeIds.length === 1 && (
                                            <>
                                                {shape.type === 'glass_polygon' ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                                                        {(() => {
                                                            const sideNames = ["Left Edge", "Top Edge", "Right Edge", "Bottom Edge"];
                                                            const pts = shape.points || getPolygonPoints(shape.sides || 4, shape.width || 100, shape.height || 100);
                                                            const numPoints = pts.length / 2;
                                                            const inputs = [];
                                                            for (let sIdx = 0; sIdx < numPoints; sIdx++) {
                                                                const key = `poly-side-${sIdx}`;
                                                                const val = polygonSideSpecs[sIdx] !== undefined ? polygonSideSpecs[sIdx] : '';
                                                                
                                                                inputs.push(
                                                                    <div key={`side-input-${sIdx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: 600 }}>{sideNames[sIdx] || `Side ${sIdx + 1}`}:</label>
                                                                        <input 
                                                                            type="text" 
                                                                            className="input" 
                                                                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '75px', height: '28px' }} 
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
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                                                        {shape.width !== undefined && (
                                                            <>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                    <label style={{ fontSize: '0.7rem', fontWeight: 600 }}>W:</label>
                                                                    <input 
                                                                        type="text" 
                                                                        className="input" 
                                                                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '65px', height: '28px' }} 
                                                                        value={localInputs.width || ''} 
                                                                        onFocus={() => { setFocusedField('width'); saveHistory(); }}
                                                                        onBlur={() => setFocusedField(null)}
                                                                        onChange={e => handleInputChange('width', e.target.value)} 
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                    <label style={{ fontSize: '0.7rem', fontWeight: 600 }}>H:</label>
                                                                    <input 
                                                                        type="text" 
                                                                        className="input" 
                                                                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '65px', height: '28px' }} 
                                                                        value={localInputs.height || ''} 
                                                                        onFocus={() => { setFocusedField('height'); saveHistory(); }}
                                                                        onBlur={() => setFocusedField(null)}
                                                                        onChange={e => handleInputChange('height', e.target.value)} 
                                                                    />
                                                                </div>
                                                            </>
                                                        )}
                                                        {shape.radius !== undefined && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                <label style={{ fontSize: '0.7rem', fontWeight: 600 }}>R:</label>
                                                                <input 
                                                                    type="text" 
                                                                    className="input" 
                                                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '65px', height: '28px' }} 
                                                                    value={localInputs.radius || ''} 
                                                                    onFocus={() => { setFocusedField('radius'); saveHistory(); }}
                                                                    onBlur={() => setFocusedField(null)}
                                                                    onChange={e => handleInputChange('radius', e.target.value)} 
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        
                                        {/* Operations */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center', width: '100%' }}>
                                            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: '28px' }} onClick={() => copyShapes(selectedShapeIds)}>
                                                Copy
                                            </button>
                                            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: '28px' }} onClick={pasteShapes} disabled={!copiedShapes || copiedShapes.main.length === 0}>
                                                Paste
                                            </button>
                                            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: '28px' }} onClick={() => duplicateShapes(selectedShapeIds)}>
                                                Duplicate
                                            </button>
                                            <button className="btn" style={{ 
                                                background: '#fef2f2', 
                                                color: '#ef4444', 
                                                border: '1px solid #fca5a5', 
                                                fontSize: '0.75rem', 
                                                padding: '0.2rem 0.5rem', 
                                                height: '28px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem'
                                            }} onClick={() => removeShapes(selectedShapeIds)}>
                                                <Trash2 size={12} /> Delete {selectedShapeIds.length > 1 ? `(${selectedShapeIds.length})` : ''}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Optimization controls & read-only angles (only when single selected shape is glass_polygon) */}
                                    {selectedShapeIds.length === 1 && shape.type === 'glass_polygon' && (
                                        <>
                                            {/* Optimization controls: Fixed Corner selection + Action Button */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem', borderTop: '1px dashed rgba(59, 130, 246, 0.15)', paddingTop: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 600 }}>Fix to 90°:</label>
                                                    {(() => {
                                                        const cornerNames = ["Bottom-Left", "Top-Left", "Top-Right", "Bottom-Right"];
                                                        return [0, 1, 2, 3].map(cIdx => (
                                                            <label key={`fix-corner-${cIdx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', cursor: 'pointer' }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={fixedCorners[cIdx]} 
                                                                    onChange={(e) => {
                                                                        const newFixed = [...fixedCorners];
                                                                        newFixed[cIdx] = e.target.checked;
                                                                        setFixedCorners(newFixed);
                                                                    }}
                                                                />
                                                                {cornerNames[cIdx]}
                                                            </label>
                                                        ));
                                                    })()}
                                                </div>
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: '28px' }}
                                                    onClick={() => {
                                                        const sideLengthsPx = polygonSideSpecs.map(spec => {
                                                            const inches = parseInches(spec);
                                                            return isNaN(inches) || inches <= 0 ? 150 : inches * 10;
                                                        });
                                                        triggerPolygonOptimization(shape.id, sideLengthsPx, fixedCorners);
                                                    }}
                                                >
                                                    Optimize Shape
                                                </button>
                                            </div>
                                            {/* Angles Row (Read Only Display) */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', borderTop: '1px dashed rgba(59, 130, 246, 0.15)', paddingTop: '0.25rem', marginTop: '0.25rem' }}>
                                                {(() => {
                                                    const cornerNames = ["Bottom-Left", "Top-Left", "Top-Right", "Bottom-Right"];
                                                    const pts = shape.points || getPolygonPoints(shape.sides || 4, shape.width || 100, shape.height || 100);
                                                    const centroid = getCentroid(pts);
                                                    const numPoints = pts.length / 2;
                                                    const displayLabels = [];
                                                    for (let i = 0; i < numPoints; i++) {
                                                        const angleInfo = getVertexAngleInfo(pts, i, shape.x, shape.y, centroid, 1);
                                                        if (angleInfo) {
                                                            displayLabels.push(
                                                                <div key={`angle-disp-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{cornerNames[i]}:</span>
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#2563eb' }}>{Math.round(angleInfo.angle)}°</span>
                                                                </div>
                                                            );
                                                        }
                                                    }
                                                    return displayLabels;
                                                })()}
                                            </div>
                                        </>
                                    )}


                                    {/* Auto Hole Aligner Row */}
                                    {selectedShapeIds.length === 1 && (shape.type === 'glass_rect' || shape.type === 'glass_polygon') && (
                                        <div style={{ 
                                            display: 'flex', 
                                            flexWrap: 'wrap', 
                                            alignItems: 'center', 
                                            gap: '0.75rem', 
                                            borderTop: '1px solid rgba(59, 130, 246, 0.1)', 
                                            paddingTop: '0.5rem',
                                            marginTop: '0.25rem'
                                        }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)' }}>Auto Hole Aligner:</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <label style={{ fontSize: '0.65rem' }}>Edge</label>
                                                <select 
                                                    className="input" 
                                                    style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', height: '26px' }} 
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <label style={{ fontSize: '0.65rem' }}>Holes</label>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', height: '26px', width: '50px' }} 
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
                                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', height: '26px' }} 
                                                onClick={() => generateAlignedHoles(holeEdge, holeEdge === 'corners' ? 4 : (typeof holeCountInput === 'number' ? holeCountInput : 2))}
                                            >
                                                Align & Add Holes
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
                </aside>
                <section className="designer-main-panel">

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
                                    const props = {
                                        id: shape.id, x: shape.x, y: shape.y,
                                        fill: 'rgba(59, 130, 246, 0.2)', stroke: '#3b82f6', strokeWidth: 1, draggable: false,
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
                                        <Group key={shape.id}><Rect {...props} width={shape.width} height={shape.height} />{renderRectDimensions(shape, 1)}</Group>
                                    ) : (
                                        <Group key={shape.id}><Circle {...props} radius={shape.radius} />{renderCircleDimensions(shape, 1)}</Group>
                                    );
                                })}

                                {/* Render holes and cuts */}
                                {piece.shapes.filter(s => s.type === 'hole' || s.type === 'cut').map((shape) => {
                                    const isCut = shape.type === 'cut';
                                    const props = { id: shape.id, x: shape.x, y: shape.y, fill: 'rgba(239, 68, 68, 0.35)', stroke: '#ef4444', strokeWidth: 2, dash: [5, 5], draggable: false };
                                    return isCut ? (
                                        <Group key={shape.id}>
                                            <Rect {...props} width={shape.width} height={shape.height} />
                                            <Text x={shape.x + (shape.width || 0) / 2} y={shape.y + (shape.height || 0) / 2} text="C" fill="#ef4444" fontSize={10} fontStyle="bold" align="center" width={60} offsetX={30} offsetY={5} listening={false} />
                                        </Group>
                                    ) : (
                                        <Group key={shape.id}>
                                            <Circle {...props} radius={shape.radius} />
                                            <Text x={shape.x} y={shape.y} text="H" fill="#ef4444" fontSize={10} fontStyle="bold" align="center" width={60} offsetX={30} offsetY={5} listening={false} />
                                        </Group>
                                    );
                                })}
                            </Layer>
                        </Stage>
                    ))}
                </div>

                {/* Canvas Area */}
                <div className="designer-canvas-frame" style={{ 
                    width: '100%', 
                    overflow: 'hidden', 
                    background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)', 
                    borderRadius: '14px', 
                    border: '1px solid rgba(148, 163, 184, 0.35)', 
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 45px rgba(15, 23, 42, 0.08)',
                    padding: '0.65rem',
                    height: `${stageViewportHeight + 22}px` 
                }}>
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
                            <Rect x={0} y={0} width={stageLogicalWidth} height={stageLogicalHeight} fill="#ffffff" listening={false} />
                            {/* Render grid lines */}
                            {Array.from({ length: gridColumnCount }).map((_, i) => (
                                <Rect key={`grid-v-${i}`} x={i * 20} y={0} width={1} height={stageLogicalHeight} fill={i % 5 === 0 ? '#dbeafe' : '#f1f5f9'} listening={false} />
                            ))}
                            {Array.from({ length: gridRowCount }).map((_, i) => (
                                <Rect key={`grid-h-${i}`} x={0} y={i * 20} width={stageLogicalWidth} height={1} fill={i % 5 === 0 ? '#dbeafe' : '#f1f5f9'} listening={false} />
                            ))}

                            {/* Render glass pieces (flat 2D) */}
                            {activePiece.shapes.filter(s => s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram').map((shape) => {
                                const isSelected = selectedShapeIds.includes(shape.id);
                                const isRect = shape.type === 'glass_rect';
                                const isCircle = shape.type === 'glass_circle';
                                const isPolygon = shape.type === 'glass_polygon';
                                const isParallelogram = shape.type === 'glass_parallelogram';

                                const baseProps = {
                                    id: shape.id,
                                    x: shape.x,
                                    y: shape.y,
                                    fill: 'rgba(59, 130, 246, 0.2)',
                                    stroke: '#3b82f6',
                                    strokeWidth: (isSelected ? 3 : 1) / drawingScale,
                                    draggable: true,
                                    onClick: (e: any) => handleShapeClick(shape.id, e),
                                    onTap: (e: any) => handleShapeClick(shape.id, e),
                                    onMouseEnter: handleShapeMouseEnter,
                                    onMouseLeave: handleShapeMouseLeave,
                                    onDragStart: (e: any) => {
                                        saveHistory();
                                        if (e.target.id() === shape.id) {
                                            const children: Array<{ id: string; dx: number; dy: number }> = [];
                                            activePiece.shapes.forEach(s => {
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
                                        updateActivePiece({ shapes: activePiece.shapes.map(s => updates[s.id] ? { ...s, ...updates[s.id] } : s) });
                                    },
                                    onDragEnd: (e: any) => {
                                        const newX = e.target.x(); const newY = e.target.y();
                                        const updates: Record<string, Partial<KonvaShape>> = {};
                                        updates[shape.id] = { x: snapToOctalInch(newX), y: snapToOctalInch(newY) };
                                        childOffsetsRef.current.forEach(child => {
                                            updates[child.id] = { x: snapToOctalInch(newX + child.dx), y: snapToOctalInch(newY + child.dy), parentId: shape.id };
                                        });
                                        updateActivePiece({ shapes: activePiece.shapes.map(s => updates[s.id] ? { ...s, ...updates[s.id] } : s) });
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
                                                    activePiece.shapes.forEach(s => {
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
                                                    updateActivePiece({ shapes: activePiece.shapes.map(s => updates[s.id] ? { ...s, ...updates[s.id] } : s) });
                                                }}
                                                onDragEnd={(e: any) => {
                                                    const nx = snapToOctalInch(e.target.x());
                                                    const ny = snapToOctalInch(e.target.y());
                                                    const updates: Record<string, Partial<KonvaShape>> = {};
                                                    updates[shape.id] = { x: nx, y: ny };
                                                    childOffsetsRef.current.forEach(child => {
                                                        updates[child.id] = { x: snapToOctalInch(nx + child.dx), y: snapToOctalInch(ny + child.dy), parentId: shape.id };
                                                    });
                                                    updateActivePiece({ shapes: activePiece.shapes.map(s => updates[s.id] ? { ...s, ...updates[s.id] } : s) });
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
                                    <Group key={shape.id}><Rect {...baseProps} width={shape.width} height={shape.height} />{renderRectDimensions(shape, drawingScale)}</Group>
                                );
                            })}

                            {/* Render cuts and holes */}
                            {activePiece.shapes.filter(s => s.type === 'hole' || s.type === 'cut').map((shape) => {
                                const isSelected = selectedShapeIds.includes(shape.id);
                                const isCut = shape.type === 'cut';
                                const props = {
                                    id: shape.id, x: shape.x, y: shape.y,
                                    fill: 'rgba(239, 68, 68, 0.35)', stroke: '#ef4444',
                                    strokeWidth: (isSelected ? 3 : 2) / drawingScale,
                                    dash: [5 / drawingScale, 5 / drawingScale],
                                    draggable: true,
                                    onDragStart: (e: any) => saveHistory(),
                                    onTransformStart: (e: any) => saveHistory(),
                                    onClick: (e: any) => handleShapeClick(shape.id, e),
                                    onTap: (e: any) => handleShapeClick(shape.id, e),
                                    onMouseEnter: handleShapeMouseEnter,
                                    onMouseLeave: handleShapeMouseLeave,
                                    onDragMove: (e: any) => updateShape(shape.id, { x: snapToOctalInch(e.target.x()), y: snapToOctalInch(e.target.y()) }),
                                    onDragEnd: (e: any) => updateShape(shape.id, { x: snapToOctalInch(e.target.x()), y: snapToOctalInch(e.target.y()) }),
                                    onTransform: (e: any) => {
                                        const node = e.target; const scaleX = node.scaleX(); const scaleY = node.scaleY();
                                        node.scaleX(1); node.scaleY(1);
                                        if (isCut) { updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), width: Math.max(5, snapToOctalInch(node.width() * scaleX)), height: Math.max(5, snapToOctalInch(node.height() * scaleY)) }); }
                                        else { updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), radius: Math.max(5, snapToOctalInch(node.radius() * scaleX)) }); }
                                    },
                                    onTransformEnd: (e: any) => {
                                        const node = e.target; const scaleX = node.scaleX(); const scaleY = node.scaleY();
                                        node.scaleX(1); node.scaleY(1);
                                        if (isCut) { updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), width: Math.max(5, snapToOctalInch(node.width() * scaleX)), height: Math.max(5, snapToOctalInch(node.height() * scaleY)) }); }
                                        else { updateShape(shape.id, { x: snapToOctalInch(node.x()), y: snapToOctalInch(node.y()), radius: Math.max(5, snapToOctalInch(node.radius() * scaleX)) }); }
                                    },
                                };
                                return isCut ? (
                                    <Group key={shape.id}>
                                        <Rect {...props} width={shape.width} height={shape.height} />
                                        <Text x={shape.x + (shape.width || 0) / 2} y={shape.y + (shape.height || 0) / 2} text="C" fill="#ef4444" fontSize={10 / drawingScale} fontStyle="bold" align="center" width={60 / drawingScale} offsetX={30 / drawingScale} offsetY={5 / drawingScale} listening={false} />
                                    </Group>
                                ) : (
                                    <Group key={shape.id}>
                                        <Circle {...props} radius={shape.radius} />
                                        <Text x={shape.x} y={shape.y} text="H" fill="#ef4444" fontSize={10 / drawingScale} fontStyle="bold" align="center" width={60 / drawingScale} offsetX={30 / drawingScale} offsetY={5 / drawingScale} listening={false} />
                                    </Group>
                                );
                            })}

                            {/* Render accessories */}
                            {activePiece.shapes.filter(s => s.type === 'accessory').map((shape) => {
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
                                        {/* Lock graphic */}
                                        {shape.accessoryType === 'lock' && (
                                            <Group>
                                                <Circle x={12.5} y={12.5} radius={7.5} stroke="#ef4444" strokeWidth={1.5 / drawingScale} dash={[3, 3]} fill="rgba(239, 68, 68, 0.05)" listening={false} />
                                                <Rect x={0} y={0} width={25} height={25} fill="#9ca3af" stroke="#4b5563" strokeWidth={1 / drawingScale} cornerRadius={4} />
                                                <Circle x={12.5} y={12.5} radius={4} fill="#4b5563" stroke="#1f2937" strokeWidth={1 / drawingScale} />
                                                <Rect x={11.5} y={12.5} width={2} height={4} fill="#1f2937" />
                                                <Text x={-10 / drawingScale} y={-10 / drawingScale} text="Lock" fontSize={8 / drawingScale} fill="#ef4444" fontStyle="bold" align="center" width={45 / drawingScale} listening={false} />
                                            </Group>
                                        )}
                                        {/* Connector graphic */}
                                        {shape.accessoryType === 'connector' && (
                                            <Group>
                                                <Circle x={10} y={10} radius={3.5} stroke="#ef4444" strokeWidth={1.5 / drawingScale} dash={[2, 2]} fill="rgba(239, 68, 68, 0.05)" listening={false} />
                                                <Circle x={30} y={10} radius={3.5} stroke="#ef4444" strokeWidth={1.5 / drawingScale} dash={[2, 2]} fill="rgba(239, 68, 68, 0.05)" listening={false} />
                                                <Rect x={0} y={0} width={40} height={20} fill="#d1d5db" stroke="#6b7280" strokeWidth={1 / drawingScale} cornerRadius={2} />
                                                <Line points={[20, 0, 20, 20]} stroke="#9ca3af" strokeWidth={1 / drawingScale} />
                                                <Text x={-5 / drawingScale} y={-10 / drawingScale} text="L-Conn" fontSize={8 / drawingScale} fill="#ef4444" fontStyle="bold" align="center" width={50 / drawingScale} listening={false} />
                                            </Group>
                                        )}
                                        {/* Hinge graphic */}
                                        {shape.accessoryType === 'hinge' && (
                                            <Group>
                                                <Rect x={0} y={5} width={20} height={15} stroke="#ef4444" strokeWidth={1.5 / drawingScale} dash={[3, 3]} fill="rgba(239, 68, 68, 0.05)" listening={false} />
                                                <Rect x={0} y={0} width={15} height={25} fill="#9ca3af" stroke="#4b5563" strokeWidth={1 / drawingScale} />
                                                <Rect x={14} y={0} width={2} height={25} fill="#4b5563" />
                                                <Rect x={16} y={0} width={14} height={25} fill="#d1d5db" stroke="#6b7280" strokeWidth={1 / drawingScale} />
                                                <Text x={-10 / drawingScale} y={-10 / drawingScale} text="Hinge" fontSize={8 / drawingScale} fill="#ef4444" fontStyle="bold" align="center" width={50 / drawingScale} listening={false} />
                                            </Group>
                                        )}
                                        {/* Profile graphic */}
                                        {shape.accessoryType === 'profile' && (
                                            <Group>
                                                <Rect x={0} y={0} width={shape.width || 120} height={10} fill="#4b5563" stroke="#1f2937" strokeWidth={1 / drawingScale} />
                                                <Rect x={0} y={3} width={shape.width || 120} height={4} fill="#e5e7eb" />
                                                <Text x={0} y={-10 / drawingScale} text={`Profile (${formatInchesFraction(shape.width || 120)})`} fontSize={8 / drawingScale} fill="#374151" fontStyle="bold" align="center" width={shape.width || 120} listening={false} />
                                            </Group>
                                        )}
                                        {/* Custom Hardware graphic */}
                                        {shape.hardwareItemId && (
                                            <Group>
                                                <Rect x={0} y={0} width={30} height={30} fill="#f59e0b" stroke="#d97706" strokeWidth={1.5 / drawingScale} cornerRadius={6} />
                                                <Circle x={15} y={15} radius={6} stroke="#fff" strokeWidth={2 / drawingScale} fill="rgba(255,255,255,0.2)" />
                                                <Text x={0} y={11} text="HW" fontSize={8} fill="#fff" fontStyle="bold" align="center" width={30} listening={false} />
                                                <Text 
                                                    x={-35} 
                                                    y={-10 / drawingScale} 
                                                    text={shape.accessoryName || 'Hardware'} 
                                                    fontSize={8 / drawingScale} 
                                                    fill="#d97706" 
                                                    fontStyle="bold" 
                                                    align="center" 
                                                    width={100} 
                                                    listening={false} 
                                                />
                                            </Group>
                                        )}
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
                </div>
                </section>
            </div>
        </div>
    );
}
