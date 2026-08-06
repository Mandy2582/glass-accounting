import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const APPLY = process.argv.includes('--apply');
const ORIGIN = 'https://iconmetal.co.in';
const PDF_URL = `${ORIGIN}/media/7bf5ccf7-8610-4959-8cf4-14fb3d0575ca/0bugpQ/Products/ICON%20CATALOGUE%202020.pdf?download=true`;
const BUCKET = 'product-images';
const OBJECT_PREFIX = 'icon-hardware';
const BACKUP_DIR = '/Users/mandeepsingh/Desktop/arjun_glass_house_backups';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function withRetry(label, operation, attempts = 4) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await sleep(attempt * 600);
        }
    }
    throw new Error(`${label} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fetchBuffer(url) {
    return withRetry(`Image request for ${url}`, async () => {
        const response = await fetch(url, { headers: { 'user-agent': 'ArjunGlassHouse-CatalogueSync/1.0' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
    });
}

async function fetchText(url) {
    return withRetry(`Catalogue request for ${url}`, async () => {
        const response = await fetch(url, { headers: { 'user-agent': 'ArjunGlassHouse-CatalogueSync/1.0' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
    });
}

const decodeHtml = value => value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;|\u00a0/g, ' ');

const normalizeCode = value => decodeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.:;,]+$/g, '')
    .trim()
    .toUpperCase();

async function readWebsiteImageMap() {
    const home = await fetchText(ORIGIN);
    const categoryPaths = [...new Set([...home.matchAll(/href="(\/Products\/[^"]+)"/gi)].map(match => match[1]))];
    const pages = await mapConcurrent(categoryPaths, 6, async sourcePath => fetchText(new URL(sourcePath, ORIGIN)));
    const images = new Map();
    pages.forEach(html => {
        for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
            const row = match[1];
            const marker = row.search(/Product Code/i);
            if (marker < 0) continue;
            let tail = row.slice(marker).replace(/^Product Code/i, '');
            tail = tail.replace(/^(?:\s|:|&nbsp;|&#160;|\u00a0|<[^>]+>)*/gi, '');
            const firstText = tail.match(/^([^<]+)/)?.[1];
            if (!firstText) continue;
            const code = normalizeCode(firstText);
            const imagePath = [
                ...[...row.matchAll(/href="([^"]+)"[^>]*data-lightbox/gi)].map(image => decodeHtml(image[1])),
                ...[...row.matchAll(/<img[^>]+src="([^"]+)"/gi)].map(image => decodeHtml(image[1])),
            ].find(candidate => candidate.startsWith('/media/') && !candidate.includes('media(MediaArchive:'));
            if (code && imagePath && !images.has(code)) images.set(code, new URL(imagePath, ORIGIN).href);
        }
    });
    return images;
}

const railingBoxes = {
    'ICRA-1': [350, 395, 435, 500],
    'ICRA-1A': [470, 395, 580, 500],
    'ICRA-2': [600, 395, 685, 500],
    'ICRA-2A': [710, 395, 815, 500],
    'ICRA-25': [850, 395, 940, 500],
    'ICRA-3': [980, 395, 1080, 500],
    'ICRA-4': [65, 575, 185, 690],
    'ICRA-5': [195, 575, 320, 690],
    'ICRA-6': [325, 575, 445, 690],
    'ICRA-7': [455, 575, 570, 690],
    'ICRA-8': [575, 575, 690, 690],
    'ICRA-9': [700, 575, 815, 690],
    'ICRA-9A': [840, 575, 940, 690],
    'ICRA-9S': [980, 575, 1080, 690],
    'ICRA-10': [55, 750, 190, 895],
    'ICRA-701': [215, 760, 305, 895],
    'ICRA-702': [335, 760, 435, 895],
    'ICRA-703': [465, 760, 560, 895],
    'ICRA-50': [580, 775, 740, 890],
    'ICRA-59': [755, 775, 920, 890],
    'ICRA-60': [925, 775, 1085, 890],
    'ICRA-50-WLC': [90, 975, 180, 1080],
    'ICRA-50-90': [205, 975, 310, 1080],
    'ICRA-50-180': [330, 975, 440, 1080],
    'ICRA-50-EC': [475, 975, 550, 1080],
    'ICRA-60-WLC': [80, 1170, 185, 1260],
    'ICRA-60-90': [210, 1170, 310, 1260],
    'ICRA-60-180': [325, 1170, 440, 1260],
    'ICRA-60-EC': [470, 1170, 555, 1260],
    'ICRA-PR-11': [750, 1140, 910, 1270],
};

const hydraulicBoxes = {
    'ICFH-100': [760, 1730, 1035, 1915],
    'ICPF-102': [1080, 1730, 1405, 1915],
};

const referenceSizes = {
    railing: { width: 1153, height: 1616 },
    hydraulic: { width: 1482, height: 2078 },
};

function scaledRegion(box, reference, actual) {
    const [left, top, right, bottom] = box;
    const scaledLeft = Math.round(left * actual.width / reference.width);
    const scaledTop = Math.round(top * actual.height / reference.height);
    return {
        left: scaledLeft,
        top: scaledTop,
        width: Math.max(1, Math.round(right * actual.width / reference.width) - scaledLeft),
        height: Math.max(1, Math.round(bottom * actual.height / reference.height) - scaledTop),
    };
}

async function normalizedWebp(buffer) {
    return sharp(buffer)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(640, 480, { fit: 'contain', background: '#ffffff', withoutEnlargement: false })
        .webp({ quality: 88, effort: 5 })
        .toBuffer();
}

async function renderCataloguePages(tempDir) {
    const pdfPath = path.join(tempDir, 'icon-catalogue.pdf');
    await fs.writeFile(pdfPath, await fetchBuffer(PDF_URL));
    const hydraulicPrefix = path.join(tempDir, 'hydraulic');
    const railingPrefix = path.join(tempDir, 'railing');
    await execFileAsync('pdftoppm', ['-f', '2', '-l', '2', '-png', '-r', '300', pdfPath, hydraulicPrefix]);
    await execFileAsync('pdftoppm', ['-f', '15', '-l', '15', '-png', '-r', '300', pdfPath, railingPrefix]);
    const files = await fs.readdir(tempDir);
    return {
        hydraulic: path.join(tempDir, files.find(file => file.startsWith('hydraulic-') && file.endsWith('.png'))),
        railing: path.join(tempDir, files.find(file => file.startsWith('railing-') && file.endsWith('.png'))),
    };
}

async function catalogueCrop(pagePath, box, reference) {
    const page = sharp(pagePath);
    const metadata = await page.metadata();
    const region = scaledRegion(box, reference, { width: metadata.width, height: metadata.height });
    return normalizedWebp(await page.extract(region).toBuffer());
}

async function mapConcurrent(values, concurrency, mapper) {
    const output = new Array(values.length);
    let next = 0;
    async function worker() {
        while (next < values.length) {
            const index = next;
            next += 1;
            output[index] = await mapper(values[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
    return output;
}

async function ensureBucket() {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw new Error(`Bucket listing failed: ${error.message}`);
    if (data.some(bucket => bucket.name === BUCKET)) return;
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        allowedMimeTypes: ['image/webp'],
        fileSizeLimit: 2 * 1024 * 1024,
    });
    if (createError) throw new Error(`Bucket creation failed: ${createError.message}`);
}

async function main() {
    const { data: items, error } = await supabase
        .from('items')
        .select('id, model, name, image_url')
        .eq('category', 'hardware')
        .eq('make', 'Icon')
        .order('model');
    if (error) throw new Error(`Icon inventory query failed: ${error.message}`);
    if (!items || items.length !== 335) throw new Error(`Expected 335 Icon products, found ${items?.length || 0}.`);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'icon-catalogue-images-'));
    try {
        const [renderedPages, websiteImages] = await Promise.all([
            renderCataloguePages(tempDir),
            readWebsiteImageMap(),
        ]);
        if (websiteImages.size < 300) throw new Error(`Only ${websiteImages.size} current website product images were found.`);
        const prepared = await mapConcurrent(items, 8, async item => {
            let image;
            let source;
            if (railingBoxes[item.model]) {
                source = 'Icon Catalogue 2020, railing accessories page';
                image = await catalogueCrop(renderedPages.railing, railingBoxes[item.model], referenceSizes.railing);
            } else if (hydraulicBoxes[item.model]) {
                source = 'Icon Catalogue 2020, hydraulic patch page';
                image = await catalogueCrop(renderedPages.hydraulic, hydraulicBoxes[item.model], referenceSizes.hydraulic);
            } else {
                const sourceUrl = item.model === 'ICASD-1'
                    ? `${ORIGIN}/media/ad1ffe4e-2a53-4803-b287-5574046074d8/zZxYDQ/Products/Automatic%20Sliding%20Sensor%20Door/01.jpg`
                    : websiteImages.get(item.model) || item.image_url;
                if (!sourceUrl) throw new Error(`No official image source was found for ${item.model}.`);
                if (sourceUrl.includes('media(MediaArchive:')) throw new Error(`Only a malformed official image source was found for ${item.model}.`);
                source = sourceUrl;
                image = await normalizedWebp(await fetchBuffer(sourceUrl));
            }
            if (image.length < 1000 || image.length > 2 * 1024 * 1024) {
                throw new Error(`Generated image for ${item.model} has unexpected size ${image.length}.`);
            }
            return { ...item, image, source, objectPath: `${OBJECT_PREFIX}/${item.model.replace(/[^A-Za-z0-9._-]+/g, '_')}.webp` };
        });

        console.log(JSON.stringify({
            mode: APPLY ? 'apply' : 'dry-run',
            products: prepared.length,
            websiteImages: prepared.filter(item => item.source.startsWith('http')).length,
            pdfCatalogueImages: prepared.filter(item => !item.source.startsWith('http')).length,
            totalOptimizedBytes: prepared.reduce((sum, item) => sum + item.image.length, 0),
            minImageBytes: Math.min(...prepared.map(item => item.image.length)),
            maxImageBytes: Math.max(...prepared.map(item => item.image.length)),
        }, null, 2));
        if (!APPLY) return;

        await fs.mkdir(BACKUP_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `icon-hardware-images-before-sync-${timestamp}.json`);
        await fs.writeFile(backupPath, JSON.stringify({
            exportedAt: new Date().toISOString(),
            items: items.map(item => ({ id: item.id, model: item.model, image_url: item.image_url })),
        }, null, 2));

        await ensureBucket();
        await mapConcurrent(prepared, 6, async item => {
            await withRetry(`Upload for ${item.model}`, async () => {
                const { error: uploadError } = await supabase.storage
                    .from(BUCKET)
                    .upload(item.objectPath, item.image, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
                if (uploadError) throw new Error(uploadError.message);
            });
        });

        await mapConcurrent(prepared, 8, async item => {
            const { data } = supabase.storage.from(BUCKET).getPublicUrl(item.objectPath);
            const { error: updateError } = await supabase.from('items').update({ image_url: data.publicUrl }).eq('id', item.id);
            if (updateError) throw new Error(`Inventory update failed for ${item.model}: ${updateError.message}`);
        });

        const { data: verify, error: verifyError } = await supabase
            .from('items')
            .select('model, image_url')
            .eq('category', 'hardware')
            .eq('make', 'Icon');
        if (verifyError) throw new Error(`Image verification query failed: ${verifyError.message}`);
        const missing = (verify || []).filter(item => !item.image_url || !item.image_url.includes(`/storage/v1/object/public/${BUCKET}/${OBJECT_PREFIX}/`));
        if ((verify || []).length !== 335 || missing.length > 0) {
            throw new Error(`Post-sync verification failed: ${verify?.length || 0} rows, ${missing.length} invalid image URLs.`);
        }
        console.log(JSON.stringify({ applied: true, verifiedImages: verify.length, backupPath }, null, 2));
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
