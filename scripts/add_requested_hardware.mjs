import crypto from 'node:crypto';

const products = [
    {
        name: 'Ozone Floor Spring',
        type: 'Floor Spring',
        productGroup: 'Floor Spring',
        make: 'Ozone',
        model: '',
        fittingRole: 'floor_spring',
        holesRequired: 0,
        cutsRequired: 0,
        imageUrl: '/shop-products/photos/hardware-floor-springs.png',
    },
    {
        name: 'Needo Top Patch',
        type: 'Patch Fitting',
        productGroup: 'Patch Fitting',
        make: 'Needo',
        model: '',
        fittingRole: 'top_patch',
        holesRequired: 1,
        cutsRequired: 1,
        imageUrl: '/shop-products/photos/hardware-patch-fittings.png',
    },
    {
        name: 'Needo Bottom Patch',
        type: 'Patch Fitting',
        productGroup: 'Patch Fitting',
        make: 'Needo',
        model: '',
        fittingRole: 'bottom_patch',
        holesRequired: 1,
        cutsRequired: 1,
        imageUrl: '/shop-products/photos/hardware-patch-fittings.png',
    },
    {
        name: 'Trudoor Glass Door Handle',
        type: 'Glass Door Handle',
        productGroup: 'Glass Door Handles',
        make: 'Trudoor',
        model: '',
        fittingRole: 'handle',
        holesRequired: 2,
        cutsRequired: 0,
        imageUrl: '/shop-products/photos/hardware-handles.png',
    },
];

const sqlLiteral = value => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
    return `'${String(value).replaceAll("'", "''")}'`;
};

const rows = products.map(product => ({
    id: crypto.randomUUID(),
    name: product.name,
    category: 'hardware',
    type: product.type,
    product_group: product.productGroup,
    show_online: false,
    image_url: product.imageUrl,
    make: product.make,
    model: product.model,
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
    hsn_code: '83024110',
    conversion_factor: 0,
    fitting_role: product.fittingRole,
    holes_required: product.holesRequired,
    cuts_required: product.cutsRequired,
}));

const columns = Object.keys(rows[0]);
const values = rows.map(row => `(${columns.map(column => sqlLiteral(row[column])).join(', ')})`);
const sql = [
    'begin;',
    'create temporary table requested_hardware (like public.items including defaults) on commit drop;',
    `insert into requested_hardware (${columns.join(', ')}) values`,
    `${values.join(',\n')};`,
    `insert into public.items (${columns.join(', ')})`,
    `select ${columns.map(column => `source.${column}`).join(', ')} from requested_hardware source`,
    'where not exists (',
    '  select 1 from public.items existing',
    "  where lower(trim(existing.make)) = lower(trim(source.make))",
    "    and lower(trim(existing.name)) = lower(trim(source.name))",
    ');',
    "select name, make, fitting_role, stock, rate from public.items where lower(make) in ('ozone', 'needo', 'trudoor') order by make, name;",
    'commit;',
].join('\n');

if (process.argv.includes('--sql')) {
    process.stdout.write(sql);
} else {
    console.log(`Prepared ${products.length} requested hardware products.`);
    console.log('Run with --sql to emit an idempotent PostgreSQL import.');
}
