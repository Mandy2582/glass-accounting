/**
 * DXF Exporter for Glass Designer
 * Generates standard AutoCAD R12 ASCII DXF files compatible with CNC glass cutting
 * machines (Bystronic, Intermac, Lisec, Bottero) and CAD applications.
 *
 * This is always a fabrication drawing: outline + holes + cuts only, no hardware
 * markers -- a CNC machine cuts and drills glass, it doesn't install fittings.
 */

import { GlassPiece, GlassItem } from '@/types';
import { deriveAccessoryGeometry } from './fabricationSpecs';

export interface DXFExportOptions {
    unit?: 'mm' | 'inch';
    // Real catalogue items keyed by id, so hardware markers that reference a real
    // fitting get its precise per-model hole/notch geometry instead of a generic guess.
    fittingsById?: Map<string, GlassItem>;
}

// Canvas coordinates are stored at 10 units per inch (see GlassDesigner.createRectShape /
// glassSystemDesigner U=10) -- every coordinate must go through this before being written
// out as real-world mm/inches, or the DXF geometry comes out 10x (inch) or 2.54x (mm) wrong.
const UNITS_PER_INCH = 10;
const MM_PER_INCH = 25.4;

/**
 * Generate a complete R12 DXF file string from glass pieces.
 */
export function exportToDXF(pieces: GlassPiece[], options: DXFExportOptions = {}): string {
    const unit = options.unit || 'mm';
    const toOut = (canvasVal: number) => unit === 'mm'
        ? (canvasVal / UNITS_PER_INCH) * MM_PER_INCH
        : canvasVal / UNITS_PER_INCH;

    const lines: string[] = [];

    // Helper to append DXF key-value pair
    const add = (code: number, value: string | number) => {
        lines.push(code.toString().padStart(3, ' '));
        lines.push(value.toString());
    };

    // Header section
    add(0, 'SECTION');
    add(2, 'HEADER');
    add(9, '$ACADVER');
    add(1, 'AC1009'); // R12 DXF format
    add(9, '$INSUNITS');
    add(70, unit === 'mm' ? 4 : 1); // 4 = mm, 1 = inches
    add(0, 'ENDSEC');

    // Tables section (Layers)
    add(0, 'SECTION');
    add(2, 'TABLES');
    add(0, 'TABLE');
    add(2, 'LAYER');
    add(70, 4); // Number of layer entries

    const layers = [
        { name: '0_OUTLINE', color: 7 },   // White/Black outer glass outline
        { name: '1_HOLES', color: 1 },     // Red drill holes
        { name: '2_CUTOUTS', color: 5 },   // Blue notches & cutouts
        { name: '3_ANNOTATIONS', color: 3 } // Green text and dimensions
    ];

    layers.forEach(ly => {
        add(0, 'LAYER');
        add(2, ly.name);
        add(70, 0);
        add(62, ly.color);
        add(6, 'CONTINUOUS');
    });

    add(0, 'ENDTAB');
    add(0, 'ENDSEC');

    // Entities section
    add(0, 'SECTION');
    add(2, 'ENTITIES');

    const pieceGapUnits = 150 * UNITS_PER_INCH; // 150" gap between pieces, in canvas units

    pieces.forEach((piece, pIndex) => {
        const pieceXOffset = pIndex * pieceGapUnits; // canvas units, added before conversion

        piece.shapes.forEach(shape => {
            if (shape.type === 'glass_rect') {
                const w = toOut(shape.width || 0);
                const h = toOut(shape.height || 0);
                const x0 = toOut((shape.x || 0) + pieceXOffset);
                const y0 = -toOut(shape.y || 0); // Invert Y for standard CAD Cartesian plane

                add(0, 'POLYLINE');
                add(8, '0_OUTLINE');
                add(66, 1); // Followed by vertices
                add(70, 1); // Closed polyline

                const coords = [
                    { x: x0, y: y0 },
                    { x: x0 + w, y: y0 },
                    { x: x0 + w, y: y0 - h },
                    { x: x0, y: y0 - h }
                ];

                coords.forEach(pt => {
                    add(0, 'VERTEX');
                    add(8, '0_OUTLINE');
                    add(10, pt.x.toFixed(4));
                    add(20, pt.y.toFixed(4));
                    add(30, '0.0000');
                });

                add(0, 'SEQEND');

                // Label annotation
                add(0, 'TEXT');
                add(8, '3_ANNOTATIONS');
                add(10, (x0 + w / 2).toFixed(4));
                add(20, (y0 - h / 2).toFixed(4));
                add(30, '0.0000');
                add(40, (Math.min(w, h) * 0.05 || (unit === 'mm' ? 20 : 0.8)).toFixed(4));
                add(1, `${piece.name || 'GLASS_PANEL'} (${piece.thickness}mm)`);
            } else if (shape.type === 'hole') {
                const cx = toOut((shape.x || 0) + pieceXOffset);
                const cy = -toOut(shape.y || 0);
                const r = toOut(shape.radius || 10);

                add(0, 'CIRCLE');
                add(8, '1_HOLES');
                add(10, cx.toFixed(4));
                add(20, cy.toFixed(4));
                add(30, '0.0000');
                add(40, r.toFixed(4));
            } else if (shape.type === 'cut') {
                const w = toOut(shape.width || 20);
                const h = toOut(shape.height || 20);
                const x0 = toOut((shape.x || 0) + pieceXOffset) - w / 2;
                const y0 = -toOut(shape.y || 0) + h / 2;

                add(0, 'POLYLINE');
                add(8, '2_CUTOUTS');
                add(66, 1);
                add(70, 1);

                const coords = [
                    { x: x0, y: y0 },
                    { x: x0 + w, y: y0 },
                    { x: x0 + w, y: y0 - h },
                    { x: x0, y: y0 - h }
                ];

                coords.forEach(pt => {
                    add(0, 'VERTEX');
                    add(8, '2_CUTOUTS');
                    add(10, pt.x.toFixed(4));
                    add(20, pt.y.toFixed(4));
                    add(30, '0.0000');
                });

                add(0, 'SEQEND');
            } else if (shape.type === 'accessory') {
                // Hardware fittings only carry a hole/cut COUNT -- derive the real,
                // positioned drill holes and notch cutouts they imply so the CNC
                // machine actually gets geometry for them, not just a marker.
                const { holes, cuts } = deriveAccessoryGeometry(shape, options.fittingsById);

                holes.forEach(hole => {
                    const cx = toOut(hole.x + pieceXOffset);
                    const cy = -toOut(hole.y);
                    const r = toOut(hole.radius);
                    add(0, 'CIRCLE');
                    add(8, '1_HOLES');
                    add(10, cx.toFixed(4));
                    add(20, cy.toFixed(4));
                    add(30, '0.0000');
                    add(40, r.toFixed(4));
                });

                cuts.forEach(cut => {
                    const w = toOut(cut.width);
                    const h = toOut(cut.height);
                    const x0 = toOut(cut.x + pieceXOffset);
                    const y0 = -toOut(cut.y);

                    add(0, 'POLYLINE');
                    add(8, '2_CUTOUTS');
                    add(66, 1);
                    add(70, 1);
                    [
                        { x: x0, y: y0 },
                        { x: x0 + w, y: y0 },
                        { x: x0 + w, y: y0 - h },
                        { x: x0, y: y0 - h }
                    ].forEach(pt => {
                        add(0, 'VERTEX');
                        add(8, '2_CUTOUTS');
                        add(10, pt.x.toFixed(4));
                        add(20, pt.y.toFixed(4));
                        add(30, '0.0000');
                    });
                    add(0, 'SEQEND');
                });
            }
        });
    });

    add(0, 'ENDSEC');
    add(0, 'EOF');

    return lines.join('\n');
}

/**
 * Triggers a browser file download for DXF content.
 */
export function downloadDXFFile(filename: string, dxfContent: string) {
    const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.dxf') ? filename : `${filename}.dxf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
