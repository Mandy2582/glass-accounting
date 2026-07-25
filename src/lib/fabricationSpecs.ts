/**
 * Fabrication Specifications & Hardware Cutout Templates
 * Standard cutout geometries, notches, and drill hole preps for architectural
 * glass hardware brands (DORMA, Ozone, Hafele, CRL).
 */

export interface HardwareCutoutTemplate {
    id: string;
    brand: 'DORMA' | 'Ozone' | 'Hafele' | 'CRL' | 'Generic';
    name: string;
    description: string;
    fittingType: 'patch_top' | 'patch_bottom' | 'hinge_wall' | 'hinge_glass' | 'patch_lock' | 'sliding_clamp';
    notchWidthMm: number;
    notchHeightMm: number;
    cornerRadiusMm: number;
    holes: { offsetXMm: number; offsetYMm: number; radiusMm: number; countersunk?: boolean }[];
    deductionGapsMm: {
        top: number;
        bottom: number;
        hingeSide: number;
        lockSide: number;
    };
}

export const HARDWARE_CUTOUT_TEMPLATES: HardwareCutoutTemplate[] = [
    {
        id: 'dorma_bts80_bottom',
        brand: 'DORMA',
        name: 'DORMA BTS 80/84 Bottom Corner Patch (PT10)',
        description: 'Standard bottom pivot patch fitting cutout for floor spring spindles',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [
            { offsetXMm: 52, offsetYMm: 26, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 8, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'dorma_pt20_top',
        brand: 'DORMA',
        name: 'DORMA PT20 Top Patch Fitting',
        description: 'Top transom pivot patch fitting notch',
        fittingType: 'patch_top',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [
            { offsetXMm: 52, offsetYMm: 26, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 5, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'ozone_g2g_90',
        brand: 'Ozone',
        name: 'Ozone Glass-to-Glass 90° Hinge (OZ-GH-90)',
        description: 'Countersunk 2-hole prep for 90 degree glass-to-glass shower hinges',
        fittingType: 'hinge_glass',
        notchWidthMm: 48,
        notchHeightMm: 90,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 24, offsetYMm: 22, radiusMm: 8, countersunk: true },
            { offsetXMm: 24, offsetYMm: 68, radiusMm: 8, countersunk: true }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 4, lockSide: 3 }
    },
    {
        id: 'ozone_w2g_180',
        brand: 'Ozone',
        name: 'Ozone Wall-to-Glass Hinge (OZ-WH-180)',
        description: 'Heavy duty wall mount shower hinge cutout',
        fittingType: 'hinge_wall',
        notchWidthMm: 45,
        notchHeightMm: 90,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 22, offsetYMm: 22, radiusMm: 8, countersunk: true },
            { offsetXMm: 22, offsetYMm: 68, radiusMm: 8, countersunk: true }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'hafele_patch_lock',
        brand: 'Hafele',
        name: 'Hafele US10 Corner Patch Lock',
        description: 'Corner patch deadbolt lock prep with Euro profile cylinder cutout',
        fittingType: 'patch_lock',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 8,
        holes: [
            { offsetXMm: 65, offsetYMm: 26, radiusMm: 12, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 6, hingeSide: 3, lockSide: 4 }
    }
];

/**
 * Helper to retrieve template by ID.
 */
export function getHardwareTemplate(id: string): HardwareCutoutTemplate | undefined {
    return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === id);
}
