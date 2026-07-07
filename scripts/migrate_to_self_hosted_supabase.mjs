import { createClient } from '@supabase/supabase-js';

const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SUPABASE_ANON_KEY;
const targetUrl = process.env.TARGET_SUPABASE_URL || 'http://127.0.0.1:8000';
const targetKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY;

if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
  throw new Error('Set SOURCE_SUPABASE_URL, SOURCE_SUPABASE_ANON_KEY, TARGET_SUPABASE_URL, and TARGET_SUPABASE_SERVICE_ROLE_KEY.');
}

const source = createClient(sourceUrl, sourceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const target = createClient(targetUrl, targetKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  'items',
  'parties',
  'invoices',
  'invoice_items',
  'stock_batches',
  'vouchers',
  'bank_accounts',
  'orders',
  'employees',
  'attendance',
  'payroll',
  'settings',
  'thickness_pricing',
  'custom_designs',
];

const deleteOrder = [
  'attendance',
  'payroll',
  'stock_batches',
  'invoice_items',
  'vouchers',
  'orders',
  'custom_designs',
  'invoices',
  'items',
  'parties',
  'employees',
  'bank_accounts',
  'settings',
  'thickness_pricing',
];

async function fetchAll(table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await source
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) {
      if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message || '')) {
        console.log(`skip source ${table}: table not found`);
        return [];
      }
      throw new Error(`Fetch ${table} failed: ${error.message}`);
    }

    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function clearTable(table) {
  const { error } = await target
    .from(table)
    .delete()
    .neq('id', '__never__');

  if (error) {
    if (error.code === '22P02') {
      const { error: textError } = await target
        .from(table)
        .delete()
        .not('id', 'is', null);
      if (!textError) return;
      throw new Error(`Clear ${table} failed: ${textError.message}`);
    }
    throw new Error(`Clear ${table} failed: ${error.message}`);
  }
}

async function insertRows(table, rows) {
  if (!rows.length) return;
  const chunkSize = 250;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await target.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`Import ${table} failed: ${error.message}`);
  }
}

const exported = new Map();
for (const table of tables) {
  const rows = await fetchAll(table);
  exported.set(table, rows);
  console.log(`export ${table}: ${rows.length}`);
}

for (const table of deleteOrder) {
  await clearTable(table);
  console.log(`clear ${table}`);
}

for (const table of tables) {
  const rows = exported.get(table) || [];
  await insertRows(table, rows);
  console.log(`import ${table}: ${rows.length}`);
}

console.log('migration complete');
