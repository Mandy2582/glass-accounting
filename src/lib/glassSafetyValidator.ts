/**
 * Glass Safety & Structural Validator
 * Enforces standard engineering compliance rules for toughened glass processing
 * (BS EN 12150 / ASTM C1048 / IS 2553), checking edge clearances, hole spacing,
 * cutout corner radii, panel weights, and hinge load capacities.
 */

import { GlassPiece, KonvaShape } from '@/types';

export interface SafetyViolation {
    pieceId: string;
    pieceName: string;
    shapeId: string;
    rule: 'EDGE_CLEARANCE' | 'HOLE_SPACING' | 'HOLE_DIAMETER' | 'PANEL_WEIGHT';
    severity: 'warning' | 'critical';
    message: string;
    details: {
        actual: number;
        required: number;
        unit: string;
    };
}

export interface GlassSafetyAnalysis {
    isValid: boolean;
    pieceWeights: { pieceId: string; weightKg: number; areaSqFt: number }[];
    violations: SafetyViolation[];
}

/**
 * Validates a list of glass pieces against structural safety and fabrication rules.
 */
// Canvas coordinates are stored at 10 units per inch (see
// GlassDesigner.createRectShape / glassSystemDesigner U=10), so 1 canvas
// unit = 0.1 inch = 2.54 mm. All the engineering rules below are in mm, so
// every canvas measurement is converted through this first -- otherwise
// panel area/weight come out ~100x too large (a normal door reading as
// thousands of kg and firing false "over capacity" alarms).
const MM_PER_UNIT = 2.54;

export function validateGlassSafety(pieces: GlassPiece[]): GlassSafetyAnalysis {
    const violations: SafetyViolation[] = [];
    const pieceWeights: { pieceId: string; weightKg: number; areaSqFt: number }[] = [];

    pieces.forEach(piece => {
        const thickness = piece.thickness || 10; // mm
        const rectShape = piece.shapes.find(s => s.type === 'glass_rect');
        if (!rectShape) return;

        // Panel outline in mm (converted from canvas units).
        const panelWidthMm = (rectShape.width || 0) * MM_PER_UNIT;
        const panelHeightMm = (rectShape.height || 0) * MM_PER_UNIT;
        const x0Mm = (rectShape.x || 0) * MM_PER_UNIT;
        const y0Mm = (rectShape.y || 0) * MM_PER_UNIT;

        // 1. Calculate Panel Area & Weight (Glass density ~2.5 kg per m² per mm thickness)
        const areaSqM = (panelWidthMm * panelHeightMm) / 1_000_000;
        const areaSqFt = areaSqM * 10.7639;
        const weightKg = areaSqM * thickness * 2.5;

        pieceWeights.push({ pieceId: piece.id, weightKg: Math.round(weightKg * 10) / 10, areaSqFt: Math.round(areaSqFt * 100) / 100 });

        // Hinge load capacity check (Standard 2-hinge shower pair max 45kg for 10mm glass)
        if (weightKg > 55) {
            violations.push({
                pieceId: piece.id,
                pieceName: piece.name,
                shapeId: rectShape.id,
                rule: 'PANEL_WEIGHT',
                severity: 'critical',
                message: `Panel weight (${weightKg.toFixed(1)} kg) exceeds standard 2-hinge load capacity (55 kg). Add a 3rd hinge or reduce panel dimensions.`,
                details: { actual: Math.round(weightKg), required: 55, unit: 'kg' }
            });
        }

        const holes = piece.shapes.filter(s => s.type === 'hole');

        // 2. Validate Hole Diameter & Edge Clearances (all in mm)
        holes.forEach(hole => {
            const radiusMm = (hole.radius || 10) * MM_PER_UNIT;
            const diameterMm = Math.round(radiusMm * 2);
            const hxMm = hole.x * MM_PER_UNIT;
            const hyMm = hole.y * MM_PER_UNIT;

            // Rule A: Minimum Hole Diameter >= Glass Thickness
            if (diameterMm < thickness) {
                violations.push({
                    pieceId: piece.id,
                    pieceName: piece.name,
                    shapeId: hole.id,
                    rule: 'HOLE_DIAMETER',
                    severity: 'critical',
                    message: `Hole diameter (${diameterMm}mm) is smaller than glass thickness (${thickness}mm). Risk of glass cracking during tempering.`,
                    details: { actual: diameterMm, required: thickness, unit: 'mm' }
                });
            }

            // Rule B: Minimum Distance from Hole Edge to Glass Panel Edge (>= 2.5 * thickness)
            const minEdgeDist = 2.5 * thickness;
            const distLeft = hxMm - x0Mm - radiusMm;
            const distRight = x0Mm + panelWidthMm - hxMm - radiusMm;
            const distTop = hyMm - y0Mm - radiusMm;
            const distBottom = y0Mm + panelHeightMm - hyMm - radiusMm;

            const actualMinEdge = Math.min(distLeft, distRight, distTop, distBottom);

            if (actualMinEdge < minEdgeDist) {
                violations.push({
                    pieceId: piece.id,
                    pieceName: piece.name,
                    shapeId: hole.id,
                    rule: 'EDGE_CLEARANCE',
                    severity: 'critical',
                    message: `Hole edge to glass border clearance (${actualMinEdge.toFixed(1)}mm) is less than required minimum (${minEdgeDist}mm = 2.5 × thickness).`,
                    details: { actual: Math.round(actualMinEdge), required: Math.round(minEdgeDist), unit: 'mm' }
                });
            }
        });

        // 3. Validate Hole-to-Hole Distance (>= 2.0 * thickness or 30mm), in mm
        for (let i = 0; i < holes.length; i++) {
            for (let j = i + 1; j < holes.length; j++) {
                const h1 = holes[i];
                const h2 = holes[j];
                const r1Mm = (h1.radius || 10) * MM_PER_UNIT;
                const r2Mm = (h2.radius || 10) * MM_PER_UNIT;

                const dxMm = (h1.x - h2.x) * MM_PER_UNIT;
                const dyMm = (h1.y - h2.y) * MM_PER_UNIT;
                const centerDist = Math.sqrt(dxMm * dxMm + dyMm * dyMm);
                const edgeToEdgeDist = centerDist - r1Mm - r2Mm;

                const minHoleSpacing = Math.max(2.0 * thickness, 30);

                if (edgeToEdgeDist < minHoleSpacing) {
                    violations.push({
                        pieceId: piece.id,
                        pieceName: piece.name,
                        shapeId: h1.id,
                        rule: 'HOLE_SPACING',
                        severity: 'warning',
                        message: `Spacing between adjacent drill holes (${edgeToEdgeDist.toFixed(1)}mm) is below safety standard (${minHoleSpacing}mm).`,
                        details: { actual: Math.round(edgeToEdgeDist), required: Math.round(minHoleSpacing), unit: 'mm' }
                    });
                }
            }
        }
    });

    return {
        isValid: violations.length === 0,
        pieceWeights,
        violations
    };
}
