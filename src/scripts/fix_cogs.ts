import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ITEM_ID = 'adc2ab03-4eda-4f85-80b4-c400b7f449c6';

async function fixCogs() {
    console.log(`Recalculating stock for item: ${ITEM_ID}`);

    // 1. Get all batches (Oldest First)
    const { data: batches, error: batchError } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', ITEM_ID)
        .order('date', { ascending: true });

    if (batchError) throw batchError;

    console.log('Found batches:', batches.length);
    // Reset remaining_quantity in memory
    const batchState = batches.map(b => ({ ...b, remaining_quantity: b.quantity }));

    // 2. Get all invoice items for this item
    const { data: allItems, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*, invoices(type, date, created_at)')
        .eq('item_id', ITEM_ID);

    if (itemsError) throw itemsError;

    // Filter for sales and sort in JS
    const salesItems = allItems
        .filter(i => i.invoices && i.invoices.type === 'sale')
        .sort((a, b) => {
            const dateA = a.invoices.date;
            const dateB = b.invoices.date;
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return a.invoices.created_at.localeCompare(b.invoices.created_at);
        });

    console.log('Found sales items:', salesItems.length);

    // 3. Replay consumption
    for (const item of salesItems) {
        console.log(`Processing Sale Item ${item.id}: Qty=${item.quantity}`);
        let qty = item.quantity;
        let cost = 0;

        for (const batch of batchState) {
            if (qty <= 0) break;
            if (batch.remaining_quantity <= 0) continue;

            const take = Math.min(batch.remaining_quantity, qty);
            const batchCost = take * batch.rate;
            cost += batchCost;

            console.log(`  Took ${take} from Batch ${batch.date} (@${batch.rate}) = ${batchCost}`);

            batch.remaining_quantity -= take;
            qty -= take;
        }

        console.log(`  Total Cost for Item: ${cost}`);

        // Update item cost if changed (Self-healing history)
        if (item.cost_amount !== cost) {
            console.log(`  UPDATING DB: ${item.cost_amount} -> ${cost}`);
            await supabase.from('invoice_items').update({ cost_amount: cost }).eq('id', item.id);
        } else {
            console.log(`  Cost matches DB.`);
        }
    }

    // 4. Update batches in DB
    for (const batch of batchState) {
        const original = batches.find(b => b.id === batch.id);
        if (original.remaining_quantity !== batch.remaining_quantity) {
            console.log(`Updating batch ${batch.id}: ${original.remaining_quantity} -> ${batch.remaining_quantity}`);
            await supabase
                .from('stock_batches')
                .update({ remaining_quantity: batch.remaining_quantity })
                .eq('id', batch.id);
        }
    }
}

fixCogs();
