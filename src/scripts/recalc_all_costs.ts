import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function recalc() {
    console.log('Recalculating Avg Cost for all items...');

    const { data: items, error: itemsError } = await supabase.from('items').select('id, name');
    if (itemsError) throw itemsError;

    for (const item of items) {
        const { data: batches, error } = await supabase
            .from('stock_batches')
            .select('remaining_quantity, rate')
            .eq('item_id', item.id)
            .gt('remaining_quantity', 0);

        if (error) {
            console.error(`Error fetching batches for ${item.name}:`, error);
            continue;
        }

        let totalValue = 0;
        let totalQty = 0;

        batches?.forEach(b => {
            totalValue += b.remaining_quantity * b.rate;
            totalQty += b.remaining_quantity;
        });

        const avgCost = totalQty > 0 ? (totalValue / totalQty) : 0;
        console.log(`Item: ${item.name} | Batches: ${batches?.length} | New Avg Cost: ${avgCost}`);

        await supabase.from('items').update({ purchase_rate: Number(avgCost.toFixed(2)) }).eq('id', item.id);
    }

    console.log('Recalculation complete.');
}

recalc();
