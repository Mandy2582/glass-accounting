import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('Loading invoices, stock batches, and items...');
    const [invoicesRes, batchesRes] = await Promise.all([
        supabase.from('invoices').select('*'),
        supabase.from('stock_batches').select('*')
    ]);

    if (invoicesRes.error || batchesRes.error) {
        console.error('Fetch error:', invoicesRes.error || batchesRes.error);
        return;
    }

    const invoices = invoicesRes.data || [];
    const batches = batchesRes.data || [];

    // Order batches by date ascending (oldest first)
    const sortedBatches = [...batches].sort((a, b) => a.date.localeCompare(b.date));
    const batchState = sortedBatches.map(b => ({ ...b, remaining_quantity: b.quantity }));

    // Extract all unique itemIds from invoices
    const itemIds = Array.from(new Set(invoices.flatMap(inv => (inv.items || []).map(item => item.itemId)).filter(Boolean)));
    
    let items = [];
    if (itemIds.length > 0) {
        const itemsRes = await supabase.from('items').select('*').in('id', itemIds);
        if (itemsRes.error) {
            console.error('Error fetching items catalog:', itemsRes.error);
            return;
        }
        items = itemsRes.data || [];
    }

    // Filter sales and sort by date/created_at ascending
    const sales = invoices
        .filter(i => i.type === 'sale')
        .sort((a, b) => {
            const dateA = a.date;
            const dateB = b.date;
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return a.created_at.localeCompare(b.created_at);
        });

    console.log(`Found ${sales.length} sales invoices, ${batches.length} stock batches, and ${items.length} catalog items.\n`);

    for (const sale of sales) {
        let updated = false;
        const updatedItems = (sale.items || []).map(item => {
            const itemDef = items.find(i => i.id === item.itemId);
            const isGlass = itemDef ? itemDef.category !== 'hardware' : item.unit !== 'nos';

            let qtyToDeduct = Number(item.quantity);
            let totalCost = 0;

            // Consume from batches for this item
            const itemBatches = batchState.filter(b => b.item_id === item.itemId);
            for (const batch of itemBatches) {
                if (qtyToDeduct <= 0) break;
                if (batch.remaining_quantity <= 0) continue;

                const take = Math.min(batch.remaining_quantity, qtyToDeduct);
                
                let takeCost = 0;
                if (isGlass) {
                    let takeSqft = 0;
                    if (item.unit === 'sheets') {
                        takeSqft = take * (item.width * item.height) / 144;
                    } else {
                        takeSqft = take;
                    }
                    takeCost = takeSqft * (batch.rate / 1.18);
                } else {
                    takeCost = take * (batch.rate / 1.18);
                }

                totalCost += takeCost;
                batch.remaining_quantity -= take;
                qtyToDeduct -= take;
            }

            // Fallback for remaining quantity if stock was insufficient
            if (qtyToDeduct > 0) {
                const fallbackPrice = itemDef ? (itemDef.purchase_rate || 0) : 0;
                let fallbackCost = 0;
                if (isGlass) {
                    let fallbackSqft = 0;
                    if (item.unit === 'sheets') {
                        fallbackSqft = qtyToDeduct * (item.width * item.height) / 144;
                    } else {
                        fallbackSqft = qtyToDeduct;
                    }
                    fallbackCost = fallbackSqft * (fallbackPrice / 1.18);
                } else {
                    fallbackCost = qtyToDeduct * (fallbackPrice / 1.18);
                }
                totalCost += fallbackCost;
            }

            const correctCost = Number(totalCost.toFixed(2));

            console.log(`Invoice ${sale.number} | Item: ${item.itemName}`);
            console.log(`  Current cost_amount: ${item.cost_amount}`);
            console.log(`  Recalculated base cost: ${correctCost}`);

            if (item.cost_amount !== correctCost) {
                updated = true;
                return {
                    ...item,
                    cost_amount: correctCost
                };
            }
            return item;
        });

        if (updated) {
            console.log(`Updating invoice ${sale.number} in database...`);
            const { error: updateError } = await supabase
                .from('invoices')
                .update({ items: updatedItems })
                .eq('id', sale.id);

            if (updateError) {
                console.error(`Error updating invoice ${sale.number}:`, updateError);
            } else {
                console.log(`Invoice ${sale.number} updated successfully.`);
            }
        }
    }

    // Now update the remaining quantities of stock batches in the database
    console.log('\nUpdating remaining stock batch quantities in the database...');
    for (const batch of batchState) {
        const original = batches.find(b => b.id === batch.id);
        if (original.remaining_quantity !== batch.remaining_quantity) {
            console.log(`Updating stock batch ${batch.id} remaining quantity: ${original.remaining_quantity} -> ${batch.remaining_quantity}`);
            const { error: updateBatchErr } = await supabase
                .from('stock_batches')
                .update({ remaining_quantity: batch.remaining_quantity })
                .eq('id', batch.id);
            if (updateBatchErr) {
                console.error(`Error updating stock batch ${batch.id}:`, updateBatchErr);
            }
        }
    }

    console.log('\nDatabase recalculation and fix complete.');
}

run();
