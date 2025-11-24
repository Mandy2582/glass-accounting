// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ITEM_ID = 'adc2ab03-4eda-4f85-80b4-c400b7f449c6'; // Plain Glass 8 * 6

async function testDeletion() {
    console.log('=== BEFORE DELETION ===');

    // Check batches
    const { data: batchesBefore } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', ITEM_ID)
        .order('date', { ascending: true });

    console.log('\nStock Batches:');
    console.table(batchesBefore.map(b => ({
        date: b.date,
        rate: b.rate,
        original_qty: b.quantity,
        remaining_qty: b.remaining_quantity
    })));

    // Check if there's a sale to delete
    const { data: sales } = await supabase
        .from('invoices')
        .select('id, number, date')
        .eq('type', 'sale')
        .order('created_at', { ascending: false })
        .limit(1);

    if (sales && sales.length > 0) {
        console.log(`\nFound sale: ${sales[0].number} (${sales[0].id})`);
        console.log('\nTo test deletion, please delete this invoice from the UI.');
        console.log('Then run this script again to see if batches are restored.');
    } else {
        console.log('\nNo sales found to test deletion.');
    }
}

testDeletion();
