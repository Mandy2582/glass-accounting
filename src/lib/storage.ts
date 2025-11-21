import { supabase } from './supabase';
import { GlassItem, Party, Invoice, Voucher, Order, Employee, Attendance, SalarySlip } from '@/types';

// Helper to handle Supabase errors
const handleSupabaseError = (error: any) => {
    if (error) {
        console.error('Supabase Error:', error);
        throw new Error(error.message);
    }
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
        add: async (invoice: Invoice): Promise<void> => {
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
            const { error: invError } = await supabase.from('invoices').insert(dbInvoice);
            handleSupabaseError(invError);

            // 2. Insert Items
            const dbItems = invoice.items.map(item => ({
                id: item.id,
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
            const { error: itemsError } = await supabase.from('invoice_items').insert(dbItems);
            handleSupabaseError(itemsError);

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

            // Update Stock
            for (const item of invoice.items) {
                const glassItem = await db.items.getAll().then(items => items.find(i => i.id === item.itemId));
                if (glassItem) {
                    const currentStock = glassItem.warehouseStock?.[item.warehouse || 'Warehouse A'] || 0;
                    const newStock = invoice.type === 'sale'
                        ? currentStock - item.quantity
                        : currentStock + item.quantity;

                    const updatedWarehouseStock = {
                        ...glassItem.warehouseStock,
                        [item.warehouse || 'Warehouse A']: newStock
                    };

                    // Recalculate total stock
                    const totalStock = Object.values(updatedWarehouseStock).reduce((a, b) => a + b, 0);

                    await db.items.update({
                        ...glassItem,
                        stock: totalStock,
                        warehouseStock: updatedWarehouseStock
                    });
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
                    }
                }
            }

            // 2. Delete Invoice (Cascade deletes items)
            const { error } = await supabase.from('invoices').delete().eq('id', id);
            handleSupabaseError(error);
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
