import { generateUUID } from '@/lib/utils';
import type { GlassItem, GlassPiece, KonvaShape, FittingRole, DesignData, DesignItem, HardwareEdge, ImageHardwareContext } from '@/types';
import { getCutoutSpecsForItem } from '@/lib/fabricationSpecs';

// Parametric "glass systems designer": given a system type (swing door,
// shower enclosure, fixed panel, sliding door, railing) plus real
// dimensions and a few options, generate the glass panel(s) with all the
// hardware placed at industry-standard positions -- instead of trying to
// perceive/count holes off a photo, which is unreliable.
//
// Hardware is sourced from the shop's OWN catalogue: each generated fitting
// is the real stocked item matching that role (its name, glass prep, rate,
// and item id), so the drawing, the hole/cut counts, and the priced BOM all
// come from one record. When a role isn't stocked yet, a sensible built-in
// default is used and the marker is named "(role) -- add a fitting" so it's
// obvious what to configure in Settings > Hardware Fittings.
//
// The output is ordinary GlassPiece[] in the exact canvas format
// GlassDesigner already renders (10 canvas units per inch) and prices
// (accessoryHoleCount/accessoryCutCount are summed by orderDesignItems.ts
// and the canvas totals), so this needs no changes to rendering or pricing.
//
// Placement standards come from common frameless-glass conventions: shower
// hinges 150-200mm in from top/bottom; door handle/lock ~1000mm above floor;
// patch cutout set back ~70mm; spider/standoff bolts inset from the edges.
// These are starting points a designer confirms on the canvas.

const U = 10; // canvas units per inch, matching GlassDesigner.createRectShape
const MM_PER_INCH = 25.4;
const inFromMm = (millimetres: number) => millimetres / MM_PER_INCH;

// --- Standard placement offsets (inches) ---
const SHOWER_HINGE_INSET_IN = inFromMm(175);   // 150-200mm from top & bottom edge
const HANDLE_HEIGHT_IN = inFromMm(1000);       // handle/lock center ~1000mm above floor
const PATCH_SETBACK_IN = inFromMm(70);         // patch preparation centre set back from both clamped edges
const DOOR_HINGE_END_INSET_IN = 4;             // frameless door hinges ~4in in from each end
const RAIL_END_INSET_IN = 4;                   // first/last roller or standoff in from the ends
const SPIDER_CORNER_INSET_IN = 3;              // bolt-hole inset from each corner for bolted glass

// --- Sliding-system norms ---
// A sliding panel never matches its fixed partner: the roller/slider set is
// carried on the sliding leaf, so that leaf is cut SHORTER by the slider
// allowance while the fixed panel runs the full opening height. And the two
// leaves are not butt-joined -- the slider laps over the fixed panel by a
// fixed amount so there's no sight gap when it's closed, which means the
// panels together are wider than the opening by one overlap per slider.
const SLIDER_SET_ALLOWANCE_IN = 2;   // sliding leaf is cut this much shorter (roller/track space)
const SLIDING_OVERLAP_IN = 2;        // slider laps this far over its fixed neighbour when closed

// --- L-bracket norms ---
// An L-bracket clamps a glass-to-glass 90 degree or glass-to-wall joint, so it
// belongs ON the joint edge, not out in the middle of the panel face, and its
// centres sit in from the panel ends the same way a hinge does rather than
// hard up against the corner. How many depends on the run: a short return
// takes two, a full-height partition wants three or four.
const L_BRACKET_END_INSET_IN = 4;
const FIXED_PANEL_L_CONNECTOR_GLASS_INSET_IN = 2;
const CENTRE_CONNECTOR_END_INSET_IN = 6;
const STANDARD_DOOR_OPENING_WIDTH_IN = 36;
const STANDARD_DOOR_HEIGHT_IN = 84;
const DOOR_WIDTH_CLEARANCE_IN = 0.25;
const DOOR_HEIGHT_CLEARANCE_IN = 0.5;
const OVERPANEL_TO_DOOR_CLEARANCE_IN = 0.5;
// Light-duty (Small) is adequate for modest returns; a tall or heavy leaf
// levers hard on the joint and takes the heavy-duty (Big) body. Glass weighs
// ~2.5 kg per m2 per mm of thickness.
const L_BRACKET_BIG_MIN_WEIGHT_KG = 30;
const L_BRACKET_BIG_MIN_HEIGHT_IN = 72;

// How deep the glass seats into a base channel -- the channel is drawn this
// tall along the bottom edge of the panel it holds.
const CHANNEL_DEPTH_IN = 1.5;

function panelWeightKg(widthIn: number, heightIn: number, thicknessMm: number): number {
    const areaSqM = (widthIn * heightIn * 0.00064516); // in^2 -> m^2
    return areaSqM * thicknessMm * 2.5;
}

function lBracketCountForHeight(heightIn: number): number {
    if (heightIn <= 36) return 2;
    if (heightIn <= 72) return 3;
    return 4;
}

// Which L-bracket this panel needs. Falls back through the generic
// 'connector' role so a shop that hasn't tagged its brackets yet still gets
// something sensible rather than nothing.
function lBracketRole(widthIn: number, heightIn: number, thicknessMm: number, resolver: FittingResolver): FittingRole {
    const heavy = panelWeightKg(widthIn, heightIn, thicknessMm) > L_BRACKET_BIG_MIN_WEIGHT_KG
        || heightIn > L_BRACKET_BIG_MIN_HEIGHT_IN;
    const preferred: FittingRole = heavy ? 'l_bracket_big' : 'l_bracket_small';
    if (resolver.has(preferred)) return preferred;
    const other: FittingRole = heavy ? 'l_bracket_small' : 'l_bracket_big';
    if (resolver.has(other)) return other;
    return 'connector';
}

// Place L-brackets down the vertical edge that meets the neighbouring panel
// or wall, straddling that joint.
function pushLBrackets(
    shapes: KonvaShape[],
    box: PanelBox,
    input: GlassSystemInput,
    jointSide: 'left' | 'right',
    resolver: FittingResolver
) {
    const role = lBracketRole(input.widthIn, input.heightIn, input.thickness, resolver);
    const edgeX = jointSide === 'left' ? box.leftX : box.leftX + box.widthU;
    for (const yU of evenPositions(
        lBracketCountForHeight(input.heightIn),
        box.topY,
        box.heightU,
        L_BRACKET_END_INSET_IN * U
    )) {
        shapes.push(hardware(
            box.id,
            role,
            edgeX,
            yU,
            resolver,
            undefined,
            jointSide === 'left' ? 'down-right' : 'down-left',
        ));
    }
}

const ORIGIN_X = 100;
const ORIGIN_Y = 80;
const PIECE_GAP_U = 2; // tight 2px (2mm) physical glass-to-glass joint gap for single-window system assembly

export type GlassSystemType =
    | 'basic'
    | 'swing_door'
    | 'single_door'
    | 'double_door'
    | 'shower_door'
    | 'fixed_panel'
    | 'fixed_panel_f'
    | 'sliding_door'
    | 'railing'
    | 'corner_shower_90'
    | 'corner_shower_135'
    | 'top_hung_sliding'
    | 'spider_facade'
    | 'patch_double_door'
    | 'sfsd'
    | 'dfsd'
    | 'sfdd'
    | 'dfdd'
    // --- Industry Standard Multi-Piece Presets ---
    | 'shower_inline_3pc'
    | 'shower_corner_90_3pc'
    | 'shower_sliding_2pc'
    | 'office_partition_3pc'
    | 'door_with_transom'
    | 'double_door_transom_sidelites_4pc'
    | 'balustrade_spigots'
    | 'sliding_4pc_patio'
    | 'spider_facade_4pc'
    | 'balustrade_spigots_3pc'
    | 'double_swing_transom_3pc';

export interface GlassSystemInput {
    systemType: GlassSystemType;
    widthIn: number;
    heightIn: number;
    thickness: number;
    hingeSide?: 'left' | 'right';
    // All orientation values are read while facing the installation from the
    // customer/front side. `doorPosition` controls which side of a single
    // fixed panel the door occupies; hinge/pivot side remains independent.
    doorPosition?: 'left' | 'centre' | 'right';
    swingDirection?: 'inward' | 'outward' | 'both';
    hasLock?: boolean;
    hasHandle?: boolean;
    pivotStyle?: 'patch' | 'hinges';
    fixedPanelWidthIn?: number;
    fixedPanelLeftWidthIn?: number;
    fixedPanelRightWidthIn?: number;
    transomHeightIn?: number;
    // Door width is the clear opening width for each leaf, so the glass loses
    // 2/8in. Door height is the required glass-leaf height when an overpanel
    // exists (84in by default). Without an overpanel, the leaf loses 4/8in
    // from the available opening height.
    doorWidthIn?: number;
    doorHeightIn?: number;
    fixingStyle?: 'channel' | 'spider' | 'standoff';
    // Glass colour/type used for per-sqft pricing (matched against the
    // thickness-pricing rows). Defaults to 'Toughened Clear'.
    glassType?: string;
    // Sliding-system overrides. Left unset, the standard allowances apply
    // (see SLIDER_SET_ALLOWANCE_IN / SLIDING_OVERLAP_IN); a job that uses a
    // different slider kit can set its own here.
    slidingAllowanceIn?: number;
    slidingOverlapIn?: number;
}

// Cutting sizes for a sliding system, derived from the OPENING size in
// `input` rather than used verbatim: `slidingPanels` leaves each lap over a
// neighbour, so the panels together span the opening plus one overlap per
// slider, and every sliding leaf loses the slider allowance off its height.
function slidingSystemSizes(input: GlassSystemInput, totalPanels: number, slidingPanels: number) {
    const allowance = input.slidingAllowanceIn ?? SLIDER_SET_ALLOWANCE_IN;
    const overlap = input.slidingOverlapIn ?? SLIDING_OVERLAP_IN;
    const panelWidthIn = (input.widthIn + overlap * slidingPanels) / totalPanels;
    return {
        allowance,
        overlap,
        panelWidthIn: Number(panelWidthIn.toFixed(3)),
        fixedHeightIn: input.heightIn,
        slidingHeightIn: Number(Math.max(input.heightIn - allowance, 1).toFixed(3)),
    };
}

// How each fitting role renders (KonvaShape.accessoryType only has four
// values, so every role maps to the closest), its default marker footprint,
// and the built-in glass prep used only when the shop hasn't stocked a
// fitting for that role yet.
const ROLE_SPEC: Record<FittingRole, {
    render: 'lock' | 'connector' | 'hinge' | 'profile';
    w: number; h: number;
    holes: number; cuts: number; holeRadiusIn: number; cutAreaSqIn: number;
    label: string;
}> = {
    top_patch:       { render: 'profile',   w: 60, h: 40, holes: 0, cuts: 1, holeRadiusIn: 0,    cutAreaSqIn: 8, label: 'Top patch' },
    bottom_patch:    { render: 'profile',   w: 60, h: 40, holes: 0, cuts: 1, holeRadiusIn: 0,    cutAreaSqIn: 8, label: 'Bottom patch' },
    overpanel_patch: { render: 'profile',   w: 60, h: 40, holes: 0, cuts: 1, holeRadiusIn: 0,    cutAreaSqIn: 8, label: 'TM-30 overpanel patch' },
    floor_spring:    { render: 'profile',   w: 60, h: 40, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Floor spring' },
    wall_hinge:      { render: 'hinge',     w: 30, h: 25, holes: 2, cuts: 1, holeRadiusIn: 0.25, cutAreaSqIn: 6, label: 'Hinge' },
    glass_hinge:     { render: 'hinge',     w: 30, h: 25, holes: 2, cuts: 1, holeRadiusIn: 0.25, cutAreaSqIn: 6, label: 'Glass hinge' },
    door_lock:       { render: 'lock',      w: 25, h: 25, holes: 1, cuts: 1, holeRadiusIn: 0.75, cutAreaSqIn: 6, label: 'Lock' },
    sliding_lock:    { render: 'lock',      w: 25, h: 25, holes: 1, cuts: 0, holeRadiusIn: 0.5,  cutAreaSqIn: 0, label: 'Sliding lock' },
    // The shop's handwritten F convention uses a drilled L Connector. This
    // is deliberately separate from the clamp-style Small L / Big L
    // brackets below, which require no glass drilling.
    l_connector:     { render: 'connector', w: 30, h: 24, holes: 1, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: 'L Connector' },
    glass_to_glass_connector: { render: 'connector', w: 42, h: 22, holes: 0, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: 'Glass-to-glass connector' },
    // L-brackets clamp the glass face; nothing is drilled or notched into the
    // panel for them. Big is the heavier/longer body, so it draws larger.
    l_bracket_small: { render: 'connector', w: 36, h: 36, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Small L bracket' },
    l_bracket_big:   { render: 'connector', w: 50, h: 50, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Big L bracket' },
    // Width is overridden at placement time to span the panel; nothing is
    // drilled for a channel, the glass just seats into it.
    base_channel:    { render: 'profile',   w: 120, h: 12, holes: 0, cuts: 0, holeRadiusIn: 0,   cutAreaSqIn: 0, label: 'Base channel' },
    connector:       { render: 'connector', w: 40, h: 20, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Connector' },
    clamp:           { render: 'connector', w: 30, h: 18, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Clamp' },
    spigot:          { render: 'connector', w: 26, h: 26, holes: 1, cuts: 0, holeRadiusIn: 0.5,  cutAreaSqIn: 0, label: 'Spigot' },
    handle:          { render: 'lock',      w: 22, h: 60, holes: 2, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: 'Handle' },
    sliding_kit:     { render: 'hinge',     w: 40, h: 22, holes: 2, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: 'Roller' },
    other:           { render: 'connector', w: 30, h: 24, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Fitting' },
};

// role -> the shop's stocked fitting for that role (first match wins; the
// designer UI can later let staff swap among multiple options per role).
type FittingResolver = Map<FittingRole, GlassItem>;

function buildResolver(fittings: GlassItem[]): FittingResolver {
    const byRole = new Map<FittingRole, GlassItem>();
    for (const f of fittings) {
        if (f.category === 'hardware' && f.fittingRole && !byRole.has(f.fittingRole)) {
            byRole.set(f.fittingRole, f);
        }
    }
    return byRole;
}

// Builds a hardware accessory marker for `role` centered on (cxU, cyU),
// using the shop's stocked fitting when available (real name/prep/rate/id)
// and the built-in default otherwise.
function hardware(
    parentId: string,
    role: FittingRole,
    cxU: number,
    cyU: number,
    resolver: FittingResolver,
    // Continuous fittings (a base channel, a top track) are as long as the
    // panel they run along, so their footprint can't come from ROLE_SPEC.
    sizeOverride?: { w?: number; h?: number },
    orientation?: KonvaShape['hardwareOrientation'],
): KonvaShape {
    const spec = ROLE_SPEC[role];
    const fitting = resolver.get(role);
    
    let holes = fitting?.holesRequired ?? spec.holes;
    let cuts = fitting?.cutsRequired ?? spec.cuts;
    let holeRadiusIn = spec.holeRadiusIn;
    let cutAreaSqIn = spec.cutAreaSqIn;
    let requirementLabel = `${holes} hole(s) + ${cuts} cut(s)`;

    if (fitting) {
        const cadSpec = getCutoutSpecsForItem(fitting);
        if (cadSpec && cadSpec.id !== 'generic_fitting') {
            if (fitting.holesRequired === undefined && cadSpec.holes) {
                holes = cadSpec.holes.length;
            }
            if (fitting.cutsRequired === undefined && cadSpec.notchWidthMm > 0) {
                cuts = 1;
            }
            if (cadSpec.holes && cadSpec.holes.length > 0) {
                holeRadiusIn = Number(((cadSpec.holes[0].radiusMm || 6) / 25.4).toFixed(3));
            }
            if (cadSpec.notchWidthMm > 0) {
                cutAreaSqIn = Number(((cadSpec.notchWidthMm * cadSpec.notchHeightMm) / 645.16).toFixed(2));
            }
            requirementLabel = `${cadSpec.name} [${cadSpec.brand}] (${holes} holes, ${cuts} notch)`;
        }
    }

    // Most catalogue names already lead with the brand, so only append the
    // make when it isn't in there already -- otherwise the marker on the
    // drawing reads "Ozone Big L-Connector Bracket (Ozone)".
    const nameHasMake = !!(fitting?.make && fitting.name?.toLowerCase().includes(fitting.make.toLowerCase()));
    const name = fitting?.name
        ? (fitting.make && !nameHasMake ? `${fitting.name} (${fitting.make})` : fitting.name)
        : `${spec.label} -- add a fitting`;
    return {
        id: generateUUID(),
        type: 'accessory',
        x: cxU - (sizeOverride?.w ?? spec.w) / 2,
        y: cyU - (sizeOverride?.h ?? spec.h) / 2,
        width: sizeOverride?.w ?? spec.w,
        height: sizeOverride?.h ?? spec.h,
        accessoryType: spec.render,
        fittingRole: role,
        ...(orientation ? { hardwareOrientation: orientation } : {}),
        accessoryName: name,
        parentId,
        ...(fitting ? { hardwareItemId: fitting.id, accessoryRate: fitting.rate } : {}),
        accessoryHoleCount: holes,
        accessoryCutCount: cuts,
        accessoryHoleRadiusIn: holeRadiusIn,
        accessoryCutAreaSqIn: cutAreaSqIn,
        accessoryRequirementLabel: requirementLabel,
    };
}

type PanelBox = { id: string; leftX: number; topY: number; widthU: number; heightU: number };

function predictedHardware(
    parentId: string,
    role: FittingRole,
    cxU: number,
    cyU: number,
    resolver: FittingResolver,
    reason: string,
    confidence: number,
    usesExistingGlassPrep = false,
): KonvaShape {
    const shape = hardware(parentId, role, cxU, cyU, resolver);
    return {
        ...shape,
        ...(usesExistingGlassPrep ? {
            accessoryHoleCount: 0,
            accessoryCutCount: 0,
            accessoryRequirementLabel: 'Uses the holes/cuts already marked on the customer drawing',
        } : {}),
        hardwarePredictionSource: 'image-standard',
        hardwarePredictionReason: reason,
        hardwarePredictionConfidence: confidence,
    };
}

function getImagePieceBox(piece: GlassPiece): PanelBox | null {
    const outline = piece.shapes.find(shape =>
        shape.type === 'glass_rect'
        || shape.type === 'glass_polygon'
        || shape.type === 'glass_parallelogram'
        || shape.type === 'glass_circle'
    );
    if (!outline) return null;
    if (outline.type === 'glass_circle') {
        const radius = outline.radius || 0;
        return {
            id: outline.id,
            leftX: outline.x - radius,
            topY: outline.y - radius,
            widthU: radius * 2,
            heightU: radius * 2,
        };
    }
    return {
        id: outline.id,
        leftX: outline.x,
        topY: outline.y,
        widthU: outline.width || 0,
        heightU: outline.height || 0,
    };
}

function observedHolesAtEdge(piece: GlassPiece, box: PanelBox, edge: HardwareEdge): KonvaShape[] {
    const thresholdX = Math.max(24, box.widthU * 0.08);
    const thresholdY = Math.max(24, box.heightU * 0.08);
    return piece.shapes.filter(shape => {
        if (shape.type !== 'hole' || (shape.parentId && shape.parentId !== box.id)) return false;
        if (edge === 'left') return Math.abs(shape.x - box.leftX) <= thresholdX;
        if (edge === 'right') return Math.abs(shape.x - (box.leftX + box.widthU)) <= thresholdX;
        if (edge === 'top') return Math.abs(shape.y - box.topY) <= thresholdY;
        return Math.abs(shape.y - (box.topY + box.heightU)) <= thresholdY;
    });
}

function inferLegacyImageHardwareContext(piece: GlassPiece, box: PanelBox): ImageHardwareContext {
    const text = `${piece.name} ${piece.type} ${piece.hardwareNotes || ''}`.toLowerCase();
    const isOverpanel = /\boverpanel|transom|ventilator\b/.test(text);
    const isDoor = !isOverpanel && /\bdoor|shutter|hinge|patch\b/.test(text);
    const wallEdges = (['left', 'right', 'top', 'bottom'] as HardwareEdge[])
        .filter(edge => observedHolesAtEdge(piece, box, edge).length > 0);
    const leftEvidence = observedHolesAtEdge(piece, box, 'left').length;
    const rightEvidence = observedHolesAtEdge(piece, box, 'right').length;
    const hasPatchEvidence = /\bpatch|pf.?10|pf.?20|pf.?30|tm.?30\b/.test(text)
        || piece.shapes.some(shape => shape.type === 'cut'
            && (shape.y <= box.topY + box.heightU * 0.15 || shape.y >= box.topY + box.heightU * 0.75));

    return {
        panelRole: isOverpanel ? 'overpanel' : isDoor ? 'door' : 'fixed_panel',
        wallEdges: isDoor ? [] : wallEdges,
        glassJoinEdges: [],
        glassJoinType: 'unknown',
        doorStyle: isDoor ? (hasPatchEvidence ? 'patch' : 'hinge') : 'none',
        hingeSide: leftEvidence === rightEvidence ? 'left' : leftEvidence > rightEvidence ? 'left' : 'right',
        hasLock: /\block\b/.test(text),
        hasHandle: /\bhandle\b/.test(text),
        supportsDoorPivot: isOverpanel && /\bpivot|patch|door\b/.test(text),
        confidence: isDoor || isOverpanel || wallEdges.length > 0 ? 0.62 : 0.35,
    };
}

function normalizeImageHardwareContext(context: ImageHardwareContext): ImageHardwareContext {
    const validEdges = new Set<HardwareEdge>(['left', 'right', 'top', 'bottom']);
    const normalizeEdges = (edges: HardwareEdge[] | undefined) => Array.from(new Set(
        Array.isArray(edges) ? edges.filter(edge => validEdges.has(edge)) : [],
    ));
    const confidence = Number(context.confidence);

    return {
        ...context,
        wallEdges: normalizeEdges(context.wallEdges),
        glassJoinEdges: normalizeEdges(context.glassJoinEdges),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    };
}

function positionsForEdge(
    piece: GlassPiece,
    box: PanelBox,
    edge: HardwareEdge,
    standardCount: number,
): { positions: Array<{ x: number; y: number }>; usesExistingGlassPrep: boolean } {
    const observed = observedHolesAtEdge(piece, box, edge);
    if (observed.length > 0) {
        return {
            positions: observed.map(hole => ({ x: hole.x, y: hole.y })),
            usesExistingGlassPrep: true,
        };
    }

    const inset = L_BRACKET_END_INSET_IN * U;
    if (edge === 'left' || edge === 'right') {
        const x = edge === 'left' ? box.leftX : box.leftX + box.widthU;
        return {
            positions: evenPositions(standardCount, box.topY, box.heightU, inset).map(y => ({ x, y })),
            usesExistingGlassPrep: false,
        };
    }
    const y = edge === 'top' ? box.topY : box.topY + box.heightU;
    return {
        positions: evenPositions(standardCount, box.leftX, box.widthU, inset).map(x => ({ x, y })),
        usesExistingGlassPrep: false,
    };
}

function connectorResolver(fittings: GlassItem[], fallback: FittingResolver, joinType: ImageHardwareContext['glassJoinType']): FittingResolver {
    const preferred = fittings.find(item => {
        if (item.category !== 'hardware') return false;
        const name = item.name.toLowerCase();
        if (joinType === 'inline') return /\b2-way inline\b|\b180[°\s].*(?:connector|spider)\b/.test(name);
        return /\b90[°\s].*(?:connector|spider)\b|\bcorner.*(?:connector|spider)\b/.test(name);
    });
    if (!preferred) return fallback;
    const copy = new Map(fallback);
    copy.set('connector', preferred);
    return copy;
}

function fixedPanelHeightConnectorCount(heightIn: number): number {
    if (heightIn <= 24) return 1;
    if (heightIn <= 72) return 2;
    if (heightIn <= 108) return 3;
    return 4;
}

function fixedPanelWidthConnectorCount(widthIn: number): number {
    if (widthIn <= 12) return 1;
    if (widthIn <= 48) return 2;
    return 3;
}

function fixedPanelEdgePositions(box: PanelBox, edge: HardwareEdge, count: number): Array<{ x: number; y: number }> {
    const glassInset = FIXED_PANEL_L_CONNECTOR_GLASS_INSET_IN * U;
    const equalGapPositions = (startU: number, spanU: number): number[] =>
        Array.from({ length: count }, (_, index) => startU + (spanU * (index + 1)) / (count + 1));

    if (edge === 'left' || edge === 'right') {
        const x = edge === 'left'
            ? box.leftX + glassInset
            : box.leftX + box.widthU - glassInset;
        return equalGapPositions(box.topY, box.heightU).map(y => ({ x, y }));
    }
    const y = edge === 'top'
        ? box.topY + glassInset
        : box.topY + box.heightU - glassInset;
    return equalGapPositions(box.leftX, box.widthU).map(x => ({ x, y }));
}

function addFixedPanelLConnectors(
    piece: GlassPiece,
    edges: HardwareEdge[],
    resolver: FittingResolver,
): GlassPiece {
    const box = getImagePieceBox(piece);
    if (!box) return piece;
    const widthIn = box.widthU / U;
    const heightIn = box.heightU / U;
    const additions: KonvaShape[] = [];

    edges.forEach(edge => {
        const count = edge === 'left' || edge === 'right'
            ? fixedPanelHeightConnectorCount(heightIn)
            : fixedPanelWidthConnectorCount(widthIn);
        fixedPanelEdgePositions(box, edge, count).forEach(position => {
            additions.push(predictedHardware(
                box.id,
                'l_connector',
                position.x,
                position.y,
                resolver,
                `F fixed-panel rule: ${count} equally spaced L Connector${count === 1 ? '' : 's'} on the ${edge} edge; hole centres ${FIXED_PANEL_L_CONNECTOR_GLASS_INSET_IN}in inside glass`,
                1,
            ));
        });
    });

    return { ...piece, shapes: [...piece.shapes, ...additions] };
}

function splitImageRegion(
    region: GlassPiece['imageRegion'],
    side: 'left' | 'right',
): GlassPiece['imageRegion'] {
    if (!region) return region;
    const midpoint = (region.xMin + region.xMax) / 2;
    return side === 'left'
        ? { ...region, xMax: midpoint }
        : { ...region, xMin: midpoint };
}

function splitFixedPanelPiece(piece: GlassPiece): [GlassPiece, GlassPiece] | null {
    const outline = piece.shapes.find(shape => shape.type === 'glass_rect');
    if (!outline || !outline.width || !outline.height) return null;
    const halfWidth = outline.width / 2;
    const splitX = outline.x + halfWidth;
    const leftOutlineId = generateUUID();
    const rightOutlineId = generateUUID();
    const leftShapes: KonvaShape[] = [{
        ...outline,
        id: leftOutlineId,
        width: halfWidth,
    }];
    const rightShapes: KonvaShape[] = [{
        ...outline,
        id: rightOutlineId,
        width: halfWidth,
    }];

    piece.shapes.forEach(shape => {
        if (shape.id === outline.id || shape.type === 'accessory') return;
        const centerX = shape.type === 'cut'
            ? shape.x + (shape.width || 0) / 2
            : shape.x;
        if (centerX <= splitX) {
            leftShapes.push({ ...shape, id: generateUUID(), parentId: leftOutlineId });
        } else {
            rightShapes.push({
                ...shape,
                id: generateUUID(),
                x: shape.x - halfWidth,
                parentId: rightOutlineId,
            });
        }
    });

    return [
        {
            ...piece,
            id: generateUUID(),
            name: `${piece.name} - Left`,
            connectedToPrevious: false,
            imageRegion: splitImageRegion(piece.imageRegion, 'left'),
            shapes: leftShapes,
        },
        {
            ...piece,
            id: generateUUID(),
            name: `${piece.name} - Right`,
            connectedToPrevious: true,
            imageRegion: splitImageRegion(piece.imageRegion, 'right'),
            shapes: rightShapes,
        },
    ];
}

function addCentreGlassConnectors(
    leftPiece: GlassPiece,
    rightPiece: GlassPiece,
    resolver: FittingResolver,
): [GlassPiece, GlassPiece] {
    const leftBox = getImagePieceBox(leftPiece);
    const rightBox = getImagePieceBox(rightPiece);
    if (!leftBox || !rightBox) return [leftPiece, rightPiece];
    const heightIn = leftBox.heightU / U;
    const count = fixedPanelHeightConnectorCount(heightIn);
    const positions = evenPositions(
        count,
        leftBox.topY,
        leftBox.heightU,
        CENTRE_CONNECTOR_END_INSET_IN * U,
    );
    const holeInset = U;
    const holeRadius = 0.25 * U;
    const leftAdditions: KonvaShape[] = [];
    const rightAdditions: KonvaShape[] = [];

    positions.forEach(y => {
        const fitting = predictedHardware(
            leftBox.id,
            'glass_to_glass_connector',
            leftBox.leftX + leftBox.widthU,
            y,
            resolver,
            `F split-panel rule: glass-to-glass connector at the centre joint (${count} along the height)`,
            1,
        );
        leftAdditions.push({
            ...fitting,
            accessoryHoleCount: 0,
            accessoryCutCount: 0,
            accessoryRequirementLabel: 'Two glass holes, one on each side of the centre joint',
        });
        leftAdditions.push({
            id: generateUUID(),
            type: 'hole',
            x: leftBox.leftX + leftBox.widthU - holeInset,
            y,
            radius: holeRadius,
            parentId: leftBox.id,
        });
        rightAdditions.push({
            id: generateUUID(),
            type: 'hole',
            x: rightBox.leftX + holeInset,
            y,
            radius: holeRadius,
            parentId: rightBox.id,
        });
    });

    return [
        { ...leftPiece, shapes: [...leftPiece.shapes, ...leftAdditions] },
        { ...rightPiece, shapes: [...rightPiece.shapes, ...rightAdditions] },
    ];
}

/**
 * Applies the shop's literal handwritten image codes before the more general
 * vision-based hardware predictor runs.
 *
 * B: no automatic hardware or preparation.
 * F: when the labelled piece is an independent drawing, fix every outer edge
 * with drilled L Connectors using the owner's size table. Panels wider than
 * 6ft are split equally and joined down the centre.
 */
export function applyImageDesignConventions(
    pieces: GlassPiece[],
    fittings: GlassItem[] = [],
    originalPieceCount = pieces.length,
): GlassPiece[] {
    void originalPieceCount; // Kept for compatibility with older callers.
    const resolver = buildResolver(fittings);

    return pieces.flatMap((originalPiece, index) => {
        const belongsToConnectedRun = !!originalPiece.connectedToPrevious
            || !!pieces[index + 1]?.connectedToPrevious;
        if (originalPiece.imageDesignCode !== 'F' || belongsToConnectedRun) return originalPiece;

        // A deterministic F rule replaces uncertain marks hallucinated by the
        // broad image pass, while preserving every explicitly positioned hole
        // or cut the customer actually dimensioned.
        const piece = {
            ...originalPiece,
            shapes: originalPiece.shapes.filter(shape => shape.positionSource !== 'estimated-fallback'),
        };
        const box = getImagePieceBox(piece);
        if (!box) return originalPiece;
        const widthIn = box.widthU / U;

        if (widthIn <= 72) {
            return addFixedPanelLConnectors(piece, ['left', 'right', 'top', 'bottom'], resolver);
        }

        const split = splitFixedPanelPiece(piece);
        if (!split) return piece;
        const left = addFixedPanelLConnectors(split[0], ['left', 'top', 'bottom'], resolver);
        const right = addFixedPanelLConnectors(split[1], ['right', 'top', 'bottom'], resolver);
        return addCentreGlassConnectors(left, right, resolver);
    });
}

/**
 * Adds catalogue-backed hardware predictions to image-extracted pieces.
 * Explicit per-piece vision context wins; older drafts fall back to cautious
 * shape/name inference so they can be upgraded when opened in the editor.
 */
export function predictImagePieceHardware(pieces: GlassPiece[], fittings: GlassItem[] = []): GlassPiece[] {
    const resolver = buildResolver(fittings);

    return pieces.map(piece => {
        if (piece.source !== 'whatsapp-image' && piece.source !== 'email-image') return piece;
        if (piece.imageDesignCode === 'B' || piece.imageDesignCode === 'F') return piece;
        if (piece.shapes.some(shape => shape.type === 'accessory')) return piece;

        const box = getImagePieceBox(piece);
        if (!box || box.widthU <= 0 || box.heightU <= 0) return piece;
        const context = normalizeImageHardwareContext(
            piece.hardwareContext || inferLegacyImageHardwareContext(piece, box),
        );
        if (context.confidence < 0.5) return piece;

        const widthIn = box.widthU / U;
        const heightIn = box.heightU / U;
        const thickness = Number(piece.thickness) || 10;
        const additions: KonvaShape[] = [];

        if (context.panelRole === 'fixed_panel' || context.panelRole === 'sidelight') {
            for (const edge of context.wallEdges) {
                const role = lBracketRole(widthIn, heightIn, thickness, resolver);
                const placement = positionsForEdge(piece, box, edge, edge === 'left' || edge === 'right'
                    ? lBracketCountForHeight(heightIn)
                    : Math.max(2, Math.ceil(widthIn / 36)));
                placement.positions.forEach(position => additions.push(predictedHardware(
                    box.id,
                    role,
                    position.x,
                    position.y,
                    resolver,
                    `${edge} edge is fixed to a wall; ${ROLE_SPEC[role].label} selected from panel size and weight`,
                    context.confidence,
                    placement.usesExistingGlassPrep,
                )));
            }

            for (const edge of context.glassJoinEdges) {
                const isLarge = panelWeightKg(widthIn, heightIn, thickness) > L_BRACKET_BIG_MIN_WEIGHT_KG
                    || heightIn > L_BRACKET_BIG_MIN_HEIGHT_IN
                    || widthIn > 60;
                const useStructuralConnector = isLarge && context.glassJoinType === 'inline';
                const role: FittingRole = useStructuralConnector
                    ? 'connector'
                    : lBracketRole(widthIn, heightIn, thickness, resolver);
                const selectedResolver = useStructuralConnector
                    ? connectorResolver(fittings, resolver, context.glassJoinType)
                    : resolver;
                const placement = positionsForEdge(piece, box, edge, edge === 'left' || edge === 'right'
                    ? lBracketCountForHeight(heightIn)
                    : Math.max(2, Math.ceil(widthIn / 36)));
                placement.positions.forEach(position => additions.push(predictedHardware(
                    box.id,
                    role,
                    position.x,
                    position.y,
                    selectedResolver,
                    useStructuralConnector
                        ? `${edge} edge joins another large fixed panel; inline glass-to-glass connector selected`
                        : `${edge} edge joins glass at ${context.glassJoinType === 'corner' ? '90 degrees' : 'a corner'}; L bracket selected`,
                    context.confidence,
                    placement.usesExistingGlassPrep,
                )));
            }
        }

        if (context.panelRole === 'door') {
            const hingeSide = context.hingeSide || 'left';
            const hingeX = hingeSide === 'left' ? box.leftX : box.leftX + box.widthU;
            const leadX = hingeSide === 'left' ? box.leftX + box.widthU : box.leftX;
            const edgeInset = 6;
            const hingeMarkX = hingeSide === 'left' ? hingeX + edgeInset : hingeX - edgeInset;
            const leadMarkX = hingeSide === 'left' ? leadX - edgeInset : leadX + edgeInset;

            if (context.doorStyle === 'patch' || context.doorStyle === 'unknown') {
                const setback = PATCH_SETBACK_IN * U;
                const dx = (hingeSide === 'left' ? setback : -setback) / 2;
                additions.push(predictedHardware(
                    box.id, 'top_patch', hingeMarkX + dx, box.topY + setback / 2, resolver,
                    'Frameless pivot door: top patch selected', context.confidence,
                ));
                additions.push(predictedHardware(
                    box.id, 'bottom_patch', hingeMarkX + dx, box.topY + box.heightU - setback / 2, resolver,
                    'Frameless pivot door: bottom patch selected', context.confidence,
                ));
            } else if (context.doorStyle === 'hinge') {
                const hingeRole: FittingRole = context.glassJoinEdges.includes(hingeSide) ? 'glass_hinge' : 'wall_hinge';
                for (const y of evenPositions(hingeCountForHeight(heightIn), box.topY, box.heightU, DOOR_HINGE_END_INSET_IN * U)) {
                    additions.push(predictedHardware(
                        box.id, hingeRole, hingeMarkX, y, resolver,
                        context.glassJoinEdges.includes(hingeSide)
                            ? 'Door hinge edge meets fixed glass; glass-to-glass hinge selected'
                            : 'Door hinge edge meets wall/frame; wall hinge selected',
                        context.confidence,
                    ));
                }
            }

            const handleY = Math.max(box.topY + 40, Math.min(
                box.topY + box.heightU - 40,
                box.topY + box.heightU - HANDLE_HEIGHT_IN * U,
            ));
            if (context.hasLock) {
                additions.push(predictedHardware(
                    box.id, 'door_lock', leadMarkX, handleY, resolver,
                    'Lock is marked on the door drawing', context.confidence,
                ));
            }
            if (context.hasHandle) {
                additions.push(predictedHardware(
                    box.id, 'handle', leadMarkX, context.hasLock ? handleY - 70 : handleY, resolver,
                    'Handle is marked on the door drawing', context.confidence,
                ));
            }
        }

        if ((context.panelRole === 'overpanel' || context.panelRole === 'transom') && context.supportsDoorPivot) {
            const pivotSide = context.hingeSide || 'left';
            const setback = PATCH_SETBACK_IN * U;
            const x = pivotSide === 'left'
                ? box.leftX + setback / 2
                : box.leftX + box.widthU - setback / 2;
            additions.push(predictedHardware(
                box.id, 'overpanel_patch', x, box.topY + box.heightU - setback / 2, resolver,
                'Overpanel carries the door top pivot; TM-30/PF-30 overpanel patch selected',
                context.confidence,
            ));
        }

        if (additions.length === 0) return { ...piece, hardwareContext: context };
        return {
            ...piece,
            hardwareContext: context,
            shapes: [...piece.shapes, ...additions],
        };
    });
}

function rectPanel(widthIn: number, heightIn: number, originX: number): { shape: KonvaShape; box: PanelBox } {
    const id = generateUUID();
    const widthU = widthIn * U;
    const heightU = heightIn * U;
    const shape: KonvaShape = { id, type: 'glass_rect', x: originX, y: ORIGIN_Y, width: widthU, height: heightU };
    return { shape, box: { id, leftX: originX, topY: ORIGIN_Y, widthU, heightU } };
}

function evenPositions(count: number, startU: number, spanU: number, insetU: number): number[] {
    if (count <= 0) return [];
    if (count === 1) return [startU + spanU / 2];
    const usable = spanU - 2 * insetU;
    return Array.from({ length: count }, (_, i) => startU + insetU + (usable * i) / (count - 1));
}

function hingeCountForHeight(heightIn: number): number {
    return heightIn <= 90 ? 2 : 3;
}

function buildDoorPiece(name: string, input: GlassSystemInput, originX: number, resolver: FittingResolver): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const hingeSide = input.hingeSide ?? 'left';
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    shape.widthDimensionPosition = 'bottom';
    shape.heightDimensionPosition = 'inside';
    shape.forceHeightDimension = true;
    const shapes: KonvaShape[] = [shape];

    const hingeEdgeX = hingeSide === 'left' ? box.leftX : box.leftX + box.widthU;
    const leadingEdgeX = hingeSide === 'left' ? box.leftX + box.widthU : box.leftX;
    const edgeInset = 6;
    const hingeMarkX = hingeSide === 'left' ? hingeEdgeX + edgeInset : hingeEdgeX - edgeInset;
    const leadMarkX = hingeSide === 'left' ? leadingEdgeX - edgeInset : leadingEdgeX + edgeInset;
    const isShower = input.systemType === 'shower_door';

    if (input.systemType === 'swing_door' && input.pivotStyle === 'patch') {
        const setback = PATCH_SETBACK_IN * U;
        const patchX = hingeSide === 'left' ? box.leftX + setback : box.leftX + box.widthU - setback;
        shapes.push(hardware(box.id, 'top_patch', patchX, box.topY + setback, resolver));
        shapes.push(hardware(box.id, 'bottom_patch', patchX, box.topY + box.heightU - setback, resolver));
    } else {
        const count = isShower ? 2 : hingeCountForHeight(heightIn);
        const inset = (isShower ? SHOWER_HINGE_INSET_IN : DOOR_HINGE_END_INSET_IN) * U;
        const hingeRole: FittingRole = 'wall_hinge';
        for (const yU of evenPositions(count, box.topY, box.heightU, inset)) {
            shapes.push(hardware(box.id, hingeRole, hingeMarkX, yU, resolver));
        }
    }

    const handleCenterY = box.topY + box.heightU - HANDLE_HEIGHT_IN * U;
    const clampedHandleY = Math.max(box.topY + 40, Math.min(box.topY + box.heightU - 40, handleCenterY));
    if (input.hasLock) {
        shapes.push(hardware(box.id, 'door_lock', leadMarkX, clampedHandleY, resolver));
    }
    if (input.hasHandle && !isShower) {
        shapes.push(hardware(box.id, 'handle', leadMarkX, input.hasLock ? clampedHandleY - 70 : clampedHandleY, resolver));
    }

    return { name, type: 'Door', thickness, quantity: 1, shapes };
}

function buildBasicPiece(name: string, input: GlassSystemInput, originX: number): Omit<GlassPiece, 'id'> {
    const { shape } = rectPanel(input.widthIn, input.heightIn, originX);
    return { name, type: 'Basic Glass', thickness: input.thickness, quantity: 1, shapes: [shape] };
}

function buildOwnerFixedPanelPieces(input: GlassSystemInput, fittings: GlassItem[]): Array<Omit<GlassPiece, 'id'>> {
    const { shape } = rectPanel(input.widthIn, input.heightIn, ORIGIN_X);
    const base: GlassPiece = {
        id: generateUUID(),
        name: 'Fixed Panel',
        type: 'Fixed Panel',
        thickness: input.thickness,
        quantity: 1,
        imageDesignCode: 'F',
        shapes: [shape],
    };
    return applyImageDesignConventions([base], fittings, 1).map(piece => {
        const generated = { ...piece } as Partial<GlassPiece>;
        delete generated.id;
        delete generated.imageDesignCode;
        return generated as Omit<GlassPiece, 'id'>;
    });
}

function buildFixedPanelPiece(name: string, input: GlassSystemInput, originX: number, resolver: FittingResolver, pieceType = 'Partition', jointSide: 'left' | 'right' = 'left'): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    const shapes: KonvaShape[] = [shape];
    const style = input.fixingStyle ?? 'channel';

    if (style === 'spider') {
        const inset = SPIDER_CORNER_INSET_IN * U;
        const xs = [box.leftX + inset, box.leftX + box.widthU - inset];
        const ys = [box.topY + inset, box.topY + box.heightU - inset];
        for (const x of xs) for (const y of ys) shapes.push(hardware(box.id, 'spigot', x, y, resolver));
    } else if (style === 'standoff') {
        const count = Math.max(2, Math.round(widthIn / 24));
        for (const xU of evenPositions(count, box.leftX, box.widthU, RAIL_END_INSET_IN * U)) {
            shapes.push(hardware(box.id, 'spigot', xU, box.topY + box.heightU - 4 * U, resolver));
        }
    } else {
        pushLBrackets(shapes, box, input, jointSide, resolver);
    }

    return { name, type: pieceType, thickness, quantity: 1, shapes };
}

function buildSlidingDoorPiece(name: string, input: GlassSystemInput, originX: number, resolver: FittingResolver): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    const shapes: KonvaShape[] = [shape];

    for (const xU of evenPositions(2, box.leftX, box.widthU, RAIL_END_INSET_IN * U)) {
        shapes.push(hardware(box.id, 'sliding_kit', xU, box.topY + 3 * U, resolver));
    }
    if (input.hasLock) {
        const leadX = (input.hingeSide ?? 'left') === 'left' ? box.leftX + box.widthU - 6 : box.leftX + 6;
        shapes.push(hardware(box.id, 'sliding_lock', leadX, box.topY + box.heightU / 2, resolver));
    }
    if (input.hasHandle) {
        const by = box.topY + box.heightU;
        const cy = Math.max(box.topY + 40, Math.min(by - 40, by - HANDLE_HEIGHT_IN * U));
        const leadX = (input.hingeSide ?? 'left') === 'left' ? box.leftX + box.widthU - 6 : box.leftX + 6;
        shapes.push(hardware(box.id, 'handle', leadX, cy, resolver));
    }

    return { name, type: 'Sliding Door', thickness, quantity: 1, shapes };
}

function buildRailingPiece(name: string, input: GlassSystemInput, originX: number, resolver: FittingResolver): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    const shapes: KonvaShape[] = [shape];
    const style = input.fixingStyle ?? 'channel';

    if (style === 'standoff' || style === 'spider') {
        const count = Math.max(2, Math.round(widthIn / 18));
        for (const xU of evenPositions(count, box.leftX, box.widthU, RAIL_END_INSET_IN * U)) {
            shapes.push(hardware(box.id, 'spigot', xU, box.topY + box.heightU - 3 * U, resolver));
        }
    } else {
        // Channel-fixed: the glass seats into ONE continuous base channel that
        // runs the whole panel, so draw it spanning the full width along the
        // bottom edge rather than as a single point fitting floating at the
        // centre of the panel (which is what this used to do).
        const channelRole: FittingRole = resolver.has('base_channel') ? 'base_channel' : 'connector';
        const channelHeightU = CHANNEL_DEPTH_IN * U;
        const channel = hardware(
            box.id,
            channelRole,
            box.leftX + box.widthU / 2,
            box.topY + box.heightU - channelHeightU / 2,
            resolver,
            { w: box.widthU, h: channelHeightU }
        );
        // State the run length on the marker. Channel is commonly sold by the
        // metre while the BOM counts one line per marker, so whoever prices it
        // can see how much length this single line actually represents instead
        // of having to measure it off the drawing.
        // Channel is sold by the metre, so record the run length -- the pricing
        // path bills length x per-metre rate off this instead of one flat piece.
        const runMetres = Number((widthIn * 0.0254).toFixed(3));
        channel.accessoryLengthM = runMetres;
        channel.accessoryRequirementLabel = `continuous run ${widthIn}in (${runMetres.toFixed(2)} m)`;
        shapes.push(channel);
    }

    return { name, type: 'Railing', thickness, quantity: 1, shapes };
}

type FixedDoorAssemblyType = 'sfsd' | 'dfsd' | 'sfdd' | 'dfdd';

interface AssemblySection {
    name: string;
    type: string;
    outline: KonvaShape;
    shapes: KonvaShape[];
}

function doorAssemblyHeights(input: GlassSystemInput): {
    doorGlassHeightIn: number;
    overpanelHeightIn: number;
} {
    const requestedDoorHeightIn = Math.min(input.doorHeightIn || STANDARD_DOOR_HEIGHT_IN, input.heightIn);
    const availableOverpanelHeightIn = input.heightIn
        - requestedDoorHeightIn
        - OVERPANEL_TO_DOOR_CLEARANCE_IN;

    if (availableOverpanelHeightIn > 0) {
        return {
            doorGlassHeightIn: Math.max(requestedDoorHeightIn, 1),
            overpanelHeightIn: availableOverpanelHeightIn,
        };
    }

    return {
        doorGlassHeightIn: Math.max(input.heightIn - DOOR_HEIGHT_CLEARANCE_IN, 1),
        overpanelHeightIn: 0,
    };
}

function assemblyRect(name: string, type: string, x: number, y: number, widthIn: number, heightIn: number): AssemblySection {
    const outline: KonvaShape = {
        id: generateUUID(),
        type: 'glass_rect',
        x,
        y,
        width: widthIn * U,
        height: heightIn * U,
        glassSectionName: name,
        ...(type === 'Door' ? {
            widthDimensionPosition: 'bottom' as const,
            heightDimensionPosition: 'inside' as const,
            forceHeightDimension: true,
        } : type === 'Transom' ? {
            heightDimensionPosition: 'inside' as const,
            forceHeightDimension: true,
        } : {}),
    };
    return { name, type, outline, shapes: [outline] };
}

function addAssemblyFixedPanelHardware(
    section: AssemblySection,
    edges: HardwareEdge[],
    thickness: number,
    resolver: FittingResolver,
): AssemblySection {
    const withHardware = addFixedPanelLConnectors({
        id: generateUUID(),
        name: section.name,
        type: section.type,
        thickness,
        shapes: section.shapes,
    }, edges, resolver);
    return { ...section, shapes: withHardware.shapes };
}

function addAssemblyDoorHardware(
    section: AssemblySection,
    hingeSide: 'left' | 'right',
    pivotStyle: 'patch' | 'hinges',
    hingeAgainstGlass: boolean,
    hasLock: boolean,
    hasHandle: boolean,
    resolver: FittingResolver,
): AssemblySection {
    const box = getImagePieceBox({
        id: generateUUID(),
        name: section.name,
        type: section.type,
        thickness: 0,
        shapes: section.shapes,
    });
    if (!box) return section;

    const setback = PATCH_SETBACK_IN * U;
    const edgeInset = 6;
    const hingeX = hingeSide === 'left'
        ? box.leftX + (pivotStyle === 'patch' ? setback : edgeInset)
        : box.leftX + box.widthU - (pivotStyle === 'patch' ? setback : edgeInset);
    const leadingX = hingeSide === 'left'
        ? box.leftX + box.widthU - (pivotStyle === 'patch' ? setback : edgeInset)
        : box.leftX + (pivotStyle === 'patch' ? setback : edgeInset);
    const bottomY = box.topY + box.heightU;
    const handleY = Math.max(box.topY + 40, bottomY - HANDLE_HEIGHT_IN * U);
    const additions: KonvaShape[] = [];

    if (pivotStyle === 'patch') {
        additions.push(hardware(box.id, 'top_patch', hingeX, box.topY + setback, resolver));
        additions.push(hardware(box.id, 'bottom_patch', hingeX, bottomY - setback, resolver));
        additions.push(hardware(box.id, 'floor_spring', hingeX, bottomY - setback / 2, resolver));
    } else {
        const hingeRole: FittingRole = hingeAgainstGlass ? 'glass_hinge' : 'wall_hinge';
        for (const y of evenPositions(
            hingeCountForHeight(box.heightU / U),
            box.topY,
            box.heightU,
            DOOR_HINGE_END_INSET_IN * U,
        )) {
            additions.push(hardware(box.id, hingeRole, hingeX, y, resolver));
        }
    }
    if (hasLock) additions.push(hardware(box.id, 'door_lock', leadingX, bottomY - setback, resolver));
    if (hasHandle) additions.push(hardware(box.id, 'handle', leadingX, handleY, resolver));
    return { ...section, shapes: [...section.shapes, ...additions] };
}

function addAssemblyGlassJoin(
    left: AssemblySection,
    right: AssemblySection,
    joinTopY: number,
    joinHeightU: number,
    resolver: FittingResolver,
): void {
    if (joinHeightU <= 12 * U) return;
    const leftBox = getImagePieceBox({ id: generateUUID(), name: left.name, type: left.type, thickness: 0, shapes: left.shapes });
    const rightBox = getImagePieceBox({ id: generateUUID(), name: right.name, type: right.type, thickness: 0, shapes: right.shapes });
    if (!leftBox || !rightBox) return;

    const count = fixedPanelHeightConnectorCount(joinHeightU / U);
    const ys = Array.from({ length: count }, (_, index) => joinTopY + (joinHeightU * (index + 1)) / (count + 1));
    const jointX = leftBox.leftX + leftBox.widthU;
    const holeInset = U;
    const holeRadius = 0.25 * U;

    ys.forEach(y => {
        const fitting = hardware(leftBox.id, 'glass_to_glass_connector', jointX, y, resolver);
        left.shapes.push({
            ...fitting,
            accessoryHoleCount: 0,
            accessoryCutCount: 0,
            accessoryRequirementLabel: 'Two glass holes, one on each side of the glass-to-glass joint',
        });
        left.shapes.push({
            id: generateUUID(),
            type: 'hole',
            x: jointX - holeInset,
            y,
            radius: holeRadius,
            parentId: leftBox.id,
        });
        right.shapes.push({
            id: generateUUID(),
            type: 'hole',
            x: jointX + holeInset,
            y,
            radius: holeRadius,
            parentId: rightBox.id,
        });
    });
}

function buildFixedDoorAssembly(
    input: GlassSystemInput & { systemType: FixedDoorAssemblyType },
    resolver: FittingResolver,
): Omit<GlassPiece, 'id'> | null {
    const fixedCount = input.systemType === 'dfsd' || input.systemType === 'dfdd' ? 2 : 1;
    const doorCount = input.systemType === 'sfdd' || input.systemType === 'dfdd' ? 2 : 1;
    const doorOpeningWidthIn = input.doorWidthIn || STANDARD_DOOR_OPENING_WIDTH_IN;
    const openingWidthIn = doorOpeningWidthIn * doorCount;
    const remainingFixedWidthIn = input.widthIn - openingWidthIn;
    if (remainingFixedWidthIn <= 0 || input.heightIn <= 0) return null;

    const fixedWidthIn = remainingFixedWidthIn / fixedCount;
    const doorPosition = fixedCount === 2 ? 'centre' : (input.doorPosition || 'right');
    const hasLeftFixed = fixedCount === 2 || doorPosition === 'right';
    const hasRightFixed = fixedCount === 2 || doorPosition === 'left';
    const { doorGlassHeightIn, overpanelHeightIn } = doorAssemblyHeights(input);
    const doorGlassWidthIn = Math.max(doorOpeningWidthIn - DOOR_WIDTH_CLEARANCE_IN, 1);
    const doorSideClearanceIn = (doorOpeningWidthIn - doorGlassWidthIn) / 2;
    const openingX = ORIGIN_X + (hasLeftFixed ? fixedWidthIn * U : 0);
    const doorTopY = ORIGIN_Y + Math.max(input.heightIn - doorGlassHeightIn, 0) * U;
    const sections: AssemblySection[] = [];

    let leftFixed: AssemblySection | null = null;
    if (hasLeftFixed) {
        leftFixed = assemblyRect('Left Fixed Panel', 'Partition', ORIGIN_X, ORIGIN_Y, fixedWidthIn, input.heightIn);
        leftFixed = addAssemblyFixedPanelHardware(leftFixed, ['left', 'top', 'bottom'], input.thickness, resolver);
        sections.push(leftFixed);
    }

    let overpanel: AssemblySection | null = null;
    if (overpanelHeightIn > 0) {
        overpanel = assemblyRect('Door Overpanel', 'Transom', openingX, ORIGIN_Y, openingWidthIn, overpanelHeightIn);
        const overpanelEdges: HardwareEdge[] = fixedCount === 1 && overpanelHeightIn > 12
            ? ['top', doorPosition === 'left' ? 'left' : 'right']
            : ['top'];
        overpanel = addAssemblyFixedPanelHardware(overpanel, overpanelEdges, input.thickness, resolver);
        sections.push(overpanel);
    }

    const doors: AssemblySection[] = [];
    const pivotStyle = input.pivotStyle || 'patch';
    const hasLock = input.hasLock !== false;
    const hasHandle = input.hasHandle !== false;
    if (doorCount === 1) {
        const hingeSide = input.hingeSide || 'left';
        const hingeAgainstGlass = hingeSide === 'left' ? hasLeftFixed : hasRightFixed;
        let door = assemblyRect(
            'Single Glass Door',
            'Door',
            openingX + doorSideClearanceIn * U,
            doorTopY,
            doorGlassWidthIn,
            doorGlassHeightIn,
        );
        door = addAssemblyDoorHardware(
            door,
            hingeSide,
            pivotStyle,
            hingeAgainstGlass,
            hasLock,
            hasHandle,
            resolver,
        );
        doors.push(door);
    } else {
        let leftDoor = assemblyRect(
            'Left Glass Door',
            'Door',
            openingX + doorSideClearanceIn * U,
            doorTopY,
            doorGlassWidthIn,
            doorGlassHeightIn,
        );
        leftDoor = addAssemblyDoorHardware(leftDoor, 'left', pivotStyle, hasLeftFixed, hasLock, hasHandle, resolver);
        let rightDoor = assemblyRect(
            'Right Glass Door',
            'Door',
            openingX + doorOpeningWidthIn * U + doorSideClearanceIn * U,
            doorTopY,
            doorGlassWidthIn,
            doorGlassHeightIn,
        );
        rightDoor = addAssemblyDoorHardware(rightDoor, 'right', pivotStyle, hasRightFixed, hasLock, hasHandle, resolver);
        doors.push(leftDoor, rightDoor);
    }
    sections.push(...doors);

    let rightFixed: AssemblySection | null = null;
    if (hasRightFixed) {
        rightFixed = assemblyRect(
            'Right Fixed Panel',
            'Partition',
            openingX + openingWidthIn * U,
            ORIGIN_Y,
            fixedWidthIn,
            input.heightIn,
        );
        rightFixed = addAssemblyFixedPanelHardware(rightFixed, ['right', 'top', 'bottom'], input.thickness, resolver);
        sections.push(rightFixed);
    }

    if (overpanel && pivotStyle === 'patch') {
        const overBox = getImagePieceBox({ id: generateUUID(), name: overpanel.name, type: overpanel.type, thickness: 0, shapes: overpanel.shapes });
        if (overBox) {
            const supportY = overBox.topY + overBox.heightU;
            if (doorCount === 1) {
                const hingeSide = input.hingeSide || 'left';
                const pivotX = hingeSide === 'left'
                    ? doors[0].outline.x
                    : doors[0].outline.x + (doors[0].outline.width || 0);
                const pivotMeetsFixed = hingeSide === 'left' ? hasLeftFixed : hasRightFixed;
                overpanel.shapes.push(hardware(
                    overBox.id,
                    pivotMeetsFixed ? 'l_bracket_big' : 'overpanel_patch',
                    pivotX,
                    supportY,
                    resolver,
                    undefined,
                    hingeSide === 'left' ? 'down-right' : 'down-left',
                ));
            } else {
                overpanel.shapes.push(hardware(
                    overBox.id,
                    hasLeftFixed ? 'l_bracket_big' : 'overpanel_patch',
                    doors[0].outline.x,
                    supportY,
                    resolver,
                    undefined,
                    'down-right',
                ));
                overpanel.shapes.push(hardware(
                    overBox.id,
                    hasRightFixed ? 'l_bracket_big' : 'overpanel_patch',
                    doors[1].outline.x + (doors[1].outline.width || 0),
                    supportY,
                    resolver,
                    undefined,
                    'down-left',
                ));
            }
        }

    }
    if (overpanel && leftFixed) addAssemblyGlassJoin(leftFixed, overpanel, ORIGIN_Y, overpanelHeightIn * U, resolver);
    if (overpanel && rightFixed) addAssemblyGlassJoin(overpanel, rightFixed, ORIGIN_Y, overpanelHeightIn * U, resolver);

    return {
        name: `${input.systemType.toUpperCase()} Fixed Panel and Door Assembly`,
        type: 'Fixed Panel and Door Assembly',
        thickness: input.thickness,
        quantity: 1,
        shapes: sections.flatMap(section => section.shapes),
    };
}

function buildDoorOnlyAssembly(
    input: GlassSystemInput & { systemType: 'single_door' | 'double_door' },
    resolver: FittingResolver,
): Omit<GlassPiece, 'id'> {
    const doorCount = input.systemType === 'double_door' ? 2 : 1;
    const doorOpeningWidthIn = input.doorWidthIn || input.widthIn / doorCount;
    const { doorGlassHeightIn: glassHeightIn, overpanelHeightIn } = doorAssemblyHeights(input);
    const glassWidthIn = Math.max(doorOpeningWidthIn - DOOR_WIDTH_CLEARANCE_IN, 1);
    const sideClearanceIn = (doorOpeningWidthIn - glassWidthIn) / 2;
    const totalOpeningWidthIn = doorOpeningWidthIn * doorCount;
    const doorTopY = ORIGIN_Y + (input.heightIn - glassHeightIn) * U;
    const sections: AssemblySection[] = [];

    let overpanel: AssemblySection | null = null;
    if (overpanelHeightIn > 0) {
        overpanel = assemblyRect('Door Overpanel', 'Transom', ORIGIN_X, ORIGIN_Y, totalOpeningWidthIn, overpanelHeightIn);
        overpanel = addAssemblyFixedPanelHardware(overpanel, ['left', 'right', 'top'], input.thickness, resolver);
        sections.push(overpanel);
    }

    const doors: AssemblySection[] = [];
    for (let index = 0; index < doorCount; index += 1) {
        const hingeSide: 'left' | 'right' = doorCount === 2
            ? (index === 0 ? 'left' : 'right')
            : (input.hingeSide || 'left');
        let door = assemblyRect(
            doorCount === 1 ? 'Single Glass Door' : `${index === 0 ? 'Left' : 'Right'} Glass Door`,
            'Door',
            ORIGIN_X + (index * doorOpeningWidthIn + sideClearanceIn) * U,
            doorTopY,
            glassWidthIn,
            glassHeightIn,
        );
        door = addAssemblyDoorHardware(
            door,
            hingeSide,
            input.pivotStyle || 'patch',
            false,
            input.hasLock !== false,
            input.hasHandle !== false,
            resolver,
        );
        doors.push(door);
    }
    sections.push(...doors);

    // With no side fixed panels, the overpanel itself carries each top pivot
    // through TM-30 and is fixed to the wall/ceiling by drilled L Connectors.
    if (overpanel && (input.pivotStyle || 'patch') === 'patch') {
        const overBox = getImagePieceBox({ id: generateUUID(), name: overpanel.name, type: overpanel.type, thickness: 0, shapes: overpanel.shapes });
        if (overBox) {
            doors.forEach((door, index) => {
                const hingeX = doorCount === 1
                    ? ((input.hingeSide || 'left') === 'left'
                        ? door.outline.x + PATCH_SETBACK_IN * U
                        : door.outline.x + (door.outline.width || 0) - PATCH_SETBACK_IN * U)
                    : (index === 0
                        ? door.outline.x + PATCH_SETBACK_IN * U
                        : door.outline.x + (door.outline.width || 0) - PATCH_SETBACK_IN * U);
                overpanel!.shapes.push(hardware(
                    overBox.id,
                    'overpanel_patch',
                    hingeX,
                    overBox.topY + overBox.heightU - PATCH_SETBACK_IN * U,
                    resolver,
                ));
            });
        }
    }

    return {
        name: `${doorCount === 1 ? 'Single' : 'Double'} Door${overpanel ? ' with Overpanel' : ''} Assembly`,
        type: overpanel ? 'Door and Overpanel Assembly' : 'Door Assembly',
        thickness: input.thickness,
        quantity: 1,
        shapes: sections.flatMap(section => section.shapes),
    };
}

// Main entry point. Pass the shop's hardware catalogue (or the full item
// list -- non-hardware items are ignored) so each fitting is the real
// stocked one; omit it and every role falls back to built-in defaults.
export function generateGlassSystem(input: GlassSystemInput, fittings: GlassItem[] = []): Array<Omit<GlassPiece, 'id'>> {
    const resolver = buildResolver(fittings);
    const pieces: Array<Omit<GlassPiece, 'id'>> = [];
    let originX = ORIGIN_X;

    const advance = (piece: Omit<GlassPiece, 'id'>) => {
        pieces.push(piece);
        const outline = piece.shapes.find(s => s.type === 'glass_rect');
        originX += (outline?.width ?? input.widthIn * U) + PIECE_GAP_U;
    };

    // Same as advance, but pulls the next panel back so it is drawn LAPPING
    // over this one instead of butt-joined -- how a closed sliding leaf
    // actually sits against its fixed neighbour.
    const advanceLapped = (piece: Omit<GlassPiece, 'id'>, overlapIn: number) => {
        advance(piece);
        originX -= overlapIn * U + PIECE_GAP_U;
    };

    switch (input.systemType) {
        case 'basic':
            advance(buildBasicPiece('Basic Glass', input, originX));
            break;
        case 'swing_door':
            advance(buildDoorPiece('Glass Door', input, originX, resolver));
            break;
        case 'single_door':
        case 'double_door':
            pieces.push(buildDoorOnlyAssembly(
                input as GlassSystemInput & { systemType: 'single_door' | 'double_door' },
                resolver,
            ));
            break;
        case 'shower_door':
            advance(buildDoorPiece('Shower Door', input, originX, resolver));
            if (input.fixedPanelWidthIn && input.fixedPanelWidthIn > 0) {
                advance(buildFixedPanelPiece('Shower Fixed Panel', { ...input, widthIn: input.fixedPanelWidthIn }, originX, resolver, 'Partition'));
            }
            break;
        case 'fixed_panel':
            advance(buildFixedPanelPiece('Fixed Panel', input, originX, resolver));
            break;
        case 'fixed_panel_f':
            buildOwnerFixedPanelPieces(input, fittings).forEach(piece => advance(piece));
            break;
        case 'sliding_door': {
            // Panel widths come from the caller here; the norms that always
            // apply are the slider's shorter height and the lap over the fixed
            // panel. A lone sliding leaf still loses the slider allowance.
            const s = slidingSystemSizes(input, 2, 1);
            const hasFixed = !!(input.fixedPanelWidthIn && input.fixedPanelWidthIn > 0);
            const slider = buildSlidingDoorPiece('Sliding Door', { ...input, heightIn: s.slidingHeightIn }, originX, resolver);
            if (hasFixed) {
                advanceLapped(slider, s.overlap);
                advance(buildFixedPanelPiece('Fixed Panel', { ...input, widthIn: input.fixedPanelWidthIn!, heightIn: s.fixedHeightIn }, originX, resolver, 'Partition'));
            } else {
                advance(slider);
            }
            break;
        }
        case 'railing':
            advance(buildRailingPiece('Glass Railing', input, originX, resolver));
            break;
        case 'corner_shower_90': {
            advance(buildDoorPiece('Shower Door (90° Corner)', input, originX, resolver));
            const returnWidth = input.fixedPanelWidthIn || 24;
            advance(buildFixedPanelPiece('90° Return Glass Panel', { ...input, widthIn: returnWidth }, originX, resolver, 'Partition'));
            break;
        }
        case 'corner_shower_135': {
            advance(buildDoorPiece('Shower Door (135° Neo-Angle)', input, originX, resolver));
            const returnWidth = input.fixedPanelWidthIn || 20;
            advance(buildFixedPanelPiece('135° Fixed Panel A', { ...input, widthIn: returnWidth }, originX, resolver, 'Partition'));
            advance(buildFixedPanelPiece('135° Fixed Panel B', { ...input, widthIn: returnWidth }, originX, resolver, 'Partition'));
            break;
        }
        case 'top_hung_sliding': {
            const s = slidingSystemSizes(input, 2, 1);
            advanceLapped(
                buildSlidingDoorPiece('Top-Hung Barn Slider Door', { ...input, heightIn: s.slidingHeightIn }, originX, resolver),
                s.overlap
            );
            const fixedW = input.fixedPanelWidthIn || input.widthIn;
            advance(buildFixedPanelPiece('Sliding Fixed Track Panel', { ...input, widthIn: fixedW, heightIn: s.fixedHeightIn }, originX, resolver, 'Partition'));
            break;
        }
        case 'spider_facade': {
            advance(buildFixedPanelPiece('Spider Structural Facade Glass', { ...input, fixingStyle: 'spider' }, originX, resolver, 'Structural Glass'));
            break;
        }
        case 'patch_double_door': {
            advance(buildDoorPiece('Left Patch Glass Door', { ...input, hingeSide: 'left', pivotStyle: 'patch' }, originX, resolver));
            advance(buildDoorPiece('Right Patch Glass Door', { ...input, hingeSide: 'right', pivotStyle: 'patch' }, originX, resolver));
            break;
        }
        case 'sfsd':
        case 'dfsd':
        case 'sfdd':
        case 'dfdd': {
            const assembly = buildFixedDoorAssembly(input as GlassSystemInput & { systemType: FixedDoorAssemblyType }, resolver);
            if (assembly) pieces.push(assembly);
            break;
        }
        case 'shower_inline_3pc': {
            const leftW = input.fixedPanelLeftWidthIn || 18;
            const rightW = input.fixedPanelRightWidthIn || 18;
            advance(buildFixedPanelPiece('Shower Fixed Panel Left', { ...input, widthIn: leftW }, originX, resolver, 'Partition', 'right'));
            advance(buildDoorPiece('Shower Door (Center)', input, originX, resolver));
            advance(buildFixedPanelPiece('Shower Fixed Panel Right', { ...input, widthIn: rightW }, originX, resolver, 'Partition'));
            break;
        }
        case 'shower_corner_90_3pc': {
            const leftW = input.fixedPanelLeftWidthIn || 18;
            const returnW = input.fixedPanelWidthIn || 24;
            advance(buildFixedPanelPiece('Inline Fixed Panel', { ...input, widthIn: leftW }, originX, resolver, 'Partition', 'right'));
            advance(buildDoorPiece('Shower Door', input, originX, resolver));
            advance(buildFixedPanelPiece('90° Return Panel', { ...input, widthIn: returnW }, originX, resolver, 'Partition'));
            break;
        }
        case 'shower_sliding_2pc': {
            // Two leaves splitting one opening: each covers half the opening
            // plus half the lap, and the sliding leaf is cut shorter.
            const s = slidingSystemSizes(input, 2, 1);
            advanceLapped(
                buildFixedPanelPiece('Fixed Shower Panel', { ...input, widthIn: s.panelWidthIn, heightIn: s.fixedHeightIn }, originX, resolver, 'Partition', 'right'),
                s.overlap
            );
            advance(buildSlidingDoorPiece('Frameless Sliding Shower Door', { ...input, widthIn: s.panelWidthIn, heightIn: s.slidingHeightIn }, originX, resolver));
            break;
        }
        case 'office_partition_3pc': {
            const leftW = input.fixedPanelLeftWidthIn || 36;
            const rightW = input.fixedPanelRightWidthIn || 36;
            advance(buildFixedPanelPiece('Office Glass Partition Left', { ...input, widthIn: leftW }, originX, resolver, 'Partition', 'right'));
            advance(buildDoorPiece('Office Swing Glass Door', { ...input, pivotStyle: 'patch', hasLock: true }, originX, resolver));
            advance(buildFixedPanelPiece('Office Glass Partition Right', { ...input, widthIn: rightW }, originX, resolver, 'Partition'));
            break;
        }
        case 'door_with_transom': {
            const transomH = input.transomHeightIn || 18;
            const doorPiece = buildDoorPiece('Main Swing Glass Door', { ...input, pivotStyle: 'patch', hasLock: true }, originX, resolver);
            advance(doorPiece);
            const transomPiece = buildFixedPanelPiece('Overpanel Transom Glass', { ...input, heightIn: transomH }, originX, resolver, 'Transom');
            // Adjust transom shapes Y position to sit above the door
            const doorHeightU = input.heightIn * U;
            const transomHeightU = transomH * U;
            transomPiece.shapes.forEach(s => {
                s.y = s.y - transomHeightU - OVERPANEL_TO_DOOR_CLEARANCE_IN * U;
            });
            pieces.push(transomPiece);
            break;
        }
        case 'double_door_transom_sidelites_4pc': {
            const sideW = input.fixedPanelWidthIn || 24;
            const transomH = input.transomHeightIn || 18;
            const startX = originX;
            advance(buildFixedPanelPiece('Left Side Lite Glass', { ...input, widthIn: sideW }, originX, resolver, 'Partition', 'right'));
            advance(buildDoorPiece('Left Entrance Door', { ...input, hingeSide: 'left', pivotStyle: 'patch' }, originX, resolver));
            advance(buildDoorPiece('Right Entrance Door', { ...input, hingeSide: 'right', pivotStyle: 'patch' }, originX, resolver));
            advance(buildFixedPanelPiece('Right Side Lite Glass', { ...input, widthIn: sideW }, originX, resolver, 'Partition'));
            
            const totalWidthIn = sideW * 2 + input.widthIn * 2;
            const transomPiece = buildFixedPanelPiece('Top Entrance Transom Glass', { ...input, widthIn: totalWidthIn, heightIn: transomH }, startX, resolver, 'Transom');
            const transomHeightU = transomH * U;
            transomPiece.shapes.forEach(s => {
                s.y = s.y - transomHeightU - OVERPANEL_TO_DOOR_CLEARANCE_IN * U;
            });
            pieces.push(transomPiece);
            break;
        }
        case 'balustrade_spigots': {
            advance(buildRailingPiece('Spigot Glass Balustrade Panel', { ...input, fixingStyle: 'standoff' }, originX, resolver));
            break;
        }
        case 'sliding_4pc_patio': {
            // Four leaves over one opening, the two centre sliders each
            // lapping their outer fixed neighbour.
            const s = slidingSystemSizes(input, 4, 2);
            const fixedW = input.fixedPanelWidthIn || s.panelWidthIn;
            advanceLapped(buildFixedPanelPiece('Left Fixed Patio Glass', { ...input, widthIn: fixedW, heightIn: s.fixedHeightIn }, originX, resolver, 'Partition', 'right'), s.overlap);
            advance(buildSlidingDoorPiece('Left Sliding Patio Door', { ...input, widthIn: s.panelWidthIn, heightIn: s.slidingHeightIn }, originX, resolver));
            advanceLapped(buildSlidingDoorPiece('Right Sliding Patio Door', { ...input, widthIn: s.panelWidthIn, heightIn: s.slidingHeightIn }, originX, resolver), s.overlap);
            advance(buildFixedPanelPiece('Right Fixed Patio Glass', { ...input, widthIn: fixedW, heightIn: s.fixedHeightIn }, originX, resolver, 'Partition'));
            break;
        }
        case 'spider_facade_4pc': {
            const panelW = input.widthIn || 48;
            advance(buildFixedPanelPiece('Facade Panel 1 (Left Outer)', { ...input, widthIn: panelW, fixingStyle: 'spider' }, originX, resolver, 'Structural Glass'));
            advance(buildFixedPanelPiece('Facade Panel 2 (Left Center)', { ...input, widthIn: panelW, fixingStyle: 'spider' }, originX, resolver, 'Structural Glass'));
            advance(buildFixedPanelPiece('Facade Panel 3 (Right Center)', { ...input, widthIn: panelW, fixingStyle: 'spider' }, originX, resolver, 'Structural Glass'));
            advance(buildFixedPanelPiece('Facade Panel 4 (Right Outer)', { ...input, widthIn: panelW, fixingStyle: 'spider' }, originX, resolver, 'Structural Glass'));
            break;
        }
        case 'balustrade_spigots_3pc': {
            const panelW = input.widthIn || 48;
            advance(buildRailingPiece('Balustrade Glass Panel 1', { ...input, widthIn: panelW, fixingStyle: 'standoff' }, originX, resolver));
            advance(buildRailingPiece('Balustrade Glass Panel 2', { ...input, widthIn: panelW, fixingStyle: 'standoff' }, originX, resolver));
            advance(buildRailingPiece('Balustrade Glass Panel 3', { ...input, widthIn: panelW, fixingStyle: 'standoff' }, originX, resolver));
            break;
        }
        case 'double_swing_transom_3pc': {
            const startX = originX;
            const transomH = input.transomHeightIn || 18;
            advance(buildDoorPiece('Left Double Entrance Door', { ...input, hingeSide: 'left', pivotStyle: 'patch', hasLock: true }, originX, resolver));
            advance(buildDoorPiece('Right Double Entrance Door', { ...input, hingeSide: 'right', pivotStyle: 'patch', hasLock: true }, originX, resolver));
            
            const totalWidthIn = (input.widthIn || 36) * 2;
            const transomPiece = buildFixedPanelPiece('Double Entrance Transom Glass', { ...input, widthIn: totalWidthIn, heightIn: transomH }, startX, resolver, 'Transom');
            const transomHeightU = transomH * U;
            transomPiece.shapes.forEach(s => {
                s.y = s.y - transomHeightU - OVERPANEL_TO_DOOR_CLEARANCE_IN * U;
            });
            pieces.push(transomPiece);
            break;
        }
    }

    return pieces;
}

// Converts a generated system into the CustomDesign.drawingData shape the
// rest of the app already understands: `items` (DesignItem[]) drives
// pricing in orderDesignItems.ts, `pieces` renders on the GlassDesigner
// canvas. Same output shape as buildDesignDataFromImageAnalysis, so the
// order-intake path can create a real, priceable, editable design from a
// text order ("shower door 30x72 12mm") without any drawing at all.
export function buildGlassSystemDesignData(input: GlassSystemInput, fittings: GlassItem[] = []): {
    drawingData: DesignData;
    totalArea: number;
    grossArea: number;
    holes: number;
    cuts: number;
    items: DesignItem[];
} {
    const generated = generateGlassSystem(input, fittings);

    const items: DesignItem[] = generated.flatMap((piece, pieceIndex) => {
        const outlines = piece.shapes.filter(s => s.type === 'glass_rect');
        return outlines.map((outline, outlineIndex) => {
            const widthIn = (outline.width ?? 0) / U;
            const heightIn = (outline.height ?? 0) / U;
            const quantity = piece.quantity || 1;
            const area = Math.round(((widthIn * heightIn) / 144) * quantity * 100) / 100;
            const preparation = piece.shapes.filter(shape => shape.parentId === outline.id);
            const holes = preparation.reduce((sum, shape) =>
                sum + (shape.type === 'hole' ? 1 : Number(shape.accessoryHoleCount) || 0), 0);
            const cuts = preparation.reduce((sum, shape) =>
                sum + (shape.type === 'cut' ? 1 : Number(shape.accessoryCutCount) || 0), 0);
            return {
                id: generateUUID(),
                name: outline.glassSectionName || piece.name || `Piece ${pieceIndex + 1}.${outlineIndex + 1}`,
                // The glass TYPE (not the piece role) -- getPieceThicknessRate
                // matches this against the thickness-pricing rows to find the
                // per-sqft rate. Generated systems are toughened clear glass by
                // default; the piece's role ("Door"/"Panel") stays on the
                // canvas piece itself. Staff can switch to another colour in the
                // designer, which re-prices via the matching pricing row.
                type: input.glassType || 'Toughened Clear',
                thickness: piece.thickness || input.thickness || 12,
                // Keep this outline and its own preparation/hardware together
                // so orderDesignItems can bill catalogue fittings from the
                // physical glass piece, exactly like image-imported designs.
                shapes: [outline, ...preparation] as unknown as DesignItem['shapes'],
                area,
                cost: 0,
                // Extra fields the design editor's cost breakdown reads (treated
                // as any[]) -- match buildDesignDataFromImageAnalysis so a
                // reopened draft keeps its holes/cuts/quantity.
                netArea: area,
                holes: holes * quantity,
                cuts: cuts * quantity,
                quantity,
            } as DesignItem;
        });
    });

    const totalArea = Math.round(items.reduce((sum, item) => sum + item.area, 0) * 100) / 100;
    const holes = generated.reduce((sum, p) => sum + p.shapes.reduce((s, sh) =>
        s + (sh.type === 'hole' ? 1 : Number(sh.accessoryHoleCount) || 0), 0), 0);
    const cuts = generated.reduce((sum, p) => sum + p.shapes.reduce((s, sh) =>
        s + (sh.type === 'cut' ? 1 : Number(sh.accessoryCutCount) || 0), 0), 0);

    const orientation = [
        input.doorPosition ? `door ${input.doorPosition}` : null,
        input.hingeSide ? `${input.pivotStyle === 'patch' ? 'pivot' : 'hinges'} ${input.hingeSide}` : null,
        input.swingDirection ? `opens ${input.swingDirection === 'both' ? 'both ways' : input.swingDirection}` : null,
        input.pivotStyle ? `${input.pivotStyle === 'hinges' ? 'side hinges' : 'top/bottom patch fittings'}` : null,
    ].filter(Boolean).join(', ');
    const drawingData: DesignData = {
        shapes: [],
        dimensions: { width: input.widthIn, height: input.heightIn, unit: 'inch' },
        holes: [],
        cuts: [],
        notes: `Auto-generated ${input.systemType.replace('_', ' ')} -- ${input.widthIn}in x ${input.heightIn}in, ${input.thickness}mm${orientation ? `. Front-view orientation: ${orientation}` : ''}. Hardware placed at standard positions from your fitting catalogue; review and adjust before production.`,
        items,
        pieces: generated.map(piece => ({ id: generateUUID(), ...piece, source: 'system-designer' })),
    };

    return { drawingData, totalArea, grossArea: totalArea, holes, cuts, items };
}

// Human-readable summary of what a system will generate, for a confirmation
// line in the UI or a WhatsApp reply.
export function describeGlassSystem(input: GlassSystemInput, fittings: GlassItem[] = []): string {
    const pieces = generateGlassSystem(input, fittings);
    const hardwareCounts = new Map<string, number>();
    let holes = 0, cuts = 0;
    for (const piece of pieces) {
        for (const shape of piece.shapes) {
            if (shape.type !== 'accessory') continue;
            hardwareCounts.set(shape.accessoryName || 'hardware', (hardwareCounts.get(shape.accessoryName || 'hardware') || 0) + 1);
            holes += Number(shape.accessoryHoleCount) || 0;
            cuts += Number(shape.accessoryCutCount) || 0;
        }
    }
    const parts = Array.from(hardwareCounts.entries()).map(([name, n]) => `${n}x ${name}`);
    // Call out the sliding allowances, since a slider being cut shorter than
    // its fixed partner looks like a mistake unless it's stated. The lap only
    // exists when there's actually a fixed panel to lap over.
    const hasSlider = pieces.some(p => p.type === 'Sliding Door');
    const hasFixedPartner = pieces.some(p => p.type !== 'Sliding Door');
    const slidingNote = hasSlider
        ? ` | slider cut ${input.slidingAllowanceIn ?? SLIDER_SET_ALLOWANCE_IN}" shorter for the slider set`
          + (hasFixedPartner ? `, laps ${input.slidingOverlapIn ?? SLIDING_OVERLAP_IN}" over the fixed panel` : '')
        : '';
    return `${pieces.length} piece(s), ${holes} hole(s) + ${cuts} cut(s) total${parts.length ? ' -- ' + parts.join(', ') : ''}${slidingNote}`;
}
