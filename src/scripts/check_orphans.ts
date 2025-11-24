// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkOrphans() {
    // Check all invoice_items
    const { data: allItems } = await supabase
        .from('invoice_items')
        .select('id, invoice_id, item_name, quantity');

    console.log(`Total invoice_items: ${allItems.length}`);

    // Check which ones have valid invoices
    const { data: allInvoices } = await supabase
        .from('invoices')
        .select('id');

    const invoiceIds = new Set(allInvoices.map(i => i.id));

    const orphans = allItems.filter(item => !invoiceIds.has(item.invoice_id));

    if (orphans.length > 0) {
        console.log(`\nFound ${orphans.length} ORPHANED invoice_items (no parent invoice):`);
        console.table(orphans);

        console.log('\nDeleting orphaned items...');
        for (const orphan of orphans) {
            await supabase.from('invoice_items').delete().eq('id', orphan.id);
            console.log(`Deleted orphan ${orphan.id}`);
        }
    } else {
        console.log('\nNo orphaned items found.');
    }
}

checkOrphans();
