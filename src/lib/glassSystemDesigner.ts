import { generateUUID } from '@/lib/utils';
import type { GlassPiece, KonvaShape } from '@/types';

// Parametric "glass systems designer": given a system type (swing door,
// shower enclosure, fixed panel, sliding door, railing) plus real
// dimensions and a few options, generate the glass panel(s) with all the
// hardware placed at industry-standard positions -- instead of trying to
// perceive/count holes off a photo, which is unreliable. The output is
// ordinary GlassPiece[] in the exact canvas format GlassDesigner already
// renders (10 canvas units per inch) and prices (hardware carries
// accessoryHoleCount/accessoryCutCount, already summed by
// orderDesignItems.ts and the canvas totals), so this needs no changes to
// rendering or pricing -- it only produces the shapes.
//
// Placement standards are sourced from common frameless-glass hardware
// conventions (dormakaba/Ozone/generic patch-fitting and shower-hardware
// installation guides): shower hinges 150-200mm in from top and bottom;
// door handle/lock ~1000mm above floor; patch-fitting cutout set back
// ~70mm from the edge with the pivot ~55-65mm in. These are sensible
// defaults a designer confirms/adjusts on the canvas, not gospel -- exact
// cutout sizes ultimately depend on the specific hardware brand the shop
// uses, which is why every generated item stays fully editable.

const U = 10; // canvas units per inch, matching GlassDesigner.createRectShape
const MM_PER_INCH = 25.4;
const inFromMm = (millimetres: number) => millimetres / MM_PER_INCH;

// --- Standard placement offsets (inches) ---
const SHOWER_HINGE_INSET_IN = inFromMm(175);   // 150-200mm from top & bottom edge
const HANDLE_HEIGHT_IN = inFromMm(1000);       // handle/lock center ~1000mm above floor
const HANDLE_HOLE_PITCH_IN = inFromMm(300);    // vertical gap between a D-handle's two holes
const PATCH_SETBACK_IN = inFromMm(70);         // patch cutout set back from the edge it clamps
const DOOR_HINGE_END_INSET_IN = 4;             // frameless door hinges ~4in in from each end
const RAIL_END_INSET_IN = 4;                   // first/last roller or standoff in from the ends
const SPIDER_CORNER_INSET_IN = 3;              // bolt-hole inset from each corner for bolted glass

// Canvas origin for the first piece; extra pieces are laid out to the right.
const ORIGIN_X = 100;
const ORIGIN_Y = 80;
const PIECE_GAP_U = 40; // gap between adjacent pieces on the shared canvas

export type GlassSystemType = 'swing_door' | 'shower_door' | 'fixed_panel' | 'sliding_door' | 'railing';

export interface GlassSystemInput {
    systemType: GlassSystemType;
    widthIn: number;
    heightIn: number;
    thickness: number;
    // Which vertical edge carries the hinges/pivot (the other edge gets the
    // handle/lock). Defaults to 'left'.
    hingeSide?: 'left' | 'right';
    // Swing/shower door extras.
    hasLock?: boolean;   // patch lock / glass lock on the leading edge
    hasHandle?: boolean; // D-handle (2 holes) on the leading edge
    // Swing door pivot style: patch fittings (top+bottom corner patches over
    // a floor spring) vs wall hinges. Defaults to 'hinges'.
    pivotStyle?: 'patch' | 'hinges';
    // Optional adjoining fixed side panel (shower/partition), generated as a
    // second piece to the right at this width.
    fixedPanelWidthIn?: number;
    // Fixed-panel / railing fixing style.
    fixingStyle?: 'channel' | 'spider' | 'standoff';
}

type HardwareKind =
    | 'hinge' | 'lock' | 'handle' | 'knob'
    | 'patch' | 'connector' | 'channel' | 'clamp'
    | 'spider' | 'standoff' | 'roller';

// Standard glass-prep requirement per hardware kind: how many holes/cuts it
// implies (for pricing + the hole/cut totals) and a human label. Values
// follow the existing createAccessoryShape conventions (hinge 2h+1c, lock
// 1h+1c) and extend them to the additional hardware this engine places.
const HARDWARE_REQUIREMENT: Record<HardwareKind, { holes: number; cuts: number; holeRadiusIn: number; cutAreaSqIn: number; label: string }> = {
    hinge:     { holes: 2, cuts: 1, holeRadiusIn: 0.25, cutAreaSqIn: 6, label: '2 holes + 1 cut' },
    lock:      { holes: 1, cuts: 1, holeRadiusIn: 0.75, cutAreaSqIn: 6, label: '1 hole + 1 cut' },
    handle:    { holes: 2, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: '2 holes' },
    knob:      { holes: 1, cuts: 0, holeRadiusIn: 0.5, cutAreaSqIn: 0, label: '1 hole' },
    patch:     { holes: 0, cuts: 1, holeRadiusIn: 0, cutAreaSqIn: 8, label: '1 corner cut-out' },
    connector: { holes: 0, cuts: 0, holeRadiusIn: 0, cutAreaSqIn: 0, label: 'clamped, no glass prep' },
    channel:   { holes: 0, cuts: 0, holeRadiusIn: 0, cutAreaSqIn: 0, label: 'channel, no glass prep' },
    clamp:     { holes: 0, cuts: 0, holeRadiusIn: 0, cutAreaSqIn: 0, label: 'clamped, no glass prep' },
    spider:    { holes: 1, cuts: 0, holeRadiusIn: 0.5, cutAreaSqIn: 0, label: '1 bolt hole' },
    standoff:  { holes: 1, cuts: 0, holeRadiusIn: 0.5, cutAreaSqIn: 0, label: '1 bolt hole' },
    roller:    { holes: 2, cuts: 0, holeRadiusIn: 0.25, cutAreaSqIn: 0, label: '2 holes' },
};

// The KonvaShape.accessoryType enum only has four values; every hardware
// kind renders as the closest of those (drives the marker's colour/label in
// the canvas), while the real hole/cut counts above are what get priced.
const RENDER_TYPE: Record<HardwareKind, 'lock' | 'connector' | 'hinge' | 'profile'> = {
    hinge: 'hinge', roller: 'hinge',
    lock: 'lock', handle: 'lock', knob: 'lock',
    patch: 'profile', channel: 'profile',
    connector: 'connector', clamp: 'connector', spider: 'connector', standoff: 'connector',
};

// Default marker footprint (canvas units) per hardware kind.
const HARDWARE_SIZE: Record<HardwareKind, { w: number; h: number }> = {
    hinge: { w: 30, h: 25 }, lock: { w: 25, h: 25 }, handle: { w: 22, h: 60 }, knob: { w: 22, h: 22 },
    patch: { w: 60, h: 40 }, connector: { w: 40, h: 20 }, channel: { w: 60, h: 18 }, clamp: { w: 30, h: 18 },
    spider: { w: 24, h: 24 }, standoff: { w: 24, h: 24 }, roller: { w: 40, h: 22 },
};

// Builds a hardware accessory marker centered on (cxU, cyU) in canvas units.
function hardware(parentId: string, kind: HardwareKind, cxU: number, cyU: number, name: string): KonvaShape {
    const req = HARDWARE_REQUIREMENT[kind];
    const size = HARDWARE_SIZE[kind];
    return {
        id: generateUUID(),
        type: 'accessory',
        x: cxU - size.w / 2,
        y: cyU - size.h / 2,
        width: size.w,
        height: size.h,
        accessoryType: RENDER_TYPE[kind],
        accessoryName: name,
        parentId,
        accessoryHoleCount: req.holes,
        accessoryCutCount: req.cuts,
        accessoryHoleRadiusIn: req.holeRadiusIn,
        accessoryCutAreaSqIn: req.cutAreaSqIn,
        accessoryRequirementLabel: req.label,
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

// Evenly spaces N points along a run of `spanU` units, inset `insetU` from
// each end -- used for hinge columns, roller rows, standoff rows, etc.
function evenPositions(count: number, startU: number, spanU: number, insetU: number): number[] {
    if (count <= 0) return [];
    if (count === 1) return [startU + spanU / 2];
    const usable = spanU - 2 * insetU;
    return Array.from({ length: count }, (_, i) => startU + insetU + (usable * i) / (count - 1));
}

// Hinge count grows with door height so tall doors get a middle hinge, the
// same rule a fabricator uses by eye.
function hingeCountForHeight(heightIn: number): number {
    if (heightIn <= 60) return 2;
    if (heightIn <= 90) return 2;
    return 3;
}

function buildDoorPiece(name: string, input: GlassSystemInput, originX: number): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const hingeSide = input.hingeSide ?? 'left';
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    const shapes: KonvaShape[] = [shape];

    const hingeEdgeX = hingeSide === 'left' ? box.leftX : box.leftX + box.widthU;
    const leadingEdgeX = hingeSide === 'left' ? box.leftX + box.widthU : box.leftX;
    // Nudge the marker just inside its edge so it reads as belonging to that edge.
    const edgeInset = 6;
    const hingeMarkX = hingeSide === 'left' ? hingeEdgeX + edgeInset : hingeEdgeX - edgeInset;
    const leadMarkX = hingeSide === 'left' ? leadingEdgeX - edgeInset : leadingEdgeX + edgeInset;

    if (input.systemType === 'swing_door' && input.pivotStyle === 'patch') {
        // Top + bottom corner patch fittings over a floor spring.
        const setback = PATCH_SETBACK_IN * U;
        shapes.push(hardware(box.id, 'patch', hingeMarkX + (hingeSide === 'left' ? setback : -setback) / 2, box.topY + setback / 2, 'Top Patch Fitting'));
        shapes.push(hardware(box.id, 'patch', hingeMarkX + (hingeSide === 'left' ? setback : -setback) / 2, box.topY + box.heightU - setback / 2, 'Bottom Patch Fitting'));
    } else {
        // Wall/glass hinges evenly spaced down the hinge edge.
        const count = input.systemType === 'shower_door' ? 2 : hingeCountForHeight(heightIn);
        const inset = (input.systemType === 'shower_door' ? SHOWER_HINGE_INSET_IN : DOOR_HINGE_END_INSET_IN) * U;
        for (const yU of evenPositions(count, box.topY, box.heightU, inset)) {
            shapes.push(hardware(box.id, 'hinge', hingeMarkX, yU, input.systemType === 'shower_door' ? 'Shower Hinge' : 'Door Hinge'));
        }
    }

    // Handle/lock on the leading edge at standard height (measured up from the
    // bottom edge, since that's how the 1000mm convention is defined).
    const handleCenterY = box.topY + box.heightU - HANDLE_HEIGHT_IN * U;
    const clampedHandleY = Math.max(box.topY + 40, Math.min(box.topY + box.heightU - 40, handleCenterY));
    if (input.hasLock) {
        shapes.push(hardware(box.id, input.systemType === 'shower_door' ? 'knob' : 'lock', leadMarkX, clampedHandleY, input.systemType === 'shower_door' ? 'Shower Knob' : 'Patch Lock'));
    }
    if (input.hasHandle) {
        // A D-handle reads as one marker spanning its two-hole pitch.
        shapes.push(hardware(box.id, 'handle', leadMarkX, clampedHandleY, 'D-Handle'));
    }

    return { name, type: 'Door', thickness, quantity: 1, shapes };
}

function buildFixedPanelPiece(name: string, input: GlassSystemInput, originX: number, pieceType = 'Partition'): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    const shapes: KonvaShape[] = [shape];
    const style = input.fixingStyle ?? 'channel';

    if (style === 'spider') {
        // Bolted glass: a bolt hole inset from each of the four corners.
        const inset = SPIDER_CORNER_INSET_IN * U;
        const xs = [box.leftX + inset, box.leftX + box.widthU - inset];
        const ys = [box.topY + inset, box.topY + box.heightU - inset];
        for (const x of xs) for (const y of ys) shapes.push(hardware(box.id, 'spider', x, y, 'Spider Bolt'));
    } else if (style === 'standoff') {
        // Standoff-fixed: a row of standoffs near the bottom edge.
        const count = Math.max(2, Math.round(widthIn / 24));
        for (const xU of evenPositions(count, box.leftX, box.widthU, RAIL_END_INSET_IN * U)) {
            shapes.push(hardware(box.id, 'standoff', xU, box.topY + box.heightU - 4 * U, 'Standoff'));
        }
    } else {
        // U-channel top & bottom (or clamps) -- no glass holes.
        shapes.push(hardware(box.id, 'channel', box.leftX + box.widthU / 2, box.topY + 9, 'Top U-Channel'));
        shapes.push(hardware(box.id, 'channel', box.leftX + box.widthU / 2, box.topY + box.heightU - 9, 'Bottom U-Channel'));
    }

    return { name, type: pieceType, thickness, quantity: 1, shapes };
}

function buildSlidingDoorPiece(name: string, input: GlassSystemInput, originX: number): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    const shapes: KonvaShape[] = [shape];

    // Top-hung: two roller brackets near the top corners.
    for (const xU of evenPositions(2, box.leftX, box.widthU, RAIL_END_INSET_IN * U)) {
        shapes.push(hardware(box.id, 'roller', xU, box.topY + 3 * U, 'Roller Bracket'));
    }
    if (input.hasHandle) {
        const handleCenterY = box.topY + box.heightU - HANDLE_HEIGHT_IN * U;
        const clampedHandleY = Math.max(box.topY + 40, Math.min(box.topY + box.heightU - 40, handleCenterY));
        const leadX = (input.hingeSide ?? 'left') === 'left' ? box.leftX + box.widthU - 6 : box.leftX + 6;
        shapes.push(hardware(box.id, 'handle', leadX, clampedHandleY, 'Sliding Handle'));
    }

    return { name, type: 'Sliding Door', thickness, quantity: 1, shapes };
}

function buildRailingPiece(name: string, input: GlassSystemInput, originX: number): Omit<GlassPiece, 'id'> {
    const { widthIn, heightIn, thickness } = input;
    const { shape, box } = rectPanel(widthIn, heightIn, originX);
    const shapes: KonvaShape[] = [shape];
    const style = input.fixingStyle ?? 'channel';

    if (style === 'standoff' || style === 'spider') {
        // Standoff-fixed railing: a row of standoffs near the bottom edge.
        const count = Math.max(2, Math.round(widthIn / 18));
        for (const xU of evenPositions(count, box.leftX, box.widthU, RAIL_END_INSET_IN * U)) {
            shapes.push(hardware(box.id, 'standoff', xU, box.topY + box.heightU - 3 * U, 'Standoff'));
        }
    } else {
        // Base-channel railing: continuous channel along the bottom, no holes.
        shapes.push(hardware(box.id, 'channel', box.leftX + box.widthU / 2, box.topY + box.heightU - 9, 'Base Channel'));
    }

    return { name, type: 'Railing', thickness, quantity: 1, shapes };
}

// Main entry point: system type + params -> ready-to-render, ready-to-price
// GlassPiece pieces (without ids, matching GlassDesigner's preset convention).
export function generateGlassSystem(input: GlassSystemInput): Array<Omit<GlassPiece, 'id'>> {
    const pieces: Array<Omit<GlassPiece, 'id'>> = [];
    let originX = ORIGIN_X;

    const advance = (piece: Omit<GlassPiece, 'id'>) => {
        pieces.push(piece);
        const outline = piece.shapes.find(s => s.type === 'glass_rect');
        originX += (outline?.width ?? input.widthIn * U) + PIECE_GAP_U;
    };

    switch (input.systemType) {
        case 'swing_door':
            advance(buildDoorPiece('Glass Door', input, originX));
            break;
        case 'shower_door':
            advance(buildDoorPiece('Shower Door', input, originX));
            if (input.fixedPanelWidthIn && input.fixedPanelWidthIn > 0) {
                advance(buildFixedPanelPiece('Shower Fixed Panel', { ...input, widthIn: input.fixedPanelWidthIn }, originX, 'Partition'));
            }
            break;
        case 'fixed_panel':
            advance(buildFixedPanelPiece('Fixed Panel', input, originX));
            break;
        case 'sliding_door':
            advance(buildSlidingDoorPiece('Sliding Door', input, originX));
            if (input.fixedPanelWidthIn && input.fixedPanelWidthIn > 0) {
                advance(buildFixedPanelPiece('Fixed Panel', { ...input, widthIn: input.fixedPanelWidthIn }, originX, 'Partition'));
            }
            break;
        case 'railing':
            advance(buildRailingPiece('Glass Railing', input, originX));
            break;
    }

    return pieces;
}

// Human-readable summary of what a system will generate, for a confirmation
// line in the UI / a WhatsApp reply ("Generating: Shower Door 30x72 12mm --
// 2 hinges, 1 knob").
export function describeGlassSystem(input: GlassSystemInput): string {
    const pieces = generateGlassSystem(input);
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
    return `${pieces.length} piece(s), ${holes} hole(s) + ${cuts} cut(s) total${parts.length ? ' -- ' + parts.join(', ') : ''}`;
}
