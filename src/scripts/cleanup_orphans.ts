import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanup() {
    console.log('Cleaning up orphan stock batches...');

    // Get all invoice IDs
    const { data: invoices, error: invError } = await supabase.from('invoices').select('id');
    if (invError) throw invError;
    const invoiceIds = new Set(invoices.map(i => i.id));

    // Get all batches
    const { data: batches, error: batchError } = await supabase.from('stock_batches').select('id, invoice_id');
    if (batchError) throw batchError;

    // Find orphans
    const orphans = batches.filter(b => b.invoice_id && !invoiceIds.has(b.invoice_id));
    console.log(`Found ${orphans.length} orphan batches.`);

    if (orphans.length > 0) {
        const orphanIds = orphans.map(b => b.id);
        const { error: delError } = await supabase.from('stock_batches').delete().in('id', orphanIds);
        if (delError) console.error('Error deleting orphans:', delError);
        else console.log('Deleted orphan batches.');
    } else {
        console.log('No orphans found.');
    }
}

cleanup();
