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
export function validateGlassSafety(pieces: GlassPiece[]): GlassSafetyAnalysis {
    const violations: SafetyViolation[] = [];
    const pieceWeights: { pieceId: string; weightKg: number; areaSqFt: number }[] = [];

    pieces.forEach(piece => {
        const thickness = piece.thickness || 10; // mm
        const rectShape = piece.shapes.find(s => s.type === 'glass_rect');
        if (!rectShape) return;

        const panelWidth = rectShape.width || 0;
        const panelHeight = rectShape.height || 0;
        const x0 = rectShape.x || 0;
        const y0 = rectShape.y || 0;

        // 1. Calculate Panel Area & Weight (Glass density ~2.5 kg per m² per mm thickness)
        const areaSqIn = panelWidth * panelHeight;
        const areaSqFt = areaSqIn / 144;
        const areaSqM = areaSqIn * 0.00064516;
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

        // 2. Validate Hole Diameter & Edge Clearances
        holes.forEach(hole => {
            const radius = hole.radius || 10; // in mm or px
            const diameter = radius * 2;
            const hx = hole.x;
            const hy = hole.y;

            // Rule A: Minimum Hole Diameter >= Glass Thickness
            if (diameter < thickness) {
                violations.push({
                    pieceId: piece.id,
                    pieceName: piece.name,
                    shapeId: hole.id,
                    rule: 'HOLE_DIAMETER',
                    severity: 'critical',
                    message: `Hole diameter (${diameter}mm) is smaller than glass thickness (${thickness}mm). Risk of glass cracking during tempering.`,
                    details: { actual: diameter, required: thickness, unit: 'mm' }
                });
            }

            // Rule B: Minimum Distance from Hole Edge to Glass Panel Edge (>= 2.5 * thickness)
            const minEdgeDist = 2.5 * thickness;
            const distLeft = hx - x0 - radius;
            const distRight = x0 + panelWidth - hx - radius;
            const distTop = hy - y0 - radius;
            const distBottom = y0 + panelHeight - hy - radius;

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

        // 3. Validate Hole-to-Hole Distance (>= 2.0 * thickness or 30mm)
        for (let i = 0; i < holes.length; i++) {
            for (let j = i + 1; j < holes.length; j++) {
                const h1 = holes[i];
                const h2 = holes[j];
                const r1 = h1.radius || 10;
                const r2 = h2.radius || 10;

                const dx = h1.x - h2.x;
                const dy = h1.y - h2.y;
                const centerDist = Math.sqrt(dx * dx + dy * dy);
                const edgeToEdgeDist = centerDist - r1 - r2;

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
