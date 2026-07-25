/**
 * Factory Job Card & Bill of Materials (BOM) Generator
 * Computes exact net cutting sizes with clearance gap deductions, edge polishing
 * linear meters, and hardware item BOM for production job sheets.
 */

import { GlassPiece, GlassItem } from '@/types';

export interface FactoryPieceJobCard {
    pieceId: string;
    pieceName: string;
    thicknessMm: number;
    rawWidthMm: number;
    rawHeightMm: number;
    netWidthMm: number;
    netHeightMm: number;
    deductions: {
        topGapMm: number;
        bottomGapMm: number;
        hingeSideGapMm: number;
        lockSideGapMm: number;
    };
    edgePolishingMeters: {
        flatPolishedMeters: number;
        mitered45Meters: number;
        beveledMeters: number;
    };
    holesCount: number;
    cutsCount: number;
}

export interface HardwareBOMItem {
    itemId?: string;
    name: string;
    role: string;
    quantity: number;
    estimatedRate: number;
    totalAmount: number;
}

export interface FactoryBOMReport {
    jobCards: FactoryPieceJobCard[];
    hardwareBOM: HardwareBOMItem[];
    totalGlassAreaSqM: number;
    totalGlassWeightKg: number;
    totalPolishingMeters: number;
    totalHardwareCost: number;
}

/**
 * Generates factory job card specifications and hardware bill of materials.
 */
export function generateFactoryBOM(pieces: GlassPiece[], catalogue: GlassItem[] = []): FactoryBOMReport {
    const jobCards: FactoryPieceJobCard[] = [];
    const hardwareMap = new Map<string, HardwareBOMItem>();

    let totalGlassAreaSqM = 0;
    let totalGlassWeightKg = 0;
    let totalPolishingMeters = 0;
    let totalHardwareCost = 0;

    pieces.forEach(piece => {
        const thickness = piece.thickness || 10;
        const rect = piece.shapes.find(s => s.type === 'glass_rect');

        const rawW_In = (rect?.width || 0) / 10;
        const rawH_In = (rect?.height || 0) / 10;

        const rawWidthMm = rawW_In * 25.4;
        const rawHeightMm = rawH_In * 25.4;

        // Apply standard fabrication clearance gaps
        const isDoor = (piece.name || '').toLowerCase().includes('door');
        const gaps = isDoor
            ? { topGapMm: 3, bottomGapMm: 8, hingeSideGapMm: 3, lockSideGapMm: 3 }
            : { topGapMm: 0, bottomGapMm: 0, hingeSideGapMm: 0, lockSideGapMm: 0 };

        const netWidthMm = Math.max(0, rawWidthMm - gaps.hingeSideGapMm - gaps.lockSideGapMm);
        const netHeightMm = Math.max(0, rawHeightMm - gaps.topGapMm - gaps.bottomGapMm);

        // Edge polishing meters (Perimeter = 2 * (W + H) in meters)
        const perimeterMeters = (2 * (netWidthMm + netHeightMm)) / 1000;
        totalPolishingMeters += perimeterMeters;

        const areaSqM = (netWidthMm / 1000) * (netHeightMm / 1000);
        totalGlassAreaSqM += areaSqM;
        totalGlassWeightKg += areaSqM * thickness * 2.5;

        // Count holes and cuts (both standalone drawings and accessory prep requirements)
        const holesCount = piece.shapes.reduce((acc, s) => {
            if (s.type === 'hole') return acc + 1;
            if (s.type === 'accessory' && s.accessoryHoleCount) return acc + Number(s.accessoryHoleCount);
            return acc;
        }, 0);
        const cutsCount = piece.shapes.reduce((acc, s) => {
            if (s.type === 'cut') return acc + 1;
            if (s.type === 'accessory' && s.accessoryCutCount) return acc + Number(s.accessoryCutCount);
            return acc;
        }, 0);

        jobCards.push({
            pieceId: piece.id,
            pieceName: piece.name || 'Glass Panel',
            thicknessMm: thickness,
            rawWidthMm: Math.round(rawWidthMm),
            rawHeightMm: Math.round(rawHeightMm),
            netWidthMm: Math.round(netWidthMm),
            netHeightMm: Math.round(netHeightMm),
            deductions: gaps,
            edgePolishingMeters: {
                flatPolishedMeters: Math.round(perimeterMeters * 100) / 100,
                mitered45Meters: 0,
                beveledMeters: 0
            },
            holesCount,
            cutsCount
        });

        // Hardware BOM Aggregation with Catalogue Enrichment
        piece.shapes.forEach(shape => {
            if (shape.type === 'accessory') {
                const catalogItem = catalogue.find(i => i.id === shape.hardwareItemId || i.name.toLowerCase() === shape.accessoryName?.toLowerCase());
                let name = shape.accessoryName || catalogItem?.name || 'Hardware Fitting';
                if (catalogItem?.make && !name.toLowerCase().includes(catalogItem.make.toLowerCase())) {
                    name = `${name} [${catalogItem.make}${catalogItem.model ? ` ${catalogItem.model}` : ''}]`;
                }
                const role = shape.accessoryType || catalogItem?.fittingRole || 'fitting';
                const rate = Number(shape.accessoryRate) || Number(catalogItem?.rate) || 0;

                const existing = hardwareMap.get(name);
                if (existing) {
                    existing.quantity += 1;
                    existing.totalAmount += rate;
                } else {
                    hardwareMap.set(name, {
                        itemId: shape.hardwareItemId || catalogItem?.id,
                        name,
                        role,
                        quantity: 1,
                        estimatedRate: rate,
                        totalAmount: rate
                    });
                }
                totalHardwareCost += rate;
            }
        });
    });

    return {
        jobCards,
        hardwareBOM: Array.from(hardwareMap.values()),
        totalGlassAreaSqM: Math.round(totalGlassAreaSqM * 100) / 100,
        totalGlassWeightKg: Math.round(totalGlassWeightKg * 10) / 10,
        totalPolishingMeters: Math.round(totalPolishingMeters * 100) / 100,
        totalHardwareCost: Math.round(totalHardwareCost)
    };
}
