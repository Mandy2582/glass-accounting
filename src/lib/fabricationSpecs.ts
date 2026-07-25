/**
 * Fabrication Specifications & Hardware Cutout Templates
 * Complete manufacturer CAD cutout geometries, notches, drill hole preps, setback offsets,
 * and clearance gap deductions for all 80+ architectural hardware catalog models across
 * DORMA (dormakaba), Ozone, Icon, Häfele, Hardwyn, Enox, and CRL.
 */

export interface HardwareCutoutTemplate {
    id: string;
    brand: 'DORMA' | 'Ozone' | 'Hafele' | 'Icon' | 'Hardwyn' | 'Enox' | 'CRL' | 'Generic';
    name: string;
    description: string;
    fittingType:
        | 'patch_bottom'
        | 'patch_top'
        | 'patch_transom'
        | 'patch_overpanel_fin'
        | 'patch_lock'
        | 'patch_strike'
        | 'hinge_wall'
        | 'hinge_glass'
        | 'hinge_glass_90'
        | 'hinge_glass_135'
        | 'hinge_offset'
        | 'handle_pull'
        | 'handle_ladder_lock'
        | 'handle_knob'
        | 'handle_flush_pull'
        | 'sliding_top_clamp'
        | 'sliding_barn_roller'
        | 'sliding_bottom_guide'
        | 'spigot_core_drill'
        | 'spigot_base_plate'
        | 'spigot_channel'
        | 'standoff_pin'
        | 'handrail_connector'
        | 'spider_4way'
        | 'spider_2way'
        | 'spider_1way'
        | 'spider_fin'
        | 'clamp_wall'
        | 'clamp_glass_90'
        | 'clamp_glass_180'
        | 'clamp_glass_135'
        | 'lock_indicator'
        | 'lock_hook_sliding'
        | 'lock_center_patch'
        | 'floor_spring'
        | 'other';
    notchWidthMm: number;
    notchHeightMm: number;
    cornerRadiusMm: number;
    pivotOffsetMm?: number;
    verticalOffsetMm?: number;
    holes: { offsetXMm: number; offsetYMm: number; radiusMm: number; countersunk?: boolean }[];
    deductionGapsMm: {
        top: number;
        bottom: number;
        hingeSide: number;
        lockSide: number;
    };
}

export const HARDWARE_CUTOUT_TEMPLATES: HardwareCutoutTemplate[] = [
    // =========================================================================
    // 1. DORMA / dormakaba (Floor Springs, Patch Fittings, Sliding & Hinges)
    // =========================================================================
    {
        id: 'cat_dorma_bts80',
        brand: 'DORMA',
        name: 'DORMA BTS 80 Floor Spring Spindle Alignment',
        description: 'Heavy duty cement box with interchangeable tapered spindle axis alignment',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_bts84',
        brand: 'DORMA',
        name: 'DORMA BTS 84 Double Action Floor Spring',
        description: 'Standard floor spring cement box alignment with 65mm pivot setback',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_bts75v',
        brand: 'DORMA',
        name: 'DORMA BTS 75V Variable Spring Floor Closer',
        description: 'Universal adjustable closer spindle prep alignment',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_bts65',
        brand: 'DORMA',
        name: 'DORMA BTS 65 Compact Floor Spring',
        description: 'Compact shallow cement box alignment for standard doors',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_rts85',
        brand: 'DORMA',
        name: 'DORMA RTS 85 Transom Concealed Door Closer',
        description: 'Overhead concealed closer spindle top patch connection',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_pt10',
        brand: 'DORMA',
        name: 'DORMA PT 10 Bottom Patch Fitting (65mm Setback)',
        description: 'Bottom corner glass notch with clamping plate spindle seat',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_pt20',
        brand: 'DORMA',
        name: 'DORMA PT 20 Top Patch Fitting (65mm Setback)',
        description: 'Top corner notch with pivot receptacle bushing',
        fittingType: 'patch_top',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 5, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_pt22',
        brand: 'DORMA',
        name: 'DORMA PT 22 Overpanel Patch with Fin Support',
        description: 'Overpanel patch fitting cutout with architectural side fin stabilizing clamping',
        fittingType: 'patch_overpanel_fin',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [
            { offsetXMm: 65, offsetYMm: 26, radiusMm: 9, countersunk: false },
            { offsetXMm: 130, offsetYMm: 26, radiusMm: 9, countersunk: false }
        ],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_dorma_pt24',
        brand: 'DORMA',
        name: 'DORMA PT 24 Overpanel Pivot Patch with Door Stop',
        description: 'Transom pivot patch prep with integrated acoustic elastomer door stop',
        fittingType: 'patch_transom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 9, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_pt30',
        brand: 'DORMA',
        name: 'DORMA PT 30 Overpanel Transom Patch with Pivot Pin',
        description: 'Overpanel patch connecting door top PT20 patch to transom glass',
        fittingType: 'patch_transom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 9, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_pt40',
        brand: 'DORMA',
        name: 'DORMA PT 40 Side Fin Support Junction Patch',
        description: 'Side fin structural junction notch and dual bolting cutout',
        fittingType: 'patch_overpanel_fin',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [
            { offsetXMm: 65, offsetYMm: 26, radiusMm: 9, countersunk: false },
            { offsetXMm: 130, offsetYMm: 26, radiusMm: 9, countersunk: false }
        ],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_dorma_pt41',
        brand: 'DORMA',
        name: 'DORMA PT 41 4-Way Overpanel & Side Fin Junction Patch',
        description: '4-way structural patch connecting overpanel, sidelights, and vertical glass fin',
        fittingType: 'patch_overpanel_fin',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [
            { offsetXMm: 50, offsetYMm: 26, radiusMm: 9, countersunk: false },
            { offsetXMm: 120, offsetYMm: 26, radiusMm: 9, countersunk: false }
        ],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_dorma_pt60',
        brand: 'DORMA',
        name: 'DORMA PT 60 Connector Patch for Overpanel & Side Panel',
        description: '2-way connector patch holding transom to sidelite without pivots',
        fittingType: 'patch_transom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_pt70',
        brand: 'DORMA',
        name: 'DORMA PT 70 Overpanel Connector with Stop Insert',
        description: 'Transom connector with integrated door alignment stop',
        fittingType: 'patch_transom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_us10',
        brand: 'DORMA',
        name: 'DORMA US 10 Corner Deadbolt Patch Lock',
        description: 'Bottom or top corner lock cutout for Euro profile cylinder deadbolt',
        fittingType: 'patch_lock',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 12, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 8, hingeSide: 3, lockSide: 4 }
    },
    {
        id: 'cat_dorma_us20',
        brand: 'DORMA',
        name: 'DORMA US 20 Center Meeting Stile Patch Lock',
        description: 'Central mid-height lock cutout for double glass doors',
        fittingType: 'lock_center_patch',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        verticalOffsetMm: 1000,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 12, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 3, lockSide: 5 }
    },
    {
        id: 'cat_dorma_arcos_pt10',
        brand: 'DORMA',
        name: 'DORMA Arcos PT 10 Architectural Curved Bottom Patch',
        description: 'Curved architectural profile bottom patch fitting cutout',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 12,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_arcos_pt20',
        brand: 'DORMA',
        name: 'DORMA Arcos PT 20 Architectural Curved Top Patch',
        description: 'Curved architectural profile top patch fitting cutout',
        fittingType: 'patch_top',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 12,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 5, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_dorma_agile50',
        brand: 'DORMA',
        name: 'DORMA Agile 50 Concealed Sliding System Clamping Track',
        description: 'Top clamp glass suspension without drilling (50kg continuous track)',
        fittingType: 'sliding_top_clamp',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 45, bottom: 10, hingeSide: 15, lockSide: 15 }
    },
    {
        id: 'cat_dorma_agile150',
        brand: 'DORMA',
        name: 'DORMA Agile 150 Heavy-Duty Sliding Track Clamps',
        description: 'Heavy-duty 150kg clamp carrier suspension system without drilling',
        fittingType: 'sliding_top_clamp',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 60, bottom: 10, hingeSide: 15, lockSide: 15 }
    },
    {
        id: 'cat_dorma_rs120',
        brand: 'DORMA',
        name: 'DORMA RS 120 Roller Sliding Glass Door Track',
        description: 'Two top drill holes for roller carriage bolt anchoring',
        fittingType: 'sliding_top_clamp',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [
            { offsetXMm: 80, offsetYMm: 35, radiusMm: 8, countersunk: false },
            { offsetXMm: 350, offsetYMm: 35, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 50, bottom: 10, hingeSide: 15, lockSide: 15 }
    },
    {
        id: 'cat_dorma_manet_slider',
        brand: 'DORMA',
        name: 'DORMA Manet Single-Point Stainless Steel Slider Track',
        description: 'Countersunk single point fixing holes for architectural exposed stainless rollers',
        fittingType: 'sliding_barn_roller',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [
            { offsetXMm: 100, offsetYMm: 45, radiusMm: 10, countersunk: true },
            { offsetXMm: 400, offsetYMm: 45, radiusMm: 10, countersunk: true }
        ],
        deductionGapsMm: { top: 55, bottom: 10, hingeSide: 20, lockSide: 20 }
    },
    {
        id: 'cat_dorma_tensor_w2g',
        brand: 'DORMA',
        name: 'DORMA Tensor Wall-to-Glass Self-Closing Shower Hinge',
        description: 'Rectangular edge cutout for bi-directional hydraulic dampening hinge',
        fittingType: 'hinge_wall',
        notchWidthMm: 58,
        notchHeightMm: 72,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 29, offsetYMm: 22, radiusMm: 7, countersunk: false },
            { offsetXMm: 29, offsetYMm: 50, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 6, lockSide: 3 }
    },
    {
        id: 'cat_dorma_tensor_g2g',
        brand: 'DORMA',
        name: 'DORMA Tensor Glass-to-Glass 180° Self-Closing Hinge',
        description: 'Symmetrical double glass cutout for 180° inline frameless glass panels',
        fittingType: 'hinge_glass',
        notchWidthMm: 58,
        notchHeightMm: 72,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 29, offsetYMm: 22, radiusMm: 7, countersunk: false },
            { offsetXMm: 29, offsetYMm: 50, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 6, lockSide: 3 }
    },
    {
        id: 'cat_dorma_beyond_pivot',
        brand: 'DORMA',
        name: 'DORMA Beyond Anti-Finger Trap Pivot Door Fitting',
        description: 'Continuous central pivot rod assembly requiring zero glass notch cutouts',
        fittingType: 'patch_top',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 0,
        holes: [],
        deductionGapsMm: { top: 8, bottom: 10, hingeSide: 4, lockSide: 4 }
    },

    // =========================================================================
    // 2. OZONE INDIA (Floor Springs, Patches, Showers, Spiders, Spigots)
    // =========================================================================
    {
        id: 'cat_ozone_fs84',
        brand: 'Ozone',
        name: 'Ozone OZ-FS-84 Floor Spring Spindle Setback',
        description: 'Standard Italian/German interchangeable cam spindle arrangement (65mm setback)',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_fs75v',
        brand: 'Ozone',
        name: 'Ozone OZ-FS-75V Variable Heavy Floor Spring',
        description: 'Adjustable power hydraulic closer floor box alignment',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_fs90',
        brand: 'Ozone',
        name: 'Ozone OZ-FS-90 Extra Heavy Duty Floor Spring (300kg)',
        description: 'Heavy duty spindle alignment for oversize commercial structural doors',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_hdc100',
        brand: 'Ozone',
        name: 'Ozone Hydraulic Bottom Patch Door Closer (OZ-HDC-100)',
        description: 'Integrated floor-dig-free hydraulic bottom patch closer cutout',
        fittingType: 'patch_bottom',
        notchWidthMm: 170,
        notchHeightMm: 56,
        cornerRadiusMm: 8,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 28, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 12, hingeSide: 4, lockSide: 3 }
    },
    {
        id: 'cat_ozone_pf10',
        brand: 'Ozone',
        name: 'Ozone Bottom Patch Fitting OZ-PF-10 (65mm Setback)',
        description: 'Standard rectangular notch cutout with single central clamping hole',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 25, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_pf20',
        brand: 'Ozone',
        name: 'Ozone Top Patch Fitting OZ-PF-20 (55mm/65mm Setback)',
        description: 'Top patch fitting notch matching overpanel pivot center',
        fittingType: 'patch_top',
        notchWidthMm: 162,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        pivotOffsetMm: 55,
        holes: [{ offsetXMm: 55, offsetYMm: 25, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 5, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_pf30',
        brand: 'Ozone',
        name: 'Ozone Overpanel Transom Patch OZ-PF-30 with Pivot',
        description: 'Overpanel patch fitting with 55mm pivot pin seat for PF20 top patch',
        fittingType: 'patch_transom',
        notchWidthMm: 162,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        pivotOffsetMm: 55,
        holes: [{ offsetXMm: 55, offsetYMm: 25, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_pf40',
        brand: 'Ozone',
        name: 'Ozone Side Fin Connector Patch OZ-PF-40',
        description: 'Junction support notch connecting transom glass and 19mm glass side fin',
        fittingType: 'patch_overpanel_fin',
        notchWidthMm: 162,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        holes: [
            { offsetXMm: 55, offsetYMm: 25, radiusMm: 8, countersunk: false },
            { offsetXMm: 125, offsetYMm: 25, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_ozone_pf50',
        brand: 'Ozone',
        name: 'Ozone Wall-to-Glass Overpanel Connector OZ-PF-50',
        description: 'Single bolting notch connecting fixed overpanel to masonry or jamb wall',
        fittingType: 'patch_transom',
        notchWidthMm: 85,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        holes: [{ offsetXMm: 42, offsetYMm: 25, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_pf60',
        brand: 'Ozone',
        name: 'Ozone 4-Way Overpanel & Fin Connector OZ-PF-60',
        description: 'Heavy duty 4-way glass intersection connecting double transom and side fin',
        fittingType: 'patch_overpanel_fin',
        notchWidthMm: 162,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        holes: [
            { offsetXMm: 55, offsetYMm: 25, radiusMm: 8, countersunk: false },
            { offsetXMm: 125, offsetYMm: 25, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_ozone_pf100',
        brand: 'Ozone',
        name: 'Ozone Corner Deadbolt Lock Patch OZ-PF-100',
        description: 'Bottom corner lock cutout with Euro cylinder prep and brass deadbolt throw',
        fittingType: 'patch_lock',
        notchWidthMm: 162,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        holes: [{ offsetXMm: 55, offsetYMm: 25, radiusMm: 12, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 8, hingeSide: 3, lockSide: 4 }
    },
    {
        id: 'cat_ozone_pf200',
        brand: 'Ozone',
        name: 'Ozone Center Double-Door Lock Patch OZ-PF-200',
        description: 'Center mid-span patch lock notch for meeting stiles on double doors',
        fittingType: 'lock_center_patch',
        notchWidthMm: 162,
        notchHeightMm: 51,
        cornerRadiusMm: 8,
        verticalOffsetMm: 1000,
        holes: [{ offsetXMm: 55, offsetYMm: 25, radiusMm: 12, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 3, lockSide: 5 }
    },
    {
        id: 'cat_ozone_oz_wh_180',
        brand: 'Ozone',
        name: 'Ozone Wall-to-Glass 90° Shower Hinge (OZ-WH-180)',
        description: 'Mouse-ear notch with dual clamping holes for frameless shower doors',
        fittingType: 'hinge_wall',
        notchWidthMm: 55,
        notchHeightMm: 65,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 27.5, offsetYMm: 18, radiusMm: 7, countersunk: false },
            { offsetXMm: 27.5, offsetYMm: 47, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_ozone_oz_g2g_180',
        brand: 'Ozone',
        name: 'Ozone Inline 180° Glass-to-Glass Hinge (OZ-G2G-180)',
        description: 'Mirrored double mouse-ear cutouts for inline glass panel suspension',
        fittingType: 'hinge_glass',
        notchWidthMm: 55,
        notchHeightMm: 65,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 27.5, offsetYMm: 18, radiusMm: 7, countersunk: false },
            { offsetXMm: 27.5, offsetYMm: 47, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_ozone_oz_g2g_90',
        brand: 'Ozone',
        name: 'Ozone Corner 90° Glass-to-Glass Hinge (OZ-G2G-90)',
        description: 'Corner 90-degree intersection cutouts for shower enclosure returns',
        fittingType: 'hinge_glass_90',
        notchWidthMm: 55,
        notchHeightMm: 65,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 27.5, offsetYMm: 18, radiusMm: 7, countersunk: false },
            { offsetXMm: 27.5, offsetYMm: 47, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_ozone_oz_g2g_135',
        brand: 'Ozone',
        name: 'Ozone Neo-Angle 135° Shower Hinge (OZ-G2G-135)',
        description: '135-degree neo-angle diamond shower cubicle glass hinge preparation',
        fittingType: 'hinge_glass_135',
        notchWidthMm: 55,
        notchHeightMm: 65,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 27.5, offsetYMm: 18, radiusMm: 7, countersunk: false },
            { offsetXMm: 27.5, offsetYMm: 47, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_ozone_oz_sh_sl01',
        brand: 'Ozone',
        name: 'Ozone Soft-Close Roller Shower Slider (OZ-SH-SL01)',
        description: 'Two top drilled clearance holes for sliding shower wheels',
        fittingType: 'sliding_barn_roller',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [
            { offsetXMm: 60, offsetYMm: 30, radiusMm: 8, countersunk: false },
            { offsetXMm: 250, offsetYMm: 30, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 40, bottom: 12, hingeSide: 10, lockSide: 10 }
    },
    {
        id: 'cat_ozone_sp_101',
        brand: 'Ozone',
        name: 'Ozone 1-Way Structural Spider OZ-SP-101',
        description: 'Single articulated M16 countersunk routel bolt hole for glass facades',
        fittingType: 'spider_1way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_ozone_sp_102',
        brand: 'Ozone',
        name: 'Ozone 2-Way Inline (180°) Structural Spider OZ-SP-102',
        description: '2-way 200mm CTC structural point-fixing joint across meeting panels',
        fittingType: 'spider_2way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_ozone_sp_102l',
        brand: 'Ozone',
        name: 'Ozone 2-Way Corner / Fin Spider Fitting OZ-SP-102L',
        description: '90-degree corner intersection or fin support structural spider arm prep',
        fittingType: 'spider_fin',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_ozone_sp_103',
        brand: 'Ozone',
        name: 'Ozone 3-Way Structural Spider Fitting OZ-SP-103',
        description: 'T-junction 3-way curtain wall structural spider glass hole arrangement',
        fittingType: 'spider_4way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_ozone_sp_104',
        brand: 'Ozone',
        name: 'Ozone 4-Way Intersection Spider Fitting OZ-SP-104',
        description: '4-way structural grid facade spider fitting with 4 articulated routel joints',
        fittingType: 'spider_4way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_ozone_routel_m16',
        brand: 'Ozone',
        name: 'Ozone Articulated M16 Routel Bolt for Spider Joints',
        description: 'Countersunk hole prep for flush architectural structural glass joints',
        fittingType: 'spider_1way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 50, offsetYMm: 50, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 5, bottom: 5, hingeSide: 5, lockSide: 5 }
    },
    {
        id: 'cat_ozone_sr_2205',
        brand: 'Ozone',
        name: 'Ozone Duplex 2205 Core-Drill Spigot OZ-SR-2205',
        description: 'Friction clamp base spigot for balustrades requiring zero glass holes',
        fittingType: 'spigot_core_drill',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 0, bottom: 60, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_ozone_sr_102',
        brand: 'Ozone',
        name: 'Ozone Surface-Mount Spigot OZ-SR-102',
        description: 'Surface base-plate railing friction spigot without drilling glass',
        fittingType: 'spigot_base_plate',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 0, bottom: 60, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_ozone_ch_10',
        brand: 'Ozone',
        name: 'Ozone Continuous Aluminum Balustrade Channel OZ-CH-10',
        description: 'Bottom embedment floor channel clamping 12mm-15mm toughened glass',
        fittingType: 'spigot_channel',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 0, bottom: 15, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_ozone_ph01_300',
        brand: 'Ozone',
        name: 'Ozone D-Pull Handle 300mm CTC (OZ-PH-01-300)',
        description: 'Two back-to-back 14mm holes spaced 300mm center-to-center',
        fittingType: 'handle_pull',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 1050,
        holes: [
            { offsetXMm: 65, offsetYMm: -150, radiusMm: 7, countersunk: false },
            { offsetXMm: 65, offsetYMm: 150, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },
    {
        id: 'cat_ozone_ph01_450',
        brand: 'Ozone',
        name: 'Ozone D-Pull Handle 450mm CTC (OZ-PH-01-450)',
        description: 'Two back-to-back 14mm holes spaced 450mm center-to-center',
        fittingType: 'handle_pull',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 1050,
        holes: [
            { offsetXMm: 65, offsetYMm: -225, radiusMm: 7, countersunk: false },
            { offsetXMm: 65, offsetYMm: 225, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },
    {
        id: 'cat_ozone_ph10_1200',
        brand: 'Ozone',
        name: 'Ozone H-Type Locking Ladder Handle 1200mm',
        description: 'Floor locking ladder handle with cylinder lock throw and 3 anchor holes',
        fittingType: 'handle_ladder_lock',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 1100,
        holes: [
            { offsetXMm: 70, offsetYMm: -450, radiusMm: 7, countersunk: false },
            { offsetXMm: 70, offsetYMm: 450, radiusMm: 7, countersunk: false },
            { offsetXMm: 70, offsetYMm: -520, radiusMm: 11, countersunk: false }
        ],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },
    {
        id: 'cat_ozone_ph10_1500',
        brand: 'Ozone',
        name: 'Ozone H-Type Locking Ladder Handle 1500mm',
        description: '1500mm locking ladder bar handle with integrated floor pin deadbolt',
        fittingType: 'handle_ladder_lock',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 1200,
        holes: [
            { offsetXMm: 70, offsetYMm: -600, radiusMm: 7, countersunk: false },
            { offsetXMm: 70, offsetYMm: 600, radiusMm: 7, countersunk: false },
            { offsetXMm: 70, offsetYMm: -670, radiusMm: 11, countersunk: false }
        ],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },

    // =========================================================================
    // 3. ICON ARCHITECTURAL HARDWARE (Complete Manufacturer Specs)
    // =========================================================================
    {
        id: 'cat_icon_fs84',
        brand: 'Icon',
        name: 'Icon IC-FS-84 Double Action Floor Spring',
        description: 'Universal floor box spindle orientation with standard 65mm setback',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_icon_fs75',
        brand: 'Icon',
        name: 'Icon IC-FS-75 Heavy Duty Floor Spring',
        description: 'Heavy duty commercial floor spring alignment',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_icon_hym01',
        brand: 'Icon',
        name: 'Icon Hydraulic Bottom Patch Door Closer (IC-HYM-01)',
        description: 'Self-contained hydraulic bottom hinge with zero cement cutting required',
        fittingType: 'patch_bottom',
        notchWidthMm: 168,
        notchHeightMm: 55,
        cornerRadiusMm: 8,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 27, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 12, hingeSide: 4, lockSide: 3 }
    },
    {
        id: 'cat_icon_pf10',
        brand: 'Icon',
        name: 'Icon Universal Bottom Patch Fitting (IC-PF-10)',
        description: 'Universal corner cutout matching industry 162×52mm template',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_icon_pf20',
        brand: 'Icon',
        name: 'Icon Universal Top Patch Fitting (IC-PF-20)',
        description: 'Top corner patch cutout with pivot seat bushing',
        fittingType: 'patch_top',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 5, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_icon_pf30',
        brand: 'Icon',
        name: 'Icon Overpanel Transom Pivot Patch (IC-PF-30)',
        description: 'Overpanel patch fitting with 65mm pivot pin seat for PF20 top patch',
        fittingType: 'patch_transom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_icon_pf40',
        brand: 'Icon',
        name: 'Icon Side Fin Junction Support Patch (IC-PF-40)',
        description: 'Junction support notch connecting transom glass and structural side fin',
        fittingType: 'patch_overpanel_fin',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [
            { offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false },
            { offsetXMm: 130, offsetYMm: 26, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_icon_us10',
        brand: 'Icon',
        name: 'Icon Bottom Corner Deadbolt Lock Patch (IC-US-10)',
        description: 'Corner lock cutout with Euro cylinder deadbolt prep',
        fittingType: 'patch_lock',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 12, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 8, hingeSide: 3, lockSide: 4 }
    },
    {
        id: 'cat_icon_us20',
        brand: 'Icon',
        name: 'Icon Central Meeting Stile Lock Fitting (IC-US-20)',
        description: 'Central meeting stile lock cutout for double glass doors',
        fittingType: 'lock_center_patch',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        verticalOffsetMm: 1000,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 12, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 3, lockSide: 5 }
    },
    {
        id: 'cat_icon_sh90',
        brand: 'Icon',
        name: 'Icon Wall-to-Glass Solid Brass Shower Hinge (IC-SH-90)',
        description: 'Standard mouse-ear edge cutout with dual clamp securing holes',
        fittingType: 'hinge_wall',
        notchWidthMm: 56,
        notchHeightMm: 68,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 28, offsetYMm: 19, radiusMm: 7, countersunk: false },
            { offsetXMm: 28, offsetYMm: 49, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_icon_sh180',
        brand: 'Icon',
        name: 'Icon Inline 180° Glass-to-Glass Shower Hinge (IC-SH-180)',
        description: 'Symmetrical inline mouse-ear cutout between frameless panels',
        fittingType: 'hinge_glass',
        notchWidthMm: 56,
        notchHeightMm: 68,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 28, offsetYMm: 19, radiusMm: 7, countersunk: false },
            { offsetXMm: 28, offsetYMm: 49, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_icon_sh135',
        brand: 'Icon',
        name: 'Icon 135° Neo-Angle Shower Hinge (IC-SH-135)',
        description: 'Diamond cubicle 135° return glass panel hinge cutout',
        fittingType: 'hinge_glass_135',
        notchWidthMm: 56,
        notchHeightMm: 68,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 28, offsetYMm: 19, radiusMm: 7, countersunk: false },
            { offsetXMm: 28, offsetYMm: 49, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_icon_cl01',
        brand: 'Icon',
        name: 'Icon Square Wall Mounting Clamp (IC-CL-01)',
        description: '50×50mm solid brass wall partition clamp with single 14mm central hole',
        fittingType: 'clamp_wall',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 25, offsetYMm: 25, radiusMm: 7, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_icon_cl02',
        brand: 'Icon',
        name: 'Icon D-Shape Partition Wall Clamp (IC-CL-02)',
        description: 'Curved D-shape partition clamp with single 14mm central anchor hole',
        fittingType: 'clamp_wall',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 25, offsetYMm: 25, radiusMm: 7, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_icon_sp1',
        brand: 'Icon',
        name: 'Icon 1-Way Fin Spider Fitting (IC-SP-1)',
        description: 'Single articulated point fixing routel prep',
        fittingType: 'spider_1way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_icon_sp2',
        brand: 'Icon',
        name: 'Icon 2-Way Inline Structural Spider (IC-SP-2)',
        description: '2-way structural point-fixing joint across meeting panels',
        fittingType: 'spider_2way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_icon_sp4',
        brand: 'Icon',
        name: 'Icon 4-Way Curtain Wall Intersection Spider (IC-SP-4)',
        description: '4-way structural grid facade spider fitting with 4 articulated routel joints',
        fittingType: 'spider_4way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 65, offsetYMm: 65, radiusMm: 13, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    },
    {
        id: 'cat_icon_spg01',
        brand: 'Icon',
        name: 'Icon Core-Drill Balustrade Spigot (IC-SPG-01)',
        description: 'Heavy duty stainless Core Drill friction spigot requiring zero glass drilling',
        fittingType: 'spigot_core_drill',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 0, bottom: 60, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_icon_spg02',
        brand: 'Icon',
        name: 'Icon Surface Flange Mount Spigot (IC-SPG-02)',
        description: 'Surface plate deck-mounted friction spigot holding toughened glass',
        fittingType: 'spigot_base_plate',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 0, bottom: 60, hingeSide: 4, lockSide: 4 }
    },
    {
        id: 'cat_icon_sl100',
        brand: 'Icon',
        name: 'Icon Roller Sliding Glass Track Kit (IC-SL-100)',
        description: 'Two top drilled clearance holes for smooth roller hanger carriage',
        fittingType: 'sliding_barn_roller',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [
            { offsetXMm: 70, offsetYMm: 35, radiusMm: 8, countersunk: false },
            { offsetXMm: 300, offsetYMm: 35, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 45, bottom: 10, hingeSide: 15, lockSide: 15 }
    },
    {
        id: 'cat_icon_ph300',
        brand: 'Icon',
        name: 'Icon D-Pull Handle 300mm CTC (IC-PH-300)',
        description: 'Two back-to-back 14mm holes spaced 300mm center-to-center',
        fittingType: 'handle_pull',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 1050,
        holes: [
            { offsetXMm: 65, offsetYMm: -150, radiusMm: 7, countersunk: false },
            { offsetXMm: 65, offsetYMm: 150, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },
    {
        id: 'cat_icon_ph600',
        brand: 'Icon',
        name: 'Icon H-Style Stainless Ladder Pull Handle 600mm',
        description: 'Two back-to-back 14mm holes spaced 400mm CTC with 600mm total bar length',
        fittingType: 'handle_pull',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 1050,
        holes: [
            { offsetXMm: 65, offsetYMm: -200, radiusMm: 7, countersunk: false },
            { offsetXMm: 65, offsetYMm: 200, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },

    // =========================================================================
    // 4. HÄFELE / HAFELE (Startec Series, Showers, Barn Sliders)
    // =========================================================================
    {
        id: 'cat_hafele_startec_fs84',
        brand: 'Hafele',
        name: 'Häfele Startec FS 84 Floor Spring Alignment',
        description: 'Standard EN3/4 cement box alignment with 65mm setback',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hafele_startec_fs75v',
        brand: 'Hafele',
        name: 'Häfele Startec FS 75V Variable Heavy Floor Spring',
        description: 'Variable hydraulic closing force floor spring alignment',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hafele_startec_pf10',
        brand: 'Hafele',
        name: 'Häfele Startec PF 10 Bottom Door Patch',
        description: 'Bottom corner glass notch with Startec clamping spindle seat',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hafele_startec_pf20',
        brand: 'Hafele',
        name: 'Häfele Startec PF 20 Top Door Patch',
        description: 'Top corner patch cutout with pivot bushing receptacle',
        fittingType: 'patch_top',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 5, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hafele_startec_pf30',
        brand: 'Hafele',
        name: 'Häfele Startec PF 30 Overpanel Transom Patch',
        description: 'Overpanel patch connecting door top PF20 patch to transom glass',
        fittingType: 'patch_transom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 4, bottom: 4, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hafele_startec_us10',
        brand: 'Hafele',
        name: 'Häfele Startec US 10 Corner Deadbolt Lock',
        description: 'Bottom corner lock cutout for Euro profile cylinder deadbolt',
        fittingType: 'patch_lock',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 12, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 8, hingeSide: 3, lockSide: 4 }
    },
    {
        id: 'cat_hafele_98153',
        brand: 'Hafele',
        name: 'Häfele Wall-to-Glass 90° Shower Hinge (981.53.001)',
        description: 'Precision mouse-ear cutout for solid brass self-closing shower hinge',
        fittingType: 'hinge_wall',
        notchWidthMm: 58,
        notchHeightMm: 70,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 29, offsetYMm: 20, radiusMm: 7, countersunk: false },
            { offsetXMm: 29, offsetYMm: 50, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 6, lockSide: 3 }
    },
    {
        id: 'cat_hafele_98152',
        brand: 'Hafele',
        name: 'Häfele Inline 180° Glass-to-Glass Hinge (981.52.001)',
        description: 'Mirrored double mouse-ear cutouts for inline 180° glass panels',
        fittingType: 'hinge_glass',
        notchWidthMm: 58,
        notchHeightMm: 70,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 29, offsetYMm: 20, radiusMm: 7, countersunk: false },
            { offsetXMm: 29, offsetYMm: 50, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 6, lockSide: 3 }
    },
    {
        id: 'cat_hafele_98154',
        brand: 'Hafele',
        name: 'Häfele Corner 90° Glass-to-Glass Hinge (981.54.001)',
        description: '90-degree corner intersection cutouts for frameless shower returns',
        fittingType: 'hinge_glass_90',
        notchWidthMm: 58,
        notchHeightMm: 70,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 29, offsetYMm: 20, radiusMm: 7, countersunk: false },
            { offsetXMm: 29, offsetYMm: 50, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 6, lockSide: 3 }
    },
    {
        id: 'cat_hafele_slido120',
        brand: 'Hafele',
        name: 'Häfele Slido Classic 120-F Concealed Sliding Track',
        description: 'Top clamping carriage requiring zero glass notch drilling',
        fittingType: 'sliding_top_clamp',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [],
        deductionGapsMm: { top: 55, bottom: 10, hingeSide: 15, lockSide: 15 }
    },
    {
        id: 'cat_hafele_barn_roller',
        brand: 'Hafele',
        name: 'Häfele Exposed Stainless Steel Barn Slider',
        description: 'Four countersunk holes for architectural exposed stainless roller straps',
        fittingType: 'sliding_barn_roller',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [
            { offsetXMm: 80, offsetYMm: 40, radiusMm: 10, countersunk: true },
            { offsetXMm: 350, offsetYMm: 40, radiusMm: 10, countersunk: true }
        ],
        deductionGapsMm: { top: 60, bottom: 12, hingeSide: 20, lockSide: 20 }
    },
    {
        id: 'cat_hafele_flush_pull_50',
        brand: 'Hafele',
        name: 'Häfele Recessed Flush Ring Handle (Ø50mm)',
        description: 'Single circular 50mm bore hole for recessed sliding door handle',
        fittingType: 'handle_flush_pull',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 1050,
        holes: [{ offsetXMm: 60, offsetYMm: 0, radiusMm: 25, countersunk: false }],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },

    // =========================================================================
    // 5. HARDWYN, ENOX & CRL (Architectural Specialties)
    // =========================================================================
    {
        id: 'cat_hardwyn_fs84',
        brand: 'Hardwyn',
        name: 'Hardwyn HW-FS-84 Double Action Floor Spring',
        description: 'Standard cement floor box alignment with 65mm setback',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hardwyn_pf10',
        brand: 'Hardwyn',
        name: 'Hardwyn Bottom Patch Fitting HW-PF-10',
        description: 'Bottom corner glass notch matching standard 162×52mm dimensions',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hardwyn_pf20',
        brand: 'Hardwyn',
        name: 'Hardwyn Top Patch Fitting HW-PF-20',
        description: 'Top corner patch cutout with 65mm pivot seat bushing',
        fittingType: 'patch_top',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 5, bottom: 3, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_hardwyn_sh90',
        brand: 'Hardwyn',
        name: 'Hardwyn Wall-to-Glass Shower Hinge HW-SH-90',
        description: 'Mouse-ear notch with dual clamping holes for frameless shower doors',
        fittingType: 'hinge_wall',
        notchWidthMm: 56,
        notchHeightMm: 68,
        cornerRadiusMm: 6,
        holes: [
            { offsetXMm: 28, offsetYMm: 19, radiusMm: 7, countersunk: false },
            { offsetXMm: 28, offsetYMm: 49, radiusMm: 7, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 5, lockSide: 3 }
    },
    {
        id: 'cat_enox_ep84',
        brand: 'Enox',
        name: 'Enox Architectural Floor Spring EP-84',
        description: 'Universal floor box spindle orientation with 65mm setback',
        fittingType: 'floor_spring',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        pivotOffsetMm: 65,
        holes: [],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_enox_e10',
        brand: 'Enox',
        name: 'Enox Bottom Patch Fitting E-10',
        description: 'Universal bottom corner patch cutout matching industry standard',
        fittingType: 'patch_bottom',
        notchWidthMm: 162,
        notchHeightMm: 52,
        cornerRadiusMm: 10,
        pivotOffsetMm: 65,
        holes: [{ offsetXMm: 65, offsetYMm: 26, radiusMm: 8, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 10, hingeSide: 3, lockSide: 3 }
    },
    {
        id: 'cat_enox_indicator_lock',
        brand: 'Enox',
        name: 'Enox Glass Partition Toilet Indicator Lock E-WC-01',
        description: 'Single circular 38mm hole prep for occupied/unoccupied turn thumb latch',
        fittingType: 'lock_indicator',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        verticalOffsetMm: 950,
        holes: [{ offsetXMm: 50, offsetYMm: 0, radiusMm: 19, countersunk: false }],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 4 }
    },
    {
        id: 'cat_crl_geneva_sh',
        brand: 'CRL',
        name: 'CRL Geneva GEN034 Heavy Duty Wall Shower Hinge',
        description: 'American standard Geneva series notch with dual 16mm clamp holes',
        fittingType: 'hinge_wall',
        notchWidthMm: 60,
        notchHeightMm: 75,
        cornerRadiusMm: 8,
        holes: [
            { offsetXMm: 30, offsetYMm: 22, radiusMm: 8, countersunk: false },
            { offsetXMm: 30, offsetYMm: 53, radiusMm: 8, countersunk: false }
        ],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 6, lockSide: 3 }
    },
    {
        id: 'cat_crl_standoff_50',
        brand: 'CRL',
        name: 'CRL Ø50mm Solid Standoff Pin for Glass Railings',
        description: 'Single 18mm countersunk or flat anchor hole for side-mount balustrades',
        fittingType: 'standoff_pin',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 50, offsetYMm: 50, radiusMm: 9, countersunk: false }],
        deductionGapsMm: { top: 0, bottom: 0, hingeSide: 0, lockSide: 0 }
    },
    {
        id: 'cat_crl_4way_spider',
        brand: 'CRL',
        name: 'CRL Heavy-Duty 4-Way Structural Spider Bracket Assembly',
        description: '4-way structural point-fixing assembly for high windload curtain walls',
        fittingType: 'spider_4way',
        notchWidthMm: 0,
        notchHeightMm: 0,
        cornerRadiusMm: 0,
        holes: [{ offsetXMm: 70, offsetYMm: 70, radiusMm: 14, countersunk: true }],
        deductionGapsMm: { top: 6, bottom: 6, hingeSide: 6, lockSide: 6 }
    }
];

/**
 * Retrieve a template directly by ID.
 */
export function getHardwareTemplate(id: string): HardwareCutoutTemplate | undefined {
    return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === id || t.id === `cat_${id}` || `cat_${t.id}` === id);
}

/**
 * Retrieve all cutout templates for a specific brand.
 */
export function getHardwareTemplatesByBrand(brand: string): HardwareCutoutTemplate[] {
    return HARDWARE_CUTOUT_TEMPLATES.filter(t => t.brand.toLowerCase() === brand.toLowerCase());
}

/**
 * Intelligent hardware template resolver that inspects an item's ID, brand make, model,
 * name, and fittingRole to find the precise CAD notch cutout and setback geometry.
 */
export function getCutoutSpecsForItem(item: {
    id?: string;
    name?: string;
    make?: string;
    model?: string;
    fittingRole?: string;
    type?: string;
}): HardwareCutoutTemplate {
    // 1. Direct ID match
    if (item.id) {
        const direct = HARDWARE_CUTOUT_TEMPLATES.find(
            t => t.id === item.id || t.id === `cat_${item.id}` || `cat_${t.id}` === item.id
        );
        if (direct) return direct;
    }

    const brandStr = item.make?.toLowerCase().trim() || '';
    const modelStr = item.model?.toLowerCase().trim() || '';
    const nameStr = item.name?.toLowerCase().trim() || '';

    // 2. Match by Brand + Model or Keywords in Name
    if (brandStr || modelStr || nameStr) {
        for (const template of HARDWARE_CUTOUT_TEMPLATES) {
            const tBrand = template.brand.toLowerCase();
            const tName = template.name.toLowerCase();
            const tId = template.id.toLowerCase();

            if (
                (brandStr && tBrand === brandStr && modelStr && tId.includes(modelStr.replace(/[^a-z0-9]/g, ''))) ||
                (modelStr && modelStr.length > 2 && tName.includes(modelStr)) ||
                (nameStr && (nameStr.includes(template.id.replace('cat_', '').replace(/_/g, ' '))))
            ) {
                return template;
            }
        }
    }

    // 3. Match by common keywords in item name
    if (nameStr.includes('bts 80') || nameStr.includes('bts 84') || nameStr.includes('floor spring')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_dorma_bts84')!;
    }
    if (nameStr.includes('pt 10') || nameStr.includes('pf-10') || nameStr.includes('bottom patch')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_dorma_pt10')!;
    }
    if (nameStr.includes('pt 20') || nameStr.includes('pf-20') || nameStr.includes('top patch')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_dorma_pt20')!;
    }
    if (nameStr.includes('pt 30') || nameStr.includes('pf-30') || nameStr.includes('overpanel')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_dorma_pt30')!;
    }
    if (nameStr.includes('shower hinge') || nameStr.includes('wall-to-glass') || nameStr.includes('wh-180')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_ozone_oz_wh_180')!;
    }
    if (nameStr.includes('glass-to-glass') || nameStr.includes('g2g') || nameStr.includes('180°')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_ozone_oz_g2g_180')!;
    }
    if (nameStr.includes('spider') || nameStr.includes('4-way')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_ozone_sp_104')!;
    }
    if (nameStr.includes('spigot') || nameStr.includes('sr-2205') || nameStr.includes('balustrade')) {
        return HARDWARE_CUTOUT_TEMPLATES.find(t => t.id === 'cat_ozone_sr_2205')!;
    }

    // 4. Fallback by fittingRole or type
    const role = item.fittingRole?.toLowerCase() || '';
    if (role === 'floor_spring') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'floor_spring')!;
    if (role === 'bottom_patch') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'patch_bottom')!;
    if (role === 'top_patch') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'patch_top')!;
    if (role === 'overpanel_patch') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'patch_transom')!;
    if (role === 'wall_hinge') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'hinge_wall')!;
    if (role === 'glass_hinge') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'hinge_glass')!;
    if (role === 'door_lock' || role === 'sliding_lock') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'patch_lock')!;
    if (role === 'spigot') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'spigot_core_drill')!;
    if (role === 'connector') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'spider_2way')!;
    if (role === 'sliding_kit') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'sliding_top_clamp')!;
    if (role === 'handle') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'handle_pull')!;
    if (role === 'clamp') return HARDWARE_CUTOUT_TEMPLATES.find(t => t.fittingType === 'clamp_wall')!;

    // 5. Ultimate fallback default generic template
    return {
        id: 'generic_fitting',
        brand: 'Generic',
        name: 'Generic Architectural Fitting Cutout',
        description: 'Standard edge notch with 14mm hole prep',
        fittingType: 'other',
        notchWidthMm: 50,
        notchHeightMm: 50,
        cornerRadiusMm: 6,
        holes: [{ offsetXMm: 25, offsetYMm: 25, radiusMm: 7, countersunk: false }],
        deductionGapsMm: { top: 3, bottom: 3, hingeSide: 3, lockSide: 3 }
    };
}
