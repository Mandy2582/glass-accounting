// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkState() {
    console.log('=== CURRENT STATE ===\n');

    // Check all batches
    const { data: batches } = await supabase
        .from('stock_batches')
        .select('*')
        .order('date', { ascending: true });

    console.log('All Stock Batches:');
    console.table(batches.map(b => ({
        item_id: b.item_id.substring(0, 8) + '...',
        date: b.date,
        rate: b.rate,
        qty: b.quantity,
        remaining: b.remaining_quantity,
        warehouse: b.warehouse
    })));

    // Check all invoices
    const { data: invoices } = await supabase
        .from('invoices')
        .select('id, number, type, date, total')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('\nRecent Invoices:');
    console.table(invoices);

    // Check invoice items for sales
    const salesInvoices = invoices.filter(i => i.type === 'sale');
    if (salesInvoices.length > 0) {
        console.log('\nSales Invoice Items:');
        for (const inv of salesInvoices) {
            const { data: items } = await supabase
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', inv.id);
            console.log(`\n${inv.number}:`);
            console.table(items.map(i => ({
                item_name: i.item_name,
                qty: i.quantity,
                cost_amount: i.cost_amount
            })));
        }
    }
}

checkState();
