// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listAllSales() {
    const { data: sales } = await supabase
        .from('invoices')
        .select('*')
        .eq('type', 'sale')
        .order('created_at', { ascending: false });

    console.log(`\nTotal sales: ${sales.length}\n`);

    for (const sale of sales) {
        console.log(`\n${sale.number} (${sale.date}):`);
        console.log(`  Total: ₹${sale.total}`);

        const { data: items } = await supabase
            .from('invoice_items')
            .select('*')
            .eq('invoice_id', sale.id);

        console.table(items.map(i => ({
            item_name: i.item_name,
            quantity: i.quantity,
            rate: i.rate,
            cost_amount: i.cost_amount
        })));
    }
}

listAllSales();
