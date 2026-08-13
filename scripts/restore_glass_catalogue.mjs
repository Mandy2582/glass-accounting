import crypto from 'node:crypto';

const brands = ['Saint Gobain', 'Gold Plus', 'Asahi'];

const sheetSizes = [
    [48, 72],
    [48, 96],
    [60, 96],
    [72, 96],
    [72, 120],
    [96, 144],
];

const productFamilies = [
    { label: 'Clear Float', group: 'Clear Float', thicknesses: [4, 5, 6, 8, 10, 12], hsn: '70052990' },
    { label: 'Toughened Clear', group: 'Toughened', thicknesses: [4, 5, 6, 8, 10, 12, 15, 19], hsn: '70071900' },
    { label: 'Tinted Bronze', group: 'Tinted', thicknesses: [4, 5, 6, 8, 10, 12], hsn: '70052190' },
    { label: 'Tinted Grey', group: 'Tinted', thicknesses: [4, 5, 6, 8, 10, 12], hsn: '70052190' },
    { label: 'Tinted Green', group: 'Tinted', thicknesses: [4, 5, 6, 8, 10, 12], hsn: '70052190' },
    { label: 'Reflective Blue', group: 'Reflective', thicknesses: [5, 6, 8, 10], hsn: '70052110' },
    { label: 'Reflective Green', group: 'Reflective', thicknesses: [5, 6, 8, 10], hsn: '70052110' },
    { label: 'Frosted', group: 'Frosted', thicknesses: [5, 6, 8, 10], hsn: '70071900' },
];

const feet = inches => Number(inches) / 12;
const sizeLabel = (width, height) => `${feet(width)}x${feet(height)}ft`;

export function buildRestoredGlassCatalogue() {
    const items = [];
    for (const make of brands) {
        for (const family of productFamilies) {
            for (const thickness of family.thicknesses) {
                for (const [width, height] of sheetSizes) {
                    items.push({
                        id: crypto.randomUUID(),
                        name: `${make} ${family.label} Glass ${thickness}mm ${sizeLabel(width, height)}`,
                        category: 'glass',
                        type: `${family.label} Glass`,
                        product_group: family.group,
                        show_online: false,
                        make,
                        model: '',
                        thickness,
                        width,
                        height,
                        unit: 'sheets',
                        stock: 0,
                        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
                        min_stock: 0,
                        rate: 0,
                        rate_unit: 'sqft',
                        purchase_rate: 0,
                        purchase_rate_unit: 'sqft',
                        hsn_code: family.hsn,
                        conversion_factor: 1,
                    });
                }
            }
        }
    }
    return items;
}

const sqlLiteral = value => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
    return `'${String(value).replaceAll("'", "''")}'`;
};

function asSql(items) {
    const columns = [
        'id', 'name', 'category', 'type', 'product_group', 'show_online', 'make', 'model',
        'thickness', 'width', 'height', 'unit', 'stock', 'warehouse_stock', 'min_stock',
        'rate', 'rate_unit', 'purchase_rate', 'purchase_rate_unit', 'hsn_code', 'conversion_factor',
    ];
    const rows = items.map(item => `(${columns.map(column => sqlLiteral(item[column])).join(', ')})`);
    return [
        'BEGIN;',
        'CREATE TEMP TABLE restored_glass_items (LIKE public.items INCLUDING DEFAULTS) ON COMMIT DROP;',
        `INSERT INTO restored_glass_items (${columns.join(', ')}) VALUES`,
        `${rows.join(',\n')};`,
        'INSERT INTO public.items (' + columns.join(', ') + ')',
        'SELECT ' + columns.map(column => `source.${column}`).join(', ') + ' FROM restored_glass_items source',
        'WHERE NOT EXISTS (',
        '  SELECT 1 FROM public.items existing WHERE lower(trim(existing.name)) = lower(trim(source.name))',
        ');',
        "SELECT category, count(*) AS item_count, count(*) FILTER (WHERE rate > 0) AS priced, count(*) FILTER (WHERE stock > 0) AS stocked FROM public.items GROUP BY category ORDER BY category;",
        'COMMIT;',
    ].join('\n');
}

const catalogue = buildRestoredGlassCatalogue();
if (catalogue.length !== 792) {
    throw new Error(`Expected 792 restored rows, generated ${catalogue.length}.`);
}

if (process.argv.includes('--sql')) {
    process.stdout.write(asSql(catalogue));
} else {
    console.log(`Prepared ${catalogue.length} deterministic glass catalogue rows.`);
    console.log(`${brands.length} brands x ${sheetSizes.length} standard sheet sizes x 44 product/thickness variants.`);
    console.log('Use --sql to emit an idempotent PostgreSQL restore transaction.');
}
