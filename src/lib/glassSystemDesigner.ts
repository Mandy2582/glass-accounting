import { generateUUID } from '@/lib/utils';
import type { GlassItem, GlassPiece, KonvaShape, FittingRole, DesignData, DesignItem } from '@/types';
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
const PATCH_SETBACK_IN = inFromMm(70);         // patch cutout set back from the edge it clamps
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
        shapes.push(hardware(box.id, role, edgeX, yU, resolver));
    }
}

const ORIGIN_X = 100;
const ORIGIN_Y = 80;
const PIECE_GAP_U = 2; // tight 2px (2mm) physical glass-to-glass joint gap for single-window system assembly

export type GlassSystemType =
    | 'swing_door'
    | 'shower_door'
    | 'fixed_panel'
    | 'sliding_door'
    | 'railing'
    | 'corner_shower_90'
    | 'corner_shower_135'
    | 'top_hung_sliding'
    | 'spider_facade'
    | 'patch_double_door'
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
    hasLock?: boolean;
    hasHandle?: boolean;
    pivotStyle?: 'patch' | 'hinges';
    fixedPanelWidthIn?: number;
    fixedPanelLeftWidthIn?: number;
    fixedPanelRightWidthIn?: number;
    transomHeightIn?: number;
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
    overpanel_patch: { render: 'profile',   w: 60, h: 40, holes: 0, cuts: 1, holeRadiusIn: 0,    cutAreaSqIn: 8, label: 'Overpanel patch' },
    floor_spring:    { render: 'profile',   w: 60, h: 40, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Floor spring' },
    wall_hinge:      { render: 'hinge',     w: 30, h: 25, holes: 2, cuts: 1, holeRadiusIn: 0.25, cutAreaSqIn: 6, label: 'Hinge' },
    glass_hinge:     { render: 'hinge',     w: 30, h: 25, holes: 2, cuts: 1, holeRadiusIn: 0.25, cutAreaSqIn: 6, label: 'Glass hinge' },
    door_lock:       { render: 'lock',      w: 25, h: 25, holes: 1, cuts: 1, holeRadiusIn: 0.75, cutAreaSqIn: 6, label: 'Lock' },
    sliding_lock:    { render: 'lock',      w: 25, h: 25, holes: 1, cuts: 0, holeRadiusIn: 0.5,  cutAreaSqIn: 0, label: 'Sliding lock' },
    // L-brackets clamp the glass face; nothing is drilled or notched into the
    // panel for them. Big is the heavier/longer body, so it draws larger.
    l_bracket_small: { render: 'connector', w: 26, h: 26, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Small L bracket' },
    l_bracket_big:   { render: 'connector', w: 38, h: 38, holes: 0, cuts: 0, holeRadiusIn: 0,    cutAreaSqIn: 0, label: 'Big L bracket' },
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
    sizeOverride?: { w?: number; h?: number }
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
    const shapes: KonvaShape[] = [shape];

    const hingeEdgeX = hingeSide === 'left' ? box.leftX : box.leftX + box.widthU;
    const leadingEdgeX = hingeSide === 'left' ? box.leftX + box.widthU : box.leftX;
    const edgeInset = 6;
    const hingeMarkX = hingeSide === 'left' ? hingeEdgeX + edgeInset : hingeEdgeX - edgeInset;
    const leadMarkX = hingeSide === 'left' ? leadingEdgeX - edgeInset : leadingEdgeX + edgeInset;
    const isShower = input.systemType === 'shower_door';

    if (input.systemType === 'swing_door' && input.pivotStyle === 'patch') {
        const setback = PATCH_SETBACK_IN * U;
        const dx = (hingeSide === 'left' ? setback : -setback) / 2;
        shapes.push(hardware(box.id, 'top_patch', hingeMarkX + dx, box.topY + setback / 2, resolver));
        shapes.push(hardware(box.id, 'bottom_patch', hingeMarkX + dx, box.topY + box.heightU - setback / 2, resolver));
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
        const runMetres = (widthIn * 0.0254).toFixed(2);
        channel.accessoryRequirementLabel = `continuous run ${widthIn}in (${runMetres} m)`;
        shapes.push(channel);
    }

    return { name, type: 'Railing', thickness, quantity: 1, shapes };
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
        case 'swing_door':
            advance(buildDoorPiece('Glass Door', input, originX, resolver));
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
                s.y = s.y - transomHeightU - 2; // sit directly above the door
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
                s.y = s.y - transomHeightU - 2;
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
                s.y = s.y - transomHeightU - 2;
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

    const items: DesignItem[] = generated.map((piece, index) => {
        const outline = piece.shapes.find(s => s.type === 'glass_rect');
        const widthIn = (outline?.width ?? 0) / U;
        const heightIn = (outline?.height ?? 0) / U;
        const quantity = piece.quantity || 1;
        const area = Math.round(((widthIn * heightIn) / 144) * quantity * 100) / 100;
        const holes = piece.shapes.reduce((sum, s) => sum + (Number(s.accessoryHoleCount) || 0), 0);
        const cuts = piece.shapes.reduce((sum, s) => sum + (Number(s.accessoryCutCount) || 0), 0);
        return {
            id: generateUUID(),
            name: piece.name || `Piece ${index + 1}`,
            // The glass TYPE (not the piece role) -- getPieceThicknessRate
            // matches this against the thickness-pricing rows to find the
            // per-sqft rate. Generated systems are toughened clear glass by
            // default; the piece's role ("Door"/"Panel") stays on the
            // canvas piece itself. Staff can switch to another colour in the
            // designer, which re-prices via the matching pricing row.
            type: input.glassType || 'Toughened Clear',
            thickness: piece.thickness || input.thickness || 12,
            shapes: [],
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

    // Collect all hardware fittings from generated pieces and append them as 'Hardware' items in items
    const hardwareMap = new Map<string, { id: string; name: string; type: 'Hardware'; quantity: number; rate: number; holes: number; cuts: number }>();
    generated.forEach(piece => {
        const qty = piece.quantity || 1;
        piece.shapes.forEach(shape => {
            if (shape.type === 'accessory') {
                const name = shape.accessoryName || shape.accessoryType || 'Hardware Fitting';
                const key = shape.hardwareItemId || name;
                const rate = Number(shape.accessoryRate) || 0;
                const holes = Number(shape.accessoryHoleCount) || 0;
                const cuts = Number(shape.accessoryCutCount) || 0;
                const existing = hardwareMap.get(key);
                if (existing) {
                    existing.quantity += qty;
                } else {
                    hardwareMap.set(key, {
                        id: key,
                        name,
                        type: 'Hardware',
                        quantity: qty,
                        rate,
                        holes,
                        cuts
                    });
                }
            }
        });
    });

    const hardwareItems: DesignItem[] = Array.from(hardwareMap.values()).map(hw => ({
        id: generateUUID(),
        name: hw.name,
        type: 'Hardware',
        thickness: 0,
        shapes: [],
        area: 0,
        cost: hw.rate * hw.quantity,
        netArea: 0,
        holes: hw.holes * hw.quantity,
        cuts: hw.cuts * hw.quantity,
        quantity: hw.quantity,
        rate: hw.rate
    } as any));

    const allItems = [...items, ...hardwareItems];

    const totalArea = Math.round(items.reduce((sum, item) => sum + item.area, 0) * 100) / 100;
    const holes = generated.reduce((sum, p) => sum + p.shapes.reduce((s, sh) => s + (Number(sh.accessoryHoleCount) || 0), 0), 0);
    const cuts = generated.reduce((sum, p) => sum + p.shapes.reduce((s, sh) => s + (Number(sh.accessoryCutCount) || 0), 0), 0);

    const drawingData: DesignData = {
        shapes: [],
        dimensions: { width: input.widthIn, height: input.heightIn, unit: 'inch' },
        holes: [],
        cuts: [],
        notes: `Auto-generated ${input.systemType.replace('_', ' ')} -- ${input.widthIn}in x ${input.heightIn}in, ${input.thickness}mm. Hardware placed at standard positions from your fitting catalogue; review and adjust before production.`,
        items: allItems,
        pieces: generated.map(piece => ({ id: generateUUID(), ...piece, source: 'system-designer' })),
    };

    return { drawingData, totalArea, grossArea: totalArea, holes, cuts, items: allItems };
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
