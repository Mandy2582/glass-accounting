// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkItemStock() {
    const { data: items } = await supabase
        .from('items')
        .select('*')
        .eq('name', 'Plain Glass 8 * 6');

    if (items && items.length > 0) {
        const item = items[0];
        console.log('\nItem Stock Information:');
        console.log('Name:', item.name);
        console.log('Total Stock:', item.stock);
        console.log('Warehouse Stock:', item.warehouse_stock);
        console.log('\n');

        // Check batches
        const { data: batches } = await supabase
            .from('stock_batches')
            .select('*')
            .eq('item_id', item.id)
            .order('date', { ascending: true });

        console.log('Stock Batches:');
        console.table(batches.map(b => ({
            date: b.date,
            rate: b.rate,
            original: b.quantity,
            remaining: b.remaining_quantity
        })));

        const totalInBatches = batches.reduce((sum, b) => sum + b.remaining_quantity, 0);
        console.log(`\nTotal in batches: ${totalInBatches}`);
        console.log(`Item stock field: ${item.stock}`);
        console.log(`Match: ${totalInBatches === item.stock ? 'YES ✅' : 'NO ❌'}`);
    }
}

checkItemStock();
