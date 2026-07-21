import sharp from 'sharp';

// Phone cameras almost never rotate the pixels when you hold the phone
// sideways -- they store the sensor's raw orientation and record an EXIF
// Orientation tag telling viewers how to rotate it. Browsers and photo apps
// honour that tag, so the drawing looks upright to the person who sent it,
// but the raw bytes handed to a vision model are still rotated 90/180/270
// degrees. That silently destroys every edge-relative judgement the model
// makes ("this hole is near the left edge" becomes near the top edge), which
// is exactly the kind of position error that is otherwise very hard to
// diagnose -- the model looks like it is guessing when it is actually
// reading a sideways picture correctly.
//
// sharp's .rotate() with no argument bakes the EXIF orientation into the
// actual pixels and clears the tag, so what the model sees matches what the
// sender saw. Everything downstream (vision analysis and the stored review
// copy) uses that normalized image.

const VISION_MAX_DIMENSION = 2200; // keeps small handwritten dimension text legible
const STORED_MAX_DIMENSION = 1600; // review copy shown beside the extracted drawing
const JPEG_QUALITY = 82;

export type NormalizedIntakeImage = {
    base64: string;
    mimeType: string;
    /** Data URL ready to hand to a vision API. */
    dataUrl: string;
};

export type NormalizedIntakePair = {
    /** Higher-resolution copy for the vision model. */
    vision: NormalizedIntakeImage;
    /** Smaller copy stored on the design for side-by-side review. */
    stored: NormalizedIntakeImage;
    /** True when EXIF said the image needed rotating (useful for logs). */
    wasRotated: boolean;
};

const toImage = (buffer: Buffer): NormalizedIntakeImage => {
    const base64 = buffer.toString('base64');
    return { base64, mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${base64}` };
};

/**
 * Applies EXIF orientation, downscales, and re-encodes an intake photo.
 * Falls back to the original bytes if the image can't be processed (e.g. an
 * unsupported format) -- intake should never fail just because normalization
 * did.
 */
export async function normalizeIntakeImage(base64: string, mimeType: string): Promise<NormalizedIntakePair> {
    const original: NormalizedIntakeImage = {
        base64,
        mimeType,
        dataUrl: `data:${mimeType};base64,${base64}`,
    };

    try {
        const input = Buffer.from(base64, 'base64');
        const metadata = await sharp(input).metadata();
        // EXIF orientation 1 (and an absent tag) already match the pixels.
        const wasRotated = typeof metadata.orientation === 'number' && metadata.orientation > 1;

        const render = (maxDimension: number) => sharp(input)
            .rotate() // no argument = auto-orient from EXIF
            .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: JPEG_QUALITY })
            .toBuffer();

        const [visionBuffer, storedBuffer] = await Promise.all([
            render(VISION_MAX_DIMENSION),
            render(STORED_MAX_DIMENSION),
        ]);

        return { vision: toImage(visionBuffer), stored: toImage(storedBuffer), wasRotated };
    } catch (error) {
        console.error('Failed to normalize intake image, using original bytes:', error);
        return { vision: original, stored: original, wasRotated: false };
    }
}
