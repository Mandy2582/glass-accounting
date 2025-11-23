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

// Helper to recalculate stock and COGS for an item (Replay History)
const recalculateStockForItem = async (itemId: string) => {
    console.log(`Recalculating stock for item: ${itemId}`);

    // 1. Get all batches (Oldest First)
    const { data: batches, error: batchError } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', itemId)
        .order('date', { ascending: true });

    if (batchError) {
        console.error('Error fetching batches for recalc:', batchError);
        return;
    }

    // 2. Reset remaining_quantity in memory
    const batchState = batches.map(b => ({ ...b, remaining_quantity: b.quantity }));

    // 3. Get all active sales items (Ordered by Date)
    // We need to join with invoices to filter by type 'sale' and order by date
    const { data: salesItems, error: salesError } = await supabase
        .from('invoice_items')
        .select('*, invoices!inner(type, date, created_at)')
        .eq('item_id', itemId)
        .eq('invoices.type', 'sale')
        .order('invoices(date)', { ascending: true })
        .order('invoices(created_at)', { ascending: true });

    if (salesError) {
        console.error('Error fetching sales for recalc:', salesError);
        return;
    }

    console.log(`Found ${salesItems?.length || 0} sales items for recalculation`);

    // 4. Replay consumption
    if (salesItems) {
        for (const item of salesItems) {
            let qty = item.quantity;
            let cost = 0;

            for (const batch of batchState) {
                if (qty <= 0) break;
                if (batch.remaining_quantity <= 0) continue;

                const take = Math.min(batch.remaining_quantity, qty);
                cost += take * batch.rate;

                batch.remaining_quantity -= take;
                qty -= take;
            }

            // Update cost_amount if changed (Self-healing)
            if (item.cost_amount !== cost) {
                console.log(`Updating cost_amount for item ${item.id}: ${item.cost_amount} -> ${cost}`);
                await supabase.from('invoice_items').update({ cost_amount: cost }).eq('id', item.id);
            }
        }
    }

    // 5. Update batches in DB
    console.log(`Updating ${batches.length} batches in DB`);
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

    // 6. Recalculate Avg Cost
    await recalculateItemAvgCost(itemId);
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
        delete: async (id: string): Promise<void> => {
            const { error } = await supabase.from('items').delete().eq('id', id);
            handleSupabaseError(error);
        }
    },
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
                    itemName: item.item_name,
                    cost_amount: item.cost_amount
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

            // 2. Prepare Items & Calculate FIFO Cost (if sale)
            const dbItems = [];

            for (const item of invoice.items) {
                const dbItem: any = {
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
                };

                // Process Stock & Batches *before* insert to get cost_amount
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

                        // Assign calculated cost to dbItem BEFORE insert
                        dbItem.cost_amount = totalCost;
                        console.log(`Calculated cost for item ${dbItem.id}: ${totalCost}`);

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

                        await recalculateItemAvgCost(item.itemId);
                    }
                }

                dbItems.push(dbItem);
            }

            // 3. Insert Items (now with cost_amount)
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
                            console.log(`Deleting batches for purchase invoice ${id}, item ${item.itemId}`);
                            await supabase.from('stock_batches').delete().eq('invoice_id', id).eq('item_id', item.itemId);
                        } else if (invoice.type === 'sale') {
                            // Restore stock by recalculating history
                            console.log(`Recalculating stock for sale deletion, item ${item.itemId}`);
                            await recalculateStockForItem(item.itemId);
                            console.log(`Finished recalculating stock for item ${item.itemId}`);
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
