import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ORIGIN = 'https://iconmetal.co.in';
const BACKUP_DIR = '/Users/mandeepsingh/Desktop/arjun_glass_house_backups';
const APPLY = process.argv.includes('--apply');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const decodeHtml = value => value
    .replace(/&nbsp;|&#160;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&deg;|&#176;/g, ' deg')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const plainText = value => decodeHtml(value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCode = value => decodeHtml(value)
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s+/g, ' ')
    .replace(/[.:;,]+$/g, '')
    .trim()
    .toUpperCase();

const categoryName = html => plainText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Icon Hardware');

function parseProducts(html, sourcePath) {
    const category = categoryName(html);
    const products = [];
    for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const row = match[1];
        const marker = row.search(/Product Code/i);
        if (marker < 0) continue;

        let tail = row.slice(marker).replace(/^Product Code/i, '');
        tail = tail.replace(/^(?:\s|:|&nbsp;|&#160;|\u00a0|<[^>]+>)*/gi, '');
        const firstText = tail.match(/^([^<]+)/)?.[1];
        if (!firstText) continue;
        const code = normalizeCode(firstText);
        if (!code || code.length > 80) continue;

        const afterCode = plainText(tail.slice(firstText.length))
            .replace(/\bFull Product Details\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const conciseName = (afterCode.split(/\bSpecification\b/i)[0] || '')
            .replace(/^[-: ]+|[-: ]+$/g, '')
            .trim();
        const productName = conciseName || category;
        const imagePath = [...row.matchAll(/href="([^"]+)"[^>]*data-lightbox/gi)]
            .map(image => decodeHtml(image[1]))[0];

        products.push({
            code,
            name: productName.slice(0, 240),
            category,
            sourcePath,
            imageUrl: imagePath ? new URL(imagePath, ORIGIN).href : null,
        });
    }
    return products;
}

const fittingRoles = new Map([
    ['ICFH-84', 'floor_spring'],
    ['ICPF-2', 'top_patch'],
    ['ICPF-3', 'bottom_patch'],
    ['ICPF-4', 'overpanel_patch'],
    ['ICPF-1', 'l_bracket_big'],
    ['ICPF-610', 'l_bracket_small'],
    ['ICGC-4', 'l_connector'],
    ['ICGC-5', 'glass_to_glass_connector'],
    ['ICPL-1', 'door_lock'],
    ['ICSL-LK-W', 'sliding_lock'],
    ['ICSH-1', 'wall_hinge'],
    ['ICSH-2', 'glass_hinge'],
    ['ICGH-01-S/PSS', 'handle'],
    ['ICSL-A1', 'sliding_kit'],
    ['ICRA-U25', 'base_channel'],
    ['ICSP-2', 'connector'],
    ['ICSH-5', 'clamp'],
    ['ICRA-1', 'spigot'],
]);

const preparationByRole = {
    top_patch: [0, 1],
    bottom_patch: [0, 1],
    overpanel_patch: [0, 1],
    floor_spring: [0, 0],
    wall_hinge: [2, 1],
    glass_hinge: [2, 1],
    door_lock: [1, 1],
    sliding_lock: [1, 0],
    l_connector: [1, 0],
    glass_to_glass_connector: [0, 0],
    l_bracket_small: [0, 0],
    l_bracket_big: [0, 0],
    base_channel: [0, 0],
    connector: [0, 0],
    clamp: [0, 0],
    spigot: [0, 0],
    handle: [2, 0],
    sliding_kit: [2, 0],
};

const supplementalProducts = [
    {
        code: 'ICFH-100',
        name: 'Hydraulic Floor Hinge',
        category: 'Hydraulic Patch',
        sourcePath: '/Products/Hydraulic-Patch',
        imageUrl: null,
    },
    {
        code: 'ICPF-102',
        name: 'Hydraulic Top Patch',
        category: 'Hydraulic Patch',
        sourcePath: '/Products/Hydraulic-Patch',
        imageUrl: null,
    },
    ...[
        ['ICRA-1', 'Floor to Glass Holder'],
        ['ICRA-1A', 'Floor to Glass Holder'],
        ['ICRA-2', 'Floor to Glass Holder'],
        ['ICRA-2A', 'Floor to Glass Holder'],
        ['ICRA-25', 'Floor to Glass Holder (Small)'],
        ['ICRA-3', 'Floor to Glass Holder'],
        ['ICRA-4', 'Wall to Track Glass Connector'],
        ['ICRA-5', 'Wall to Handrail Connector'],
        ['ICRA-6', 'Glass to Handrail Connector'],
        ['ICRA-7', 'Glass Connector for Baluster with Flat Back'],
        ['ICRA-8', 'Glass Connector for Baluster with Round Back'],
        ['ICRA-9', 'Wall to Glass Holder'],
        ['ICRA-9A', 'Wall to Glass Holder'],
        ['ICRA-9S', 'Adjustable Round Railing Connector'],
        ['ICRA-10', 'Adjustable Wall to Glass Holder'],
        ['ICRA-701', 'Floor to Glass Holder'],
        ['ICRA-702', 'Floor to Glass Holder'],
        ['ICRA-703', 'Floor to Glass Holder'],
        ['ICRA-50', 'Round Slotted Tube'],
        ['ICRA-59', 'Oval Slotted Tube'],
        ['ICRA-60', 'Square Slotted Tube'],
        ['ICRA-50-WLC', 'Round Wall to Tube Connector'],
        ['ICRA-50-90', 'Round 90 deg Tube to Tube Joiner'],
        ['ICRA-50-180', 'Round 180 deg Tube to Tube Joiner'],
        ['ICRA-50-EC', 'Round End Cap'],
        ['ICRA-60-WLC', 'Square Wall to Tube Connector'],
        ['ICRA-60-90', 'Square 90 deg Tube to Tube Joiner'],
        ['ICRA-60-180', 'Square 180 deg Tube to Tube Joiner'],
        ['ICRA-60-EC', 'Square End Cap'],
        ['ICRA-PR-11', 'Glass Wedge System'],
    ].map(([code, name]) => ({
        code,
        name,
        category: 'Railing Accessories',
        sourcePath: '/Products/ICON-CATALOGUE-2020',
        imageUrl: null,
    })),
];

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function withRetry(label, operation, attempts = 4) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await sleep(750 * attempt);
        }
    }
    throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fetchText(url) {
    return withRetry(`Icon catalogue request for ${url}`, async () => {
        const response = await fetch(url, { headers: { 'user-agent': 'ArjunGlassHouse-CatalogueSync/1.0' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
    });
}

async function readOfficialCatalogue() {
    const home = await fetchText(ORIGIN);
    const categoryPaths = [...new Set([...home.matchAll(/href="(\/Products\/[^"]+)"/gi)].map(match => match[1]))];
    const products = [];
    for (const sourcePath of categoryPaths) {
        const html = await fetchText(new URL(sourcePath, ORIGIN));
        products.push(...parseProducts(html, sourcePath));
    }
    products.push(...supplementalProducts);

    const unique = new Map();
    for (const product of products) {
        const key = product.code.replace(/[^A-Z0-9]/g, '');
        if (!unique.has(key)) unique.set(key, product);
    }
    return { categoryPaths, products: [...unique.values()] };
}

function toDatabaseItem(product) {
    const fittingRole = fittingRoles.get(product.code);
    const [holesRequired, cutsRequired] = preparationByRole[fittingRole] || [0, 0];
    const isLock = /lock/i.test(product.category) || /\block\b/i.test(product.name);
    return {
        id: crypto.randomUUID(),
        name: `Icon ${product.name} (${product.code})`,
        category: 'hardware',
        type: product.category,
        product_group: product.category,
        show_online: false,
        image_url: product.imageUrl,
        make: 'Icon',
        model: product.code,
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 0,
        rate: 0,
        rate_unit: 'nos',
        purchase_rate: 0,
        purchase_rate_unit: 'nos',
        hsn_code: isLock ? '83014090' : '83024110',
        conversion_factor: 0,
        fitting_role: fittingRole || null,
        holes_required: holesRequired,
        cuts_required: cutsRequired,
    };
}

async function upsertBatches(table, rows, batchSize = 100) {
    for (let start = 0; start < rows.length; start += batchSize) {
        await withRetry(`${table} upsert at row ${start}`, async () => {
            const { error } = await supabase.from(table).upsert(rows.slice(start, start + batchSize));
            if (error) throw new Error(error.message);
        });
    }
}

async function readExistingHardware() {
    return withRetry('Existing hardware query', async () => {
        const { data, error } = await supabase.from('items').select('*').eq('category', 'hardware');
        if (error) throw new Error(error.message);
        return data || [];
    });
}

async function readStockBatches(itemIds) {
    if (itemIds.length === 0) return [];
    const rows = [];
    for (let start = 0; start < itemIds.length; start += 25) {
        const batch = await withRetry(`Hardware stock batch query at item ${start}`, async () => {
            const { data, error } = await supabase
                .from('stock_batches')
                .select('*')
                .in('item_id', itemIds.slice(start, start + 25));
            if (error) throw new Error(error.message);
            return data || [];
        });
        rows.push(...batch);
    }
    return rows;
}

async function deleteHardware() {
    await withRetry('Hardware deletion', async () => {
        const { error } = await supabase.from('items').delete().eq('category', 'hardware');
        if (error) throw new Error(error.message);
    });
}

async function main() {
    const { categoryPaths, products } = await readOfficialCatalogue();
    const importedItems = products.map(toDatabaseItem);
    const importedCodes = new Set(importedItems.map(item => item.model));
    const requiredCodes = [...fittingRoles.keys()];
    const missingRoles = requiredCodes.filter(code => !importedCodes.has(code));
    if (categoryPaths.length < 20 || importedItems.length < 280 || missingRoles.length > 0) {
        throw new Error(`Catalogue validation failed: ${categoryPaths.length} categories, ${importedItems.length} products, missing role codes: ${missingRoles.join(', ') || 'none'}`);
    }
    if (importedItems.some(item => item.stock !== 0 || item.rate !== 0 || item.purchase_rate !== 0)) {
        throw new Error('Zero-stock/zero-price invariant failed.');
    }

    const oldHardware = await readExistingHardware();
    const oldIds = oldHardware.map(item => item.id);
    const oldBatches = await readStockBatches(oldIds);

    const report = {
        mode: APPLY ? 'apply' : 'dry-run',
        officialSource: ORIGIN,
        categories: categoryPaths.length,
        products: importedItems.length,
        fittingRoles: importedItems.filter(item => item.fitting_role).map(item => ({
            code: item.model,
            role: item.fitting_role,
            name: item.name,
        })),
        replacingHardwareRows: oldHardware.length,
        replacingStockBatches: oldBatches.length,
        zeroStock: importedItems.every(item => item.stock === 0),
        zeroPrice: importedItems.every(item => item.rate === 0 && item.purchase_rate === 0),
    };
    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) return;

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `hardware-replacement-${timestamp}.json`);
    await fs.writeFile(backupPath, JSON.stringify({
        exportedAt: new Date().toISOString(),
        source: ORIGIN,
        oldHardware,
        oldStockBatches: oldBatches,
        importedItems,
    }, null, 2));

    try {
        await deleteHardware();
        await upsertBatches('items', importedItems);
    } catch (error) {
        await deleteHardware();
        await upsertBatches('items', oldHardware);
        await upsertBatches('stock_batches', oldBatches);
        throw new Error(`Replacement failed and the previous hardware was restored: ${error instanceof Error ? error.message : String(error)}`);
    }

    const verify = await withRetry('Imported hardware verification', async () => {
        const { data, error } = await supabase
            .from('items')
            .select('id, make, model, stock, rate, purchase_rate, fitting_role')
            .eq('category', 'hardware');
        if (error) throw new Error(error.message);
        return data || [];
    });
    if ((verify || []).length !== importedItems.length || (verify || []).some(item => (
        item.make !== 'Icon' || Number(item.stock) !== 0 || Number(item.rate) !== 0 || Number(item.purchase_rate) !== 0
    ))) {
        throw new Error('Post-import verification failed. Use the generated backup to restore the prior catalogue.');
    }

    console.log(JSON.stringify({ applied: true, backupPath, verifiedHardwareRows: verify.length }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
