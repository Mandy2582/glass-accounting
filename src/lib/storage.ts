import { supabase } from './supabase';
import { generateUUID } from './utils';
import { GlassItem, Party, Invoice, Voucher, Order, Employee, Attendance, SalarySlip, BankAccount } from '@/types';

// Helper to handle Supabase errors
const handleSupabaseError = (error: any) => {
    if (error) {
        // Log the full error object for debugging
        console.error('Supabase Error (Full Object):', error);

        // Log structured error details
        console.error('Supabase Error Details:', {
            message: error?.message || error?.msg || (typeof error === 'string' ? error : 'Unknown error'),
            code: error?.code || error?.status || 'No code',
            details: error?.details || error?.detail || 'No details',
            hint: error?.hint || 'No hint',
            errorType: typeof error,
            errorKeys: error && typeof error === 'object' ? Object.keys(error) : []
        });
        // Don't throw - let UI handle empty data gracefully
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
                .select('*')
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
            // 1. Get Invoice data BEFORE deleting (we need it to revert effects)
            const invoices = await db.invoices.getAll();
            const invoice = invoices.find(i => i.id === id);

            if (!invoice) {
                console.warn(`Invoice ${id} not found for deletion`);
                return;
            }

            // Store items that need batch recalculation (for sales)
            const itemsToRecalculate: string[] = [];
            if (invoice.type === 'sale') {
                invoice.items.forEach(item => {
                    if (!itemsToRecalculate.includes(item.itemId)) {
                        itemsToRecalculate.push(item.itemId);
                    }
                });
            }

            // 2. Delete Invoice FIRST (Cascade deletes invoice_items)
            console.log(`Deleting invoice ${id} from database...`);
            const { error } = await supabase.from('invoices').delete().eq('id', id);
            handleSupabaseError(error);

            // 3. NOW revert effects using the stored invoice data
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
                    }

                    // Recalculate Avg Cost
                    await recalculateItemAvgCost(item.itemId);
                }
            }

            // 4. For sales, recalculate batches AFTER invoice is deleted
            if (itemsToRecalculate.length > 0) {
                console.log(`Recalculating batches for ${itemsToRecalculate.length} items after deletion`);
                for (const itemId of itemsToRecalculate) {
                    console.log(`Recalculating stock for item ${itemId}`);
                    await recalculateStockForItem(itemId);
                    console.log(`Finished recalculating stock for item ${itemId}`);
                }
            }
        },
        updatePaymentStatus: async (invoiceId: string, paidAmount: number, status: Invoice['status']): Promise<void> => {
            // Update only the payment-related fields without reverting stock/balance
            const { error } = await supabase
                .from('invoices')
                .update({
                    paid_amount: paidAmount,
                    status: status
                })
                .eq('id', invoiceId);

            handleSupabaseError(error);
        }
    },
    dashboard: {
        getStats: async () => {
            const { data, error } = await supabase.rpc('get_dashboard_stats');

            if (error) {
                console.error('Error fetching dashboard stats via RPC:', error);
                // Fallback to empty stats or throw
                throw error;
            }

            return {
                totalSales: data.totalSales || 0,
                totalPurchases: data.totalPurchases || 0,
                totalReceivables: data.totalReceivables || 0,
                totalPayables: data.totalPayables || 0,
                totalItems: data.totalItems || 0,
                lowStockItems: data.lowStockItems || 0
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
                partyName: v.party_name,
                employeeId: v.employee_id,
                employeeName: v.employee_name,
                bankAccountId: v.bank_account_id
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
                party_name: voucher.partyName,
                employee_id: voucher.employeeId,
                employee_name: voucher.employeeName,
                bank_account_id: voucher.bankAccountId
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

            // Update Employee Balance
            if (voucher.employeeId) {
                const employee = await db.employees.getAll().then(es => es.find(e => e.id === voucher.employeeId));
                if (employee) {
                    let newBalance = employee.balance;
                    // Payment to Employee (Advance/Salary Payment) -> Increases Balance (Debit)
                    // Receipt from Employee (Repayment) -> Decreases Balance (Credit)
                    if (voucher.type === 'payment') newBalance += voucher.amount;
                    if (voucher.type === 'receipt') newBalance -= voucher.amount;

                    await db.employees.update({ ...employee, balance: newBalance });
                }
            }
        }
    },
    bankAccounts: {
        getAll: async (): Promise<BankAccount[]> => {
            const { data, error } = await supabase.from('bank_accounts').select('*');
            handleSupabaseError(error);
            return (data || []).map((b: any) => ({
                ...b,
                accountNumber: b.account_number,
                odLimit: b.od_limit,
                interestRate: b.interest_rate,
                openingBalance: b.opening_balance
            }));
        },
        add: async (account: BankAccount): Promise<void> => {
            const dbAccount = {
                id: account.id,
                name: account.name,
                account_number: account.accountNumber,
                type: account.type,
                od_limit: account.odLimit,
                interest_rate: account.interestRate,
                opening_balance: account.openingBalance
            };
            const { error } = await supabase.from('bank_accounts').insert(dbAccount);
            handleSupabaseError(error);
        },
        update: async (account: BankAccount): Promise<void> => {
            const dbAccount = {
                name: account.name,
                account_number: account.accountNumber,
                type: account.type,
                od_limit: account.odLimit,
                interest_rate: account.interestRate,
                opening_balance: account.openingBalance
            };
            const { error } = await supabase.from('bank_accounts').update(dbAccount).eq('id', account.id);
            handleSupabaseError(error);
        }
    },
    orders: {
        getAll: async (): Promise<Order[]> => {
            const { data, error } = await supabase.from('orders').select('*');
            handleSupabaseError(error);
            return (data || []).map((o: any) => ({
                ...o,
                partyId: o.party_id,
                partyName: o.party_name,
                deliveryDate: o.delivery_date,
                taxRate: o.tax_rate,
                taxAmount: o.tax_amount,
                linkedOrderId: o.linked_order_id,
                parentOrderId: o.parent_order_id,
                isDirectDelivery: o.is_direct_delivery,
                supplierDeliveryDate: o.supplier_delivery_date,
                customerDeliveryDate: o.customer_delivery_date,
                deliveredToUs: o.delivered_to_us,
                deliveredToCustomer: o.delivered_to_customer,
                deliveries: o.deliveries || [],
                notes: o.notes || [],
                paidAmount: o.paid_amount,
                paymentStatus: o.payment_status,
                invoiceId: o.invoice_id
            }));
        },

        add: async (order: Order): Promise<void> => {
            const dbOrder = {
                id: order.id,
                type: order.type,
                number: order.number,
                date: order.date,
                delivery_date: order.deliveryDate || null,
                party_id: order.partyId,
                party_name: order.partyName,
                items: order.items, // Supabase client handles JSON automatically
                subtotal: order.subtotal,
                tax_rate: order.taxRate,
                tax_amount: order.taxAmount,
                total: order.total,
                status: order.status,
                linked_order_id: order.linkedOrderId || null,
                parent_order_id: order.parentOrderId || null,
                is_direct_delivery: order.isDirectDelivery || false,
                supplier_delivery_date: order.supplierDeliveryDate || null,
                customer_delivery_date: order.customerDeliveryDate || null,
                delivered_to_us: order.deliveredToUs || 0,
                delivered_to_customer: order.deliveredToCustomer || 0,
                deliveries: order.deliveries || [],
                notes: order.notes || [],
                paid_amount: order.paidAmount || 0,
                payment_status: order.paymentStatus || 'unpaid',
                invoice_id: order.invoiceId || null
            };
            console.log('Inserting order:', dbOrder); // Debug log
            const { error } = await supabase.from('orders').insert(dbOrder);
            handleSupabaseError(error);
        },

        update: async (order: Order): Promise<void> => {
            const dbOrder = {
                type: order.type,
                number: order.number,
                date: order.date,
                delivery_date: order.deliveryDate || null,
                party_id: order.partyId,
                party_name: order.partyName,
                items: order.items,
                subtotal: order.subtotal,
                tax_rate: order.taxRate,
                tax_amount: order.taxAmount,
                total: order.total,
                status: order.status,
                linked_order_id: order.linkedOrderId || null,
                parent_order_id: order.parentOrderId || null,
                is_direct_delivery: order.isDirectDelivery || false,
                supplier_delivery_date: order.supplierDeliveryDate || null,
                customer_delivery_date: order.customerDeliveryDate || null,
                delivered_to_us: order.deliveredToUs || 0,
                delivered_to_customer: order.deliveredToCustomer || 0,
                deliveries: order.deliveries || [],
                notes: order.notes || null,
                paid_amount: order.paidAmount || 0,
                payment_status: order.paymentStatus || 'unpaid'
            };
            console.log('Updating order:', dbOrder);
            const { error } = await supabase.from('orders').update(dbOrder).eq('id', order.id);
            handleSupabaseError(error);

            // Sync logic: If Supplier Delivered, update the linked order too
            if (order.linkedOrderId && order.status === 'supplier_delivered') {
                const { error: syncError } = await supabase.from('orders')
                    .update({
                        status: 'supplier_delivered',
                        supplier_delivery_date: order.supplierDeliveryDate || null,
                        delivered_to_us: order.deliveredToUs || 0
                    })
                    .eq('id', order.linkedOrderId)
                    // Only update if the linked order is behind in status (e.g. pending or supplier_ordered)
                    .in('status', ['pending', 'supplier_ordered']);

                if (syncError) console.error('Error syncing linked order:', syncError);
            }
        },

        linkOrders: async (saleOrderId: string, purchaseOrderId: string): Promise<void> => {
            // Link SO to PO and vice versa
            await supabase.from('orders').update({ linked_order_id: purchaseOrderId }).eq('id', saleOrderId);
            await supabase.from('orders').update({ linked_order_id: saleOrderId, parent_order_id: saleOrderId }).eq('id', purchaseOrderId);
        },

        updateStatus: async (orderId: string, newStatus: string, deliveryDate?: string): Promise<void> => {
            const updateData: any = { status: newStatus };

            if (newStatus === 'supplier_delivered' && deliveryDate) {
                updateData.supplier_delivery_date = deliveryDate;
            } else if (newStatus === 'customer_delivered' && deliveryDate) {
                updateData.customer_delivery_date = deliveryDate;
            }

            const { error } = await supabase.from('orders').update(updateData).eq('id', orderId);
            handleSupabaseError(error);
        },

        getLinkedOrder: async (orderId: string): Promise<Order | null> => {
            const orders = await db.orders.getAll();
            const order = orders.find(o => o.id === orderId);
            if (!order || !order.linkedOrderId) return null;
            return orders.find(o => o.id === order.linkedOrderId) || null;
        },

        delete: async (id: string): Promise<void> => {
            const { error } = await supabase.from('orders').delete().eq('id', id);
            handleSupabaseError(error);
        },

        convertToInvoice: async (orderId: string): Promise<string> => {
            try {
                console.log('Converting order to invoice:', orderId);

                // 1. Get Order
                const { data: orderData, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
                if (orderError) {
                    console.error('Error fetching order:', orderError);
                    throw orderError;
                }

                const order = orderData;
                console.log('Order data:', order);

                // 2. Create Invoice Object
                const invoiceId = crypto.randomUUID();
                const invoice: Invoice = {
                    id: invoiceId,
                    type: order.type === 'sale_order' ? 'sale' : 'purchase',
                    number: `INV-${Date.now().toString().substr(-6)}`,
                    supplierInvoiceNumber: order.type === 'purchase_order' ? '' : undefined,
                    date: new Date().toISOString().split('T')[0],
                    partyId: order.party_id,
                    partyName: order.party_name,
                    items: order.items.map((item: any) => ({
                        id: crypto.randomUUID(),
                        invoiceId: invoiceId,
                        itemId: item.itemId || item.item_id,
                        itemName: item.itemName || item.item_name || item.description,
                        description: item.description,
                        quantity: item.quantity,
                        unit: item.unit,
                        width: item.width,
                        height: item.height,
                        sqft: item.sqft,
                        rate: item.rate,
                        amount: item.amount,
                        warehouse: item.warehouse || 'Warehouse A'
                    })),
                    subtotal: order.subtotal,
                    taxRate: order.tax_rate,
                    taxAmount: order.tax_amount,
                    total: order.total,
                    paidAmount: order.paid_amount || 0,
                    status: (order.paid_amount || 0) >= order.total ? 'paid' : ((order.paid_amount || 0) > 0 ? 'partially_paid' : 'unpaid')
                };

                console.log('Invoice object created:', invoice);

                // 3. Save Invoice (This handles stock deduction and ledger updates)
                console.log('Calling db.invoices.add...');
                await db.invoices.add(invoice);
                console.log('Invoice added successfully');

                // 4. Link Invoice to Order
                console.log('Linking invoice to order...');
                const { error: updateError } = await supabase.from('orders')
                    .update({ invoice_id: invoiceId })
                    .eq('id', orderId);

                if (updateError) {
                    console.error('Failed to link invoice to order:', updateError);
                    throw updateError;
                }

                console.log('Invoice conversion completed successfully');
                return invoiceId;
            } catch (error) {
                console.error('convertToInvoice failed:', error);
                throw error;
            }
        },

        recordPayment: async (orderId: string, payment: { amount: number, mode: 'cash' | 'bank', bankAccountId?: string, date: string, notes?: string }): Promise<void> => {
            try {
                console.log('Recording payment:', { orderId, payment });

                // 1. Get Order
                const { data: orderData, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
                if (orderError) {
                    console.error('Error fetching order:', orderError);
                    throw orderError;
                }

                const order = orderData;
                const isPO = order.type === 'purchase_order';

                console.log('Order fetched:', order);

                // 2. Create Voucher
                const voucher = {
                    id: crypto.randomUUID(),
                    number: `${isPO ? 'PAY' : 'RCP'}-${Date.now().toString().substr(-6)}`,
                    date: payment.date,
                    type: isPO ? 'payment' : 'receipt',
                    party_id: order.party_id,
                    party_name: order.party_name,
                    amount: payment.amount,
                    description: `Payment for Order #${order.number}. ${payment.notes || ''}`,
                    mode: payment.mode,
                    bank_account_id: payment.bankAccountId || null
                };

                console.log('Creating voucher:', voucher);
                const { error: voucherError } = await supabase.from('vouchers').insert(voucher);
                if (voucherError) {
                    console.error('Error creating voucher:', voucherError);
                    throw voucherError;
                }

                // 3. Update Order Payment Status
                const newPaidAmount = (order.paid_amount || 0) + payment.amount;
                const newStatus = newPaidAmount >= order.total ? 'paid' : 'partially_paid';

                console.log('Updating order payment status:', { newPaidAmount, newStatus });
                const { error: updateError } = await supabase.from('orders')
                    .update({
                        paid_amount: newPaidAmount,
                        payment_status: newStatus
                    })
                    .eq('id', orderId);

                if (updateError) {
                    console.error('Error updating order:', updateError);
                    throw updateError;
                }

                // 4. Update Party Balance
                const { data: partyData, error: partyFetchError } = await supabase.from('parties').select('balance').eq('id', order.party_id).single();
                if (partyFetchError) {
                    console.error('Error fetching party:', partyFetchError);
                    throw partyFetchError;
                }

                if (partyData) {
                    let newBalance = partyData.balance;
                    if (isPO) {
                        // Supplier: We owe them (Negative). We pay them. Balance should increase (become less negative).
                        newBalance += payment.amount;
                    } else {
                        // Customer: They owe us (Positive). They pay us. Balance should decrease.
                        newBalance -= payment.amount;
                    }

                    console.log('Updating party balance:', { oldBalance: partyData.balance, newBalance });
                    const { error: partyUpdateError } = await supabase.from('parties').update({ balance: newBalance }).eq('id', order.party_id);
                    if (partyUpdateError) {
                        console.error('Error updating party balance:', partyUpdateError);
                        throw partyUpdateError;
                    }
                }

                console.log('Payment recorded successfully');
            } catch (error) {
                console.error('recordPayment failed:', error);
                throw error;
            }
        }
    },
    employees: {
        getAll: async (): Promise<Employee[]> => {
            const { data, error } = await supabase.from('employees').select('*');
            handleSupabaseError(error);
            return (data || []).map((e: any) => ({
                ...e,
                joiningDate: e.joining_date,
                basicSalary: e.basic_salary,
                balance: e.balance || 0
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
                status: employee.status,
                balance: employee.balance || 0
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
                status: employee.status,
                balance: employee.balance
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

            // Update Employee Balance (Salary Due = Payable = Credit = Decrease Balance)
            const employee = await db.employees.getAll().then(es => es.find(e => e.id === slip.employeeId));
            if (employee) {
                const newBalance = (employee.balance || 0) - slip.netSalary;
                await db.employees.update({ ...employee, balance: newBalance });
            }
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
