'use client';

import type { KonvaShape } from '@/types';

// A read-only thumbnail of an extracted drawing, rendered as plain SVG.
// Deliberately not the Konva designer: this shows up on the order review
// page purely so staff can eyeball the extraction against the original
// photo, and pulling the full editor (canvas, hardware catalogue, history)
// onto that page would make it slow to open for no review benefit.

type DesignPreviewProps = {
    pieces: Array<{ shapes?: KonvaShape[] }>;
    height?: number;
};

const OUTLINE_TYPES = new Set(['glass_rect', 'glass_polygon', 'glass_parallelogram', 'glass_circle']);

export default function DesignPreview({ pieces, height = 260 }: DesignPreviewProps) {
    const shapes = pieces.flatMap(piece => piece.shapes || []);
    if (shapes.length === 0) {
        return (
            <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem', background: 'var(--color-bg)', borderRadius: '8px' }}>
                No shapes were extracted from this drawing.
            </div>
        );
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    shapes.forEach(shape => {
        const radius = shape.radius || 0;
        const x0 = shape.type === 'glass_circle' || shape.type === 'hole' ? shape.x - radius : shape.x;
        const y0 = shape.type === 'glass_circle' || shape.type === 'hole' ? shape.y - radius : shape.y;
        const x1 = shape.type === 'glass_circle' || shape.type === 'hole' ? shape.x + radius : shape.x + (shape.width || 0);
        const y1 = shape.type === 'glass_circle' || shape.type === 'hole' ? shape.y + radius : shape.y + (shape.height || 0);
        minX = Math.min(minX, x0); minY = Math.min(minY, y0);
        maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
    });

    const pad = Math.max((maxX - minX) * 0.04, 10);
    const viewBox = `${minX - pad} ${minY - pad} ${(maxX - minX) + pad * 2} ${(maxY - minY) + pad * 2}`;
    // Stroke widths are in user units, so scale them off the drawing's own
    // size -- otherwise a 240-unit panel and a 2400-unit run look wildly
    // different once the SVG is fitted to the same box.
    const stroke = Math.max((maxX - minX) / 400, 1.2);

    return (
        <svg viewBox={viewBox} style={{ width: '100%', height, display: 'block' }} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Extracted drawing preview">
            {shapes.filter(s => OUTLINE_TYPES.has(s.type)).map(shape => {
                const flagged = shape.positionSource === 'estimated-fallback';
                const fill = flagged ? 'rgba(245, 158, 11, 0.18)' : 'rgba(59, 130, 246, 0.18)';
                const line = flagged ? '#f59e0b' : '#3b82f6';
                if (shape.type === 'glass_circle') {
                    return <circle key={shape.id} cx={shape.x} cy={shape.y} r={shape.radius || 0} fill={fill} stroke={line} strokeWidth={stroke} />;
                }
                if (shape.type === 'glass_polygon' && shape.points?.length) {
                    const points = [];
                    for (let i = 0; i < shape.points.length; i += 2) {
                        points.push(`${shape.x + shape.points[i]},${shape.y + shape.points[i + 1]}`);
                    }
                    return <polygon key={shape.id} points={points.join(' ')} fill={fill} stroke={line} strokeWidth={stroke} />;
                }
                return <rect key={shape.id} x={shape.x} y={shape.y} width={shape.width || 0} height={shape.height || 0} fill={fill} stroke={line} strokeWidth={stroke} />;
            })}

            {shapes.filter(s => s.type === 'hole' || s.type === 'cut').map(shape => {
                const flagged = shape.positionSource === 'estimated-fallback';
                const line = flagged ? '#f59e0b' : '#ef4444';
                const fill = flagged ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.35)';
                return shape.type === 'cut'
                    ? <rect key={shape.id} x={shape.x} y={shape.y} width={shape.width || 0} height={shape.height || 0} fill={fill} stroke={line} strokeWidth={stroke} strokeDasharray={`${stroke * 3} ${stroke * 3}`} />
                    : <circle key={shape.id} cx={shape.x} cy={shape.y} r={shape.radius || 0} fill={fill} stroke={line} strokeWidth={stroke} />;
            })}
        </svg>
    );
}
