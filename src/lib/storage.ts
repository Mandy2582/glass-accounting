import { supabase } from './supabase';
import { generateUUID, roundCurrency } from './utils';
import { GlassItem, Party, Invoice, InvoiceItem, Voucher, Order, Employee, Attendance, SalarySlip, BankAccount, CustomDesign, BusinessConfig } from '@/types';
import { convertQuantityForItemUnit, convertRateForItemUnit } from '@/lib/units';

const normalizeInvoiceItemMoney = (item: InvoiceItem): InvoiceItem => ({
    ...item,
    rate: roundCurrency(item.rate),
    amount: roundCurrency(item.amount),
    lineTotal: item.lineTotal === undefined ? undefined : roundCurrency(item.lineTotal),
    cost_amount: item.cost_amount === undefined ? undefined : roundCurrency(item.cost_amount)
});

const normalizeInvoiceMoney = (invoice: Invoice): Invoice => ({
    ...invoice,
    items: invoice.items.map(normalizeInvoiceItemMoney),
    subtotal: roundCurrency(invoice.subtotal),
    taxAmount: roundCurrency(invoice.taxAmount),
    total: roundCurrency(invoice.total),
    paidAmount: invoice.paidAmount === undefined ? undefined : roundCurrency(invoice.paidAmount)
});

const normalizeOrderMoney = (order: Order): Order => ({
    ...order,
    items: order.items.map(normalizeInvoiceItemMoney),
    subtotal: roundCurrency(order.subtotal),
    taxAmount: roundCurrency(order.taxAmount),
    total: roundCurrency(order.total),
    paidAmount: order.paidAmount === undefined ? undefined : roundCurrency(order.paidAmount)
});

const requirePositiveCurrency = (amount: number, label: string): number => {
    const normalized = roundCurrency(amount);
    if (normalized <= 0) throw new Error(`${label} must be greater than zero.`);
    return normalized;
};

const toStockQuantity = (item: InvoiceItem, inventoryItem: any): number => {
    return roundCurrency(convertQuantityForItemUnit({
        quantity: item.quantity,
        fromUnit: item.unit,
        toUnit: inventoryItem.unit || item.unit,
        width: item.width || inventoryItem.width,
        height: item.height || inventoryItem.height,
        conversionFactor: inventoryItem.conversionFactor || inventoryItem.conversion_factor,
    }));
};

const toStockRate = (rate: number, fromUnit: string | undefined, inventoryItem: any): number => {
    return roundCurrency(convertRateForItemUnit({
        rate,
        fromUnit,
        toUnit: inventoryItem.unit,
        width: inventoryItem.width,
        height: inventoryItem.height,
        conversionFactor: inventoryItem.conversionFactor || inventoryItem.conversion_factor,
    }));
};

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

    // Get item definition from DB
    const { data: dbItem, error: itemError } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();

    if (itemError) {
        console.error('Error fetching item definition for recalc:', itemError);
    }

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

    // 3. Get all active sales containing this item (Ordered by Date)
    const { data: salesInvoices, error: salesError } = await supabase
        .from('invoices')
        .select('*')
        .eq('type', 'sale')
        .contains('items', `[{"itemId": "${itemId}"}]`)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    if (salesError) {
        console.error('Error fetching sales for recalc:', salesError);
        return;
    }

    const salesItems: any[] = [];
    if (salesInvoices) {
        for (const inv of salesInvoices) {
            const items = inv.items || [];
            for (const item of items) {
                if (item.itemId === itemId) {
                    salesItems.push({
                        ...item,
                        invoiceId: inv.id,
                        invoiceNumber: inv.number,
                        invoiceDate: inv.date,
                        invoiceCreatedAt: inv.created_at,
                        _parentInvoice: inv
                    });
                }
            }
        }
    }

    console.log(`Found ${salesItems.length} sales items for recalculation`);

    // 4. Replay consumption
    for (const item of salesItems) {
        const isGlass = dbItem ? dbItem.category !== 'hardware' : item.unit !== 'nos';
        let qtyToDeduct = Number(item.quantity);
        let totalCost = 0;

        for (const batch of batchState) {
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
            const fallbackPrice = dbItem ? (dbItem.purchase_rate || 0) : 0;
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

        const roundedCost = Number(totalCost.toFixed(2));

        // Mark as updated if different
        if (item.cost_amount !== roundedCost) {
            console.log(`Updating cost_amount for item in invoice ${item.invoiceNumber}: ${item.cost_amount} -> ${roundedCost}`);
            item.cost_amount = roundedCost;
            item._dirty = true;
        }
    }

    // 4.5 Save updated invoices to DB
    const invoicesToUpdate = new Map<string, any>();
    for (const item of salesItems) {
        if (item._dirty) {
            const parent = item._parentInvoice;
            delete item._dirty;
            delete item._parentInvoice;
            delete item.invoiceId;
            delete item.invoiceNumber;
            delete item.invoiceDate;
            delete item.invoiceCreatedAt;

            invoicesToUpdate.set(parent.id, parent);
        }
    }

    for (const [id, parent] of invoicesToUpdate.entries()) {
        const cleanItems = parent.items.map((it: any) => {
            const { _dirty, _parentInvoice, invoiceId, invoiceNumber, invoiceDate, invoiceCreatedAt, ...clean } = it;
            return clean;
        });

        console.log(`Updating invoice ${parent.number} in DB with new cost amounts...`);
        const { error: updateInvError } = await supabase
            .from('invoices')
            .update({ items: cleanItems })
            .eq('id', id);

        if (updateInvError) {
            console.error(`Error updating invoice ${parent.number}:`, updateInvError);
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
            let allData: any[] = [];
            let from = 0;
            const limit = 1000;
            while (true) {
                const { data, error } = await supabase
                    .from('items')
                    .select('*')
                    .range(from, from + limit - 1);
                
                handleSupabaseError(error);
                if (error || !data || data.length === 0) {
                    break;
                }
                allData = allData.concat(data);
                if (data.length < limit) {
                    break;
                }
                from += limit;
            }
            return allData.map(mapItemFromDB);
        },
        getShopProducts: async (limit = 240): Promise<GlassItem[]> => {
            const { data, error } = await supabase
                .from('items')
                .select('*')
                .eq('show_online', true)
                .gt('rate', 0)
                .order('category', { ascending: true })
                .order('name', { ascending: true })
                .limit(limit);

            handleSupabaseError(error);
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
            return (data || []).map(party => ({ ...party, balance: roundCurrency(party.balance) }));
        },
        getById: async (id: string): Promise<Party | null> => {
            const { data, error } = await supabase.from('parties').select('*').eq('id', id).single();
            if (error) return null;
            return { ...data, balance: roundCurrency(data.balance) };
        },
        add: async (party: Party): Promise<void> => {
            party = { ...party, balance: roundCurrency(party.balance) };
            const { error } = await supabase.from('parties').insert(party);
            handleSupabaseError(error);
        },
        update: async (party: Party): Promise<void> => {
            party = { ...party, balance: roundCurrency(party.balance) };
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
                .select('*')
                .order('created_at', { ascending: false });
            handleSupabaseError(error);

            return (data || []).map((inv: any) => normalizeInvoiceMoney({
                ...inv,
                partyId: inv.party_id,
                partyName: inv.party_name,
                taxRate: inv.tax_rate,
                taxAmount: inv.tax_amount,
                paidAmount: inv.paid_amount,
                supplierInvoiceNumber: inv.supplier_invoice_number,
                items: inv.items || []
            } as Invoice));
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
            invoice = normalizeInvoiceMoney(invoice);
            console.log('db.invoices.add called with:', JSON.stringify(invoice, null, 2));

            const processedItems = [];

            if (invoice.type === 'purchase') {
                // For Purchases, we insert the invoice FIRST, so the foreign key constraint on stock_batches is satisfied.
                const dbInvoice = {
                    id: invoice.id,
                    type: invoice.type,
                    number: invoice.number,
                    supplier_invoice_number: invoice.supplierInvoiceNumber,
                    date: invoice.date,
                    party_id: invoice.partyId,
                    party_name: invoice.partyName,
                    items: invoice.items,
                    subtotal: invoice.subtotal,
                    tax_rate: invoice.taxRate,
                    tax_amount: invoice.taxAmount,
                    total: invoice.total,
                    paid_amount: invoice.paidAmount,
                    status: invoice.status
                };
                console.log('Inserting purchase invoice first:', dbInvoice);
                const { error: invError } = await supabase.from('invoices').insert(dbInvoice);
                if (invError) console.error('Invoice insert error:', invError);
                handleSupabaseError(invError);

                // Now process stock updates and create stock batches
                for (const item of invoice.items) {
                    const glassItem = await db.items.getAll().then(items => items.find(i => i.id === item.itemId));
                    if (glassItem) {
                        const currentStock = glassItem.warehouseStock?.[item.warehouse || 'Warehouse A'] || 0;
                        const stockQuantity = toStockQuantity(item, glassItem);
                        const stockRate = toStockRate(item.rate, item.unit, glassItem);

                        // 1. Create Stock Batch
                        const batch = {
                            item_id: item.itemId,
                            invoice_id: invoice.id,
                            date: invoice.date,
                            rate: stockRate, // Store GST-inclusive rate in inventory stock unit
                            quantity: stockQuantity,
                            remaining_quantity: stockQuantity,
                            warehouse: item.warehouse || 'Warehouse A'
                        };
                        const { error: batchError } = await supabase.from('stock_batches').insert(batch);
                        handleSupabaseError(batchError);

                        // 2. Update Item Stock
                        const newStock = currentStock + stockQuantity;
                        const updatedWarehouseStock = {
                            ...glassItem.warehouseStock,
                            [item.warehouse || 'Warehouse A']: newStock
                        };
                        const totalStock = Object.values(updatedWarehouseStock).reduce((a, b) => a + b, 0);

                        const { error: itemUpdateError } = await supabase
                            .from('items')
                            .update({
                                stock: totalStock,
                                warehouse_stock: updatedWarehouseStock,
                            })
                            .eq('id', glassItem.id);
                        if (itemUpdateError) throw new Error(`Failed to update inventory stock: ${itemUpdateError.message}`);

                        // 3. Recalculate Avg Cost
                        await recalculateItemAvgCost(item.itemId);
                    }
                }
            } else if (invoice.type === 'sale') {
                // For Sales, we process FIFO deductions FIRST to calculate cost_amount per item
                for (const item of invoice.items) {
                    const processedItem: any = { ...item };
                    const { data: glassItem, error: fetchErr } = await supabase
                        .from('items')
                        .select('*')
                        .eq('id', item.itemId)
                        .maybeSingle();
                    
                    if (fetchErr) console.error('Error fetching item details:', fetchErr);

                    if (glassItem) {
                        const currentStock = glassItem.warehouse_stock?.[item.warehouse || 'Warehouse A'] || 0;
                        const stockQuantity = toStockQuantity(item, glassItem);
                        const fallbackRate = toStockRate(glassItem.purchase_rate || 0, glassItem.purchase_rate_unit || glassItem.rate_unit || glassItem.unit, glassItem);

                        // FIFO Consumption
                        let qtyToDeduct = stockQuantity;
                        let totalCost = 0;

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

                                const takeCost = take * (batch.rate / 1.18);

                                totalCost += takeCost;

                                const { error: updateBatchError } = await supabase
                                    .from('stock_batches')
                                    .update({ remaining_quantity: available - take })
                                    .eq('id', batch.id);
                                handleSupabaseError(updateBatchError);

                                qtyToDeduct -= take;
                            }
                        }

                        // Fallback for remaining quantity if stock was insufficient
                        if (qtyToDeduct > 0) {
                            totalCost += qtyToDeduct * (fallbackRate / 1.18);
                        }

                        processedItem.cost_amount = Number(totalCost.toFixed(2));
                        console.log(`Calculated cost for item ${processedItem.itemId}: ${processedItem.cost_amount}`);

                        // Update Item Stock
                        const newStock = currentStock - stockQuantity;
                        const updatedWarehouseStock = {
                            ...glassItem.warehouse_stock,
                            [item.warehouse || 'Warehouse A']: newStock
                        };
                        const totalStock = Object.values(updatedWarehouseStock).reduce((a: any, b: any) => Number(a) + Number(b), 0);

                        const { error: itemUpdateErr } = await supabase
                            .from('items')
                            .update({
                                stock: totalStock,
                                warehouse_stock: updatedWarehouseStock,
                            })
                            .eq('id', glassItem.id);
                        if (itemUpdateErr) throw new Error(`Failed to update inventory stock: ${itemUpdateErr.message}`);

                        await recalculateItemAvgCost(item.itemId);
                    }
                    processedItems.push(processedItem);
                }

                // 2. Insert Sale Invoice
                const dbInvoice = {
                    id: invoice.id,
                    type: invoice.type,
                    number: invoice.number,
                    supplier_invoice_number: invoice.supplierInvoiceNumber,
                    date: invoice.date,
                    party_id: invoice.partyId,
                    party_name: invoice.partyName,
                    items: processedItems,
                    subtotal: invoice.subtotal,
                    tax_rate: invoice.taxRate,
                    tax_amount: invoice.taxAmount,
                    total: invoice.total,
                    paid_amount: invoice.paidAmount,
                    status: invoice.status
                };
                console.log('Inserting sale invoice:', dbInvoice);
                const { error: invError } = await supabase.from('invoices').insert(dbInvoice);
                if (invError) console.error('Invoice insert error:', invError);
                handleSupabaseError(invError);
            }

            // Update Party Balance
            const party = await db.parties.getAll().then(ps => ps.find(p => p.id === invoice.partyId));
            if (party) {
                let newBalance = party.balance;
                if (invoice.type === 'sale') newBalance += invoice.total;
                if (invoice.type === 'purchase') newBalance -= invoice.total;
                newBalance = Number(newBalance.toFixed(2));
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
                newBalance = Number(newBalance.toFixed(2));
                await db.parties.update({ ...party, balance: newBalance });
            }

            // Revert Stock
            for (const item of invoice.items) {
                const glassItem = await db.items.getAll().then(items => items.find(i => i.id === item.itemId));
                if (glassItem) {
                    const currentStock = glassItem.warehouseStock?.[item.warehouse || 'Warehouse A'] || 0;
                    const stockQuantity = toStockQuantity(item, glassItem);
                    const newStock = invoice.type === 'sale'
                        ? currentStock + stockQuantity
                        : currentStock - stockQuantity;

                    const updatedWarehouseStock = {
                        ...glassItem.warehouseStock,
                        [item.warehouse || 'Warehouse A']: newStock
                    };
                    const totalStock = Object.values(updatedWarehouseStock).reduce((a, b) => a + b, 0);

                    const { error: itemUpdateError } = await supabase
                        .from('items')
                        .update({
                            stock: totalStock,
                            warehouse_stock: updatedWarehouseStock,
                        })
                        .eq('id', glassItem.id);
                    if (itemUpdateError) throw new Error(`Failed to update inventory stock: ${itemUpdateError.message}`);

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
                    paid_amount: roundCurrency(paidAmount),
                    status: status
                })
                .eq('id', invoiceId);

            handleSupabaseError(error);
        }
    },
    dashboard: {
        getStats: async () => {
            try {
                // Fetch all necessary data in parallel
                const [invoicesResult, itemsResult] = await Promise.all([
                    supabase.from('invoices').select('type, total, paid_amount'),
                    supabase.from('items').select('stock, min_stock')
                ]);

                const invoices = invoicesResult.data || [];
                const items = itemsResult.data || [];

                // Calculate stats from the invoices table
                const salesInvoices = invoices.filter(inv => inv.type === 'sale' || !inv.type);
                const purchaseInvoices = invoices.filter(inv => inv.type === 'purchase');

                const totalSales = salesInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
                const totalReceivables = salesInvoices.reduce((sum, inv) => sum + ((inv.total || 0) - (inv.paid_amount || 0)), 0);

                const totalPurchases = purchaseInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
                const totalPayables = purchaseInvoices.reduce((sum, inv) => sum + ((inv.total || 0) - (inv.paid_amount || 0)), 0);

                const totalItems = items.length;
                const lowStockItems = items.filter(item => (item.min_stock || 0) > 0 && (item.stock || 0) <= item.min_stock).length;

                return {
                    totalSales,
                    totalPurchases,
                    totalReceivables,
                    totalPayables,
                    totalItems,
                    lowStockItems
                };
            } catch (error) {
                console.error('Error fetching dashboard stats:', error);
                // Return empty stats instead of throwing
                return {
                    totalSales: 0,
                    totalPurchases: 0,
                    totalReceivables: 0,
                    totalPayables: 0,
                    totalItems: 0,
                    lowStockItems: 0
                };
            }
        }
    },
    vouchers: {
        getAll: async (): Promise<Voucher[]> => {
            const { data, error } = await supabase.from('vouchers').select('*');
            handleSupabaseError(error);
            return (data || []).map((v: any) => ({
                ...v,
                amount: roundCurrency(v.amount),
                partyId: v.party_id,
                partyName: v.party_name,
                employeeId: v.employee_id,
                employeeName: v.employee_name,
                bankAccountId: v.bank_account_id
            }));
        },
        add: async (voucher: Voucher): Promise<void> => {
            voucher = { ...voucher, amount: requirePositiveCurrency(voucher.amount, 'Voucher amount') };
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
                    newBalance = Number(newBalance.toFixed(2));

                    await db.parties.update({ ...party, balance: newBalance });
                }
            }

            // Update Employee Balance
            if (voucher.employeeId && !voucher.partyId) {
                const employee = await db.employees.getAll().then(es => es.find(e => e.id === voucher.employeeId));
                if (employee) {
                    let newBalance = employee.balance;
                    // Payment to Employee (Advance/Salary Payment) -> Increases Balance (Debit)
                    // Receipt from Employee (Repayment) -> Decreases Balance (Credit)
                    if (voucher.type === 'payment') newBalance += voucher.amount;
                    if (voucher.type === 'receipt') newBalance -= voucher.amount;
                    newBalance = Number(newBalance.toFixed(2));

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
                odLimit: roundCurrency(b.od_limit),
                interestRate: roundCurrency(b.interest_rate),
                openingBalance: roundCurrency(b.opening_balance)
            }));
        },
        add: async (account: BankAccount): Promise<void> => {
            account = {
                ...account,
                odLimit: roundCurrency(account.odLimit),
                interestRate: roundCurrency(account.interestRate),
                openingBalance: roundCurrency(account.openingBalance)
            };
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
            account = {
                ...account,
                odLimit: roundCurrency(account.odLimit),
                interestRate: roundCurrency(account.interestRate),
                openingBalance: roundCurrency(account.openingBalance)
            };
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
        generateNextGeneralNumber: async (): Promise<string> => {
            const { data, error } = await supabase
                .from('orders')
                .select('general_number')
                .not('general_number', 'is', null);

            handleSupabaseError(error);

            let maxNum = 100000;
            (data || []).forEach(row => {
                const num = parseInt(String(row.general_number || '').replace(/\D/g, ''), 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            });
            return String(maxNum + 1);
        },

        generateNextOrderNumber: async (type: 'sale_order' | 'purchase_order'): Promise<string> => {
            const prefix = type === 'sale_order' ? 'SO' : 'PO';

            const { data, error } = await supabase
                .from('orders')
                .select('number')
                .eq('type', type)
                .like('number', `${prefix}-%`);

            handleSupabaseError(error);

            let maxSerial = 0;
            (data || []).forEach(o => {
                const matches = String(o.number || '').match(/\d+/g);
                const serialVal = matches?.length ? parseInt(matches[matches.length - 1], 10) : NaN;
                if (!isNaN(serialVal) && serialVal > maxSerial) {
                    maxSerial = serialVal;
                }
            });

            const nextSerial = maxSerial + 1;
            const formattedSerial = String(nextSerial).padStart(6, '0');
            return `${prefix}-${formattedSerial}`;
        },

        getAll: async (): Promise<Order[]> => {
            const { data, error } = await supabase.from('orders').select('*');
            handleSupabaseError(error);
            return (data || []).map((o: any) => normalizeOrderMoney({
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
                notes: o.notes || '',
                paidAmount: o.paid_amount,
                paymentStatus: o.payment_status,
                invoiceId: o.invoice_id,
                generalNumber: o.general_number,
                soNumber: o.so_number,
                poNumber: o.po_number,
                requiresDesign: o.requires_design
            } as Order));
        },

        add: async (order: Order): Promise<void> => {
            order = normalizeOrderMoney(order);
            const dbOrder = {
                id: order.id,
                type: order.type,
                number: order.number,
                general_number: order.generalNumber || null,
                so_number: order.soNumber || null,
                po_number: order.poNumber || null,
                requires_design: order.requiresDesign || false,
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
                notes: order.notes || null,
                paid_amount: order.paidAmount || 0,
                payment_status: order.paymentStatus || 'unpaid',
                invoice_id: order.invoiceId || null
            };
            console.log('Inserting order:', dbOrder); // Debug log
            const { error } = await supabase.from('orders').insert(dbOrder);
            handleSupabaseError(error);
        },

        update: async (order: Order): Promise<void> => {
            order = normalizeOrderMoney(order);
            const dbOrder = {
                type: order.type,
                number: order.number,
                general_number: order.generalNumber || null,
                so_number: order.soNumber || null,
                po_number: order.poNumber || null,
                requires_design: order.requiresDesign || false,
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
                const invoiceType = order.type === 'sale_order' ? 'sale' : 'purchase';
                const nextNumber = await db.businessConfig.getNextInvoiceNumber(invoiceType, true);
                
                const invoice: Invoice = {
                    id: invoiceId,
                    type: invoiceType,
                    number: nextNumber,
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
                    status: Number((order.paid_amount || 0).toFixed(2)) >= Number(order.total.toFixed(2)) ? 'paid' : ((order.paid_amount || 0) > 0 ? 'partially_paid' : 'unpaid')
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
                payment = { ...payment, amount: requirePositiveCurrency(payment.amount, 'Payment amount') };
                console.log('Recording payment:', { orderId, payment });

                // 1. Get Order
                const { data: orderData, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
                if (orderError) {
                    console.error('Error fetching order:', orderError);
                    throw orderError;
                }

                const order = orderData;
                const isPO = order.type === 'purchase_order';
                const balanceDue = roundCurrency((order.total || 0) - (order.paid_amount || 0));
                if (payment.amount > balanceDue) {
                    throw new Error(`Payment cannot exceed the balance due of ${balanceDue.toFixed(2)}.`);
                }

                console.log('Order fetched:', order);

                // 2. Create Voucher
                const voucher = {
                    id: crypto.randomUUID(),
                    number: `${isPO ? 'PAY' : 'RCP'}-${Date.now().toString().substr(-6)}`,
                    date: payment.date,
                    type: isPO ? 'payment' : 'receipt',
                    party_id: order.party_id,
                    party_name: order.party_name,
                    amount: Number(payment.amount.toFixed(2)),
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
                const newPaidAmount = Number(((order.paid_amount || 0) + payment.amount).toFixed(2));
                const newStatus = newPaidAmount >= Number(order.total.toFixed(2)) ? 'paid' : 'partially_paid';

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

                // 3b. If order is converted to an invoice, automatically update in the sales/purchase invoices table
                if (order.invoice_id) {
                    const { data: invData, error: invFetchError } = await supabase.from('invoices').select('paid_amount, total').eq('id', order.invoice_id).single();
                    if (!invFetchError && invData) {
                        const invPaidAmount = Number(((invData.paid_amount || 0) + payment.amount).toFixed(2));
                        const invStatus = invPaidAmount >= Number(invData.total.toFixed(2)) ? 'paid' : (invPaidAmount > 0 ? 'partially_paid' : 'unpaid');
                        
                        console.log('Syncing payment to associated invoice:', { id: order.invoice_id, invPaidAmount, invStatus });
                        await supabase.from('invoices')
                            .update({
                                paid_amount: invPaidAmount,
                                status: invStatus
                            })
                            .eq('id', order.invoice_id);
                    }
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

                    console.log('Updating party balance:', { oldBalance: partyData.balance, newBalance: Number(newBalance.toFixed(2)) });
                    const { error: partyUpdateError } = await supabase.from('parties').update({ balance: Number(newBalance.toFixed(2)) }).eq('id', order.party_id);
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
                basicSalary: roundCurrency(e.basic_salary),
                balance: roundCurrency(e.balance || 0)
            }));
        },
        add: async (employee: Employee): Promise<void> => {
            employee = {
                ...employee,
                basicSalary: roundCurrency(employee.basicSalary),
                balance: roundCurrency(employee.balance)
            };
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
            employee = {
                ...employee,
                basicSalary: roundCurrency(employee.basicSalary),
                balance: roundCurrency(employee.balance)
            };
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
            // Since id is UUID in DB, and code might pass custom string IDs,
            // we resolve by checking if a record for the employee and date exists.
            const { data: existing, error: fetchError } = await supabase
                .from('attendance')
                .select('id')
                .eq('employee_id', record.employeeId)
                .eq('date', record.date)
                .maybeSingle();

            if (fetchError) {
                console.error('Error checking existing attendance:', fetchError);
            }

            if (existing) {
                const { error: updateError } = await supabase
                    .from('attendance')
                    .update({ status: record.status, note: record.note })
                    .eq('id', existing.id);
                handleSupabaseError(updateError);
            } else {
                const dbRecord = {
                    id: generateUUID(),
                    employee_id: record.employeeId,
                    date: record.date,
                    status: record.status,
                    note: record.note
                };
                const { error: insertError } = await supabase
                    .from('attendance')
                    .insert(dbRecord);
                handleSupabaseError(insertError);
            }
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
                basicSalary: roundCurrency(s.basic_salary),
                presentDays: s.present_days,
                totalDays: s.total_days,
                deductions: roundCurrency(s.deductions),
                bonus: roundCurrency(s.bonus),
                netSalary: roundCurrency(s.net_salary),
                paymentDate: s.payment_date
            }));
        },
        add: async (slip: SalarySlip): Promise<void> => {
            slip = {
                ...slip,
                basicSalary: roundCurrency(slip.basicSalary),
                deductions: roundCurrency(slip.deductions),
                bonus: roundCurrency(slip.bonus),
                netSalary: roundCurrency(slip.netSalary)
            };
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
                const newBalance = roundCurrency((employee.balance || 0) - slip.netSalary);
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
    },



    reports: {
        async getDashboardStats() {
            try {
                // Get orders
                const { data: orders, error: ordersError } = await supabase
                    .from('orders')
                    .select('total, payment_status, status');

                if (ordersError) {
                    console.error('Error fetching orders for dashboard:', ordersError);
                    return {
                        totalSales: 0,
                        totalOrders: 0,
                        pendingOrders: 0,
                        receivables: 0
                    };
                }

                // Get invoices (for receivables)
                const { data: invoices, error: invoicesError } = await supabase
                    .from('invoices')
                    .select('total, status')
                    .eq('type', 'sale');

                if (invoicesError) {
                    console.error('Error fetching invoices for dashboard:', invoicesError);
                }

                // Calculate stats
                const totalSales = orders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;
                const totalOrders = orders?.length || 0;
                const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0;

                // Calculate receivables (unpaid invoices)
                const receivables = invoices?.filter(i => i.status === 'pending')
                    .reduce((sum, inv) => sum + (inv.total || 0), 0) || 0;

                return {
                    totalSales,
                    totalOrders,
                    pendingOrders,
                    receivables
                };
            } catch (error) {
                console.error('Error in getDashboardStats:', error);
                return {
                    totalSales: 0,
                    totalOrders: 0,
                    pendingOrders: 0,
                    receivables: 0
                };
            }
        },

        async getMonthlySales() {
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('total, date')
                    .gte('date', new Date(new Date().getFullYear(), 0, 1).toISOString())
                    .order('date', { ascending: true });

                if (error) {
                    console.error('Error fetching monthly sales:', error);
                    return new Array(12).fill(0).map((_, i) => ({
                        name: new Date(0, i).toLocaleString('default', { month: 'short' }),
                        sales: 0
                    }));
                }

                // Aggregate by month
                const monthlyData = new Array(12).fill(0).map((_, i) => ({
                    name: new Date(0, i).toLocaleString('default', { month: 'short' }),
                    sales: 0
                }));

                data?.forEach(order => {
                    const date = new Date(order.date);
                    const month = date.getMonth();
                    monthlyData[month].sales += order.total || 0;
                });

                return monthlyData;
            } catch (error) {
                console.error('Error in getMonthlySales:', error);
                return new Array(12).fill(0).map((_, i) => ({
                    name: new Date(0, i).toLocaleString('default', { month: 'short' }),
                    sales: 0
                }));
            }
        },

        async getRecentActivity() {
            try {
                // Get recent orders
                const { data: orders, error: ordersError } = await supabase
                    .from('orders')
                    .select('id, number, date, total, status, party_name')
                    .order('date', { ascending: false })
                    .limit(5);

                if (ordersError) {
                    console.error('Error fetching recent orders:', ordersError);
                }

                // Get recent designs
                const { data: designs, error: designsError } = await supabase
                    .from('custom_designs')
                    .select('id, name, created_date, estimated_cost, status, customer_name')
                    .order('created_date', { ascending: false })
                    .limit(5);

                if (designsError) {
                    console.error('Error fetching recent designs:', designsError);
                }

                // Combine and sort
                const activities = [
                    ...(orders?.map(o => ({
                        type: 'order',
                        id: o.id,
                        title: `Order #${o.number}`,
                        subtitle: o.party_name || 'Unknown Customer',
                        date: o.date,
                        amount: o.total,
                        status: o.status
                    })) || []),
                    ...(designs?.map(d => ({
                        type: 'design',
                        id: d.id,
                        title: d.name,
                        subtitle: d.customer_name || 'Draft',
                        date: d.created_date,
                        amount: d.estimated_cost,
                        status: d.status
                    })) || [])
                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 5);

                return activities;
            } catch (error) {
                console.error('Error in getRecentActivity:', error);
                return [];
            }
        },

        async getLowStockItems() {
            try {
                const { data: items, error: itemsError } = await supabase
                    .from('items')
                    .select('id, name, stock, min_stock, unit');

                if (itemsError) {
                    console.error('Error fetching low stock items:', itemsError);
                    return [];
                }

                // Only flag items with an actual configured threshold -- otherwise
                // every brand-new item (stock 0, min_stock unset/0) would trip this
                // the moment it's created, before anyone's had a chance to stock it.
                return items?.filter(item => (item.min_stock || 0) > 0 && item.stock <= item.min_stock) || [];
            } catch (error) {
                console.error('Error in getLowStockItems:', error);
                return [];
            }
        }
    },

    settings: {
        /**
         * Get pricing configuration from settings
         * @returns PricingConfig object
         */
        async getPricing(): Promise<any> {
            const { data, error } = await supabase
                .from('settings')
                .select('pricing_config')
                .eq('id', 'default')
                .single();

            if (error || !data) {
                // Only log as warning since we have fallback defaults
                if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                    console.warn('Settings table not configured, using default pricing:', error.message);
                }
                // Return default if not found
                return {
                    baseRatePerSqft: 0,
                    holeCharge: 50,
                    cutCharge: 30,
                    complexityMultiplier: { simple: 1.0, medium: 1.0, complex: 1.0 },
                    edgeFinishing: { polished: 0, beveled: 0, none: 0 },
                    minimumCharge: 0,
                    termsAndConditions: ''
                };
            }

            const config = data.pricing_config;
            return {
                ...config,
                baseRatePerSqft: 0,
                holeCharge: roundCurrency(config.holeCharge),
                cutCharge: roundCurrency(config.cutCharge),
                minimumCharge: 0,
                complexityMultiplier: { simple: 1, medium: 1, complex: 1 },
                edgeFinishing: { polished: 0, beveled: 0, none: 0 }
            };
        },

        /**
         * Update pricing configuration
         * @param config - New pricing configuration
         */
        async updatePricing(config: any): Promise<void> {
            config = {
                ...config,
                baseRatePerSqft: 0,
                holeCharge: roundCurrency(config.holeCharge),
                cutCharge: roundCurrency(config.cutCharge),
                minimumCharge: 0,
                complexityMultiplier: { simple: 1, medium: 1, complex: 1 },
                edgeFinishing: { polished: 0, beveled: 0, none: 0 }
            };
            const { error } = await supabase
                .from('settings')
                .upsert({
                    id: 'default',
                    pricing_config: config,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error updating pricing config:', error);
                throw error;
            }
        },

        getProductGroups(): { glass: string[]; hardware: string[] } {
            return {
                glass: ['Clear Float', 'Toughened', 'Tinted', 'Reflective', 'Fluted', 'Mirrors'],
                hardware: ['Handles', 'Locks', 'Hinges', 'Patch Fittings', 'Floor Springs', 'Shower Hardware', 'Sliding Systems', 'Brackets & Clamps']
            };
        },

        async getShopProductGroups(): Promise<{ glass: string[]; hardware: string[] }> {
            const defaults = db.settings.getProductGroups();
            const { data, error } = await supabase
                .from('settings')
                .select('pricing_config')
                .eq('id', 'default')
                .single();

            if (error || !data?.pricing_config?.shopProductGroups) {
                return defaults;
            }

            return {
                glass: Array.isArray(data.pricing_config.shopProductGroups.glass) ? data.pricing_config.shopProductGroups.glass : defaults.glass,
                hardware: Array.isArray(data.pricing_config.shopProductGroups.hardware) ? data.pricing_config.shopProductGroups.hardware : defaults.hardware
            };
        },

        async updateShopProductGroups(groups: { glass: string[]; hardware: string[] }): Promise<void> {
            const { data: existing } = await supabase
                .from('settings')
                .select('pricing_config')
                .eq('id', 'default')
                .single();

            const pricingConfig = {
                ...(existing?.pricing_config || {}),
                shopProductGroups: {
                    glass: groups.glass.map(group => group.trim()).filter(Boolean),
                    hardware: groups.hardware.map(group => group.trim()).filter(Boolean)
                }
            };

            const { error } = await supabase
                .from('settings')
                .upsert({
                    id: 'default',
                    pricing_config: pricingConfig,
                    updated_at: new Date().toISOString()
                });

            handleSupabaseError(error);
        },

        /**
         * Get thickness-based pricing rates
         * @returns Array of thickness pricing configurations
         */
        async getThicknessPricing(): Promise<Array<{ thickness: number; ratePerSqft: number }>> {
            const { data, error } = await supabase
                .from('thickness_pricing')
                .select('thickness, rate_per_sqft')
                .order('thickness');

            if (error) {
                console.warn('Thickness pricing table not found, using defaults:', error.message);
                // Return default thickness pricing if table doesn't exist yet
                return [
                    { thickness: 3.5, ratePerSqft: 100 },
                    { thickness: 4, ratePerSqft: 110 },
                    { thickness: 5, ratePerSqft: 120 },
                    { thickness: 6, ratePerSqft: 130 },
                    { thickness: 8, ratePerSqft: 150 },
                    { thickness: 10, ratePerSqft: 180 },
                    { thickness: 12, ratePerSqft: 210 },
                    { thickness: 15, ratePerSqft: 250 },
                    { thickness: 19, ratePerSqft: 300 }
                ];
            }

            if (!data || data.length === 0) {
                return [
                    { thickness: 3.5, ratePerSqft: 100 },
                    { thickness: 4, ratePerSqft: 110 },
                    { thickness: 5, ratePerSqft: 120 },
                    { thickness: 6, ratePerSqft: 130 },
                    { thickness: 8, ratePerSqft: 150 },
                    { thickness: 10, ratePerSqft: 180 },
                    { thickness: 12, ratePerSqft: 210 },
                    { thickness: 15, ratePerSqft: 250 },
                    { thickness: 19, ratePerSqft: 300 }
                ];
            }

            return data.map(item => ({
                thickness: Number(item.thickness),
                ratePerSqft: roundCurrency(item.rate_per_sqft)
            }));
        },

        /**
         * Update thickness-based pricing rates
         * @param thicknessPricing - Array of thickness pricing configurations to save
         */
        async updateThicknessPricing(thicknessPricing: Array<{ thickness: number; ratePerSqft: number }>): Promise<void> {
            try {
                // Delete all existing thickness pricing
                const { error: deleteError } = await supabase
                    .from('thickness_pricing')
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

                if (deleteError) {
                    console.error('Error deleting existing thickness pricing:', deleteError);
                    throw deleteError;
                }

                // Insert new thickness pricing
                if (thicknessPricing.length > 0) {
                    const { error: insertError } = await supabase
                        .from('thickness_pricing')
                        .insert(thicknessPricing.map(item => ({
                            thickness: item.thickness,
                            rate_per_sqft: roundCurrency(item.ratePerSqft)
                        })));

                    if (insertError) {
                        console.error('Error inserting thickness pricing:', insertError);
                        throw insertError;
                    }
                }
            } catch (error) {
                console.error('Error updating thickness pricing:', error);
                throw error;
            }
        }
    },

    businessConfig: {
        /**
         * Default business configuration for Arjun Glass House
         */
        getDefaults(): BusinessConfig {
            return {
                businessName: 'Arjun Glass House',
                tagline: 'Premium Glass Solutions',
                gstin: '',
                pan: '',
                address: '',
                city: '',
                state: 'Punjab',
                stateCode: '03',
                pincode: '',
                phone: '',
                email: '',
                website: '',
                bankName: '',
                bankAccountNumber: '',
                bankIfsc: '',
                bankBranch: '',
                upiId: '',
                paymentInstructions: 'Payment is verified by staff after receipt. Please mention the order number while paying.',
                defaultGstRate: 18,
                defaultGstType: 'intra_state',
                invoicePrefix: 'AGH',
                financialYearStart: 4, // April
                deliveryChargeRules: [
                    { id: 'local', place: 'Local delivery', charge: 0 },
                    { id: 'city', place: 'Within city', charge: 500 },
                    { id: 'nearby', place: 'Nearby area', charge: 1000 }
                ],
                installationChargePerSqft: 0,
                unitPreferences: {
                    defaultCountUnit: 'nos',
                    defaultGlassBillingUnit: 'sqft',
                    unknownUnitFallback: 'nos',
                },
                tallyServerIp: '192.168.1.100',
                tallyServerPort: '9000',
                tallyCompanyName: 'Arjun Glass House',
                tallyAutoSyncEnabled: false,
                tallySyncInterval: 60, // 1 hour
                tallyLastSyncTime: '',
                tallySyncLogs: [],
                customAccounts: [
                    { id: '12345678-1111-1111-1111-111111111111', name: 'Salary Expense', type: 'expense' },
                    { id: '12345678-2222-2222-2222-222222222222', name: 'Rent Expense', type: 'expense' },
                    { id: '12345678-3333-3333-3333-333333333333', name: 'Electricity Expense', type: 'expense' },
                    { id: '12345678-4444-4444-4444-444444444444', name: 'Office Expense', type: 'expense' },
                    { id: '12345678-5555-5555-5555-555555555555', name: 'Expense Reimbursements', type: 'expense' },
                    { id: '12345678-6666-6666-6666-666666666666', name: 'Sales Revenue', type: 'revenue' },
                    { id: '12345678-7777-7777-7777-777777777777', name: 'Purchase Cost', type: 'expense' },
                    { id: '12345678-8888-8888-8888-888888888888', name: 'Miscellaneous Expense', type: 'expense' }
                ]
            };
        },

        /**
         * Get business configuration
         */
        async get(): Promise<BusinessConfig> {
            const { data, error } = await supabase
                .from('settings')
                .select('business_config')
                .eq('id', 'default')
                .single();

            if (error || !data || !data.business_config) {
                return db.businessConfig.getDefaults();
            }

            return { ...db.businessConfig.getDefaults(), ...data.business_config };
        },

        /**
         * Update business configuration
         */
        async update(config: BusinessConfig): Promise<void> {
            // First get existing settings to preserve other fields
            const { data: existing } = await supabase
                .from('settings')
                .select('*')
                .eq('id', 'default')
                .single();

            const upsertData: any = {
                id: 'default',
                business_config: config,
                updated_at: new Date().toISOString()
            };

            // Preserve existing pricing_config if it exists
            if (existing?.pricing_config) {
                upsertData.pricing_config = existing.pricing_config;
            }

            const { error } = await supabase
                .from('settings')
                .upsert(upsertData);

            if (error) {
                console.error('Error updating business config:', error);
                throw error;
            }
        },

        /**
         * Get next sequential invoice number based on financial year
         * Format: PREFIX/YY-YY/NNN (e.g., AGH/25-26/001)
         */
        async getNextInvoiceNumber(type: 'sale' | 'purchase', fromOrder?: boolean): Promise<string> {
            const config = await db.businessConfig.get();
            const prefix = type === 'sale' ? (config.invoicePrefix || 'AGH') : 'PUR';
            const fyStart = config.financialYearStart || 4; // Default April

            // Calculate current financial year
            const now = new Date();
            const currentMonth = now.getMonth() + 1; // 1-indexed
            const currentYear = now.getFullYear();

            let fyStartYear: number;
            if (currentMonth >= fyStart) {
                fyStartYear = currentYear;
            } else {
                fyStartYear = currentYear - 1;
            }
            const fyEndYear = fyStartYear + 1;
            const fyLabel = `${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;

            // Get the highest invoice number for this financial year
            const fyStartDate = new Date(fyStartYear, fyStart - 1, 1).toISOString().split('T')[0];
            const fyEndDate = new Date(fyEndYear, fyStart - 1, 1).toISOString().split('T')[0];

            const { data: invoices, error } = await supabase
                .from('invoices')
                .select('number')
                .eq('type', type)
                .gte('date', fyStartDate)
                .lt('date', fyEndDate)
                .order('created_at', { ascending: false })
                .limit(50);

            let nextNumber = 1;
            if (!error && invoices && invoices.length > 0) {
                // Find highest number in the pattern PREFIX/YY-YY/NNN
                for (const inv of invoices) {
                    if (inv.number.startsWith(`${prefix}/`)) {
                        const match = inv.number.match(/(\d+)$/);
                        if (match) {
                            const num = parseInt(match[1]);
                            if (num >= nextNumber) {
                                nextNumber = num + 1;
                            }
                        }
                    }
                }
            }

            return `${prefix}/${fyLabel}/${String(nextNumber).padStart(3, '0')}`;
        }
    }
};

// Mappers
function mapItemFromDB(dbItem: any): GlassItem {
    const stock = dbItem.stock || 0;
    let warehouseStock = dbItem.warehouse_stock || { 'Warehouse A': 0, 'Warehouse B': 0 };
    const defaultRateUnit = dbItem.category === 'glass' ? 'sqft' : (dbItem.unit || 'nos');
    
    // Fallback if warehouses are unassigned but total stock is defined
    const wA = warehouseStock['Warehouse A'] || 0;
    const wB = warehouseStock['Warehouse B'] || 0;
    if (wA === 0 && wB === 0 && stock > 0) {
        warehouseStock = {
            'Warehouse A': stock,
            'Warehouse B': 0
        };
    }

    return {
        id: dbItem.id,
        name: dbItem.name,
        category: dbItem.category,
        type: dbItem.type,
        productGroup: dbItem.product_group,
        showOnline: dbItem.show_online ?? false,
        imageUrl: dbItem.image_url,
        make: dbItem.make,
        model: dbItem.model,
        thickness: dbItem.thickness,
        width: dbItem.width,
        height: dbItem.height,
        unit: dbItem.unit,
        stock: dbItem.stock,
        warehouseStock,
        minStock: dbItem.min_stock,
        rate: roundCurrency(dbItem.rate),
        rateUnit: dbItem.rate_unit || defaultRateUnit,
        purchaseRate: dbItem.purchase_rate === undefined ? undefined : roundCurrency(dbItem.purchase_rate),
        purchaseRateUnit: dbItem.purchase_rate_unit || dbItem.rate_unit || defaultRateUnit,
        hsnCode: dbItem.hsn_code,
        conversionFactor: dbItem.conversion_factor
    };
}

function mapItemToDB(item: GlassItem): any {
    const defaultRateUnit = item.category === 'glass' ? 'sqft' : (item.unit || 'nos');

    return {
        id: item.id,
        name: item.name,
        category: item.category,
        type: item.type,
        product_group: item.productGroup || null,
        show_online: item.showOnline || false,
        image_url: item.imageUrl || null,
        make: item.make,
        model: item.model,
        thickness: item.thickness,
        width: item.width,
        height: item.height,
        unit: item.unit,
        stock: item.stock,
        warehouse_stock: item.warehouseStock,
        min_stock: item.minStock,
        rate: roundCurrency(item.rate),
        rate_unit: item.rateUnit || defaultRateUnit,
        purchase_rate: item.purchaseRate === undefined ? undefined : roundCurrency(item.purchaseRate),
        purchase_rate_unit: item.purchaseRateUnit || item.rateUnit || defaultRateUnit,
        hsn_code: item.hsnCode,
        conversion_factor: item.conversionFactor
    };
}

// Custom Designs storage
export const designsDb = {
    async getAll(): Promise<CustomDesign[]> {
        const { data, error } = await supabase
            .from('custom_designs')
            .select('*')
            .order('created_date', { ascending: false });

        if (error) {
            handleSupabaseError(error);
            return [];
        }

        return (data || []).map(d => ({
            id: d.id,
            name: d.name,
            customerId: d.customer_id,
            customerName: d.customer_name,
            drawingData: d.drawing_data,
            baseShape: d.base_shape,
            totalArea: d.total_area,
            grossArea: d.gross_area,
            holes: d.holes,
            cuts: d.cuts,
            complexityLevel: d.complexity_level,
            baseRate: roundCurrency(d.base_rate),
            complexityCharge: roundCurrency(d.complexity_charge),
            edgeFinishingCharge: roundCurrency(d.edge_finishing_charge),
            estimatedCost: roundCurrency(d.estimated_cost),
            status: d.status,
            createdDate: d.created_date,
            approvedDate: d.approved_date,
            notes: d.notes,
            orderId: d.order_id
        }));
    },

    async getById(id: string): Promise<CustomDesign | null> {
        const { data, error } = await supabase
            .from('custom_designs')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            handleSupabaseError(error);
            return null;
        }

        if (!data) return null;

        return {
            id: data.id,
            name: data.name,
            customerId: data.customer_id,
            customerName: data.customer_name,
            drawingData: data.drawing_data,
            baseShape: data.base_shape,
            totalArea: data.total_area,
            grossArea: data.gross_area,
            holes: data.holes,
            cuts: data.cuts,
            complexityLevel: data.complexity_level,
            baseRate: roundCurrency(data.base_rate),
            complexityCharge: roundCurrency(data.complexity_charge),
            edgeFinishingCharge: roundCurrency(data.edge_finishing_charge),
            estimatedCost: roundCurrency(data.estimated_cost),
            status: data.status,
            createdDate: data.created_date,
            approvedDate: data.approved_date,
            notes: data.notes,
            orderId: data.order_id
        };
    },

    async add(design: CustomDesign): Promise<void> {
        try {
            const { error } = await supabase.from('custom_designs').insert({
                id: design.id,
                name: design.name,
                customer_id: design.customerId,
                customer_name: design.customerName,
                drawing_data: design.drawingData,
                base_shape: design.baseShape,
                total_area: design.totalArea,
                gross_area: design.grossArea,
                holes: design.holes,
                cuts: design.cuts,
                complexity_level: design.complexityLevel,
                base_rate: roundCurrency(design.baseRate),
                complexity_charge: roundCurrency(design.complexityCharge),
                edge_finishing_charge: roundCurrency(design.edgeFinishingCharge),
                estimated_cost: roundCurrency(design.estimatedCost),
                status: design.status,
                created_date: design.createdDate,
                approved_date: design.approvedDate,
                notes: design.notes,
                order_id: design.orderId
            });

            if (error) {
                console.error('Error adding design to Supabase:', error);
                throw new Error(`Failed to save design: ${error.message}`);
            }
        } catch (error: any) {
            console.error('Error in designsDb.add:', error);
            throw new Error(error.message || 'Failed to create design');
        }
    },

    async update(design: CustomDesign): Promise<void> {
        try {
            const { error } = await supabase
                .from('custom_designs')
                .update({
                    name: design.name,
                    customer_id: design.customerId,
                    customer_name: design.customerName,
                    drawing_data: design.drawingData,
                    base_shape: design.baseShape,
                    total_area: design.totalArea,
                    gross_area: design.grossArea,
                    holes: design.holes,
                    cuts: design.cuts,
                    complexity_level: design.complexityLevel,
                    base_rate: roundCurrency(design.baseRate),
                    complexity_charge: roundCurrency(design.complexityCharge),
                    edge_finishing_charge: roundCurrency(design.edgeFinishingCharge),
                    estimated_cost: roundCurrency(design.estimatedCost),
                    status: design.status,
                    approved_date: design.approvedDate,
                    notes: design.notes,
                    order_id: design.orderId
                })
                .eq('id', design.id);

            if (error) {
                console.error('Error updating design in Supabase:', error);
                throw new Error(`Failed to update design: ${error.message}`);
            }
        } catch (error: any) {
            console.error('Error in designsDb.update:', error);
            throw new Error(error.message || 'Failed to update design');
        }
    },

    async delete(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('custom_designs')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting design from Supabase:', error);
                throw new Error(`Failed to delete design: ${error.message}`);
            }
        } catch (error: any) {
            console.error('Error in designsDb.delete:', error);
            throw new Error(error.message || 'Failed to delete design');
        }
    },

    /**
     * Convert a custom design to a sales order
     * @param designId - ID of the design to convert
     * @param deliveryDate - Expected delivery date for the order
     * @param orderNotes - Additional notes for the order
     * @returns The created order
     */
    async convertToOrder(designId: string, deliveryDate: string, orderNotes: string): Promise<Order> {
        // 1. Get the design
        const design = await this.getById(designId);
        if (!design) {
            throw new Error('Design not found');
        }

        // 2. Validate design can be converted
        if (design.status !== 'approved') {
            throw new Error('Only approved designs can be converted to orders');
        }

        if (design.orderId) {
            throw new Error('Design has already been converted to an order');
        }

        if (!design.customerId) {
            throw new Error('Design must have a customer before converting to order');
        }

        // 3. Generate order number
        const orderNumber = await db.orders.generateNextOrderNumber('sale_order');

        // 4. Create the order
        const newOrder: Order = {
            id: generateUUID(),
            type: 'sale_order',
            number: orderNumber,
            date: new Date().toISOString().split('T')[0],
            deliveryDate: deliveryDate,
            partyId: design.customerId,
            partyName: design.customerName || '',
            items: [{
                id: generateUUID(),
                itemId: design.id,
                itemName: `Custom Glass - ${design.name}`,
                description: `Custom designed glass piece\nArea: ${design.totalArea.toFixed(2)} sqft\n\nDesign Details:\n- Gross Area: ${design.grossArea.toFixed(2)} sqft\n- Holes: ${design.holes}\n- Cuts: ${design.cuts}`,
                width: 0,
                height: 0,
                quantity: 1,
                unit: 'pcs' as any,
                sqft: design.totalArea,
                rate: design.estimatedCost,
                amount: design.estimatedCost,
            }],
            subtotal: design.estimatedCost,
            taxRate: 0,
            taxAmount: 0,
            total: design.estimatedCost,
            status: 'pending',
            notes: orderNotes,
            paidAmount: 0,
            paymentStatus: 'unpaid',
        };

        // 5. Save the order
        await db.orders.add(newOrder);

        // 6. Update the design
        await this.update({
            ...design,
            orderId: newOrder.id,
            status: 'converted',
        });

        return newOrder;
    }
};
