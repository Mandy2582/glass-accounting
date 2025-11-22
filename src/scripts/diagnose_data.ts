import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
    console.log('Checking Invoices...');
    const { data: invoices, error: invError } = await supabase
        .from('invoices')
        .select('*, items:invoice_items(*)')
        .eq('type', 'purchase');

    if (invError) {
        console.error('Error fetching invoices:', invError);
        return;
    }

    if (invoices.length > 0) {
        console.log('Sample Invoice:', JSON.stringify(invoices[0], null, 2));
    }

    console.log(`Found ${invoices.length} purchase invoices.`);

    console.log('Checking Stock Batches...');
    const { data: batches, error: batchError } = await supabase
        .from('stock_batches')
        .select('*');

    if (batchError) {
        console.error('Error fetching batches:', batchError);
        return;
    }

    console.log(`Found ${batches.length} stock batches.`);

    const { count: itemCount, error: itemError } = await supabase
        .from('invoice_items')
        .select('*', { count: 'exact', head: true });

    if (itemError) console.error(itemError);
    console.log(`Found ${itemCount} total invoice items.`);

    if (invoices.length > 0 && batches.length === 0) {
        console.log('MISMATCH DETECTED: Invoices exist but no stock batches found.');
        console.log('This confirms that existing data needs to be migrated.');
    } else {
        console.log('Data seems consistent or both empty.');
    }
}

checkData();
