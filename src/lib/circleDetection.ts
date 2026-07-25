import sharp from 'sharp';
import cvModule from '@techstark/opencv-js';

// Classical computer-vision circle detection (Hough Circle Transform) used
// as a candidate generator for the per-panel hole verification pass in
// whatsappVision.ts -- feeding the LLM a list of "here's what a deterministic
// detector found" candidates to confirm/reject is a much more tractable task
// for it than free-form "count every circle from scratch", which is where
// the pure-LLM approach was shown (on a real drawing) to drift both over and
// under regardless of prompt framing.
//
// This is a candidate generator, not a final answer: Hough circles reliably
// finds real hand-drawn holes, but also flags lookalikes (circled drawing
// numbers, loops in handwritten digits like "8"/"0"/"3", a photographed
// finger/thumb at the image edge) -- confirmed on a real drawing crop. The
// LLM is the one that actually decides which candidates are real holes,
// using its semantic understanding of the photo; this module only narrows
// down where to look.

export type CandidateCircle = {
    xFraction: number;
    yFraction: number;
    radiusFraction: number;
};

let cvPromise: Promise<any> | null = null;
function getCv(): Promise<any> {
    if (!cvPromise) {
        cvPromise = Promise.resolve(cvModule).then(async (cv: any) => {
            if (cv.Mat) return cv;
            await new Promise<void>(resolve => { cv.onRuntimeInitialized = () => resolve(); });
            return cv;
        });
    }
    return cvPromise;
}

// Candidates within this fraction of the crop's own edge are dropped before
// they ever reach the LLM -- the verification pass crops with ~12% padding
// around the panel's own estimated bounding box specifically to avoid
// clipping edge-hugging holes, but that same padding is exactly where a
// neighboring panel's bleed-through or a photographed thumb tends to land
// (confirmed on a real drawing). A real hole drawn "near the edge" of the
// panel itself is still comfortably inside this margin in practice.
const EDGE_EXCLUSION_FRACTION = 0.04;
const MAX_CANDIDATES = 40;

// Detects circular marks in a (already cropped, single-panel) photo and
// returns their positions as fractions of the image's own width/height, so
// they can be communicated to the LLM in the same normalized coordinate
// system already used elsewhere (e.g. imageRegion) regardless of the
// source photo's actual resolution. Returns [] on any failure (missing
// runtime support, corrupt image, etc.) -- this is a best-effort hint, never
// a hard dependency; the verification call still works from a blank slate
// when this comes back empty.
export async function detectCandidateCircles(imageDataUrl: string): Promise<CandidateCircle[]> {
    try {
        const match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (!match) return [];

        const buffer = Buffer.from(match[1], 'base64');
        const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = info;
        if (!width || !height) return [];

        const cv = await getCv();
        const mat = cv.matFromArray(height, width, cv.CV_8UC4, data);
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const circles = new cv.Mat();
        try {
            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
            cv.medianBlur(gray, blurred, 5);

            // Scale-invariant params -- radius bounds as a fraction of the
            // image's shorter side, minDist likewise, so this behaves
            // consistently across differently-sized crops rather than
            // assuming a fixed pixel scale. Tuned against a real hand-drawn
            // photo: permissive enough to catch faint/irregular circles
            // (real holes are hand-drawn, not geometrically perfect) while
            // still bounding the radius range away from much larger marks
            // like a circled drawing number.
            const shortSide = Math.min(width, height);
            const minRadius = Math.max(4, Math.round(shortSide * 0.012));
            const maxRadius = Math.round(shortSide * 0.045);
            const minDist = Math.round(shortSide * 0.045);
            cv.HoughCircles(blurred, circles, cv.HOUGH_GRADIENT, 1, minDist, 80, 18, minRadius, maxRadius);

            const results: CandidateCircle[] = [];
            for (let i = 0; i < circles.cols && results.length < MAX_CANDIDATES; i++) {
                const x = circles.data32F[i * 3];
                const y = circles.data32F[i * 3 + 1];
                const r = circles.data32F[i * 3 + 2];
                const xFraction = x / width;
                const yFraction = y / height;
                if (
                    xFraction < EDGE_EXCLUSION_FRACTION || xFraction > 1 - EDGE_EXCLUSION_FRACTION ||
                    yFraction < EDGE_EXCLUSION_FRACTION || yFraction > 1 - EDGE_EXCLUSION_FRACTION
                ) {
                    continue;
                }
                results.push({ xFraction, yFraction, radiusFraction: r / shortSide });
            }
            return results;
        } finally {
            mat.delete();
            gray.delete();
            blurred.delete();
            circles.delete();
        }
    } catch (error) {
        console.error('[circle-detection] Failed to detect candidate circles:', error);
        return [];
    }
}
