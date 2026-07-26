/**
 * SVG Exporter for Glass Designer
 * Generates clean, scalable vector graphics (SVG) with precise panel geometry,
 * hole centerlines, cutout notches, and dimension callouts suitable for printing
 * and factory job specification sheets.
 *
 * Two drawing types, since they serve different people on the job:
 * - 'fabrication' (default): outline + every hole/cut the glass actually needs drilled
 *   or cut, including the ones implied by hardware -- no hardware markers or brand
 *   names, because the person cutting/drilling the glass doesn't need them.
 * - 'installation': outline + labelled, colour-coded hardware markers showing what
 *   fitting goes where, for whoever is installing the hardware after the glass comes
 *   back from processing.
 */

import { GlassPiece, GlassItem } from '@/types';
import { deriveAccessoryGeometry } from './fabricationSpecs';

export interface SVGExportOptions {
    title?: string;
    unit?: 'inch' | 'mm';
    showDimensions?: boolean;
    mode?: 'fabrication' | 'installation';
    fittingsById?: Map<string, GlassItem>;
}

// Canvas coordinates are stored at 10 units per inch (see GlassDesigner.createRectShape /
// glassSystemDesigner U=10) -- every coordinate must go through this before being drawn
// at a real-world scale, or the SVG geometry (and its printed dimension labels) come out
// 10x (inch) or 2.54x (mm) wrong.
const UNITS_PER_INCH = 10;
const MM_PER_INCH = 25.4;

// Matches the canvas marker/accessory palette in GlassDesigner.tsx and the published
// Glass Systems Designer artifact: hinge=blue, lock=red, patch/profile=violet, connector/fix=green.
const ACCESSORY_COLORS: Record<string, string> = {
    hinge: '#2563eb',
    lock: '#d0402a',
    profile: '#7c3aed',
    connector: '#0f8a5f'
};

/**
 * Generates an SVG string representation of glass designer pieces.
 */
export function exportToSVG(pieces: GlassPiece[], options: SVGExportOptions = {}): string {
    const unit = options.unit || 'inch';
    const showDims = options.showDimensions !== false;
    const mode = options.mode || 'fabrication';
    const toOut = (canvasVal: number) => unit === 'mm'
        ? (canvasVal / UNITS_PER_INCH) * MM_PER_INCH
        : canvasVal / UNITS_PER_INCH;

    // Resolve every piece's shapes -- for glass_rect/hole/cut that's the shape itself
    // (converted to output units); for accessory shapes it depends on the drawing type.
    type ResolvedShape = { kind: 'glass_rect' | 'hole' | 'cut' | 'accessory'; x: number; y: number; width?: number; height?: number; radius?: number; label?: string; color?: string };

    const resolvePiece = (piece: GlassPiece): ResolvedShape[] => {
        const out: ResolvedShape[] = [];
        piece.shapes.forEach(shape => {
            if (shape.type === 'glass_rect') {
                out.push({ kind: 'glass_rect', x: toOut(shape.x || 0), y: toOut(shape.y || 0), width: toOut(shape.width || 0), height: toOut(shape.height || 0) });
            } else if (shape.type === 'hole') {
                out.push({ kind: 'hole', x: toOut(shape.x || 0), y: toOut(shape.y || 0), radius: toOut(shape.radius || 10) });
            } else if (shape.type === 'cut') {
                out.push({ kind: 'cut', x: toOut(shape.x || 0), y: toOut(shape.y || 0), width: toOut(shape.width || 20), height: toOut(shape.height || 20) });
            } else if (shape.type === 'accessory') {
                if (mode === 'installation') {
                    out.push({
                        kind: 'accessory',
                        x: toOut(shape.x || 0),
                        y: toOut(shape.y || 0),
                        width: toOut(shape.width || 20),
                        height: toOut(shape.height || 20),
                        label: shape.accessoryName || 'Fitting',
                        color: ACCESSORY_COLORS[shape.accessoryType || 'connector'] || ACCESSORY_COLORS.connector
                    });
                } else {
                    const { holes, cuts } = deriveAccessoryGeometry(shape, options.fittingsById);
                    holes.forEach(hole => out.push({ kind: 'hole', x: toOut(hole.x), y: toOut(hole.y), radius: toOut(hole.radius) }));
                    cuts.forEach(cut => out.push({ kind: 'cut', x: toOut(cut.x), y: toOut(cut.y), width: toOut(cut.width), height: toOut(cut.height) }));
                }
            }
        });
        return out;
    };

    const resolvedPieces = pieces.map(resolvePiece);

    // Calculate total bounding box of all pieces
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pieceGap = 40; // output-unit gap between pieces laid side by side

    let runningX = 0;
    const pieceOffsets: number[] = [];
    resolvedPieces.forEach(shapes => {
        pieceOffsets.push(runningX);
        let localMax = 0;
        shapes.forEach(s => {
            const w = s.width || (s.radius ? s.radius * 2 : 50);
            const h = s.height || (s.radius ? s.radius * 2 : 50);
            minX = Math.min(minX, runningX + s.x - 50);
            minY = Math.min(minY, s.y - 50);
            maxX = Math.max(maxX, runningX + s.x + w + 50);
            maxY = Math.max(maxY, s.y + h + 50);
            localMax = Math.max(localMax, s.x + w);
        });
        runningX += localMax + pieceGap;
    });

    if (minX === Infinity) {
        minX = 0; minY = 0; maxX = 800; maxY = 600;
    }

    const width = maxX - minX;
    const height = maxY - minY;

    const svgElements: string[] = [];

    // Background grid definition
    svgElements.push(`
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0e7490"/>
        </marker>
      </defs>
      <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#grid)" />
    `);

    // Render pieces
    pieces.forEach((piece, pIndex) => {
        const pieceOffsetX = pieceOffsets[pIndex];

        resolvedPieces[pIndex].forEach(s => {
            const px = pieceOffsetX + s.x;
            const py = s.y;

            if (s.kind === 'glass_rect') {
                const w = s.width || 0;
                const h = s.height || 0;

                svgElements.push(`
                    <g id="glass-piece-${piece.id}">
                        <rect x="${px}" y="${py}" width="${w}" height="${h}"
                              fill="#e0f2fe" fill-opacity="0.6" stroke="#0284c7" stroke-width="2.5" rx="3" />
                        <text x="${px + w / 2}" y="${py + h / 2}" font-family="system-ui, sans-serif" font-size="14"
                              font-weight="600" fill="#0369a1" text-anchor="middle" dominant-baseline="middle">
                            ${piece.name || 'Glass Panel'} (${piece.thickness}mm)
                        </text>
                    </g>
                `);

                if (showDims) {
                    svgElements.push(`
                        <line x1="${px}" y1="${py - 18}" x2="${px + w}" y2="${py - 18}" stroke="#0e7490" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
                        <text x="${px + w / 2}" y="${py - 24}" font-family="sans-serif" font-size="11" font-weight="600" fill="#0e7490" text-anchor="middle">
                            ${w.toFixed(2)} ${unit}
                        </text>
                        <line x1="${px - 18}" y1="${py}" x2="${px - 18}" y2="${py + h}" stroke="#0e7490" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
                        <text x="${px - 26}" y="${py + h / 2}" font-family="sans-serif" font-size="11" font-weight="600" fill="#0e7490" text-anchor="middle" transform="rotate(-90 ${px - 26} ${py + h / 2})">
                            ${h.toFixed(2)} ${unit}
                        </text>
                    `);
                }
            } else if (s.kind === 'hole') {
                const r = s.radius || 10;
                svgElements.push(`
                    <circle cx="${px}" cy="${py}" r="${r}" fill="#ef4444" fill-opacity="0.2" stroke="#dc2626" stroke-width="1.5"/>
                    <line x1="${px - r - 4}" y1="${py}" x2="${px + r + 4}" y2="${py}" stroke="#dc2626" stroke-width="1" stroke-dasharray="2 2"/>
                    <line x1="${px}" y1="${py - r - 4}" x2="${px}" y2="${py + r + 4}" stroke="#dc2626" stroke-width="1" stroke-dasharray="2 2"/>
                `);
            } else if (s.kind === 'cut') {
                const w = s.width || 20;
                const h = s.height || 20;
                const cx = px - w / 2;
                const cy = py - h / 2;
                svgElements.push(`
                    <rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="#3b82f6" fill-opacity="0.3" stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="3 3"/>
                `);
            } else if (s.kind === 'accessory') {
                const w = s.width || 20;
                const h = s.height || 20;
                const color = s.color || '#0f8a5f';
                svgElements.push(`
                    <rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1.6" rx="3"/>
                    <text x="${px + w / 2}" y="${py - 6}" font-family="sans-serif" font-size="10" font-weight="700" fill="${color}" text-anchor="middle">
                        ${s.label}
                    </text>
                `);
            }
        });
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="100%" height="100%">
  ${svgElements.join('\n')}
</svg>`;
}

/**
 * Triggers a browser file download for SVG content.
 */
export function downloadSVGFile(filename: string, svgContent: string) {
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
