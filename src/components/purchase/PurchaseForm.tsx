'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Eye } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem, Party, Invoice, InvoiceItem } from '@/types';

import PartyModal from '@/components/parties/PartyModal';
import ItemModal from '@/components/inventory/ItemModal';
import { generateUUID, roundCurrency } from '@/lib/utils';
import FractionInput from '@/components/FractionInput';
import { calculateLineAmounts, convertRateForItemUnit, UNIT_OPTIONS_BY_GROUP } from '@/lib/units';

interface PurchaseFormProps {
    onSave: () => void;
    onCancel: () => void;
    initialData?: Invoice;
    viewOnly?: boolean;
}

export default function PurchaseForm({ onSave, onCancel, initialData, viewOnly = false }: PurchaseFormProps) {
    const isEditing = !!initialData && !viewOnly;
    const [parties, setParties] = useState<Party[]>([]);
    const [items, setItems] = useState<GlassItem[]>([]);
    const [selectedPartyId, setSelectedPartyId] = useState(initialData?.partyId || '');
    const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(initialData?.supplierInvoiceNumber || '');
    const [invoiceDate, setInvoiceDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);

    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(initialData?.items || []);
    const [loading, setLoading] = useState(false);
    const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
    const [showNewItemModal, setShowNewItemModal] = useState(false);
    const [pendingItemRowIndex, setPendingItemRowIndex] = useState<number | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [partiesData, itemsData] = await Promise.all([
            db.parties.getAll(),
            db.items.getAll()
        ]);
        // Filter for suppliers only
        setParties(partiesData.filter(p => p.type === 'supplier'));
        setItems(itemsData);
    };

    const handleSaveNewSupplier = async (partyData: Omit<Party, 'id'>) => {
        const newParty: Party = {
            ...partyData,
            id: generateUUID(),
        };
        await db.parties.add(newParty);
        await loadData();
        setSelectedPartyId(newParty.id);
        setShowNewSupplierModal(false);
    };

    const handleSaveNewItem = async (itemData: Omit<GlassItem, 'id'>) => {
        // Check for duplicates (Copying logic from InventoryPage, ideally should be a shared helper)
        const getItemKey = (item: Partial<GlassItem>) => {
            if (item.category === 'hardware') {
                return `hardware-${item.name}-${item.make || ''}-${item.model || ''}`.toLowerCase();
            }
            return `glass-${item.name}-${item.type}-${item.thickness}-${item.width}-${item.height}`.toLowerCase();
        };

        const newKey = getItemKey(itemData);
        const isDuplicate = items.some(existingItem => getItemKey(existingItem) === newKey);

        if (isDuplicate) {
            alert('An item with these details already exists in the inventory.');
            return;
        }

        // ...

        const newItem: GlassItem = {
            ...itemData,
            id: generateUUID(),
        };
        await db.items.add(newItem);
        await loadData();
        if (pendingItemRowIndex !== null) {
            setInvoiceItems(prev => prev.map((row, index) => {
                if (index !== pendingItemRowIndex) return row;
                const width = newItem.width || 0;
                const height = newItem.height || 0;
                const qty = row.quantity || 1;
                const unit = newItem.purchaseRateUnit || newItem.rateUnit || newItem.unit;
                const calculated = calculateLineAmounts({
                    width,
                    height,
                    quantity: qty,
                    unit,
                    rate: newItem.rate,
                    taxRate: 18,
                    conversionFactor: newItem.conversionFactor,
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

    const addItem = () => {
        setInvoiceItems([...invoiceItems, {
            itemId: '',
            itemName: '',
            width: 0,
            height: 0,
            quantity: 1,
            unit: 'sqft',
            sqft: 0,
            rate: 0,
            amount: 0
        }]);
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const newItems = [...invoiceItems];
        const previousUnit = newItems[index].unit || 'nos';
        const item = { ...newItems[index], [field]: value };

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
                item.unit = selectedItem.purchaseRateUnit || selectedItem.rateUnit || selectedItem.unit;
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
                taxRate: 18,
                conversionFactor: catalogItem?.conversionFactor,
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

    const calculateTotal = () => {
        return roundCurrency(invoiceItems.reduce((sum, item) => sum + (item.amount || 0), 0));
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
        try {
            const party = parties.find(p => p.id === selectedPartyId);
            const subtotal = calculateTotal();
            const taxRate = 18; // Fixed for now
            const taxAmount = roundCurrency(subtotal * (taxRate / 100));
            const total = roundCurrency(subtotal + taxAmount);

            const invoice: Invoice = {
                id: initialData?.id || generateUUID(),
                type: 'purchase',
                number: initialData?.number || `PUR-${Date.now().toString().substr(-6)}`,
                supplierInvoiceNumber,
                date: invoiceDate,
                partyId: selectedPartyId,
                partyName: party?.name || 'Unknown',
                items: invoiceItems,
                subtotal,
                taxRate,
                taxAmount,
                total,
                status: initialData?.status || 'unpaid'
            };

            // DEBUG: Check payload
            if (invoice.items.length === 0) {
                alert('Error: No items to save!');
                setLoading(false);
                return;
            }

            console.log('Submitting Invoice:', invoice);

            if (isEditing) {
                await db.invoices.update(invoice);
            } else {
                await db.invoices.add(invoice);
            }
            onSave();
        } catch (error: any) {
            console.error(error);
            alert(`Failed to save purchase: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {viewOnly && <Eye size={20} />}
                {viewOnly ? 'View Purchase Entry' : isEditing ? 'Edit Purchase Entry' : 'New Purchase Entry'}
                {initialData?.number && <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>({initialData.number})</span>}
            </h2>

            <form onSubmit={handleSubmit}>
                <div className="form-grid form-grid-3" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Supplier</label>
                        <div className="quick-add-field">
                            <select
                                className="input"
                                required
                                value={selectedPartyId}
                                onChange={e => {
                                    if (e.target.value === '__add_supplier__') {
                                        setShowNewSupplierModal(true);
                                    } else {
                                        setSelectedPartyId(e.target.value);
                                    }
                                }}
                                disabled={viewOnly}
                            >
                                <option value="">Select Supplier</option>
                                <option value="__add_supplier__">+ Add New Supplier</option>
                                {parties.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="quick-add-button"
                                onClick={() => setShowNewSupplierModal(true)}
                                title="Add New Supplier"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Supplier Invoice #</label>
                        <input
                            type="text"
                            className="input"
                            value={supplierInvoiceNumber}
                            onChange={e => setSupplierInvoiceNumber(e.target.value)}
                            disabled={viewOnly}
                            placeholder="Optional"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Date</label>
                        <input
                            type="date"
                            required
                            className="input"
                            value={invoiceDate}
                            disabled={viewOnly}
                            onChange={e => setInvoiceDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="table-responsive" style={{ marginBottom: '1.5rem' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '18%' }}>Item</th>
                                <th style={{ width: '9%' }}>Make</th>
                                <th style={{ width: '9%' }}>Type/Model</th>
                                <th style={{ width: '9%' }}>Warehouse</th>
                                <th style={{ width: '8%' }}>W (in)</th>
                                <th style={{ width: '8%' }}>H (in)</th>
                                <th style={{ width: '10%' }}>Qty</th>
                                <th style={{ width: '6%' }}>Unit</th>
                                <th style={{ width: '8%' }}>Sq.ft</th>
                                <th style={{ width: '12%' }}>Rate</th>
                                <th style={{ width: '12%' }}>Amount</th>
                                <th style={{ width: '5%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoiceItems.map((item, index) => (
                                <tr key={index}>
                                    <td>
                                        <div className="quick-add-field">
                                            <select
                                                className="input"
                                                value={item.itemId}
                                                disabled={viewOnly}
                                                onChange={e => {
                                                    if (e.target.value === 'NEW_ITEM') {
                                                        setPendingItemRowIndex(index);
                                                        setShowNewItemModal(true);
                                                    } else {
                                                        updateItem(index, 'itemId', e.target.value);
                                                    }
                                                }}
                                            >
                                                <option value="">Select Item</option>
                                                <option value="NEW_ITEM" style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>+ Add New Item</option>
                                                {items.map(i => (
                                                    <option key={i.id} value={i.id}>
                                                        {i.name}
                                                        {i.category === 'hardware'
                                                            ? ` (${i.make || '-'} ${i.model || '-'})`
                                                            : ` (${i.make ? i.make + ' - ' : ''}${i.type} - ${i.thickness}mm)`}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className="quick-add-button quick-add-button-compact"
                                                onClick={() => {
                                                    setPendingItemRowIndex(index);
                                                    setShowNewItemModal(true);
                                                }}
                                                title="Add New Item"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </td>
                                    <td>{item.make || '-'}</td>
                                    <td>{item.model || item.type || '-'}</td>
                                    <td>
                                        <select
                                            className="input"
                                            value={item.warehouse || ''}
                                            onChange={e => updateItem(index, 'warehouse', e.target.value)}
                                            disabled={viewOnly}
                                        >
                                            <option value="">Select</option>
                                            <option value="Warehouse A">Warehouse A</option>
                                            <option value="Warehouse B">Warehouse B</option>
                                        </select>
                                    </td>
                                    <td>
                                        <FractionInput
                                            className="input"
                                            value={item.width || 0}
                                            onChange={val => updateItem(index, 'width', val)}
                                            disabled={viewOnly}
                                        />
                                    </td>
                                    <td>
                                        <FractionInput
                                            className="input"
                                            value={item.height || 0}
                                            onChange={val => updateItem(index, 'height', val)}
                                            disabled={viewOnly}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.quantity || ''}
                                            onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                                            disabled={viewOnly}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="input"
                                            value={item.unit || 'sqft'}
                                            onChange={e => updateItem(index, 'unit', e.target.value)}
                                            style={{ padding: '0.25rem', width: '100%', fontSize: '0.875rem' }}
                                            disabled={viewOnly}
                                        >
                                            {UNIT_OPTIONS_BY_GROUP.map(group => (
                                                <optgroup key={group.label} label={group.label}>
                                                    {group.units.map(unit => (
                                                        <option key={unit.value} value={unit.value}>{unit.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </td>
                                    <td>{item.sqft}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input money-input"
                                            min="0"
                                            step="0.01"
                                            value={item.rate || ''}
                                            onChange={e => updateItem(index, 'rate', Number(e.target.value))}
                                            disabled={viewOnly}
                                        />
                                    </td>
                                    <td>{item.amount}</td>
                                    {!viewOnly && (
                                    <td>
                                        <button type="button" onClick={() => removeItem(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!viewOnly && (
                    <button type="button" onClick={addItem} className="btn" style={{ marginTop: '1rem', background: '#f3f4f6', color: '#374151', border: '1px dashed #d1d5db' }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add Item
                    </button>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Subtotal: ₹{calculateTotal().toFixed(2)}</p>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>GST (18%): ₹{(calculateTotal() * 0.18).toFixed(2)}</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>Total: ₹{(calculateTotal() * 1.18).toFixed(2)}</p>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                    <button type="button" onClick={onCancel} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        {viewOnly ? 'Close' : 'Cancel'}
                    </button>
                    {!viewOnly && (
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Saving...' : isEditing ? 'Update Purchase' : 'Save Purchase'}
                    </button>
                    )}
                </div>
            </form>

            <PartyModal
                isOpen={showNewSupplierModal}
                onClose={() => setShowNewSupplierModal(false)}
                onSave={handleSaveNewSupplier}
                initialData={{ type: 'supplier' } as Party}
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
