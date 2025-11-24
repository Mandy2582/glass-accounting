// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSales() {
    const { data: sales } = await supabase
        .from('invoices')
        .select('id, number, date, total')
        .eq('type', 'sale')
        .order('created_at', { ascending: false });

    console.log(`\nFound ${sales.length} ACTIVE sales invoices:\n`);
    console.table(sales);

    if (sales.length > 0) {
        for (const sale of sales) {
            const { data: items } = await supabase
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', sale.id);

            console.log(`\nItems in ${sale.number}:`);
            console.table(items.map(i => ({
                item_name: i.item_name,
                quantity: i.quantity,
                cost_amount: i.cost_amount
            })));
        }
    }

    // Check batches
    const { data: batches } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', 'adc2ab03-4eda-4f85-80b4-c400b7f449c6')
        .order('date', { ascending: true });

    console.log('\nCurrent batch state:');
    console.table(batches.map(b => ({
        date: b.date,
        rate: b.rate,
        original: b.quantity,
        remaining: b.remaining_quantity
    })));
}

checkSales();
