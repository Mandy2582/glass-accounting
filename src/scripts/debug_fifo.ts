import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ITEM_ID = 'adc2ab03-4eda-4f85-80b4-c400b7f449c6'; // Plain Glass 8 * 6

async function debugFIFO() {
    console.log(`Debugging FIFO for Item: ${ITEM_ID}`);

    // 1. Fetch Batches
    const { data: batches, error: batchError } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', ITEM_ID)
        .order('date', { ascending: true });

    if (batchError) throw batchError;

    console.log('\n--- Current Stock Batches (Oldest First) ---');
    console.table(batches?.map(b => ({
        id: b.id,
        date: b.date,
        rate: b.rate,
        qty: b.quantity,
        remaining: b.remaining_quantity,
        used: b.quantity - b.remaining_quantity
    })));

    // 2. Simulate Sale (Consumption)
    const SALE_QTY = 10;
    console.log(`\n--- Simulating Sale of ${SALE_QTY} units ---`);
    let qtyToDeduct = SALE_QTY;
    let totalCost = 0;
    const consumptionLog = [];

    // Clone batches for simulation
    const simBatches = JSON.parse(JSON.stringify(batches));

    for (const batch of simBatches) {
        if (qtyToDeduct <= 0) break;
        if (batch.remaining_quantity <= 0) continue;

        const take = Math.min(batch.remaining_quantity, qtyToDeduct);
        const cost = take * batch.rate;
        totalCost += cost;

        consumptionLog.push({
            batchId: batch.id,
            date: batch.date,
            rate: batch.rate,
            taken: take,
            cost: cost
        });

        batch.remaining_quantity -= take;
        qtyToDeduct -= take;
    }

    console.table(consumptionLog);
    console.log(`Total Cost for ${SALE_QTY} units: ${totalCost}`);
    console.log(`Average Cost per unit: ${totalCost / SALE_QTY}`);

    // 3. Simulate Restore (Deletion of Sale)
    console.log(`\n--- Simulating Restore of ${SALE_QTY} units ---`);
    let qtyToRestore = SALE_QTY;
    const restoreLog = [];

    // Use the *modified* simBatches as starting point? 
    // No, we want to simulate restoring to the *current* DB state (assuming we just made a sale).
    // But to test if logic is correct, we should probably simulate restoring to the state *after* the simulated sale.

    // Let's simulate restoring to the *current* DB state first, to see where it would go.
    // If the DB state has "holes", it should fill them.

    const restoreBatches = JSON.parse(JSON.stringify(batches)); // Start with current DB state

    for (const batch of restoreBatches) {
        if (qtyToRestore <= 0) break;

        const space = batch.quantity - batch.remaining_quantity;
        if (space > 0) {
            const add = Math.min(space, qtyToRestore);

            restoreLog.push({
                batchId: batch.id,
                date: batch.date,
                rate: batch.rate,
                spaceBefore: space,
                added: add,
                remainingAfter: batch.remaining_quantity + add
            });

            batch.remaining_quantity += add;
            qtyToRestore -= add;
        }
    }

    console.table(restoreLog);
    if (qtyToRestore > 0) {
        console.log(`WARNING: Could not restore ${qtyToRestore} units! No space in batches.`);
    } else {
        console.log('Successfully restored all units.');
    }
}

debugFIFO();
