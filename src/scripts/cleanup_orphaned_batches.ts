// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanupOrphanedBatches() {
    console.log('Checking for orphaned batches...\n');

    // Get all batches
    const { data: allBatches } = await supabase
        .from('stock_batches')
        .select('*');

    console.log(`Total batches: ${allBatches.length}`);

    // Get all invoice IDs
    const { data: allInvoices } = await supabase
        .from('invoices')
        .select('id');

    const invoiceIds = new Set(allInvoices.map(i => i.id));

    // Find orphaned batches
    const orphanedBatches = allBatches.filter(batch => !invoiceIds.has(batch.invoice_id));

    if (orphanedBatches.length > 0) {
        console.log(`\nFound ${orphanedBatches.length} orphaned batches:\n`);
        console.table(orphanedBatches.map(b => ({
            id: b.id.substring(0, 8) + '...',
            date: b.date,
            rate: b.rate,
            qty: b.quantity,
            remaining: b.remaining_quantity
        })));

        console.log('\nDeleting orphaned batches...');
        for (const batch of orphanedBatches) {
            await supabase.from('stock_batches').delete().eq('id', batch.id);
            console.log(`Deleted batch ${batch.id}`);
        }
        console.log('\n✅ Cleanup complete!');
    } else {
        console.log('\n✅ No orphaned batches found.');
    }
}

cleanupOrphanedBatches();
