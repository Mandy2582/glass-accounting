import sharp from 'sharp';
import { generateUUID, roundCurrency } from '@/lib/utils';
import type { DesignData, DesignItem, GlassItem, GlassPiece, ImageDesignCode, ImageHardwareContext, KonvaShape } from '@/types';
import { applyImageDesignConventions, generateGlassSystem, predictImagePieceHardware } from '@/lib/glassSystemDesigner';
import { parseDoorOpeningDimensions } from '@/lib/glassSystemOrder';

export type LengthUnit = 'inch' | 'mm';

// A hole's position is normally dimensioned by hand in one of three ways:
//   1. Distance from one or two nearby edges (e.g. "20mm from left, 15mm
//      from top"), or marked centered on an axis -- fromLeft/fromRight/
//      fromTop/fromBottom/centeredX/centeredY.
//   2. No number at all, but clearly drawn close to one edge of the panel by
//      convention (e.g. a column of holes running near the left edge with no
//      dimension marking the distance) -- nearEdge.
//   3. A distance measured from ANOTHER hole/cut rather than from an edge
//      (e.g. two holes with a single "200mm" pitch written between them) --
//      pitchFromIndex/pitchDistance/pitchUnit/pitchAxis.
// Only the fields actually shown on the drawing should be filled in --
// everything else stays null rather than guessed.
type PositionFields = {
    unit?: LengthUnit | null;
    fromLeft?: number | null;
    fromRight?: number | null;
    fromTop?: number | null;
    fromBottom?: number | null;
    centeredX?: boolean | null;
    centeredY?: boolean | null;
    nearEdge?: 'left' | 'right' | 'top' | 'bottom' | null;
    pitchFromIndex?: number | null;
    pitchDistance?: number | null;
    pitchUnit?: LengthUnit | null;
    pitchAxis?: 'horizontal' | 'vertical' | null;
};

export type VisionHole = PositionFields & {
    diameter?: number | null;
};

export type VisionCut = PositionFields & {
    cutType?: 'corner_notch' | 'edge_notch' | 'through_cut' | null;
    corner?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | null;
    width?: number | null;
    height?: number | null;
};

// A panel isn't always a plain rectangle -- some drawings show one or more
// corners cut off at an angle (a "taper", often labeled as such, common on
// railing glass following a staircase rake). horizontalCut/verticalCut are
// how far the diagonal cut runs in along each of that corner's two edges;
// only fill these in when the drawing actually gives both measurements --
// many drawings only label "Taper" with no numbers at all (the exact angle
// is meant to be matched on site), in which case leave them null rather than
// guessing a size.
export type VisionCornerTaper = {
    corner: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
    horizontalCut?: number | null;
    verticalCut?: number | null;
    unit?: LengthUnit | null;
};

export type WhatsAppImageAnalysis = {
    classification: 'text_order' | 'drawing' | 'mixed' | 'unknown';
    extractedText: string;
    customerName?: string | null;
    confidence: number;
    orderLines: Array<{
        description: string;
        quantity?: number | null;
        unit?: string | null;
    }>;
    drawing: {
        notes: string;
        pieces: Array<{
            name: string;
            type: string;
            width?: number | null;
            height?: number | null;
            widthUnit?: LengthUnit | null;
            heightUnit?: LengthUnit | null;
            thickness?: number | null;
            quantity?: number | null;
            holes: VisionHole[];
            cuts: VisionCut[];
            tapers: VisionCornerTaper[];
            // True when this piece is cut from the same continuous sheet/run
            // as the immediately preceding piece in this array (adjoining
            // sections sharing one top/bottom edge, divided only by cut
            // lines -- e.g. a multi-section railing or shopfront run).
            // Connected pieces are drawn together on one shared canvas at
            // their real relative widths instead of separate tabs; genuinely
            // separate/independent panels (a door drawn apart from a
            // sidelite, unrelated pieces on the same page) should leave this
            // null/false.
            connectedToPrevious?: boolean | null;
            designCode?: ImageDesignCode | null;
            hardwareNotes?: string | null;
            hardwareContext?: ImageHardwareContext | null;
            // Approximate bounding box of this piece within the photo, as
            // fractions of the image's own width/height (0 = left/top edge,
            // 1 = right/bottom edge). Used to crop a zoomed-in view of just
            // this panel for a focused second-pass hole/cut recount --
            // asking the model to divide attention across every panel in a
            // busy multi-section photo at once is exactly where hole counts
            // drift (confirmed against a real 3-panel drawing: two plainer
            // panels were each over-counted by 2, while the one panel with
            // an explicit distance label came out exactly right). Null when
            // the piece's location in the photo can't be told at all.
            imageRegion?: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
            // The model's own independent tally of holes by location,
            // committed to as structured numbers BEFORE/separately from
            // writing out holes[] -- top+bottom+left+right+interior should
            // equal holes.length. The existing prompt already asks for this
            // as a free-text self-check ("go section by section..."), but
            // that's advisory only; capturing it as its own required field
            // lets buildPieceShapes() programmatically verify the two counts
            // actually agree, rather than trusting holes.length on faith.
            // When they don't agree, every hole on this piece gets flagged
            // estimated-fallback (same amber-review mechanism as an
            // unplaceable position) -- a mismatched self-tally means the
            // count itself is unreliable, not just where each hole sits.
            holeEdgeCounts?: { top: number; bottom: number; left: number; right: number; interior: number } | null;
        }>;
    };
    // What KIND of glass system the drawing depicts, when it's a recognisable
    // one (a swing door, a shower enclosure, a sliding door with a fixed
    // panel, an office partition, a railing...). This is the reliable half of
    // reading a drawing photo: naming the system and its overall size is a
    // coarse judgement models are good at, whereas counting individual small
    // circles is one they are measurably bad at. When this comes back
    // confident, the intake generates the panels and hardware from the
    // industry rules in glassSystemDesigner instead of trusting the perceived
    // holes[] -- so the holes land where the standards say they go.
    glassSystem?: {
        systemType: string | null;
        widthIn: number | null;
        heightIn: number | null;
        thickness: number | null;
        hingeSide?: 'left' | 'right' | null;
        doorPosition?: 'left' | 'centre' | 'right' | null;
        swingDirection?: 'inward' | 'outward' | 'both' | null;
        pivotStyle?: 'patch' | 'hinges' | null;
        hasLock?: boolean | null;
        hasHandle?: boolean | null;
        fixedPanelWidthIn?: number | null;
        doorWidthIn?: number | null;
        doorHeightIn?: number | null;
        slidingPanelPosition?: 'left' | 'right' | null;
        confidence: number;
    } | null;
    // True only when the vision call itself errored/couldn't be parsed --
    // as opposed to a successful call that genuinely classified the image as
    // 'unknown'. Callers should fail open (keep for review) on a real
    // failure instead of treating it the same as "vision looked and this
    // isn't an order".
    analysisFailed?: boolean;
};

const emptyAnalysis = (classification: WhatsAppImageAnalysis['classification'], extractedText = '', analysisFailed = false): WhatsAppImageAnalysis => ({
    classification,
    extractedText,
    confidence: 0,
    orderLines: [],
    drawing: {
        notes: '',
        pieces: [],
    },
    glassSystem: null,
    analysisFailed,
});

// The system types the intake can generate from a photo. Deliberately a
// subset of GlassSystemType -- only the arrangements that are unambiguous to
// recognise in a drawing. Anything else falls back to the normal
// read-the-holes path rather than guessing at an exotic preset.
export const RECOGNISABLE_SYSTEM_TYPES = [
    'swing_door',
    'single_door',
    'double_door',
    'shower_door',
    'fixed_panel',
    'sliding_door',
    'railing',
    'patch_double_door',
    'sfsd',
    'dfsd',
    'sfdd',
    'dfdd',
    'office_partition_3pc',
    'shower_inline_3pc',
    'shower_sliding_2pc',
    'corner_shower_90',
    'top_hung_sliding',
    'sliding_4pc_patio',
] as const;

// Shared position-reading rules for holes/cuts -- used verbatim by both the
// main multi-piece analysis prompt and the single-panel verification prompt
// below, so the two calls never drift out of sync on how a position is read.
const HOLE_CUT_POSITION_GUIDANCE = [
    'HOLE AND CUT POSITIONS: These drawings dimension hole/cut positions in different ways depending on the sketch -- read each one as it is actually drawn, using whichever of the following applies:',
    '  - CUT SIZE vs CUT DISTANCE: a cut is usually drawn as a small shaded/hatched rectangle. Its SIZE is written against its own sides (width above or below it, height beside it -- e.g. "8" above and "8" beside it means an 8 x 8 cut). A number attached to an arrow running from a panel edge to the cut (e.g. 6" with an upward arrow from the bottom edge) is the cut\'s DISTANCE from that edge (fromBottom/fromLeft/etc.), NOT its width or height -- never use an edge-distance number as a cut dimension.',
    '  - MOST COMMON: distance from one or two nearby edges (e.g. "20mm from left", "15mm from top"), or marked as centered on an axis (a centerline, or equal tick marks on both sides). Record fromLeft/fromRight/fromTop/fromBottom as the distance from that edge of the panel to the CENTER of the hole/cut -- only fill in the edges that are actually dimensioned, leave the rest null. If marked centered instead of a number, set centeredX and/or centeredY to true rather than guessing a number.',
    '  - IMPORTANT -- determine fromTop vs fromBottom (and fromLeft vs fromRight) by which edge the dimension line actually starts from, NOT by which way its arrowhead points. A dimension line is very often drawn starting at the bottom edge with the arrow pointing upward toward the hole/cut -- that is still a distance FROM THE BOTTOM (fromBottom), even though the arrow points up. Trace the line back to the edge it touches to decide which field to fill in.',
    '  - NO NUMBER, BUT NEAR AN EDGE: many drawings place a row or column of holes/cuts close to one edge of the panel with no distance written at all (e.g. a column of holes running down near the left edge). When you can see it is clearly aligned along one specific edge but no number dimensions that distance, set nearEdge to that edge ("left"/"right"/"top"/"bottom") instead of leaving every field null -- this is a real observation (which edge it is near), not a guessed number.',
    '  - DIMENSIONED FROM ANOTHER HOLE/CUT, NOT AN EDGE: sometimes a single distance is written between two holes/cuts themselves (e.g. two holes stacked vertically with "200mm" written between them), rather than either one being dimensioned from a panel edge. For the second of the pair, set pitchFromIndex to the 0-based index of the other hole/cut in this same array (list the reference one first), set pitchDistance and pitchUnit to that written number, and set pitchAxis to "vertical" if they are stacked one above the other or "horizontal" if side by side.',
    '  - If a hole or cut has no readable position at all by any of the above (no edge dimension, no visible edge alignment, no pitch to another hole/cut), still include it in the array (never drop it), but leave every position field null.',
    '  - For a notch cut from a corner, set cutType to "corner_notch" and corner to which corner, plus its width/height. Otherwise use "edge_notch" for a notch cut into an edge (not a corner), or "through_cut" for an internal cutout.',
    '  - DO NOT MERGE NEARBY CUTS: a section can have more than one separate hatched/shaded cut area near the same corner or edge (e.g. a small notch right at the corner AND a larger cut a few inches away from it). Each hatched shape is its own cuts[] entry with its own size and own position numbers -- never combine two different hatched shapes into a single entry, and never let one cut\'s size number bleed into another cut\'s position number just because they are drawn close together.',
].join('\n');

const HOLE_CUT_UNITS_GUIDANCE = 'UNITS: Shops often mix units on one drawing -- panel width/height are usually inches, but hole diameters and hole/cut distances are frequently marked in mm. Report a unit per hole/cut using whatever unit is actually written next to that number. If no unit is marked, leave it null rather than guessing.';

// A hatched/shaded rectangle on these drawings is one of two very different
// things, and confusing them is a real, observed failure mode (a focused
// single-panel crop with no other context to fall back on is especially
// prone to defaulting every hatch mark it sees into cuts[] instead of
// correctly recognising plain hardware): hinge/patch/lock hardware markers
// (small, often repeated at regular intervals near panel edges, e.g. at
// top and bottom of a door) versus an actual glass cutout. The distinguishing
// signal is a labeled dimension.
const HARDWARE_VS_CUT_GUIDANCE = 'HARDWARE HATCHING IS NOT A CUT: A hatched/shaded rectangle is only a real cut/notch (cuts[] entry) if it has its own explicit width AND height dimension written directly against it (e.g. "cut 27 4/8" with a "19" beside it). A hatched mark with NO dimension numbers of its own -- especially small ones repeated near the top/bottom of a door or panel edge -- is hinge/patch/lock HARDWARE, not a cut and not a hole. Do not report undimensioned hardware hatching in cuts[] or holes[] at all; mention it in hardwareNotes instead if that field is available to you.';

// Shared JSON-schema fragments for a single hole/cut entry -- reused by both
// the main multi-piece schema and the single-panel verification schema so
// the two response shapes can never drift apart.
const HOLE_SCHEMA_PROPERTIES = {
    diameter: { type: ['number', 'null'] },
    unit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
    fromLeft: { type: ['number', 'null'] },
    fromRight: { type: ['number', 'null'] },
    fromTop: { type: ['number', 'null'] },
    fromBottom: { type: ['number', 'null'] },
    centeredX: { type: ['boolean', 'null'] },
    centeredY: { type: ['boolean', 'null'] },
    nearEdge: { type: ['string', 'null'], enum: ['left', 'right', 'top', 'bottom', null] },
    pitchFromIndex: { type: ['number', 'null'] },
    pitchDistance: { type: ['number', 'null'] },
    pitchUnit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
    pitchAxis: { type: ['string', 'null'], enum: ['horizontal', 'vertical', null] },
} as const;
const HOLE_SCHEMA_REQUIRED = Object.keys(HOLE_SCHEMA_PROPERTIES);

const CUT_SCHEMA_PROPERTIES = {
    cutType: { type: ['string', 'null'], enum: ['corner_notch', 'edge_notch', 'through_cut', null] },
    corner: { type: ['string', 'null'], enum: ['top_left', 'top_right', 'bottom_left', 'bottom_right', null] },
    width: { type: ['number', 'null'] },
    height: { type: ['number', 'null'] },
    ...HOLE_SCHEMA_PROPERTIES,
} as const;
const CUT_SCHEMA_REQUIRED = Object.keys(CUT_SCHEMA_PROPERTIES);

// A structured, independently-committed hole tally -- see holeEdgeCounts'
// comment on the piece type above for why this exists as its own schema
// field rather than just a free-text self-check.
const HOLE_EDGE_COUNTS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['top', 'bottom', 'left', 'right', 'interior'],
    properties: {
        top: { type: 'number' },
        bottom: { type: 'number' },
        left: { type: 'number' },
        right: { type: 'number' },
        interior: { type: 'number' },
    },
} as const;

const HOLE_EDGE_COUNTS_GUIDANCE = 'HOLE COUNT SELF-CHECK: Also report holeEdgeCounts -- your own independent tally of how many holes are along the top edge, bottom edge, left edge, right edge, and how many are elsewhere in the interior, counted BEFORE (and separately from) writing out the holes[] array. top + bottom + left + right + interior must equal the number of entries in holes[]. If, while double-checking, these two don\'t match, that means one of them is wrong -- go back and recount the actual circles in the photo, then make both holeEdgeCounts and holes[] agree with that real recount (never adjust holeEdgeCounts to artificially match a holes[] array you have not actually re-verified, and never adjust holes[] length without also fixing the edge counts).';

function sumHoleEdgeCounts(counts: { top: number; bottom: number; left: number; right: number; interior: number } | null | undefined): number | null {
    if (!counts) return null;
    return (Number(counts.top) || 0) + (Number(counts.bottom) || 0) + (Number(counts.left) || 0) + (Number(counts.right) || 0) + (Number(counts.interior) || 0);
}

export async function analyzeWhatsAppImage(input: {
    imageDataUrl: string;
    caption?: string;
    fromPhone: string;
}): Promise<WhatsAppImageAnalysis> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return emptyAnalysis('unknown', input.caption || '', true);
    }

    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
    // Reasoning models (gpt-5 family, o-series) think before answering --
    // that markedly improves systematic counting/reading tasks like "find
    // every small circle on this busy hand drawing", which non-reasoning
    // models chronically under-report. Their reasoning tokens count against
    // max_output_tokens, so the cap must be much higher than the JSON
    // answer alone needs.
    const isReasoningModel = /^(gpt-5|o\d)/.test(model);
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: [
                                'Analyze this photo of a hand-marked engineering/order drawing sent to a glass shop.',
                                'Classify it as text_order, drawing, mixed, or unknown.',
                                '',
                                'MULTI-PIECE DRAWINGS: A single photo may show more than one separate glass panel (e.g. a fixed panel + a door + a ventilator, or several unrelated pieces sketched on one page, or several adjoining sections cut from one continuous sheet like a shopfront or railing run). Treat each visually distinct panel/outline as its own entry in drawing.pieces -- do not merge multiple panels into one piece, and do not drop a panel just because some of its details are unclear or repetitive-looking. CHECK EVERY SINGLE SECTION for holes and cuts individually, even ones that look plain or identical to a neighboring section -- it is a common mistake to carefully read the two end sections of a multi-section run (which often have extra hardware markings) and then skip the plainer middle sections entirely; every section that has holes or cuts marked on it must have them reported, not just the ones with the most detail.',
                                '  - If adjoining sections are cut from one continuous sheet (sharing one unbroken top and bottom edge, divided only by vertical cut lines, with a single overall width dimension spanning all of them), set connectedToPrevious to true on every section after the first one in that run, so they get drawn together on one shared canvas instead of separate tabs. Leave it null/false for genuinely separate, independent pieces (e.g. a door drawn apart from a fixed sidelite).',
                                '',
                                'SHOP DESIGN CODES: Inspect the middle/interior of each panel for a clearly handwritten isolated code.',
                                '  - Set designCode to "B" only when an isolated B is visibly written inside that panel. B means Block/Basic: the deterministic engine adds no hardware, holes, or cuts beyond details explicitly drawn by the customer.',
                                '  - Set designCode to "F" only when an isolated F is visibly written inside that panel. F means the shop Fixed Panel convention. Do not infer F merely because a panel looks fixed; the letter must actually be visible.',
                                '  - Otherwise set designCode to null. Never mistake a dimension label, panel name, or an ordinary word containing B/F for the code.',
                                '',
                                'COUNT EVERY HOLE INDIVIDUALLY: each small circle ("o") drawn on the glass is one hole. Scan methodically -- along the top edge, bottom edge, left edge, right edge and interior of EVERY section -- and report one holes[] entry per circle. Never compress repeats: if five sections each show 2 circles at the top and 2 at the bottom, that is 20 separate entries, not 5. Miscounting holes (both too few and too many) is the single most common mistake on these drawings; a section is not "the same as its neighbor" -- each one must be counted from what is actually drawn on it, even if two sections look identical at a glance.',
                                HOLE_EDGE_COUNTS_GUIDANCE,
                                '',
                                HOLE_CUT_POSITION_GUIDANCE,
                                '',
                                HARDWARE_VS_CUT_GUIDANCE,
                                '',
                                'PANEL SHAPE / TAPERED CORNERS: A panel is not always a plain rectangle. If one or more corners are drawn cut off at an angle instead of square (often labeled "Taper", common on railing glass following a staircase rake), add an entry to tapers for each such corner with corner set to which one. Many drawings only label this qualitatively with no measurement at all (the angle is matched on site, not on paper) -- in that case leave horizontalCut and verticalCut null, do not guess a size. Only fill in horizontalCut (how far the cut runs in along the horizontal edge from that corner) and verticalCut (how far it runs in along the vertical edge from that corner) when the drawing actually gives both of those two measurements for that corner.',
                                '',
                                'IMAGE REGION: For each piece, also report imageRegion -- the approximate bounding box of that specific panel within this photo, as fractions of the image\'s total width/height (0 = left/top edge of the photo, 1 = right/bottom edge), e.g. {"xMin": 0.05, "yMin": 0.2, "xMax": 0.35, "yMax": 0.9}. This is used afterwards to zoom into just this panel for a careful hole/cut recount, so accuracy here matters a lot -- trace that panel\'s OWN drawn outline/boundary lines in the photo to find its real edges, do NOT assume multiple panels are evenly-sized thirds/halves of the photo just because there are 2 or 3 of them (real panels are very often uneven widths -- use the drawing\'s own width dimensions, if labeled, as a cross-check). The box should tightly bound that panel\'s own outline and nothing more -- not the whole photo, and not overlapping into a neighboring panel. Leave it null only if you genuinely cannot tell where this piece is in the photo.',
                                '',
                                'HARDWARE CONTEXT FOR EACH PIECE: Fill hardwareContext from the visible arrangement, labels, panel role, and edge marks. This does NOT ask you to choose a product; a deterministic engineering rule engine does that afterwards.',
                                '  - panelRole: door for an opening leaf; fixed_panel for ordinary fixed glass; sidelight for fixed glass beside a door; overpanel/transom for fixed glass above a door; unknown if genuinely unclear.',
                                '  - wallEdges: panel edges visibly fixed to masonry/frame. Repeated fixing holes close to one outside edge are strong wall-fixing evidence.',
                                '  - glassJoinEdges: panel edges visibly meeting another glass panel. Set glassJoinType to inline for coplanar 180-degree joins, corner for 90-degree returns, unknown if the angle is unclear.',
                                '  - doorStyle: patch when a frameless pivot door shows top/bottom patch areas or a floor-spring arrangement; hinge when it shows side hinges; none for non-doors; unknown only when the door support cannot be told.',
                                '  - hingeSide, hasLock, and hasHandle must follow visible marks/labels. supportsDoorPivot is true on an overpanel/transom that carries the door top pivot (TM-30/PF-30 arrangement).',
                                '  - confidence is confidence in this hardware relationship reading. Use a low value when wall-vs-glass boundary or door support is not visible; do not force edges or roles.',
                                '',
                                `${HOLE_CUT_UNITS_GUIDANCE} Also report widthUnit/heightUnit for the panel itself the same way.`,
                                '',
                                `GLASS SYSTEM RECOGNITION (important): separately from reading the individual marks, decide whether this drawing depicts a standard glass SYSTEM as a whole, and if so fill in glassSystem. Allowed systemType values: ${RECOGNISABLE_SYSTEM_TYPES.join(', ')}. Judge it from the overall arrangement and any written labels, e.g.: a single leaf with hinges/patches down one side and a handle = swing_door; a leaf plus an adjoining narrower fixed panel in a bathroom context = shower_door (give the fixed panel's width in fixedPanelWidthIn); two leaves meeting in the middle = patch_double_door; a moving leaf that slides across an adjoining fixed panel = sliding_door; use shower_sliding_2pc for a two-panel shower slider, top_hung_sliding for a barn-style exposed overhead rail, and sliding_4pc_patio for fixed + sliding + sliding + fixed. A low waist-height run of panels with floor-mounted spigots/base channel = railing; a plain panel with no door = fixed_panel. Treat every left/right value as viewed from the customer/front side. For a sliding system report slidingPanelPosition as the LEFT or RIGHT position of the MOVING leaf while CLOSED, only when visible or explicitly written; otherwise return null so the customer can be asked. Report doorPosition (left/centre/right), hingeSide, swingDirection (inward/outward/both), and pivotStyle (hinges for side hinges, patch for top/bottom patch fittings) only when visible or explicitly written; otherwise return null so the customer can be asked. Also report the system's OVERALL opening width and height in INCHES (converting if the drawing is dimensioned in mm), the glass thickness in mm, and whether a lock and a handle are marked. If an individual clear door opening width or height is written, report it separately as doorWidthIn/doorHeightIn; do not discard it or replace it with a standard size.`,
                                'OWNER FIXED-PANEL + DOOR CODES: recognise these literal names or acronyms with high confidence: "single fixed single door" / SFSD = sfsd; "double fixed single door" / DFSD = dfsd; "single fixed double door" / SFDD = sfdd; "double fixed double door" / DFDD = dfdd. Width and height are the OVERALL installation dimensions a and b, not an individual leaf. Use the written doorWidthIn/doorHeightIn when present. Door glass width is 2/8in less than its clear opening. Door glass height is 84in unless another door height is explicitly written. When an overpanel exists, deduct the 4/8in door-to-overpanel clearance from the overpanel glass height and keep the door at 84in (or its explicit height); without an overpanel, deduct 4/8in from the door glass height.',
                                'DOOR-ONLY SYSTEMS: a drawing explicitly labelled single door with no side fixed panel = single_door; double door with no side fixed panels = double_door. When overall height leaves an overpanel, generate TM-30 overpanel patch support plus L Connectors, and top patch, bottom patch, lock, and handle on each door.',
                                'Set glassSystem to null, and set its confidence low, if the drawing is just loose panels or a dimension list with no recognisable system arrangement -- do NOT force one of the values above onto a drawing that is not clearly that system. This field is used to regenerate the panels and hardware from engineering standards, so a wrong systemType produces a confidently wrong drawing; "null" is much better than a guess.',
                                '',
                                'Extract visible text, order lines, thickness, hardware notes, and customer name if visible.',
                                'Do not invent dimensions or exact hardware products. HardwareContext may infer the standard fitting relationship only where the drawing provides visible role/edge evidence.',
                                `Sender phone: ${input.fromPhone}`,
                                input.caption ? `Caption: ${input.caption}` : '',
                            ].filter(Boolean).join('\n'),
                        },
                        {
                            type: 'input_image',
                            image_url: input.imageDataUrl,
                            // WhatsApp photos are often full camera resolution;
                            // 'high' detail tiles the whole image (more tokens,
                            // sharper reading of small dimensions/handwriting).
                            // 'low' is a flat ~85 tokens regardless of size --
                            // much cheaper, but risks misreading fine print on
                            // a busy drawing. Override via env if the accuracy
                            // trade-off is worth it for your usage pattern.
                            detail: (process.env.OPENAI_VISION_DETAIL as 'low' | 'high' | 'auto' | undefined) || 'high',
                        },
                    ],
                },
            ],
            // Structured-output mode bounds the JSON *shape* but not the
            // length of free-text fields (extractedText, notes) -- cap this
            // as a guardrail against a single unusually busy image running up
            // an outsized bill. Reasoning models need far more headroom since
            // their (invisible) reasoning tokens draw from the same budget;
            // The schema is intentionally detailed (multi-piece dimensions,
            // holes/cuts, panel regions, system recognition). A clear drawing can
            // still need several thousand output tokens; too small a cap truncates
            // the JSON and makes the whole image fall back to "unknown".
            max_output_tokens: isReasoningModel ? 12000 : 6000,
            ...(isReasoningModel ? { reasoning: { effort: 'medium' } } : {}),
            text: {
                format: {
                    type: 'json_schema',
                    name: 'whatsapp_order_image_analysis',
                    // OpenAI's strict structured-output mode requires every key
                    // in `properties` to also appear in `required` -- optional
                    // fields must instead be modeled as nullable types (the
                    // model returns null, rather than omitting the key). This
                    // schema previously left several fields out of `required`
                    // while still declaring them optional in the type above,
                    // which OpenAI rejects outright (every image analysis call
                    // was failing silently as a result).
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['classification', 'extractedText', 'customerName', 'confidence', 'orderLines', 'drawing', 'glassSystem'],
                        properties: {
                            classification: { type: 'string', enum: ['text_order', 'drawing', 'mixed', 'unknown'] },
                            extractedText: { type: 'string' },
                            customerName: { type: ['string', 'null'] },
                            confidence: { type: 'number' },
                            glassSystem: {
                                type: ['object', 'null'],
                                additionalProperties: false,
                                required: ['systemType', 'widthIn', 'heightIn', 'thickness', 'doorPosition', 'hingeSide', 'swingDirection', 'pivotStyle', 'hasLock', 'hasHandle', 'fixedPanelWidthIn', 'doorWidthIn', 'doorHeightIn', 'slidingPanelPosition', 'confidence'],
                                properties: {
                                    systemType: { type: ['string', 'null'], enum: [...RECOGNISABLE_SYSTEM_TYPES, null] },
                                    widthIn: { type: ['number', 'null'] },
                                    heightIn: { type: ['number', 'null'] },
                                    thickness: { type: ['number', 'null'] },
                                    doorPosition: { type: ['string', 'null'], enum: ['left', 'centre', 'right', null] },
                                    hingeSide: { type: ['string', 'null'], enum: ['left', 'right', null] },
                                    swingDirection: { type: ['string', 'null'], enum: ['inward', 'outward', 'both', null] },
                                    pivotStyle: { type: ['string', 'null'], enum: ['patch', 'hinges', null] },
                                    hasLock: { type: ['boolean', 'null'] },
                                    hasHandle: { type: ['boolean', 'null'] },
                                    fixedPanelWidthIn: { type: ['number', 'null'] },
                                    doorWidthIn: { type: ['number', 'null'] },
                                    doorHeightIn: { type: ['number', 'null'] },
                                    slidingPanelPosition: { type: ['string', 'null'], enum: ['left', 'right', null] },
                                    confidence: { type: 'number' },
                                },
                            },
                            orderLines: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['description', 'quantity', 'unit'],
                                    properties: {
                                        description: { type: 'string' },
                                        quantity: { type: ['number', 'null'] },
                                        unit: { type: ['string', 'null'] },
                                    },
                                },
                            },
                            drawing: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['notes', 'pieces'],
                                properties: {
                                    notes: { type: 'string' },
                                    pieces: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            additionalProperties: false,
                                            required: ['name', 'type', 'width', 'height', 'widthUnit', 'heightUnit', 'thickness', 'quantity', 'holes', 'cuts', 'tapers', 'connectedToPrevious', 'designCode', 'hardwareNotes', 'hardwareContext', 'imageRegion', 'holeEdgeCounts'],
                                            properties: {
                                                name: { type: 'string' },
                                                type: { type: 'string' },
                                                width: { type: ['number', 'null'] },
                                                height: { type: ['number', 'null'] },
                                                widthUnit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
                                                heightUnit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
                                                thickness: { type: ['number', 'null'] },
                                                quantity: { type: ['number', 'null'] },
                                                holes: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: HOLE_SCHEMA_REQUIRED,
                                                        properties: HOLE_SCHEMA_PROPERTIES,
                                                    },
                                                },
                                                cuts: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: CUT_SCHEMA_REQUIRED,
                                                        properties: CUT_SCHEMA_PROPERTIES,
                                                    },
                                                },
                                                holeEdgeCounts: {
                                                    ...HOLE_EDGE_COUNTS_SCHEMA,
                                                    type: ['object', 'null'],
                                                },
                                                imageRegion: {
                                                    type: ['object', 'null'],
                                                    additionalProperties: false,
                                                    required: ['xMin', 'yMin', 'xMax', 'yMax'],
                                                    properties: {
                                                        xMin: { type: 'number' },
                                                        yMin: { type: 'number' },
                                                        xMax: { type: 'number' },
                                                        yMax: { type: 'number' },
                                                    },
                                                },
                                                tapers: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        additionalProperties: false,
                                                        required: ['corner', 'horizontalCut', 'verticalCut', 'unit'],
                                                        properties: {
                                                            corner: { type: 'string', enum: ['top_left', 'top_right', 'bottom_left', 'bottom_right'] },
                                                            horizontalCut: { type: ['number', 'null'] },
                                                            verticalCut: { type: ['number', 'null'] },
                                                            unit: { type: ['string', 'null'], enum: ['inch', 'mm', null] },
                                                        },
                                                    },
                                                },
                                                connectedToPrevious: { type: ['boolean', 'null'] },
                                                designCode: { type: ['string', 'null'], enum: ['B', 'F', null] },
                                                hardwareNotes: { type: ['string', 'null'] },
                                                hardwareContext: {
                                                    type: ['object', 'null'],
                                                    additionalProperties: false,
                                                    required: ['panelRole', 'wallEdges', 'glassJoinEdges', 'glassJoinType', 'doorStyle', 'hingeSide', 'hasLock', 'hasHandle', 'supportsDoorPivot', 'confidence'],
                                                    properties: {
                                                        panelRole: { type: 'string', enum: ['door', 'fixed_panel', 'sidelight', 'overpanel', 'transom', 'unknown'] },
                                                        wallEdges: {
                                                            type: 'array',
                                                            items: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
                                                        },
                                                        glassJoinEdges: {
                                                            type: 'array',
                                                            items: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
                                                        },
                                                        glassJoinType: { type: 'string', enum: ['inline', 'corner', 'unknown'] },
                                                        doorStyle: { type: 'string', enum: ['patch', 'hinge', 'none', 'unknown'] },
                                                        hingeSide: { type: ['string', 'null'], enum: ['left', 'right', null] },
                                                        hasLock: { type: ['boolean', 'null'] },
                                                        hasHandle: { type: ['boolean', 'null'] },
                                                        supportsDoorPivot: { type: ['boolean', 'null'] },
                                                        confidence: { type: 'number' },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    strict: true,
                },
            },
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error('OpenAI image analysis failed:', detail);
        return emptyAnalysis('unknown', input.caption || '', true);
    }

    const data = await response.json();
    if (data.usage) {
        console.log(`OpenAI vision usage (${model}):`, data.usage);
    }
    const outputText = data.output_text || data.output?.flatMap((item: any) => item.content || [])
        .find((content: any) => content.type === 'output_text')?.text;

    if (!outputText) {
        console.error('[whatsapp-vision] OpenAI returned no output text for image analysis:', JSON.stringify(data).slice(0, 2000));
        return emptyAnalysis('unknown', input.caption || '', true);
    }

    let result: WhatsAppImageAnalysis;
    try {
        result = JSON.parse(outputText) as WhatsAppImageAnalysis;
    } catch (error) {
        console.error('Failed to parse image analysis JSON:', error, outputText.slice(0, 2000));
        return emptyAnalysis('unknown', input.caption || '', true);
    }

    // Second pass: for each piece with real geometry and a usable image
    // region, re-read its holes/cuts from a zoomed crop of just that panel
    // instead of trusting the first pass's count across the whole (often
    // multi-panel) photo. Confirmed against a real 3-panel drawing that this
    // is exactly where counts drift: two plainer panels were each
    // over-counted by 2 holes, while the one panel with an explicit distance
    // label came out exactly right in the first pass already -- the model
    // is accurate when it has something to anchor a count against, and
    // drifts when it has to divide attention across a busy multi-panel
    // photo with nothing but freehand circles to count. Runs in parallel so
    // wall-clock latency stays close to one extra call rather than growing
    // with piece count; any failure/timeout/missing-region on a given piece
    // just keeps that piece's first-pass holes/cuts unchanged (fail-open --
    // this is a verification step, never a reason to lose data).
    if (result.classification === 'drawing' || result.classification === 'mixed') {
        const verifications = await Promise.allSettled(
            result.drawing.pieces.map(piece => verifyPieceHolesAndCuts(input.imageDataUrl, piece))
        );
        result.drawing.pieces = result.drawing.pieces.map((piece, i) => {
            const outcome = verifications[i];
            if (outcome.status === 'fulfilled' && outcome.value) {
                return { ...piece, holes: outcome.value.holes, cuts: outcome.value.cuts, holeEdgeCounts: outcome.value.holeEdgeCounts };
            }
            if (outcome.status === 'rejected') {
                console.error(`[whatsapp-vision] Per-panel verification failed for "${piece.name}", keeping first-pass holes/cuts:`, outcome.reason);
            }
            return piece;
        });
    }

    return result;
}

// Crops the original photo down to one piece's imageRegion (padded so a
// hole/cut sitting right at the panel's own edge isn't clipped), returning a
// new data URL for the focused verification call. Returns null on any
// failure (corrupt region, unreadable image, etc.) so the caller can fall
// back to the first pass's reading instead of erroring the whole analysis.
async function cropImageRegion(imageDataUrl: string, region: { xMin: number; yMin: number; xMax: number; yMax: number }): Promise<string | null> {
    try {
        const match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (!match) return null;

        const buffer = Buffer.from(match[1], 'base64');
        const image = sharp(buffer);
        const metadata = await image.metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        if (!width || !height) return null;

        const regionWidth = region.xMax - region.xMin;
        const regionHeight = region.yMax - region.yMin;
        if (!(regionWidth > 0) || !(regionHeight > 0)) return null;

        // 12% padding on each side -- generous enough that a hole/cut drawn
        // close to the panel's own outline survives the crop, without
        // pulling in so much of the neighboring panel that it reintroduces
        // the same divided-attention problem this pass exists to avoid.
        const padX = regionWidth * 0.12;
        const padY = regionHeight * 0.12;
        const xMin = Math.max(0, region.xMin - padX);
        const yMin = Math.max(0, region.yMin - padY);
        const xMax = Math.min(1, region.xMax + padX);
        const yMax = Math.min(1, region.yMax + padY);

        const left = Math.round(xMin * width);
        const top = Math.round(yMin * height);
        const cropWidth = Math.round((xMax - xMin) * width);
        const cropHeight = Math.round((yMax - yMin) * height);
        if (cropWidth <= 0 || cropHeight <= 0 || left + cropWidth > width || top + cropHeight > height) return null;

        const cropped = await image.extract({ left, top, width: cropWidth, height: cropHeight }).jpeg({ quality: 92 }).toBuffer();
        return `data:image/jpeg;base64,${cropped.toString('base64')}`;
    } catch (error) {
        console.error('[whatsapp-vision] Failed to crop image region:', error);
        return null;
    }
}

// Focused second-pass extraction: given a zoomed crop of ONE already-
// identified panel, recount its holes/cuts in isolation. Reuses the exact
// same position-reading rules and JSON schema as the main call (see
// HOLE_CUT_POSITION_GUIDANCE/HOLE_SCHEMA_PROPERTIES/CUT_SCHEMA_PROPERTIES
// above) so the two calls can never disagree on how a position is encoded --
// only the framing differs (one panel in isolation, not several at once).
async function verifyPieceHolesAndCuts(
    fullImageDataUrl: string,
    piece: WhatsAppImageAnalysis['drawing']['pieces'][number],
): Promise<{ holes: VisionHole[]; cuts: VisionCut[]; holeEdgeCounts?: { top: number; bottom: number; left: number; right: number; interior: number } | null } | null> {
    if (!piece.imageRegion) return null;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const croppedImageDataUrl = await cropImageRegion(fullImageDataUrl, piece.imageRegion);
    if (!croppedImageDataUrl) return null;

    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
    const isReasoningModel = /^(gpt-5|o\d)/.test(model);

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: [
                                'This is a zoomed-in crop showing ONE glass panel from a larger hand-marked order drawing (other panels, if any, have been cropped out -- only count what is visible in THIS image). This crop may include a small sliver of a neighboring panel at its very edge (deliberate padding to avoid clipping) -- ignore anything that clearly belongs to a different panel outline, and only report holes/cuts that belong to the main panel filling most of this crop.',
                                'Recount every hole (small circle, "o") visible in this crop, precisely and independently of any earlier reading.',
                                'COUNT EVERY HOLE INDIVIDUALLY: scan methodically along the top edge, bottom edge, left edge, right edge, and interior, and report one holes[] entry per circle.',
                                '',
                                HOLE_EDGE_COUNTS_GUIDANCE,
                                '',
                                HARDWARE_VS_CUT_GUIDANCE,
                                '',
                                HOLE_CUT_POSITION_GUIDANCE,
                                '',
                                HOLE_CUT_UNITS_GUIDANCE,
                                `This crop is of the panel named "${piece.name}".`,
                            ].filter(Boolean).join('\n'),
                        },
                        {
                            type: 'input_image',
                            image_url: croppedImageDataUrl,
                            detail: (process.env.OPENAI_VISION_DETAIL as 'low' | 'high' | 'auto' | undefined) || 'high',
                        },
                    ],
                },
            ],
            max_output_tokens: isReasoningModel ? 6000 : 1500,
            ...(isReasoningModel ? { reasoning: { effort: 'medium' } } : {}),
            text: {
                format: {
                    type: 'json_schema',
                    name: 'whatsapp_panel_hole_cut_verification',
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['holes', 'cuts', 'holeEdgeCounts'],
                        properties: {
                            holes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: HOLE_SCHEMA_REQUIRED,
                                    properties: HOLE_SCHEMA_PROPERTIES,
                                },
                            },
                            cuts: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: CUT_SCHEMA_REQUIRED,
                                    properties: CUT_SCHEMA_PROPERTIES,
                                },
                            },
                            holeEdgeCounts: HOLE_EDGE_COUNTS_SCHEMA,
                        },
                    },
                    strict: true,
                },
            },
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error(`[whatsapp-vision] Per-panel verification call failed for "${piece.name}":`, detail);
        return null;
    }

    const data = await response.json();
    if (data.usage) {
        console.log(`[whatsapp-vision] Per-panel verification usage (${model}, "${piece.name}"):`, data.usage);
    }
    const outputText = data.output_text || data.output?.flatMap((item: any) => item.content || [])
        .find((content: any) => content.type === 'output_text')?.text;
    if (!outputText) return null;

    try {
        return JSON.parse(outputText) as { holes: VisionHole[]; cuts: VisionCut[]; holeEdgeCounts?: { top: number; bottom: number; left: number; right: number; interior: number } | null };
    } catch (error) {
        console.error(`[whatsapp-vision] Failed to parse per-panel verification JSON for "${piece.name}":`, error);
        return null;
    }
}

// GlassDesigner.tsx's canvas (react-konva) uses 10 canvas units per inch --
// e.g. its own createRectShape() does `width: widthIn * 10`. This isn't
// exported from that (client-only, 'use client') component, so it's
// duplicated here deliberately; keep in sync if that scale ever changes.
const CANVAS_UNITS_PER_INCH = 10;
const MM_PER_INCH = 25.4;
const DEFAULT_HOLE_RADIUS_UNITS = 30; // matches GlassDesigner's manual "Add Hole" default
const DEFAULT_CUT_SIZE_UNITS = 50; // matches GlassDesigner's manual "Add Cut" default

function toCanvasUnits(value: number, unit: LengthUnit | null | undefined): number {
    // No unit tagged -- assume inches, matching the existing panel-dimension
    // convention. Never trust the model to do this conversion itself.
    const inches = unit === 'mm' ? value / MM_PER_INCH : value;
    return inches * CANVAS_UNITS_PER_INCH;
}

function partition<T>(items: T[], predicate: (item: T) => boolean): [T[], T[]] {
    return [items.filter(predicate), items.filter(item => !predicate(item))];
}

const EDGE_INSET_UNITS = 20; // 2 inches -- matches GlassDesigner's manual "Align & Add Holes" edge offset default

// Resolves one axis (x or y) of a position from an explicit edge distance or
// centered marking only -- never a guess. Returns null when nothing was
// dimensioned on this axis.
function resolveExplicitAxis(
    fromNear: number | null | undefined,
    fromFar: number | null | undefined,
    centered: boolean | null | undefined,
    unit: LengthUnit | null | undefined,
    rectNear: number,
    rectSize: number,
): number | null {
    if (centered) return rectNear + rectSize / 2;
    if (fromNear != null) return rectNear + toCanvasUnits(fromNear, unit);
    if (fromFar != null) return rectNear + rectSize - toCanvasUnits(fromFar, unit);
    return null;
}

type ResolvedAxis = { x: number | null; y: number | null; xConfirmed: boolean; yConfirmed: boolean };

// Resolves the CENTER position of every hole/cut in a piece. Confidence-wise
// there are three kinds of result: (a) a real dimensioned fact (edge
// distance/centered, or a pitch chained entirely off real facts), (b) a
// qualitative-but-real observation with no exact number (nearEdge), and (c) a
// pure guess (last-resort even-spacing). Only (a) counts as confirmed (no
// review flag); (b) and (c) are flagged positionSource: 'estimated-fallback'
// by the caller. The actual pass order is chosen so pitch-chain anchors
// always have a position to chain off of before the chain is resolved:
//   1. Explicit edge distance / centered marking.
//   2. nearEdge grouping -- shapes with no number at all but a visually
//      observed edge (e.g. a column of holes running near the left edge with
//      no distance marked) are evenly spaced along that specific edge
//      instead of the old generic center/bottom-edge guess, grouped
//      separately per edge so e.g. a left-edge column and a bottom-edge row
//      on the same piece don't get lumped into one line. Items that
//      themselves chain off another via pitchFromIndex are skipped here.
//   3. Last-resort even-spacing for any remaining "root" item (no pitch
//      reference of its own) -- guarantees every potential pitch anchor has
//      a real position before step 4 runs.
//   4. Pitch chain -- a distance measured from another hole/cut in the same
//      array rather than from an edge (e.g. "200mm" written between two
//      holes), resolved now that every non-chained item has a position.
//      Confidence is inherited from whichever axis of the reference shape it
//      was chained from: only the *spacing* between the pair is a hard fact
//      from the drawing, not the pair's absolute position on the panel, so a
//      pitch chained off an unconfirmed anchor stays unconfirmed.
//   5. Final safety net for a pitchFromIndex pointing out of range or at a
//      cycle, so no shape is ever left without a position.
function resolvePositions<T extends PositionFields>(
    items: T[], rectX: number, rectY: number, rectW: number, rectH: number,
): ResolvedAxis[] {
    const resolved: ResolvedAxis[] = items.map(item => {
        const x = resolveExplicitAxis(item.fromLeft, item.fromRight, item.centeredX, item.unit, rectX, rectW);
        const y = resolveExplicitAxis(item.fromTop, item.fromBottom, item.centeredY, item.unit, rectY, rectH);
        return { x, y, xConfirmed: x != null, yConfirmed: y != null };
    });

    // Pass 2: nearEdge groups -- only for shapes still fully unresolved and
    // not themselves a pitch-chain dependent (pitch is a more specific
    // signal, resolved in pass 4 below once its anchor has a position).
    (['left', 'right', 'top', 'bottom'] as const).forEach(edge => {
        const group = items
            .map((_, i) => i)
            .filter(i => items[i].nearEdge === edge && items[i].pitchFromIndex == null && resolved[i].x == null && resolved[i].y == null);
        group.forEach((i, orderInGroup) => {
            const fraction = (orderInGroup + 1) / (group.length + 1);
            if (edge === 'left') resolved[i] = { x: rectX + EDGE_INSET_UNITS, y: rectY + rectH * fraction, xConfirmed: false, yConfirmed: false };
            else if (edge === 'right') resolved[i] = { x: rectX + rectW - EDGE_INSET_UNITS, y: rectY + rectH * fraction, xConfirmed: false, yConfirmed: false };
            else if (edge === 'top') resolved[i] = { x: rectX + rectW * fraction, y: rectY + EDGE_INSET_UNITS, xConfirmed: false, yConfirmed: false };
            else resolved[i] = { x: rectX + rectW * fraction, y: rectY + rectH - EDGE_INSET_UNITS, xConfirmed: false, yConfirmed: false };
        });
    });

    // Pass 3: last-resort even-spacing, but ONLY for "root" items that have
    // no pitch-chain reference of their own -- this guarantees every
    // potential pitch anchor has a real position before pass 4 tries to
    // chain off it. Items that themselves reference another via
    // pitchFromIndex are deliberately excluded here; they wait for pass 4.
    // Only the axis that's actually missing gets guessed here -- a shape
    // dimensioned on one axis only (e.g. "6 from bottom" with no horizontal
    // dimension) must keep that real value; overwriting both axes wholesale
    // would silently discard a confirmed fact just because its other axis
    // wasn't given.
    const rootUnresolved = items.map((_, i) => i).filter(i => (resolved[i].x == null || resolved[i].y == null) && items[i].pitchFromIndex == null);
    rootUnresolved.forEach((i, orderInGroup) => {
        const fraction = (orderInGroup + 1) / (rootUnresolved.length + 1);
        const next = { ...resolved[i] };
        if (next.x == null) { next.x = rectX + rectW * fraction; next.xConfirmed = false; }
        if (next.y == null) { next.y = rectY + rectH / 2; next.yConfirmed = false; }
        resolved[i] = next;
    });

    // Pass 4: pitch chains. By this point every non-chained item has some
    // position, so any valid pitchFromIndex reference now resolves. Iterate
    // up to items.length times so chains of any length (a chains off b
    // chains off c, ...) resolve regardless of array order.
    for (let pass = 0; pass < items.length; pass++) {
        let changed = false;
        items.forEach((item, i) => {
            if (resolved[i].x != null && resolved[i].y != null) return;
            if (item.pitchFromIndex == null || item.pitchDistance == null) return;
            const ref = resolved[item.pitchFromIndex];
            if (!ref || ref.x == null || ref.y == null) return;
            const dist = toCanvasUnits(item.pitchDistance, item.pitchUnit ?? item.unit);
            const next = { ...resolved[i] };
            if (item.pitchAxis === 'horizontal') {
                if (next.x == null) { next.x = ref.x + dist; next.xConfirmed = ref.xConfirmed; changed = true; }
                if (next.y == null) { next.y = ref.y; next.yConfirmed = false; changed = true; }
            } else {
                if (next.y == null) { next.y = ref.y + dist; next.yConfirmed = ref.yConfirmed; changed = true; }
                if (next.x == null) { next.x = ref.x; next.xConfirmed = false; changed = true; }
            }
            resolved[i] = next;
        });
        if (!changed) break;
    }

    // Pass 5: final safety net -- a pitchFromIndex pointing out of range or
    // at a cycle would otherwise leave a shape with no position at all
    // (which would break rendering); fall back to plain even-spacing. As in
    // pass 3, only fill in whichever axis is actually still missing.
    const stillUnresolved = items.map((_, i) => i).filter(i => resolved[i].x == null || resolved[i].y == null);
    stillUnresolved.forEach((i, orderInGroup) => {
        const fraction = (orderInGroup + 1) / (stillUnresolved.length + 1);
        const next = { ...resolved[i] };
        if (next.x == null) { next.x = rectX + rectW * fraction; next.xConfirmed = false; }
        if (next.y == null) { next.y = rectY + rectH / 2; next.yConfirmed = false; }
        resolved[i] = next;
    });

    return resolved;
}

type VisionPieceLike = {
    width?: number | null;
    height?: number | null;
    widthUnit?: LengthUnit | null;
    heightUnit?: LengthUnit | null;
    holes?: VisionHole[] | null;
    cuts?: VisionCut[] | null;
    tapers?: VisionCornerTaper[] | null;
    imageRegion?: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
    holeEdgeCounts?: { top: number; bottom: number; left: number; right: number; interior: number } | null;
};

const CORNER_ORDER: Array<'top_left' | 'top_right' | 'bottom_right' | 'bottom_left'> = ['top_left', 'top_right', 'bottom_right', 'bottom_left'];

// Builds the outline of a panel as a polygon point list (cycling top_left ->
// top_right -> bottom_right -> bottom_left, relative to the shape's own x/y,
// matching GlassDesigner's existing polygon convention) when at least one
// corner has a fully measured taper (both horizontalCut and verticalCut
// given). Returns null when there's nothing measurable to build from, in
// which case the caller keeps a plain rectangle -- a taper that's only
// qualitatively labeled (no numbers) can't be turned into real geometry
// without inventing a size.
function buildTaperedOutline(widthUnits: number, heightUnits: number, tapers: VisionCornerTaper[]): number[] | null {
    const measured = new Map<string, VisionCornerTaper>();
    tapers.forEach(taper => {
        if (taper.corner && taper.horizontalCut != null && taper.verticalCut != null) {
            measured.set(taper.corner, taper);
        }
    });
    if (measured.size === 0) return null;

    const W = widthUnits;
    const H = heightUnits;
    const points: number[] = [];
    CORNER_ORDER.forEach(corner => {
        const taper = measured.get(corner);
        if (!taper) {
            if (corner === 'top_left') points.push(0, 0);
            else if (corner === 'top_right') points.push(W, 0);
            else if (corner === 'bottom_right') points.push(W, H);
            else points.push(0, H);
            return;
        }
        const h = toCanvasUnits(taper.horizontalCut!, taper.unit);
        const v = toCanvasUnits(taper.verticalCut!, taper.unit);
        // Each corner is replaced by two points: the one on the edge shared
        // with the previous corner in this cycle, then the one on the edge
        // shared with the next -- so the resulting list still winds
        // consistently around the shape with no crossed edges.
        if (corner === 'top_left') points.push(0, v, h, 0);
        else if (corner === 'top_right') points.push(W - h, 0, W, v);
        else if (corner === 'bottom_right') points.push(W, H - v, W - h, H);
        else points.push(h, H, 0, H - v);
    });
    return points;
}

// Builds an actual rectangle (or tapered-corner polygon) plus real or
// best-effort holes/cuts in the exact format GlassDesigner's canvas reads
// back (GlassPiece.shapes: KonvaShape[]), so a drawing extracted from a photo
// shows up as a real, editable drawing instead of an empty canvas. Returns []
// when there's no width/height to draw from, in which case the piece falls
// back to today's blank-canvas behavior.
//
// Holes/cuts go through resolvePositions() (edge distance/centered -> pitch
// chain -> nearEdge grouping -> last-resort even-spacing, see that function's
// comment). Anything not fully confirmed by a real dimensioned fact is
// tagged positionSource: 'estimated-fallback' so the review UI can flag
// exactly that subset instead of everything. The panel's own outline shape
// gets the same flag when a taper was noted but couldn't be measured (no
// numbers to build real geometry from), so "this piece's shape itself needs
// a manual fix" surfaces through the identical tab-badge/amber-highlight
// mechanism as an unresolved hole or cut.
function buildPieceShapes(piece: VisionPieceLike): KonvaShape[] {
    const widthIn = Number(piece.width) || 0;
    const heightIn = Number(piece.height) || 0;
    const placeholderSize = widthIn > 0 && heightIn > 0 ? null : estimatePlaceholderPanelSize(piece);

    const rectId = generateUUID();
    const rectX = 50;
    const rectY = 50;
    const rectWidth = placeholderSize?.width ?? toCanvasUnits(widthIn, piece.widthUnit ?? 'inch');
    const rectHeight = placeholderSize?.height ?? toCanvasUnits(heightIn, piece.heightUnit ?? 'inch');

    const tapers = piece.tapers || [];
    const outlinePoints = buildTaperedOutline(rectWidth, rectHeight, tapers);
    const hasUnmeasurableTaper = tapers.some(taper => taper.corner && (taper.horizontalCut == null || taper.verticalCut == null));
    const needsManualSizing = !!placeholderSize;

    const outlineShape: KonvaShape = outlinePoints
        ? {
            id: rectId, type: 'glass_polygon', x: rectX, y: rectY, width: rectWidth, height: rectHeight, points: outlinePoints, sides: outlinePoints.length / 2,
            ...(needsManualSizing ? { positionSource: 'estimated-fallback' as const } : {}),
        }
        : {
            id: rectId, type: 'glass_rect', x: rectX, y: rectY, width: rectWidth, height: rectHeight,
            ...(hasUnmeasurableTaper || needsManualSizing ? { positionSource: 'estimated-fallback' as const } : {}),
        };
    const shapes: KonvaShape[] = [outlineShape];

    const holes = piece.holes || [];
    const holePositions = resolvePositions(holes, rectX, rectY, rectWidth, rectHeight);
    // A mismatch between the model's own independent edge tally and the
    // holes[] array it actually wrote means the COUNT itself is unreliable
    // (not just where a given hole sits) -- every hole on this piece is
    // flagged for review in that case, even ones whose individual x/y was
    // otherwise "confirmed" by an edge distance, since an extra/missing hole
    // elsewhere on the same piece means none of them can be fully trusted
    // until a human recounts against the photo.
    const expectedHoleCount = sumHoleEdgeCounts(piece.holeEdgeCounts);
    const holeCountUncertain = expectedHoleCount != null && expectedHoleCount !== holes.length;
    holes.forEach((hole, i) => {
        const pos = holePositions[i];
        const diameterUnits = hole.diameter != null ? toCanvasUnits(hole.diameter, hole.unit) : DEFAULT_HOLE_RADIUS_UNITS * 2;
        shapes.push({
            id: generateUUID(), type: 'hole', x: pos.x!, y: pos.y!, radius: diameterUnits / 2, parentId: rectId,
            ...(pos.xConfirmed && pos.yConfirmed && !holeCountUncertain ? {} : { positionSource: 'estimated-fallback' as const }),
        });
    });

    // Corner-notch cuts are placed directly from the named corner (a
    // high-confidence, non-numeric read) and never go through
    // resolvePositions -- everything else (edge-distance/centered/pitch/
    // nearEdge/fallback) is handled identically to holes, using the same
    // CENTER semantics, then offset back to the rect's top-left corner.
    const cuts = piece.cuts || [];
    const [cornerNotchCuts, otherCuts] = partition(cuts, cut => cut.cutType === 'corner_notch' && !!cut.corner);
    cornerNotchCuts.forEach(cut => {
        const width = cut.width != null ? toCanvasUnits(cut.width, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        const height = cut.height != null ? toCanvasUnits(cut.height, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        const x = cut.corner!.includes('left') ? rectX : rectX + rectWidth - width;
        const y = cut.corner!.startsWith('top') ? rectY : rectY + rectHeight - height;
        shapes.push({ id: generateUUID(), type: 'cut', x, y, width, height, parentId: rectId });
    });

    const cutPositions = resolvePositions(otherCuts, rectX, rectY, rectWidth, rectHeight);
    otherCuts.forEach((cut, i) => {
        const pos = cutPositions[i];
        const width = cut.width != null ? toCanvasUnits(cut.width, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        const height = cut.height != null ? toCanvasUnits(cut.height, cut.unit) : DEFAULT_CUT_SIZE_UNITS;
        shapes.push({
            id: generateUUID(), type: 'cut', x: pos.x! - width / 2, y: pos.y! - height / 2, width, height, parentId: rectId,
            ...(pos.xConfirmed && pos.yConfirmed ? {} : { positionSource: 'estimated-fallback' as const }),
        });
    });

    return shapes;
}

function estimatePlaceholderPanelSize(piece: VisionPieceLike): { width: number; height: number } {
    const region = piece.imageRegion;
    const regionWidth = region ? Math.abs(Number(region.xMax) - Number(region.xMin)) : 0;
    const regionHeight = region ? Math.abs(Number(region.yMax) - Number(region.yMin)) : 0;
    const ratio = regionWidth > 0 && regionHeight > 0 ? regionWidth / regionHeight : 2 / 3;
    const maxSide = 720;
    const minSide = 240;

    if (ratio >= 1) {
        return {
            width: maxSide,
            height: Math.max(minSide, Math.min(maxSide, maxSide / ratio)),
        };
    }

    return {
        width: Math.max(minSide, Math.min(maxSide, maxSide * ratio)),
        height: maxSide,
    };
}

type MergedPieceGroup = {
    name: string;
    type: string;
    thickness: number;
    quantity: number;
    holes: number;
    cuts: number;
    hardwareNotes: string;
    shapes: KonvaShape[];
    imageDesignCode?: ImageDesignCode;
    imageRegion?: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
};

// Groups consecutive pieces marked connectedToPrevious into a single canvas
// entry, placing each member's rectangle side by side (left to right, in
// array order) at its real width offset, so an adjoining multi-section run
// (e.g. 5 panels cut from one continuous sheet) renders together on one
// shared canvas instead of separate tabs -- staff can then see at a glance
// whether a hole/cut lines up correctly against its neighboring section,
// rather than checking each section in isolation. Every member's holes/cuts
// stay correctly attached to their own rectangle (parentId) and simply move
// with it. This only affects the canvas grouping -- billing (the `items`
// array in buildDesignDataFromImageAnalysis) is built separately, one entry
// per original piece, so merging pieces here never changes area/cost counts.
function mergeConnectedPieceGroups(
    pieces: Array<{ name: string; type: string; thickness: number; quantity: number; holes: number; cuts: number; hardwareNotes: string; shapes: KonvaShape[]; imageDesignCode?: ImageDesignCode; connectedToPrevious?: boolean | null; imageRegion?: { xMin: number; yMin: number; xMax: number; yMax: number } | null }>,
): MergedPieceGroup[] {
    const groups: Array<typeof pieces> = [];
    pieces.forEach(piece => {
        if (piece.connectedToPrevious && groups.length > 0) {
            groups[groups.length - 1].push(piece);
        } else {
            groups.push([piece]);
        }
    });

    return groups.map(group => {
        let cumulativeWidthUnits = 0;
        const mergedShapes: KonvaShape[] = [];
        group.forEach(piece => {
            const dx = cumulativeWidthUnits;
            const outline = piece.shapes.find(s => s.type === 'glass_rect' || s.type === 'glass_polygon');
            piece.shapes.forEach(shape => mergedShapes.push({ ...shape, x: shape.x + dx }));
            cumulativeWidthUnits += outline?.width ?? 0;
        });

        const first = group[0];
        const regions = group.map(piece => piece.imageRegion).filter((region): region is NonNullable<typeof region> => !!region);
        return {
            name: group.length > 1 ? `${first.name} (${group.length} connected sections)` : first.name,
            type: first.type,
            thickness: first.thickness,
            quantity: first.quantity,
            holes: group.reduce((sum, piece) => sum + piece.holes, 0),
            cuts: group.reduce((sum, piece) => sum + piece.cuts, 0),
            hardwareNotes: group.map(piece => piece.hardwareNotes).filter(Boolean).join('; '),
            shapes: mergedShapes,
            imageDesignCode: first.imageDesignCode,
            imageRegion: regions.length > 0 ? {
                xMin: Math.min(...regions.map(region => region.xMin)),
                yMin: Math.min(...regions.map(region => region.yMin)),
                xMax: Math.max(...regions.map(region => region.xMax)),
                yMax: Math.max(...regions.map(region => region.yMax)),
            } : null,
        };
    });
}

function getShapeBounds(shapes: KonvaShape[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    shapes.forEach(shape => {
        if (shape.type === 'glass_circle') {
            const radius = shape.radius || 0;
            minX = Math.min(minX, shape.x - radius);
            minY = Math.min(minY, shape.y - radius);
            maxX = Math.max(maxX, shape.x + radius);
            maxY = Math.max(maxY, shape.y + radius);
            return;
        }

        const width = shape.width || 0;
        const height = shape.height || 0;
        minX = Math.min(minX, shape.x);
        minY = Math.min(minY, shape.y);
        maxX = Math.max(maxX, shape.x + width);
        maxY = Math.max(maxY, shape.y + height);
    });

    return Number.isFinite(minX)
        ? { minX, minY, maxX, maxY }
        : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

// Independent pieces are rendered on one editor canvas. Arrange them in the
// same reading order as their source-image regions and give each group its
// own footprint before the design is saved.
function arrangePieceGroups(groups: MergedPieceGroup[]): MergedPieceGroup[] {
    if (groups.length < 2) return groups;

    const ordered = groups
        .map((group, index) => ({ group, index }))
        .sort((a, b) => {
            const aRegion = a.group.imageRegion;
            const bRegion = b.group.imageRegion;
            if (!aRegion || !bRegion) return a.index - b.index;

            const aCenterY = (aRegion.yMin + aRegion.yMax) / 2;
            const bCenterY = (bRegion.yMin + bRegion.yMax) / 2;
            const sameRowTolerance = Math.max(aRegion.yMax - aRegion.yMin, bRegion.yMax - bRegion.yMin) * 0.4;
            if (Math.abs(aCenterY - bCenterY) <= sameRowTolerance) {
                return aRegion.xMin - bRegion.xMin;
            }
            return aRegion.yMin - bRegion.yMin;
        })
        .map(entry => entry.group);

    const gap = 160;
    const margin = 80;
    const targetRowWidth = 2800;
    let cursorX = margin;
    let cursorY = margin;
    let rowHeight = 0;

    return ordered.map(group => {
        const bounds = getShapeBounds(group.shapes);
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;

        if (cursorX > margin && cursorX + width > targetRowWidth) {
            cursorX = margin;
            cursorY += rowHeight + gap;
            rowHeight = 0;
        }

        const dx = cursorX - bounds.minX;
        const dy = cursorY - bounds.minY;
        cursorX += width + gap;
        rowHeight = Math.max(rowHeight, height);

        return {
            ...group,
            shapes: group.shapes.map(shape => ({ ...shape, x: shape.x + dx, y: shape.y + dy })),
        };
    });
}

// Minimum self-reported confidence before a recognised system is trusted
// enough to REPLACE the perceived drawing. Set high on purpose: generating
// the wrong system produces a drawing that looks authoritative but is wrong
// throughout, which is worse than the honest read-the-photo fallback.
const SYSTEM_RECOGNITION_MIN_CONFIDENCE = 0.7;

type FixedDoorRecognisedSystem = 'sfsd' | 'dfsd' | 'sfdd' | 'dfdd';
type DoorOnlyRecognisedSystem = 'single_door' | 'double_door';

function detectFixedDoorSystemType(text: string | null | undefined): FixedDoorRecognisedSystem | null {
    const compact = String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = compact.replace(/glass|panel|and/g, '');
    if (normalized.includes('singlefixedsingledoor') || normalized.includes('sfsd')) return 'sfsd';
    if (normalized.includes('doublefixedsingledoor') || normalized.includes('dfsd')) return 'dfsd';
    if (normalized.includes('singlefixeddoubledoor') || normalized.includes('sfdd')) return 'sfdd';
    if (normalized.includes('doublefixeddoubledoor') || normalized.includes('dfdd')) return 'dfdd';
    return null;
}

function detectDoorOnlySystemType(text: string | null | undefined): DoorOnlyRecognisedSystem | null {
    const source = String(text || '').toLowerCase();
    if (/\bfixed\b|\bsfsd\b|\bdfsd\b|\bsfdd\b|\bdfdd\b/.test(source)) return null;
    if (/\bdouble\s+(?:glass\s+)?door\b|\bdd\b/.test(source)) return 'double_door';
    if (/\bsingle\s+(?:glass\s+)?door\b|\bsd\b/.test(source)) return 'single_door';
    return null;
}

/**
 * The recognised system, but only when it's complete and confident enough to
 * regenerate the drawing from engineering standards. Returns null whenever
 * anything essential is missing or uncertain, so the caller falls back to the
 * ordinary read-the-holes path rather than inventing a system.
 */
export function resolveRecognisedSystem(analysis: WhatsAppImageAnalysis): {
    systemType: string;
    widthIn: number;
    heightIn: number;
    thickness: number;
    doorPosition?: 'left' | 'centre' | 'right';
    hingeSide?: 'left' | 'right';
    swingDirection?: 'inward' | 'outward' | 'both';
    pivotStyle?: 'patch' | 'hinges';
    hasLock?: boolean;
    hasHandle?: boolean;
    fixedPanelWidthIn?: number;
    doorWidthIn?: number;
    doorHeightIn?: number;
    slidingPanelPosition?: 'left' | 'right';
    confidence: number;
} | null {
    const sys = analysis.glassSystem;
    if (!sys) return null;
    const recognitionText = [
        sys.systemType,
        analysis.extractedText,
        analysis.drawing.notes,
    ].filter(Boolean).join(' ');
    const explicitFixedDoorType = detectFixedDoorSystemType(recognitionText);
    const explicitDoorOnlyType = explicitFixedDoorType ? null : detectDoorOnlySystemType(recognitionText);
    const systemType = explicitFixedDoorType || explicitDoorOnlyType || sys.systemType;
    if (!systemType || !(RECOGNISABLE_SYSTEM_TYPES as readonly string[]).includes(systemType)) return null;

    // Literal B/F panel codes have their own owner-defined deterministic
    // workflow, except when the drawing explicitly names one of the four
    // fixed-panel + door assemblies. In that case F labels are merely panel
    // labels inside the larger named system.
    if (!explicitFixedDoorType && analysis.drawing.pieces.some(piece => piece.designCode === 'B' || piece.designCode === 'F')) {
        return null;
    }
    const confidence = explicitFixedDoorType || explicitDoorOnlyType
        ? Math.max(Number(sys.confidence) || 0, 0.95)
        : Number(sys.confidence);
    if (!Number.isFinite(confidence) || confidence < SYSTEM_RECOGNITION_MIN_CONFIDENCE) return null;

    // Without a real overall size there is nothing to generate against.
    const widthIn = Number(sys.widthIn);
    const heightIn = Number(sys.heightIn);
    if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) return null;
    // Guard against a misread decimal/unit producing an absurd panel.
    if (widthIn > 400 || heightIn > 400) return null;

    const thickness = Number(sys.thickness);
    const textDoorDimensions = parseDoorOpeningDimensions(recognitionText);
    const doorWidthIn = Number(sys.doorWidthIn) > 0 ? Number(sys.doorWidthIn) : textDoorDimensions.doorWidthIn;
    const doorHeightIn = Number(sys.doorHeightIn) > 0 ? Number(sys.doorHeightIn) : textDoorDimensions.doorHeightIn;
    return {
        systemType,
        widthIn,
        heightIn,
        thickness: Number.isFinite(thickness) && thickness > 0 ? thickness : 10,
        ...(sys.doorPosition ? { doorPosition: sys.doorPosition } : {}),
        ...(sys.hingeSide ? { hingeSide: sys.hingeSide } : {}),
        ...(sys.swingDirection ? { swingDirection: sys.swingDirection } : {}),
        ...(sys.pivotStyle ? { pivotStyle: sys.pivotStyle } : {}),
        ...(sys.hasLock != null ? { hasLock: !!sys.hasLock } : {}),
        ...(sys.hasHandle != null ? { hasHandle: !!sys.hasHandle } : {}),
        ...(Number(sys.fixedPanelWidthIn) > 0 ? { fixedPanelWidthIn: Number(sys.fixedPanelWidthIn) } : {}),
        ...(doorWidthIn ? { doorWidthIn } : {}),
        ...(doorHeightIn ? { doorHeightIn } : {}),
        ...(sys.slidingPanelPosition ? { slidingPanelPosition: sys.slidingPanelPosition } : {}),
        confidence,
    };
}

function glassShapeAreaSqft(shape: KonvaShape): number {
    if (shape.type === 'glass_circle') {
        const radius = Number(shape.radius) || 0;
        return (Math.PI * radius * radius) / (CANVAS_UNITS_PER_INCH ** 2 * 144);
    }
    if (shape.type === 'glass_polygon' && shape.points && shape.points.length >= 6) {
        let twiceArea = 0;
        for (let index = 0; index < shape.points.length; index += 2) {
            const next = (index + 2) % shape.points.length;
            twiceArea += shape.points[index] * shape.points[next + 1]
                - shape.points[next] * shape.points[index + 1];
        }
        return Math.abs(twiceArea / 2) / (CANVAS_UNITS_PER_INCH ** 2 * 144);
    }
    const width = Number(shape.width) || 0;
    const height = Number(shape.height) || 0;
    return (width * height) / (CANVAS_UNITS_PER_INCH ** 2 * 144);
}

function glassPieceDimensionsIn(piece: GlassPiece): { width: number; height: number } {
    const outlines = piece.shapes.filter(shape => (
        shape.type === 'glass_rect'
        || shape.type === 'glass_circle'
        || shape.type === 'glass_polygon'
        || shape.type === 'glass_parallelogram'
    ));
    return {
        width: Math.max(0, ...outlines.map(shape => (
            shape.type === 'glass_circle'
                ? ((Number(shape.radius) || 0) * 2) / CANVAS_UNITS_PER_INCH
                : (Number(shape.width) || 0) / CANVAS_UNITS_PER_INCH
        ))),
        height: Math.max(0, ...outlines.map(shape => (
            shape.type === 'glass_circle'
                ? ((Number(shape.radius) || 0) * 2) / CANVAS_UNITS_PER_INCH
                : (Number(shape.height) || 0) / CANVAS_UNITS_PER_INCH
        ))),
    };
}

function inferImageGlassType(analysis: WhatsAppImageAnalysis): string {
    const text = `${analysis.extractedText}\n${analysis.drawing.notes}`.toLowerCase();
    const finishes: Array<[RegExp, string]> = [
        [/\b(?:grey|gray)\b/, 'Toughened Tinted Grey'],
        [/\bbronze\b/, 'Toughened Tinted Bronze'],
        [/\bfrosted\b|\bacid\s*etched\b/, 'Toughened Frosted'],
        [/\breflective\s+blue\b/, 'Toughened Reflective Blue'],
        [/\breflective\s+green\b/, 'Toughened Reflective Green'],
        [/\bplain\b|\bclear\b|\btoughened\b|\btempered\b/, 'Toughened Clear'],
    ];
    return finishes.find(([pattern]) => pattern.test(text))?.[1] || 'Toughened Clear';
}

function expandIndependentDoorDrawings(
    pieces: GlassPiece[],
    fittings: GlassItem[],
    glassType: string,
): GlassPiece[] {
    return pieces.flatMap((piece, index) => {
        const belongsToConnectedRun = !!piece.connectedToPrevious || !!pieces[index + 1]?.connectedToPrevious;
        if (belongsToConnectedRun) return piece;

        const label = `${piece.name} ${piece.type} ${piece.hardwareNotes || ''}`.toLowerCase();
        const systemType = /\bdouble\s*door\b|\bdd\b/.test(label)
            ? 'double_door'
            : /\bsingle\s*door\b|\bsd\b/.test(label)
                ? 'single_door'
                : null;
        if (!systemType) return piece;

        const dimensions = glassPieceDimensionsIn(piece);
        if (dimensions.width <= 0 || dimensions.height <= 0) return piece;
        const doorCount = systemType === 'double_door' ? 2 : 1;
        const generated = generateGlassSystem({
            systemType,
            widthIn: dimensions.width,
            heightIn: dimensions.height,
            doorWidthIn: dimensions.width / doorCount,
            doorHeightIn: Math.min(84, dimensions.height),
            thickness: piece.thickness,
            glassType,
            hasLock: true,
            hasHandle: true,
        }, fittings);

        return generated.map((generatedPiece, generatedIndex) => ({
            ...generatedPiece,
            id: generatedIndex === 0 ? piece.id : generateUUID(),
            source: piece.source,
            imageRegion: piece.imageRegion,
            hardwareNotes: piece.hardwareNotes,
        }));
    });
}

export function buildDesignDataFromImageAnalysis(
    analysis: WhatsAppImageAnalysis,
    fittings: GlassItem[] = [],
    source: 'whatsapp-image' | 'email-image' = 'whatsapp-image',
): {
    drawingData: DesignData;
    totalArea: number;
    grossArea: number;
    holes: number;
    cuts: number;
    items: DesignItem[];
} {
    const extractedPieces = analysis.drawing.pieces.length
        ? analysis.drawing.pieces
        : [{
            name: 'Review Piece 1',
            type: 'Glass Piece',
            width: undefined,
            height: undefined,
            thickness: undefined,
            quantity: 1,
            holes: [],
            cuts: [],
            tapers: [],
            connectedToPrevious: false,
            designCode: null,
            hardwareNotes: analysis.drawing.notes || analysis.extractedText,
            hardwareContext: null,
        }];

    const glassType = inferImageGlassType(analysis);
    const importedPieces = extractedPieces.map((piece, index) => ({
        id: generateUUID(),
        name: piece.name || `Image Piece ${index + 1}`,
        type: piece.type || 'Glass Piece',
        thickness: Number(piece.thickness) || 6,
        quantity: Number(piece.quantity) || 1,
        hardwareNotes: piece.hardwareNotes || '',
        hardwareContext: piece.hardwareContext || undefined,
        imageDesignCode: piece.designCode || undefined,
        connectedToPrevious: !!piece.connectedToPrevious,
        imageRegion: piece.imageRegion,
        source,
        shapes: buildPieceShapes(piece),
    } as GlassPiece));
    const expandedPieces = expandIndependentDoorDrawings(importedPieces, fittings, glassType);
    const conventionPieces = applyImageDesignConventions(
        expandedPieces,
        fittings,
        extractedPieces.length,
    );
    const predictedPieces = predictImagePieceHardware(conventionPieces, fittings);

    const items: DesignItem[] = predictedPieces.flatMap((predictedPiece, pieceIndex) => {
        const quantity = Math.max(1, Number(predictedPiece.quantity) || 1);
        const outlines = predictedPiece.shapes.filter(shape => (
            shape.type === 'glass_rect'
            || shape.type === 'glass_circle'
            || shape.type === 'glass_polygon'
            || shape.type === 'glass_parallelogram'
        ));
        return outlines.map((outline, outlineIndex) => {
            const preparation = predictedPiece.shapes.filter(shape => shape.parentId === outline.id);
            const area = roundCurrency(glassShapeAreaSqft(outline) * quantity);
            const manualHoles = preparation.filter(shape => shape.type === 'hole').length;
            const manualCuts = preparation.filter(shape => shape.type === 'cut').length;
            const hardwareHoles = preparation.reduce((sum, shape) => sum + (Number(shape.accessoryHoleCount) || 0), 0);
            const hardwareCuts = preparation.reduce((sum, shape) => sum + (Number(shape.accessoryCutCount) || 0), 0);

            return {
                id: outlines.length === 1 ? predictedPiece.id : generateUUID(),
                name: outline.glassSectionName || predictedPiece.name || `Piece ${pieceIndex + 1}.${outlineIndex + 1}`,
                // Piece roles such as Door and Fixed Panel belong on the canvas;
                // billing needs the actual glass product from the image header.
                type: glassType,
                thickness: predictedPiece.thickness,
                // DesignItem still exposes the legacy Fabric DrawingShape type,
                // while image/system designs are rendered and billed from Konva
                // shapes. Keep the real runtime shapes here so catalogue hardware
                // IDs, rates, and glass-prep counts reach orderDesignItems.ts.
                shapes: [outline, ...preparation] as unknown as DesignItem['shapes'],
                area,
                cost: 0,
                // Not part of the strict DesignItem type, but the design editor's
                // cost breakdown reads these extra fields (it treats items as
                // `any[]`) -- without them a reopened draft shows 0 holes/cuts
                // and quantity 1 regardless of what was actually extracted.
                netArea: area,
                // Totals across this piece's quantity, matching what `area`
                // already is and what GlassDesigner stores for editor-built
                // designs. Billing relies on that convention for both producers.
                holes: (manualHoles + hardwareHoles) * quantity,
                cuts: (manualCuts + hardwareCuts) * quantity,
                quantity,
            } as DesignItem;
        });
    });

    const totalArea = roundCurrency(items.reduce((sum, item) => sum + item.area, 0));
    const holes = items.reduce((sum, item) => sum + (Number((item as any).holes) || 0), 0);
    const cuts = items.reduce((sum, item) => sum + (Number((item as any).cuts) || 0), 0);
    const dimensions = predictedPieces.map(glassPieceDimensionsIn);
    const maxWidth = Math.max(...dimensions.map(value => value.width), 80);
    const maxHeight = Math.max(...dimensions.map(value => value.height), 60);

    const drawingData: DesignData = {
        shapes: [],
        dimensions: {
            width: maxWidth,
            height: maxHeight,
            unit: 'inch',
        },
        holes: [],
        cuts: [],
        notes: [
            'Created from WhatsApp image/drawing.',
            analysis.drawing.notes,
            analysis.extractedText ? `Extracted text: ${analysis.extractedText}` : '',
            'Review dimensions, hardware, and any flagged (amber) holes/cuts before production.',
        ].filter(Boolean).join('\n'),
        items,
        // Built per original piece first (unmerged -- items[] above already
        // captured accurate per-piece billing independently of this), then
        // grouped through mergeConnectedPieceGroups so consecutive
        // connectedToPrevious pieces land on one shared canvas instead of
        // separate tabs.
        pieces: arrangePieceGroups(mergeConnectedPieceGroups(predictedPieces.map(piece => ({
            name: piece.name,
            type: piece.type,
            thickness: piece.thickness,
            quantity: Number(piece.quantity) || 1,
            holes: piece.shapes.filter(shape => shape.type === 'hole').length,
            cuts: piece.shapes.filter(shape => shape.type === 'cut').length,
            hardwareNotes: piece.hardwareNotes || '',
            imageDesignCode: piece.imageDesignCode,
            connectedToPrevious: piece.connectedToPrevious,
            imageRegion: piece.imageRegion,
            shapes: piece.shapes,
        })))).map(group => ({
            id: generateUUID(),
            name: group.name,
            type: group.type,
            thickness: group.thickness,
            quantity: group.quantity,
            holes: group.holes,
            cuts: group.cuts,
            hardwareNotes: group.hardwareNotes,
            imageDesignCode: group.imageDesignCode,
            source,
            shapes: group.shapes,
        })),
    };

    return {
        drawingData,
        totalArea,
        grossArea: totalArea,
        holes,
        cuts,
        items,
    };
}
