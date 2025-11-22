import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function migrate() {
    console.log('Starting migration...');

    // 1. Get all Items
    const { data: items, error: itemsError } = await supabase.from('items').select('*');
    if (itemsError) throw itemsError;
    console.log(`Fetched ${items.length} items.`);

    // 2. Get all Purchase Invoices
    const { data: invoices, error: invError } = await supabase
        .from('invoices')
        .select('*, items:invoice_items(*)')
        .eq('type', 'purchase')
        .order('date', { ascending: true }); // Oldest first
    if (invError) throw invError;
    console.log(`Fetched ${invoices.length} purchase invoices.`);

    // Map to store batches per item
    const itemBatches: Record<string, any[]> = {};

    // 3. Create Batches in Memory
    for (const invoice of invoices) {
        for (const item of invoice.items) {
            if (!itemBatches[item.item_id]) {
                itemBatches[item.item_id] = [];
            }

            itemBatches[item.item_id].push({
                item_id: item.item_id,
                invoice_id: invoice.id,
                date: invoice.date,
                rate: item.rate,
                quantity: item.quantity,
                remaining_quantity: item.quantity, // Start full
                warehouse: item.warehouse || 'Warehouse A'
            });
        }
    }

    // 4. Process each Item to adjust for Sales (FIFO)
    for (const item of items) {
        const batches = itemBatches[item.id] || [];

        if (batches.length === 0) {
            // No purchases found for this item, skip
            continue;
        }

        const currentStock = item.stock || 0;
        const totalPurchased = batches.reduce((sum, b) => sum + b.quantity, 0);
        let totalSold = totalPurchased - currentStock;

        if (totalSold < 0) {
            console.warn(`Item ${item.name} has more stock (${currentStock}) than purchased (${totalPurchased}). Assuming initial stock or manual adjustment.`);
            totalSold = 0;
            // Ideally we should create a "dummy" opening balance batch here, but let's skip for now.
        }

        console.log(`Item: ${item.name} | Stock: ${currentStock} | Purchased: ${totalPurchased} | Sold: ${totalSold}`);

        // Deduct sold quantity from batches (FIFO - Oldest First)
        // Batches are already sorted by date from the invoice fetch
        for (const batch of batches) {
            if (totalSold <= 0) break;

            const deduct = Math.min(batch.remaining_quantity, totalSold);
            batch.remaining_quantity -= deduct;
            totalSold -= deduct;
        }

        // 5. Calculate Weighted Average Cost
        let totalValue = 0;
        let totalQty = 0;
        for (const batch of batches) {
            if (batch.remaining_quantity > 0) {
                totalValue += batch.remaining_quantity * batch.rate;
                totalQty += batch.remaining_quantity;
            }
        }

        const avgCost = totalQty > 0 ? (totalValue / totalQty) : (item.purchase_rate || 0);

        // 6. Commit Updates to DB

        // Insert Batches
        const { error: insertError } = await supabase.from('stock_batches').insert(batches);
        if (insertError) console.error(`Error inserting batches for ${item.name}:`, insertError);

        // Update Item Avg Cost
        const { error: updateError } = await supabase
            .from('items')
            .update({ purchase_rate: Number(avgCost.toFixed(2)) })
            .eq('id', item.id);
        if (updateError) console.error(`Error updating item ${item.name}:`, updateError);
    }

    console.log('Migration complete.');
}

migrate().catch(console.error);
