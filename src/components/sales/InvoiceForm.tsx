'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import { db } from '@/lib/storage';
import { Invoice, InvoiceItem, GlassItem, Party, BusinessConfig, GSTType } from '@/types';
import NumericInput from '@/components/NumericInput';
import PartyModal from '@/components/parties/PartyModal';
import ItemModal from '@/components/inventory/ItemModal';
import ItemSearchSelect from '@/components/ItemSearchSelect';
import { formatInchesToFraction, generateUUID, roundCurrency } from '@/lib/utils';
import { calculateLineAmounts, convertQuantityForItemUnit, convertRateForItemUnit, getUnitOptionsForItem } from '@/lib/units';

interface InvoiceFormProps {
    initialData?: Invoice;
    onSave: (invoice: Invoice) => Promise<void>;
    onCancel: () => void;
}

export default function InvoiceForm({ initialData, onSave, onCancel }: InvoiceFormProps) {
    const [items, setItems] = useState<GlassItem[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [businessConfig, setBusinessConfig] = useState<BusinessConfig | null>(null);

    const [selectedPartyId, setSelectedPartyId] = useState(initialData?.partyId || '');
    const [invoiceDate, setInvoiceDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
    const [invoiceNumber, setInvoiceNumber] = useState(initialData?.number || '');
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(initialData?.items || []);
    const [gstRate, setGstRate] = useState(initialData?.taxRate || 18);
    const [gstType, setGstType] = useState<GSTType>('intra_state');
    const [loading, setLoading] = useState(false);
    const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
    const [showNewItemModal, setShowNewItemModal] = useState(false);
    const [pendingItemRowIndex, setPendingItemRowIndex] = useState<number | null>(null);

    useEffect(() => {
        const loadData = async () => {
            const [itemsData, partiesData, config] = await Promise.all([
                db.items.getAll(),
                db.parties.getAll(),
                db.businessConfig.get()
            ]);
            setItems(itemsData);
            setParties(partiesData);
            setBusinessConfig(config);
            setGstType(config.defaultGstType || 'intra_state');

            if (!initialData?.taxRate && config.defaultGstRate) {
                setGstRate(config.defaultGstRate);
            }

            // Auto-generate invoice number for new invoices
            if (!initialData) {
                const nextNumber = await db.businessConfig.getNextInvoiceNumber('sale');
                setInvoiceNumber(nextNumber);
            }
        };
        loadData();
    }, []);

    const handleSaveNewCustomer = async (partyData: Omit<Party, 'id'>) => {
        const newParty: Party = {
            ...partyData,
            id: generateUUID(),
            type: 'customer',
        };
        await db.parties.add(newParty);
        const partiesData = await db.parties.getAll();
        setParties(partiesData);
        setSelectedPartyId(newParty.id);
        setShowNewCustomerModal(false);
    };

    const handleSaveNewItem = async (itemData: Omit<GlassItem, 'id'>) => {
        const newItem: GlassItem = {
            ...itemData,
            id: generateUUID(),
        };
        await db.items.add(newItem);
        const itemsData = await db.items.getAll();
        setItems(itemsData);
        if (pendingItemRowIndex !== null) {
            setInvoiceItems(prev => prev.map((row, index) => {
                if (index !== pendingItemRowIndex) return row;
                const width = newItem.width || 0;
                const height = newItem.height || 0;
                const qty = row.quantity || 1;
                const unit = newItem.rateUnit || newItem.unit;
                const calculated = calculateLineAmounts({
                    width,
                    height,
                    quantity: qty,
                    unit,
                    rate: newItem.rate,
                    taxRate: gstRate,
                    conversionFactor: newItem.conversionFactor,
                    unitFallback: businessConfig?.unitPreferences?.unknownUnitFallback,
                });
                return {
                    ...row,
                    itemId: newItem.id,
                    itemName: newItem.name,
                    make: newItem.make,
                    model: newItem.model,
                    type: newItem.type,
                    warehouse: 'Warehouse A',
                    width,
                    height,
                    rate: newItem.rate,
                    unit,
                    sqft: calculated.sqft,
                    amount: calculated.amount,
                    lineTotal: calculated.lineTotal,
                };
            }));
        }
        setPendingItemRowIndex(null);
        setShowNewItemModal(false);
    };

    useEffect(() => {
        setInvoiceItems(prev => prev.map(item => {
            const catalogItem = items.find(i => i.id === item.itemId);
            const calculated = calculateLineAmounts({
                width: item.width,
                height: item.height,
                quantity: item.quantity,
                unit: item.unit,
                rate: item.rate,
                taxRate: gstRate,
                conversionFactor: catalogItem?.conversionFactor,
                unitFallback: businessConfig?.unitPreferences?.unknownUnitFallback,
            });
            return {
                ...item,
                sqft: calculated.sqft,
                amount: calculated.amount,
                lineTotal: calculated.lineTotal
            };
        }));
    }, [gstRate, items, businessConfig]);

    const addItem = () => {
        setInvoiceItems([
            ...invoiceItems,
            {
                itemId: '',
                itemName: '',
                width: 0,
                height: 0,
                quantity: 1,
                unit: 'sqft',
                sqft: 0,
                rate: 0,
                amount: 0,
                warehouse: 'Warehouse A'
            }
        ]);
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const newItems = [...invoiceItems];
        const previousUnit = newItems[index].unit || 'nos';
        const item = { ...newItems[index], [field]: value };

        // Auto-populate details if item selected
        if (field === 'itemId') {
            const selectedItem = items.find(i => i.id === value);
            if (selectedItem) {
                item.itemName = selectedItem.name;
                item.make = selectedItem.make;
                item.model = selectedItem.model;
                item.type = selectedItem.type;
                item.warehouse = 'Warehouse A'; // Default
                item.width = selectedItem.width || 0;
                item.height = selectedItem.height || 0;
                item.rate = selectedItem.rate;
                item.unit = selectedItem.rateUnit || selectedItem.unit;
            }
        }

        if (field === 'unit') {
            const catalogItem = items.find(i => i.id === item.itemId);
            item.rate = convertRateForItemUnit({
                rate: Number(item.rate) || 0,
                fromUnit: previousUnit,
                toUnit: String(value),
                width: item.width || catalogItem?.width,
                height: item.height || catalogItem?.height,
                conversionFactor: catalogItem?.conversionFactor,
            });
        }

        // Calculate Sqft and Amount
        if (['width', 'height', 'quantity', 'rate', 'itemId', 'unit'].includes(field)) {
            const width = field === 'width' ? Number(value) : item.width;
            const height = field === 'height' ? Number(value) : item.height;
            const qty = field === 'quantity' ? Number(value) : item.quantity;
            const rate = field === 'rate' ? Number(value) : item.rate;
            const unit = field === 'unit' ? value : item.unit;

            const catalogItem = items.find(i => i.id === item.itemId);
            const calculated = calculateLineAmounts({
                width,
                height,
                quantity: qty,
                unit,
                rate,
                taxRate: gstRate,
                conversionFactor: catalogItem?.conversionFactor,
                unitFallback: businessConfig?.unitPreferences?.unknownUnitFallback,
            });
            item.sqft = calculated.sqft;
            item.amount = calculated.amount;
            item.lineTotal = calculated.lineTotal;
        }

        newItems[index] = item;
        setInvoiceItems(newItems);
    };

    const removeItem = (index: number) => {
        setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    };

    const calculateSubtotal = () => {
        return roundCurrency(invoiceItems.reduce((sum, item) => sum + item.amount, 0));
    };

    const calculateTax = () => {
        const subtotal = calculateSubtotal();
        return roundCurrency(subtotal * (gstRate / 100));
    };

    const getCatalogItem = (item: InvoiceItem) => items.find(i => i.id === item.itemId);

    const getItemDetails = (item: InvoiceItem) => {
        const catalogItem = getCatalogItem(item);
        const make = item.make || catalogItem?.make;
        const type = item.model || item.type || catalogItem?.model || catalogItem?.type;
        const width = Number(item.width || catalogItem?.width) || 0;
        const height = Number(item.height || catalogItem?.height) || 0;
        const size = width > 0 && height > 0 ? `${formatInchesToFraction(width)}" x ${formatInchesToFraction(height)}"` : '';
        return [make, type, size].filter(Boolean).join(' • ') || 'Select catalogue item';
    };

    const getUnitGroups = (item: InvoiceItem) => {
        const catalogItem = getCatalogItem(item);
        return getUnitOptionsForItem(catalogItem || { category: item.type?.toLowerCase().includes('hardware') ? 'hardware' : 'glass', type: item.type, unit: item.unit });
    };

    const getValidUnit = (item: InvoiceItem) => {
        const groups = getUnitGroups(item);
        const allowed = groups.flatMap(group => group.units.map(unit => unit.value));
        return allowed.includes(item.unit) ? item.unit : allowed[0] || item.unit || 'nos';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPartyId || invoiceItems.length === 0) return;

        // Validate Warehouse
        if (invoiceItems.some(i => !i.warehouse)) {
            alert('Please select a warehouse for all items.');
            return;
        }

        setLoading(true);
        const subtotal = calculateSubtotal();
        const taxAmount = roundCurrency(subtotal * (gstRate / 100));
        const total = roundCurrency(subtotal + taxAmount);

        const party = parties.find(p => p.id === selectedPartyId);

        const invoice: Invoice = {
            id: initialData?.id || crypto.randomUUID(),
            type: 'sale',
            number: invoiceNumber,
            date: invoiceDate,
            partyId: selectedPartyId,
            partyName: party?.name || 'Unknown',
            items: invoiceItems,
            subtotal,
            taxRate: gstRate,
            taxAmount,
            total,
            status: initialData?.status || 'unpaid',
            paidAmount: initialData?.paidAmount || 0
        };

        // Validate stock availability for sales
        if (!initialData) { // Only validate for new sales, not edits
            for (const item of invoiceItems) {
                const glassItem = items.find(i => i.id === item.itemId);
                if (glassItem) {
                    const availableStock = glassItem.stock || 0;
                    const requestedStock = convertQuantityForItemUnit({
                        quantity: item.quantity,
                        fromUnit: item.unit,
                        toUnit: glassItem.unit,
                        width: item.width || glassItem.width,
                        height: item.height || glassItem.height,
                        conversionFactor: glassItem.conversionFactor,
                    });
                    if (requestedStock > availableStock) {
                        alert(`Insufficient stock for ${item.itemName}!\n\nRequested: ${requestedStock} ${glassItem.unit}\nAvailable: ${availableStock} ${glassItem.unit}\n\nPlease reduce the quantity or add more stock.`);
                        setLoading(false);
                        return;
                    }
                }
            }
        }

        await onSave(invoice);
    };

    const gstRateOptions = [0, 5, 12, 18, 28];
    const halfGst = gstRate / 2;

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={onCancel} className="btn" style={{ background: 'none', padding: 0 }}>
                    <ArrowLeft size={24} />
                </button>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{initialData ? 'Edit Invoice' : 'New Sales Invoice'}</h1>
            </div>

            <form onSubmit={handleSubmit} className="card" style={{ margin: '0 auto' }}>
                {/* Invoice Header Section */}
                <div className="form-grid form-grid-4" style={{ gap: '1.5rem', marginBottom: '2rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>Invoice No.</label>
                        <input
                            type="text"
                            className="input"
                            value={invoiceNumber}
                            onChange={e => setInvoiceNumber(e.target.value)}
                            style={{ fontWeight: 600, color: 'var(--color-primary)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>Customer</label>
                        <div className="quick-add-field">
                            <select
                                className="input"
                                required
                                value={selectedPartyId}
                                onChange={e => {
                                    if (e.target.value === '__add_customer__') {
                                        setShowNewCustomerModal(true);
                                    } else {
                                        setSelectedPartyId(e.target.value);
                                    }
                                }}
                            >
                                <option value="">Select Customer</option>
                                <option value="__add_customer__">+ Add New Customer</option>
                                {parties.filter(p => p.type === 'customer').map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                                {parties.filter(p => p.type !== 'customer').length > 0 && (
                                    <optgroup label="Other Parties">
                                        {parties.filter(p => p.type !== 'customer').map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <button
                                type="button"
                                className="quick-add-button"
                                onClick={() => setShowNewCustomerModal(true)}
                                title="Add New Customer"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>Date</label>
                        <input
                            type="date"
                            className="input"
                            required
                            value={invoiceDate}
                            onChange={e => setInvoiceDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>GST Rate</label>
                        <select
                            className="input"
                            value={gstRate}
                            onChange={e => setGstRate(Number(e.target.value))}
                        >
                            {gstRateOptions.map(rate => (
                                <option key={rate} value={rate}>{rate}%</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* GST Type selector */}
                {gstRate > 0 && (
                    <div style={{
                        display: 'flex',
                        gap: '1rem',
                        marginBottom: '1.5rem',
                        padding: '0.75rem 1rem',
                        background: '#f0fdf4',
                        borderRadius: '8px',
                        border: '1px solid #bbf7d0',
                        alignItems: 'center'
                    }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#166534' }}>GST Type:</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input
                                type="radio"
                                name="gstType"
                                value="intra_state"
                                checked={gstType === 'intra_state'}
                                onChange={() => setGstType('intra_state')}
                            />
                            Intra-State (CGST {halfGst}% + SGST {halfGst}%)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input
                                type="radio"
                                name="gstType"
                                value="inter_state"
                                checked={gstType === 'inter_state'}
                                onChange={() => setGstType('inter_state')}
                            />
                            Inter-State (IGST {gstRate}%)
                        </label>
                    </div>
                )}

                {/* Items Table */}
                <div className="table-responsive" style={{ marginBottom: '2rem' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '34%' }}>Item</th>
                                <th style={{ width: '12%' }}>Warehouse</th>
                                <th style={{ width: '9%' }}>Qty</th>
                                <th style={{ width: '14%' }}>Unit</th>
                                <th style={{ width: '11%' }}>Billing</th>
                                <th style={{ width: '11%' }}>Rate</th>
                                <th style={{ width: '12%' }}>Amount</th>
                                <th style={{ width: '4%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoiceItems.map((item, index) => (
                                <tr key={index}>
                                    <td>
                                        <div className="invoice-item-picker">
                                            <ItemSearchSelect
                                                items={items}
                                                value={item.itemId}
                                                onChange={itemId => updateItem(index, 'itemId', itemId)}
                                                onAddNew={() => {
                                                    setPendingItemRowIndex(index);
                                                    setShowNewItemModal(true);
                                                }}
                                                addLabel="Add New Item"
                                                placeholder="Search item by name, make, model..."
                                            />
                                            <small>{getItemDetails(item)}</small>
                                        </div>
                                    </td>
                                    <td>
                                        <select
                                            className="input"
                                            value={item.warehouse || ''}
                                            onChange={e => updateItem(index, 'warehouse', e.target.value)}
                                        >
                                            <option value="">Select</option>
                                            <option value="Warehouse A">Warehouse A</option>
                                            <option value="Warehouse B">Warehouse B</option>
                                        </select>
                                    </td>
                                    <td>
                                        <NumericInput
                                            className="input"
                                            value={item.quantity || ''}
                                            onChange={val => updateItem(index, 'quantity', val)}
                                            min={0}
                                            step={0.01}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="input"
                                            value={getValidUnit(item)}
                                            onChange={e => updateItem(index, 'unit', e.target.value)}
                                        >
                                            {getUnitGroups(item).map(group => (
                                                <optgroup key={group.label} label={group.label}>
                                                    {group.units.map(unit => (
                                                        <option key={unit.value} value={unit.value}>{unit.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <span className="invoice-billing-pill">
                                            {calculateLineAmounts({
                                                width: item.width,
                                                height: item.height,
                                                quantity: item.quantity,
                                                unit: item.unit,
                                                rate: item.rate,
                                                taxRate: gstRate,
                                                conversionFactor: getCatalogItem(item)?.conversionFactor,
                                            }).billingLabel}
                                        </span>
                                    </td>
                                    <td>
                                        <NumericInput
                                            className="input money-input"
                                            min="0"
                                            step="0.01"
                                            precision={2}
                                            value={item.rate || ''}
                                            onChange={val => updateItem(index, 'rate', val)}
                                        />
                                    </td>
                                    <td style={{ fontWeight: 600 }}>₹{item.amount.toFixed(2)}</td>
                                    <td>
                                        <button type="button" onClick={() => removeItem(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button type="button" onClick={addItem} className="btn" style={{ marginTop: '1rem', border: '1px dashed var(--color-border)', width: '100%' }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add Item
                    </button>
                </div>

                {/* Totals Section */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
                    <div style={{ width: '350px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Subtotal:</span>
                            <span style={{ fontWeight: 600 }}>₹{calculateSubtotal().toFixed(2)}</span>
                        </div>
                        {gstRate > 0 && (
                            <>
                                {gstType === 'intra_state' ? (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                            <span>CGST ({halfGst}%):</span>
                                            <span>₹{(calculateTax() / 2).toFixed(2)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                            <span>SGST ({halfGst}%):</span>
                                            <span>₹{(calculateTax() / 2).toFixed(2)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                        <span>IGST ({gstRate}%):</span>
                                        <span>₹{calculateTax().toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    <span>Total Tax:</span>
                                    <span>₹{calculateTax().toFixed(2)}</span>
                                </div>
                            </>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 700, marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '2px solid var(--color-border)' }}>
                            <span>Grand Total:</span>
                            <span style={{ color: 'var(--color-primary)' }}>₹{(calculateSubtotal() + calculateTax()).toFixed(2)}</span>
                        </div>

                        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem', padding: '0.75rem' }}>
                            <Save size={18} style={{ marginRight: '0.5rem' }} />
                            {loading ? 'Saving...' : 'Save Invoice'}
                        </button>
                    </div>
                </div>
            </form>
            <PartyModal
                isOpen={showNewCustomerModal}
                onClose={() => setShowNewCustomerModal(false)}
                onSave={handleSaveNewCustomer}
                initialData={{ type: 'customer' } as Party}
            />
            <ItemModal
                isOpen={showNewItemModal}
                onClose={() => {
                    setPendingItemRowIndex(null);
                    setShowNewItemModal(false);
                }}
                onSave={handleSaveNewItem}
            />
        </div>
    );
}
