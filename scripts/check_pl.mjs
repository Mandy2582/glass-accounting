import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('Loading database records...');
    const [invoicesRes, vouchersRes] = await Promise.all([
        supabase.from('invoices').select('*'),
        supabase.from('vouchers').select('*')
    ]);

    if (invoicesRes.error) console.error('Invoices error:', invoicesRes.error);
    if (vouchersRes.error) console.error('Vouchers error:', vouchersRes.error);

    const invoices = invoicesRes.data || [];
    const vouchers = vouchersRes.data || [];
    const sales = invoices.filter(i => i.type === 'sale');

    // Extract unique itemIds from sales
    const itemIds = Array.from(new Set(sales.flatMap(s => (s.items || []).map(item => item.itemId)).filter(Boolean)));
    
    let items = [];
    if (itemIds.length > 0) {
        const itemsRes = await supabase.from('items').select('*').in('id', itemIds);
        if (itemsRes.error) console.error('Items error:', itemsRes.error);
        items = itemsRes.data || [];
    }

    console.log(`Found ${sales.length} sale invoices, ${vouchers.length} vouchers, loaded ${items.length} relevant items.\n`);

    let totalRevenue = 0;
    let totalCogs = 0;

    sales.forEach(sale => {
        const saleItems = sale.items || [];
        console.log(`----------------------------------------------------------------`);
        console.log(`Invoice: ${sale.number} | Date: ${sale.date} | Customer: ${sale.party_name}`);
        console.log(`Subtotal: ₹${sale.subtotal}`);
        totalRevenue += sale.subtotal;

        let saleCogs = 0;
        saleItems.forEach(item => {
            const itemDef = items.find(i => i.id === item.itemId);
            const costPrice = itemDef?.purchase_rate || 0;
            const isGlass = itemDef ? itemDef.category !== 'hardware' : item.unit !== 'nos';

            let costMethod = '';
            let calculatedCost = 0;

            if (item.cost_amount !== undefined && item.cost_amount !== null && item.cost_amount > 0) {
                calculatedCost = Number(item.cost_amount);
                costMethod = 'FIFO (stock_batches)';
            } else {
                const baseCostPrice = costPrice / 1.18;
                if (isGlass) {
                    calculatedCost = baseCostPrice * (item.sqft || 0);
                    costMethod = `Fallback Glass (purchase_rate/1.18: ${baseCostPrice.toFixed(2)} * sqft: ${item.sqft})`;
                } else {
                    calculatedCost = baseCostPrice * (item.quantity || 0);
                    costMethod = `Fallback Hardware (purchase_rate/1.18: ${baseCostPrice.toFixed(2)} * qty: ${item.quantity})`;
                }
            }

            saleCogs += calculatedCost;
            console.log(`  - Item: ${item.itemName}`);
            console.log(`    Qty: ${item.quantity} | Unit: ${item.unit} | Sqft: ${item.sqft} | Rate: ₹${item.rate} | Line Subtotal: ₹${item.amount}`);
            console.log(`    Cost: ₹${calculatedCost.toFixed(2)} [Method: ${costMethod}]`);
        });
        totalCogs += saleCogs;
        console.log(`Total COGS for invoice: ₹${saleCogs.toFixed(2)}`);
    });

    const expenses = vouchers.filter(v => v.type === 'expense').reduce((sum, v) => sum + v.amount, 0);

    console.log(`\n================================================================`);
    console.log(`OVERALL PROFIT & LOSS CALCULATION:`);
    console.log(`================================================================`);
    console.log(`Revenue (Subtotal):           ₹${totalRevenue.toFixed(2)}`);
    console.log(`Less: COGS:                   (₹${totalCogs.toFixed(2)})`);
    console.log(`----------------------------------------------------------------`);
    console.log(`Gross Profit:                 ₹${(totalRevenue - totalCogs).toFixed(2)}`);
    console.log(`Less: Operating Expenses:     (₹${expenses.toFixed(2)})`);
    console.log(`----------------------------------------------------------------`);
    console.log(`Net Profit:                   ₹${(totalRevenue - totalCogs - expenses).toFixed(2)}`);
    console.log(`================================================================`);
}

run();
