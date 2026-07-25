/**
 * SVG Exporter for Glass Designer
 * Generates clean, scalable vector graphics (SVG) with precise panel geometry,
 * hole centerlines, cutout notches, and dimension callouts suitable for printing
 * and factory job specification sheets.
 */

import { GlassPiece } from '@/types';

export interface SVGExportOptions {
    title?: string;
    unit?: 'inch' | 'mm';
    showDimensions?: boolean;
    showCenterlines?: boolean;
}

/**
 * Generates an SVG string representation of glass designer pieces.
 */
export function exportToSVG(pieces: GlassPiece[], options: SVGExportOptions = {}): string {
    const unit = options.unit || 'inch';
    const showDims = options.showDimensions !== false;

    // Calculate total bounding box of all pieces
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    pieces.forEach((piece, pIndex) => {
        const pieceOffsetX = pIndex * 400; // offset layout
        piece.shapes.forEach(shape => {
            const x = (shape.x || 0) + pieceOffsetX;
            const y = shape.y || 0;
            const w = shape.width || (shape.radius ? shape.radius * 2 : 50);
            const h = shape.height || (shape.radius ? shape.radius * 2 : 50);

            minX = Math.min(minX, x - 50);
            minY = Math.min(minY, y - 50);
            maxX = Math.max(maxX, x + w + 50);
            maxY = Math.max(maxY, y + h + 50);
        });
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
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#grid)" />
    `);

    // Render pieces
    pieces.forEach((piece, pIndex) => {
        const pieceOffsetX = pIndex * 400;

        piece.shapes.forEach(shape => {
            const px = (shape.x || 0) + pieceOffsetX;
            const py = shape.y || 0;

            if (shape.type === 'glass_rect') {
                const w = shape.width || 0;
                const h = shape.height || 0;

                // Glass Body
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

                // Dimensions
                if (showDims) {
                    // Top width dimension line
                    svgElements.push(`
                        <line x1="${px}" y1="${py - 18}" x2="${px + w}" y2="${py - 18}" stroke="#3b82f6" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
                        <text x="${px + w / 2}" y="${py - 24}" font-family="sans-serif" font-size="11" font-weight="600" fill="#2563eb" text-anchor="middle">
                            ${w} ${unit}
                        </text>
                        <!-- Left height dimension line -->
                        <line x1="${px - 18}" y1="${py}" x2="${px - 18}" y2="${py + h}" stroke="#3b82f6" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
                        <text x="${px - 26}" y="${py + h / 2}" font-family="sans-serif" font-size="11" font-weight="600" fill="#2563eb" text-anchor="middle" transform="rotate(-90 ${px - 26} ${py + h / 2})">
                            ${h} ${unit}
                        </text>
                    `);
                }
            } else if (shape.type === 'hole') {
                const cx = px;
                const cy = py;
                const r = shape.radius || 10;

                // Hole circle & crosshair centerlines
                svgElements.push(`
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ef4444" fill-opacity="0.2" stroke="#dc2626" stroke-width="1.5"/>
                    <line x1="${cx - r - 4}" y1="${cy}" x2="${cx + r + 4}" y2="${cy}" stroke="#dc2626" stroke-width="1" stroke-dasharray="2 2"/>
                    <line x1="${cx}" y1="${cy - r - 4}" x2="${cx}" y2="${cy + r + 4}" stroke="#dc2626" stroke-width="1" stroke-dasharray="2 2"/>
                `);
            } else if (shape.type === 'cut') {
                const w = shape.width || 20;
                const h = shape.height || 20;
                const cx = px - w / 2;
                const cy = py - h / 2;

                svgElements.push(`
                    <rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="#3b82f6" fill-opacity="0.3" stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="3 3"/>
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
