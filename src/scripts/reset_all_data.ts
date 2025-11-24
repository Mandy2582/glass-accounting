// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function resetEverything() {
    console.log('🔄 Resetting all data...\n');

    // 1. Delete all invoices (this will cascade delete invoice_items)
    console.log('Deleting all invoices...');
    const { data: invoices } = await supabase.from('invoices').select('id, number, type');
    if (invoices) {
        for (const inv of invoices) {
            await supabase.from('invoices').delete().eq('id', inv.id);
            console.log(`  ✓ Deleted ${inv.type} invoice: ${inv.number}`);
        }
    }

    // 2. Delete all stock batches
    console.log('\nDeleting all stock batches...');
    const { data: batches } = await supabase.from('stock_batches').select('id');
    if (batches) {
        await supabase.from('stock_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log(`  ✓ Deleted ${batches.length} batches`);
    }

    // 3. Reset all item stocks to 0
    console.log('\nResetting all item stocks to 0...');
    const { data: items } = await supabase.from('items').select('id, name');
    if (items) {
        for (const item of items) {
            await supabase.from('items').update({
                stock: 0,
                warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 }
            }).eq('id', item.id);
            console.log(`  ✓ Reset stock for: ${item.name}`);
        }
    }

    // 4. Reset all party balances to 0
    console.log('\nResetting all party balances to 0...');
    const { data: parties } = await supabase.from('parties').select('id, name');
    if (parties) {
        for (const party of parties) {
            await supabase.from('parties').update({ balance: 0 }).eq('id', party.id);
            console.log(`  ✓ Reset balance for: ${party.name}`);
        }
    }

    console.log('\n✅ Reset complete! You now have a clean slate.');
    console.log('\nYou can now:');
    console.log('1. Create new purchase invoices to add stock');
    console.log('2. Create sales invoices (with stock validation)');
    console.log('3. Test the COGS calculation and deletion features');
}

resetEverything();
