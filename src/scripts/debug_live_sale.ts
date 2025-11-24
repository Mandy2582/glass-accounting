import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugLiveSale() {
    console.log('Searching for recent sales...');

    // Find invoices with total = 12000 (from user screenshot)
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('type', 'sale')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching invoices:', error);
        return;
    }

    console.log(`Found ${invoices.length} invoices with total 12000.`);

    for (const inv of invoices) {
        console.log(`\nInvoice: ${inv.number} (${inv.type}) Date: ${inv.date} ID: ${inv.id}`);

        const { data: items, error: itemsError } = await supabase
            .from('invoice_items')
            .select('*')
            .eq('invoice_id', inv.id);

        if (itemsError) {
            console.error('Error fetching items:', itemsError);
            continue;
        }

        console.table(items.map(i => ({
            id: i.id,
            item_id: i.item_id,
            item_name: i.item_name,
            qty: i.quantity,
            rate: i.rate,
            cost_amount: i.cost_amount,
            // Check if cost_amount is actually null or 0
            is_cost_null: i.cost_amount === null,
            is_cost_undefined: i.cost_amount === undefined
        })));
    }
}

debugLiveSale();
