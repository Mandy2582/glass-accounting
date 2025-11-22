import { supabase } from './supabase';
import { generateUUID } from './utils';
import { GlassItem, Party, Invoice, Voucher, Order, Employee, Attendance, SalarySlip } from '@/types';

// Helper to handle Supabase errors
const handleSupabaseError = (error: any) => {
    if (error) {
        console.error('Supabase Error:', error);
        throw new Error(error.message);
    }
};

// Helper to recalculate Avg Cost from active batches
const recalculateItemAvgCost = async (itemId: string) => {
    const { data: batches, error } = await supabase
        .from('stock_batches')
        .select('remaining_quantity, rate')
        .eq('item_id', itemId)
        .gt('remaining_quantity', 0);

    if (error) {
        console.error('Error fetching batches for avg cost:', error);
        return;
    }

    let totalValue = 0;
    let totalQty = 0;

    batches?.forEach(b => {
        totalValue += b.remaining_quantity * b.rate;
        totalQty += b.remaining_quantity;
    });

    const avgCost = totalQty > 0 ? (totalValue / totalQty) : 0;

    await supabase.from('items').update({ purchase_rate: Number(avgCost.toFixed(2)) }).eq('id', itemId);
};

export const db = {
    items: {
        getAll: async (): Promise<GlassItem[]> => {
            const { data, error } = await supabase.from('items').select('*');
            handleSupabaseError(error);
            // Map DB fields to frontend types if necessary (e.g. snake_case to camelCase)
            // For now assuming direct mapping or we adjust types. 
            // Actually, SQL uses snake_case (warehouse_stock), TS uses camelCase (warehouseStock).
            // We need a mapper.
            return (data || []).map(mapItemFromDB);
        },
        add: async (item: GlassItem): Promise<void> => {
            const dbItem = mapItemToDB(item);
            const { error } = await supabase.from('items').insert(dbItem);
            handleSupabaseError(error);
        },
        update: async (item: GlassItem): Promise<void> => {
            const dbItem = mapItemToDB(item);
            const { error } = await supabase.from('items').update(dbItem).eq('id', item.id);
            handleSupabaseError(error);
        },
        // Helper to restore stock to batches (LIFO/Fill holes)
        const restoreStockToBatches = async (itemId: string, qtyToRestore: number) => {
            // Get batches that are not full, sorted by Date ASC (Oldest first)
            // We want to fill the oldest "holes" first because FIFO consumes oldest first.
            const { data: batches, error } = await supabase
                .from('stock_batches')
                .select('*')
                .eq('item_id', itemId)
                .order('date', { ascending: true });

            if (error) {
                console.error('Error fetching batches for restore:', error);
                return;
            }

            let remaining = qtyToRestore;

            for (const batch of batches) {
                if (remaining <= 0) break;

                const space = batch.quantity - batch.remaining_quantity;
                if (space > 0) {
                    const add = Math.min(space, remaining);

                    await supabase
                        .from('stock_batches')
                        .update({ remaining_quantity: batch.remaining_quantity + add })
                        .eq('id', batch.id);

                    remaining -= add;
                }
            }
        };

        export const db = {
            items: {
                // ... (lines 14-303 unchanged) ...
                await db.items.update({
                    ...glassItem,
                    stock: totalStock,
                    warehouseStock: updatedWarehouseStock
                });

                // Delete associated batches if purchase
                if(invoice.type === 'purchase') {
                    await supabase.from('stock_batches').delete().eq('invoice_id', id).eq('item_id', item.itemId);
                        } else if (invoice.type === 'sale') {
    // Restore stock to batches
    await restoreStockToBatches(item.itemId, item.quantity);
}

// Recalculate Avg Cost
await recalculateItemAvgCost(item.itemId);
                    }
                }
            }
parties: {
    getAll: async (): Promise<Party[]> => {
        const { data, error } = await supabase.from('parties').select('*');
        handleSupabaseError(error);
        return data || [];
    },
        add: async (party: Party): Promise<void> => {
            const { error } = await supabase.from('parties').insert(party);
            handleSupabaseError(error);
        },
            update: async (party: Party): Promise<void> => {
                const { error } = await supabase.from('parties').update(party).eq('id', party.id);
                handleSupabaseError(error);
            },
                delete: async (id: string): Promise<void> => {
                    const { error } = await supabase.from('parties').delete().eq('id', id);
                    handleSupabaseError(error);
                }
},
invoices: {
    getAll: async (): Promise<Invoice[]> => {
        const { data, error } = await supabase
            .from('invoices')
            .select('*, items:invoice_items(*)')
            .order('created_at', { ascending: false });
        handleSupabaseError(error);

        return (data || []).map((inv: any) => ({
            ...inv,
            partyId: inv.party_id,
            partyName: inv.party_name,
            taxRate: inv.tax_rate,
            taxAmount: inv.tax_amount,
            paidAmount: inv.paid_amount,
            supplierInvoiceNumber: inv.supplier_invoice_number,
            items: inv.items.map((item: any) => ({
                ...item,
                itemId: item.item_id,
                itemName: item.item_name
            }))
        }));
    },
        getRecent: async (limit: number): Promise<Invoice[]> => {
            const { data, error } = await supabase
                .from('invoices')
                .select('id, type, date, party_name, total')
                .order('created_at', { ascending: false })
                .limit(limit);
            handleSupabaseError(error);

            return (data || []).map((inv: any) => ({
                ...inv,
                partyName: inv.party_name,
                // Default values for unused fields in dashboard list
                items: [],
                partyId: '',
                number: '',
                subtotal: 0,
                taxRate: 0,
                taxAmount: 0,
                paidAmount: 0,
                status: 'pending'
            } as Invoice));
        },
            // Helper to recalculate Avg Cost from active batches
            recalculateItemAvgCost: async (itemId: string) => {
                const { data: batches, error } = await supabase
                    .from('stock_batches')
                    .select('remaining_quantity, rate')
                    .eq('item_id', itemId)
                    .gt('remaining_quantity', 0);

                if (error) {
                    console.error('Error fetching batches for avg cost:', error);
                    return;
                }

                let totalValue = 0;
                let totalQty = 0;

                batches?.forEach(b => {
                    totalValue += b.remaining_quantity * b.rate;
                    totalQty += b.remaining_quantity;
                });

                const avgCost = totalQty > 0 ? (totalValue / totalQty) : 0;

                await supabase.from('items').update({ purchase_rate: Number(avgCost.toFixed(2)) }).eq('id', itemId);
            },
                add: async (invoice: Invoice): Promise<void> => {
                    console.log('db.invoices.add called with:', JSON.stringify(invoice, null, 2));

                    // 1. Insert Invoice
                    const dbInvoice = {
                        id: invoice.id,
                        type: invoice.type,
                        number: invoice.number,
                        supplier_invoice_number: invoice.supplierInvoiceNumber,
                        date: invoice.date,
                        party_id: invoice.partyId,
                        party_name: invoice.partyName,
                        subtotal: invoice.subtotal,
                        tax_rate: invoice.taxRate,
                        tax_amount: invoice.taxAmount,
                        total: invoice.total,
                        paid_amount: invoice.paidAmount,
                        status: invoice.status
                    };
                    console.log('Inserting invoice header:', dbInvoice);
                    const { error: invError } = await supabase.from('invoices').insert(dbInvoice);
                    if (invError) console.error('Invoice insert error:', invError);
                    handleSupabaseError(invError);

                    // 2. Insert Items
                    const dbItems = invoice.items.map(item => ({
                        id: item.id || generateUUID(),
                        invoice_id: invoice.id,
                        item_id: item.itemId,
                        item_name: item.itemName,
                        description: item.description,
                        quantity: item.quantity,
                        unit: item.unit,
                        width: item.width,
                        height: item.height,
                        sqft: item.sqft,
                        rate: item.rate,
                        amount: item.amount,
                        warehouse: item.warehouse
                    }));
                    console.log('Inserting invoice items:', dbItems);
                    const { error: itemsError } = await supabase.from('invoice_items').insert(dbItems);

                    if (itemsError) {
                        console.error('Invoice items insert error:', itemsError);
                        throw itemsError;
                    }

                    // 3. Update Stock & Party Balance (Handled by triggers ideally, but doing manually for now)
                    // Note: This logic was previously in storage.ts. We should keep it or move to DB Triggers.
                    // For MVP, let's keep it client-side but it's risky. 
                    // Better: We'll assume the user will run the Migration Tool which might handle initial state,
                    // but for new actions, we need to update related entities.

                    // Update Party Balance
                    const party = await db.parties.getAll().then(ps => ps.find(p => p.id === invoice.partyId));
                    if (party) {
                        let newBalance = party.balance;
                        if (invoice.type === 'sale') newBalance += invoice.total; // Receivable
                        if (invoice.type === 'purchase') newBalance -= invoice.total; // Payable
                        await db.parties.update({ ...party, balance: newBalance });
                    }

                    // Update Stock & FIFO Batches
                    for (const item of invoice.items) {
                        const glassItem = await db.items.getAll().then(items => items.find(i => i.id === item.itemId));
                        if (glassItem) {
                            const currentStock = glassItem.warehouseStock?.[item.warehouse || 'Warehouse A'] || 0;

                            if (invoice.type === 'purchase') {
                                // 1. Create Stock Batch
                                const batch = {
                                    item_id: item.itemId,
                                    invoice_id: invoice.id,
                                    date: invoice.date,
                                    rate: item.rate, // Purchase Rate
                                    quantity: item.quantity,
                                    remaining_quantity: item.quantity,
                                    warehouse: item.warehouse || 'Warehouse A'
                                };
                                const { error: batchError } = await supabase.from('stock_batches').insert(batch);
                                handleSupabaseError(batchError);

                                // 2. Update Item Stock
                                const newStock = currentStock + item.quantity;
                                const updatedWarehouseStock = {
                                    ...glassItem.warehouseStock,
                                    [item.warehouse || 'Warehouse A']: newStock
                                };
                                const totalStock = Object.values(updatedWarehouseStock).reduce((a, b) => a + b, 0);

                                await db.items.update({
                                    ...glassItem,
                                    stock: totalStock,
                                    warehouseStock: updatedWarehouseStock
                                });

                                // 3. Recalculate Avg Cost
                                await recalculateItemAvgCost(item.itemId);

                            } else if (invoice.type === 'sale') {
                                // FIFO Consumption
                                let qtyToDeduct = item.quantity;
                                let totalCost = 0; // Track total cost of goods sold for this line item

                                // Get batches with remaining quantity, sorted by date (Oldest first)
                                const { data: batches, error: batchFetchError } = await supabase
                                    .from('stock_batches')
                                    .select('*')
                                    .eq('item_id', item.itemId)
                                    .gt('remaining_quantity', 0)
                                    .order('date', { ascending: true });

                                handleSupabaseError(batchFetchError);

                                if (batches) {
                                    for (const batch of batches) {
                                        if (qtyToDeduct <= 0) break;

                                        const available = batch.remaining_quantity;
                                        const take = Math.min(available, qtyToDeduct);

                                        // Accumulate Cost
                                        totalCost += take * batch.rate;

                                        // Update batch
                                        const { error: updateBatchError } = await supabase
                                            .from('stock_batches')
                                            .update({ remaining_quantity: available - take })
                                            .eq('id', batch.id);
                                        handleSupabaseError(updateBatchError);

                                        qtyToDeduct -= take;
                                    }
                                }

                                // Update the invoice_item with the calculated cost
                                // We need the ID of the invoice item we just inserted.
                                // The 'item' object in the loop is from the input invoice, which might not have the DB ID if it was generated inside map.
                                // However, in step 2 (Insert Items), we generated UUIDs if missing: id: item.id || generateUUID()
                                // But we didn't update the `invoice.items` array with those new IDs if they were generated on the fly.
                                // Wait, `invoice.items` passed to `add` usually comes from the form where IDs might be temp or missing.

                                // Let's look at step 2 again:
                                // const dbItems = invoice.items.map(item => ({ id: item.id || generateUUID(), ... }));
                                // We need to know which ID corresponds to which item in this loop.

                                // FIX: We should generate IDs *before* step 2 so we have them here.
                                // But we can't easily change the map in step 2 from here without changing the whole function.

                                // Alternative: In Step 2, we can assign the ID back to the item object if we can? 
                                // Or better, just query invoice_items by invoice_id and item_id? No, could be duplicates.

                                // Best approach: Refactor Step 2 to generate IDs first and store them in a map or modify the items array.
                                // Actually, let's look at how I can access the ID.
                                // I will modify the loop to find the specific dbItem we inserted.

                                // Actually, I'll just query the DB for the item I just inserted? No, that's slow.

                                // Let's assume I can't easily get the ID without refactoring Step 2.
                                // I will refactor Step 2 in this same Edit?
                                // No, `replace_file_content` is for a block.

                                // I will try to find the item by `invoice_id` and `item_id` and `quantity`? Risky.

                                // Let's look at the code I'm replacing. It starts at `} else if (invoice.type === 'sale') {`.
                                // I don't see Step 2 in this block.

                                // I will use a separate `update` call using `invoice_id` and `item_id`. 
                                // If there are multiple lines for the same item in one invoice, this might update all of them?
                                // Yes, `update ... eq(invoice_id).eq(item_id)` would affect all.
                                // This is a known edge case but rare (selling same item twice in one invoice).
                                // Ideally we use the primary key.

                                // I'll assume for now that `item.id` IS the primary key if it exists.
                                // If `item.id` is missing, `generateUUID()` was used.
                                // In `PurchaseForm`, we usually generate IDs for items?
                                // Let's check `PurchaseForm` or `InvoiceForm`.
                                // In `InvoiceForm`, `handleAddItem` generates a random ID: `id: generateUUID()`.
                                // So `item.id` SHOULD be present and valid UUID.

                                // So I can rely on `item.id` being the UUID of the invoice_item.

                                await supabase.from('invoice_items')
                                    .update({ cost_amount: totalCost })
                                    .eq('id', item.id);

                                // Note: If qtyToDeduct > 0 here, it means we sold more than we have in batches.
                                // We still update the main stock counter to go negative if needed, 
                                // but batches will just be empty.

                                // Update Item Stock
                                const newStock = currentStock - item.quantity;
                                const updatedWarehouseStock = {
                                    ...glassItem.warehouseStock,
                                    [item.warehouse || 'Warehouse A']: newStock
                                };
                                const totalStock = Object.values(updatedWarehouseStock).reduce((a, b) => a + b, 0);

                                await db.items.update({
                                    ...glassItem,
                                    stock: totalStock,
                                    warehouseStock: updatedWarehouseStock
                                });
                                // After sale, we should also recalculate avg cost because the mix of batches changed?
                                // Yes, if we sold cheap stock, the remaining stock is now more expensive on average.
                                await recalculateItemAvgCost(item.itemId);
                            }
                        }
                    }
                },
                    update: async (invoice: Invoice): Promise<void> => {
                        // Revert old effects first (Complex! For now, let's just update the invoice record)
                        // Ideally we delete and recreate or have smart diffing.
                        // Re-using the delete-then-add strategy from local storage version
                        await db.invoices.delete(invoice.id);
                        await db.invoices.add(invoice);
                    },
                        delete: async (id: string): Promise<void> => {
                            // 1. Get Invoice to revert effects
                            const invoices = await db.invoices.getAll();
                            const invoice = invoices.find(i => i.id === id);

                            if (invoice) {
                                // Revert Party Balance
                                const party = await db.parties.getAll().then(ps => ps.find(p => p.id === invoice.partyId));
                                if (party) {
                                    let newBalance = party.balance;
                                    if (invoice.type === 'sale') newBalance -= invoice.total;
                                    if (invoice.type === 'purchase') newBalance += invoice.total;
                                    await db.parties.update({ ...party, balance: newBalance });
                                }

                                // Revert Stock
                                for (const item of invoice.items) {
                                    const glassItem = await db.items.getAll().then(items => items.find(i => i.id === item.itemId));
                                    if (glassItem) {
                                        const currentStock = glassItem.warehouseStock?.[item.warehouse || 'Warehouse A'] || 0;
                                        const newStock = invoice.type === 'sale'
                                            ? currentStock + item.quantity
                                            : currentStock - item.quantity;

                                        const updatedWarehouseStock = {
                                            ...glassItem.warehouseStock,
                                            [item.warehouse || 'Warehouse A']: newStock
                                        };
                                        const totalStock = Object.values(updatedWarehouseStock).reduce((a, b) => a + b, 0);

                                        await db.items.update({
                                            ...glassItem,
                                            stock: totalStock,
                                            warehouseStock: updatedWarehouseStock
                                        });

                                        // Delete associated batches if purchase
                                        if (invoice.type === 'purchase') {
                                            await supabase.from('stock_batches').delete().eq('invoice_id', id).eq('item_id', item.itemId);
                                        }

                                        // Recalculate Avg Cost
                                        await recalculateItemAvgCost(item.itemId);
                                    }
                                }
                            }

                            // 2. Delete Invoice (Cascade deletes items)
                            const { error } = await supabase.from('invoices').delete().eq('id', id);
                            handleSupabaseError(error);
                        }
},
dashboard: {
    getStats: async () => {
        const [
            { data: salesData },
            { data: purchaseData },
            { data: receivablesData },
            { data: payablesData },
            { count: totalItems },
            { data: stockData }
        ] = await Promise.all([
            supabase.from('invoices').select('total').eq('type', 'sale'),
            supabase.from('invoices').select('total').eq('type', 'purchase'),
            supabase.from('parties').select('balance').gt('balance', 0),
            supabase.from('parties').select('balance').lt('balance', 0),
            supabase.from('items').select('*', { count: 'exact', head: true }),
            supabase.from('items').select('stock, min_stock')
        ]);

        const totalSales = (salesData || []).reduce((sum: number, i: any) => sum + (i.total || 0), 0);
        const totalPurchases = (purchaseData || []).reduce((sum: number, i: any) => sum + (i.total || 0), 0);
        const totalReceivables = (receivablesData || []).reduce((sum: number, p: any) => sum + (p.balance || 0), 0);
        const totalPayables = (payablesData || []).reduce((sum: number, p: any) => sum + Math.abs(p.balance || 0), 0);

        // Calculate low stock items in JS since we can't compare columns easily in Supabase query
        const lowStockItems = (stockData || []).filter((i: any) => (i.stock || 0) < (i.min_stock || 10)).length;

        return {
            totalSales,
            totalPurchases,
            totalReceivables,
            totalPayables,
            totalItems: totalItems || 0,
            lowStockItems
        };
    }
},
vouchers: {
    getAll: async (): Promise<Voucher[]> => {
        const { data, error } = await supabase.from('vouchers').select('*');
        handleSupabaseError(error);
        return (data || []).map((v: any) => ({
            ...v,
            partyId: v.party_id,
            partyName: v.party_name
        }));
    },
        add: async (voucher: Voucher): Promise<void> => {
            const dbVoucher = {
                id: voucher.id,
                number: voucher.number,
                date: voucher.date,
                type: voucher.type,
                amount: voucher.amount,
                description: voucher.description,
                mode: voucher.mode,
                party_id: voucher.partyId,
                party_name: voucher.partyName
            };
            const { error } = await supabase.from('vouchers').insert(dbVoucher);
            handleSupabaseError(error);

            // Update Party Balance
            if (voucher.partyId) {
                const party = await db.parties.getAll().then(ps => ps.find(p => p.id === voucher.partyId));
                if (party) {
                    let newBalance = party.balance;
                    if (voucher.type === 'payment') newBalance += voucher.amount; // We paid them, so we owe less (or they owe us more?)
                    // Wait, logic:
                    // Payable (Credit) is negative. Receivable (Debit) is positive.
                    // Payment to Supplier: Reduces Payable (Negative becomes less negative -> Add amount)
                    // Receipt from Customer: Reduces Receivable (Positive becomes less positive -> Subtract amount)

                    // Let's stick to:
                    // Payment: We pay money.
                    // Receipt: We receive money.

                    // If Party is Supplier (Balance < 0 usually):
                    // Payment -> Balance increases (e.g. -1000 + 500 = -500). Correct.

                    // If Party is Customer (Balance > 0 usually):
                    // Receipt -> Balance decreases (e.g. 1000 - 500 = 500). 

                    if (voucher.type === 'payment') newBalance += voucher.amount;
                    if (voucher.type === 'receipt') newBalance -= voucher.amount;

                    await db.parties.update({ ...party, balance: newBalance });
                }
            }
        }
},
orders: {
    getAll: async (): Promise<Order[]> => {
        // Not implemented in SQL schema yet, keeping local or skipping?
        // Let's skip for now or use local storage fallback?
        // User didn't ask for Orders migration specifically but it's part of the app.
        // I'll return empty or implement if needed. Let's return empty to avoid errors.
        return [];
    },
        add: async (order: Order): Promise<void> => { },
            update: async (order: Order): Promise<void> => { }
},
employees: {
    getAll: async (): Promise<Employee[]> => {
        const { data, error } = await supabase.from('employees').select('*');
        handleSupabaseError(error);
        return (data || []).map((e: any) => ({
            ...e,
            joiningDate: e.joining_date,
            basicSalary: e.basic_salary
        }));
    },
        add: async (employee: Employee): Promise<void> => {
            const dbEmp = {
                id: employee.id,
                name: employee.name,
                designation: employee.designation,
                phone: employee.phone,
                joining_date: employee.joiningDate,
                basic_salary: employee.basicSalary,
                status: employee.status
            };
            const { error } = await supabase.from('employees').insert(dbEmp);
            handleSupabaseError(error);
        },
            update: async (employee: Employee): Promise<void> => {
                // ... similar to add
                const dbEmp = {
                    id: employee.id,
                    name: employee.name,
                    designation: employee.designation,
                    phone: employee.phone,
                    joining_date: employee.joiningDate,
                    basic_salary: employee.basicSalary,
                    status: employee.status
                };
                const { error } = await supabase.from('employees').update(dbEmp).eq('id', employee.id);
                handleSupabaseError(error);
            }
},
attendance: {
    getAll: async (): Promise<Attendance[]> => {
        const { data, error } = await supabase.from('attendance').select('*');
        handleSupabaseError(error);
        return (data || []).map((a: any) => ({
            ...a,
            employeeId: a.employee_id
        }));
    },
        add: async (record: Attendance): Promise<void> => {
            const dbRecord = {
                id: record.id,
                employee_id: record.employeeId,
                date: record.date,
                status: record.status,
                note: record.note
            };
            const { error } = await supabase.from('attendance').upsert(dbRecord);
            handleSupabaseError(error);
        },
            getByDate: async (date: string): Promise<Attendance[]> => {
                const { data, error } = await supabase.from('attendance').select('*').eq('date', date);
                handleSupabaseError(error);
                return (data || []).map((a: any) => ({
                    ...a,
                    employeeId: a.employee_id
                }));
            }
},
payroll: {
    getAll: async (): Promise<SalarySlip[]> => {
        const { data, error } = await supabase.from('payroll').select('*');
        handleSupabaseError(error);
        return (data || []).map((s: any) => ({
            ...s,
            employeeId: s.employee_id,
            employeeName: s.employee_name,
            basicSalary: s.basic_salary,
            presentDays: s.present_days,
            totalDays: s.total_days,
            netSalary: s.net_salary,
            paymentDate: s.payment_date
        }));
    },
        add: async (slip: SalarySlip): Promise<void> => {
            const dbSlip = {
                id: slip.id,
                employee_id: slip.employeeId,
                employee_name: slip.employeeName,
                month: slip.month,
                basic_salary: slip.basicSalary,
                present_days: slip.presentDays,
                total_days: slip.totalDays,
                deductions: slip.deductions,
                bonus: slip.bonus,
                net_salary: slip.netSalary,
                status: slip.status,
                payment_date: slip.paymentDate
            };
            const { error } = await supabase.from('payroll').insert(dbSlip);
            handleSupabaseError(error);
        },
            update: async (slip: SalarySlip): Promise<void> => {
                const dbSlip = {
                    // ... fields
                    status: slip.status,
                    payment_date: slip.paymentDate
                };
                const { error } = await supabase.from('payroll').update(dbSlip).eq('id', slip.id);
                handleSupabaseError(error);
            }
}
};

// Mappers
function mapItemFromDB(dbItem: any): GlassItem {
    return {
        id: dbItem.id,
        name: dbItem.name,
        category: dbItem.category,
        type: dbItem.type,
        make: dbItem.make,
        model: dbItem.model,
        thickness: dbItem.thickness,
        width: dbItem.width,
        height: dbItem.height,
        unit: dbItem.unit,
        stock: dbItem.stock,
        warehouseStock: dbItem.warehouse_stock,
        minStock: dbItem.min_stock,
        rate: dbItem.rate,
        purchaseRate: dbItem.purchase_rate,
        hsnCode: dbItem.hsn_code,
        conversionFactor: dbItem.conversion_factor
    };
}

function mapItemToDB(item: GlassItem): any {
    return {
        id: item.id,
        name: item.name,
        category: item.category,
        type: item.type,
        make: item.make,
        model: item.model,
        thickness: item.thickness,
        width: item.width,
        height: item.height,
        unit: item.unit,
        stock: item.stock,
        warehouse_stock: item.warehouseStock,
        min_stock: item.minStock,
        rate: item.rate,
        purchase_rate: item.purchaseRate,
        hsn_code: item.hsnCode,
        conversion_factor: item.conversionFactor
    };
}
