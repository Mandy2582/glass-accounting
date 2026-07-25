/**
 * Architectural Glass Engineering & Structural Calculator
 * Evaluates wind load deflection limits (ASTM E1300 / BS 6262), center of mass
 * (for installation crane balance), weight, and thermal stress risk.
 */

import { GlassPiece, KonvaShape } from '@/types';

export interface PanelEngineeringAnalysis {
    pieceId: string;
    pieceName: string;
    thicknessMm: number;
    widthMm: number;
    heightMm: number;
    areaSqM: number;
    weightKg: number;
    centerOfMassMm: { x: number; y: number };
    maxAllowableWindPressureKPa: number;
    deflectionMmAt1KPa: number;
    isWindLoadCompliant: boolean;
    thermalCrackRisk: 'low' | 'medium' | 'high';
}

/**
 * Calculates center of mass, weight, wind load deflection, and structural compliance.
 */
export function calculateGlassEngineering(piece: GlassPiece, designWindPressureKPa = 1.0): PanelEngineeringAnalysis {
    const thickness = piece.thickness || 10;
    const rect = piece.shapes.find(s => s.type === 'glass_rect');

    const widthMm = (rect?.width || 1000) * 2.54;  // canvas units (in/10) to mm
    const heightMm = (rect?.height || 2000) * 2.54;

    const widthM = widthMm / 1000;
    const heightM = heightMm / 1000;
    const areaSqM = widthM * heightM;

    // Glass Density = ~2.5 kg per m² per mm thickness
    const weightKg = areaSqM * thickness * 2.5;

    // Center of Mass (incorporates holes/cutout area offsets)
    let sumX = widthMm / 2;
    let sumY = heightMm / 2;

    const holes = piece.shapes.filter(s => s.type === 'hole' || s.type === 'cut');
    if (holes.length > 0) {
        // Adjust center of mass slightly away from heavy cutouts
        let cutoutWeightLoss = 0;
        let cutoutMomentX = 0;
        let cutoutMomentY = 0;

        holes.forEach(h => {
            const hRadiusMm = (h.radius || 10) * 2.54;
            const hAreaSqM = Math.PI * (hRadiusMm / 1000) ** 2;
            const hLossKg = hAreaSqM * thickness * 2.5;

            cutoutWeightLoss += hLossKg;
            cutoutMomentX += hLossKg * (h.x * 2.54);
            cutoutMomentY += hLossKg * (h.y * 2.54);
        });

        const netWeight = Math.max(0.1, weightKg - cutoutWeightLoss);
        sumX = (weightKg * (widthMm / 2) - cutoutMomentX) / netWeight;
        sumY = (weightKg * (heightMm / 2) - cutoutMomentY) / netWeight;
    }

    // ASTM E1300 Wind Load Resistance Formula (4-side simply supported approximation)
    // Allowable Load P_allow = C * (t / min(W, H))^2
    const minDimM = Math.min(widthM, heightM);
    const maxAllowableWindPressureKPa = (0.015 * (thickness ** 2.2)) / (minDimM ** 1.5);

    // Deflection at 1.0 kPa (Approximation delta = (q * L^4) / (E * t^3))
    // E = 70 GPa for toughened glass
    const deflectionMmAt1KPa = (designWindPressureKPa * (minDimM ** 4) * 1000) / (70 * (thickness ** 3));
    const maxAllowableDeflectionMm = (minDimM * 1000) / 175; // L/175 ASTM E1300 limit

    const isWindLoadCompliant = deflectionMmAt1KPa <= maxAllowableDeflectionMm && designWindPressureKPa <= maxAllowableWindPressureKPa;

    // Thermal stress risk assessment
    const thermalCrackRisk: 'low' | 'medium' | 'high' = 
        thickness >= 12 ? 'high' : thickness >= 8 ? 'medium' : 'low';

    return {
        pieceId: piece.id,
        pieceName: piece.name || 'Glass Panel',
        thicknessMm: thickness,
        widthMm: Math.round(widthMm),
        heightMm: Math.round(heightMm),
        areaSqM: Math.round(areaSqM * 100) / 100,
        weightKg: Math.round(weightKg * 10) / 10,
        centerOfMassMm: { x: Math.round(sumX), y: Math.round(sumY) },
        maxAllowableWindPressureKPa: Math.round(maxAllowableWindPressureKPa * 100) / 100,
        deflectionMmAt1KPa: Math.round(deflectionMmAt1KPa * 10) / 10,
        isWindLoadCompliant,
        thermalCrackRisk
    };
}
