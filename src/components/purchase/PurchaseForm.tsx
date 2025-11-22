'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem, Party, Invoice, InvoiceItem } from '@/types';

import PartyModal from '@/components/parties/PartyModal';

interface PurchaseFormProps {
    onSave: () => void;
    onCancel: () => void;
}

export default function PurchaseForm({ onSave, onCancel }: PurchaseFormProps) {
    const [parties, setParties] = useState<Party[]>([]);
    const [items, setItems] = useState<GlassItem[]>([]);
    const [selectedPartyId, setSelectedPartyId] = useState('');
    const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);

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
            id: crypto.randomUUID(),
        };
        await db.parties.add(newParty);
        await loadData();
        setSelectedPartyId(newParty.id);
        setShowNewSupplierModal(false);
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
                item.unit = selectedItem.unit;
            }
        }

        // Recalculate
        if (item.width && item.height && item.quantity) {
            item.sqft = (item.width * item.height / 144) * item.quantity;
        }

        if (item.rate) {
            const unit = item.unit || 'sqft';
            if (unit === 'sqft') {
                item.amount = (item.sqft || 0) * item.rate;
            } else {
                item.amount = (item.quantity || 0) * item.rate;
            }
        }

        newItems[index] = item;
        setInvoiceItems(newItems);
    };

    const removeItem = (index: number) => {
        setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    };

    const calculateTotal = () => {
        return invoiceItems.reduce((sum, item) => sum + (item.amount || 0), 0);
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
            const taxAmount = subtotal * (taxRate / 100);
            const total = subtotal + taxAmount;

            const invoice: Invoice = {
                id: crypto.randomUUID(),
                type: 'purchase',
                number: `PUR-${Date.now().toString().substr(-6)}`,
                supplierInvoiceNumber,
                date: invoiceDate,
                partyId: selectedPartyId,
                partyName: party?.name || 'Unknown',
                items: invoiceItems,
                subtotal,
                taxRate,
                taxAmount,
                total,
                status: 'unpaid'
            };

            await db.invoices.add(invoice);
            onSave();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>New Purchase Entry</h2>

            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Supplier</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select
                                className="input"
                                required
                                value={selectedPartyId}
                                onChange={e => setSelectedPartyId(e.target.value)}
                                style={{ flex: 1 }}
                            >
                                <option value="">Select Supplier</option>
                                {parties.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => setShowNewSupplierModal(true)}
                                style={{ padding: '0.5rem', background: '#f3f4f6', border: '1px solid var(--color-border)' }}
                                title="Add New Supplier"
                            >
                                <Plus size={20} />
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
                            onChange={e => setInvoiceDate(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '25%' }}>Item</th>
                                <th style={{ width: '10%' }}>Make</th>
                                <th style={{ width: '10%' }}>Type/Model</th>
                                <th style={{ width: '10%' }}>Warehouse</th>
                                <th style={{ width: '8%' }}>W (in)</th>
                                <th style={{ width: '8%' }}>H (in)</th>
                                <th style={{ width: '8%' }}>Qty</th>
                                <th style={{ width: '8%' }}>Unit</th>
                                <th style={{ width: '8%' }}>Sq.ft</th>
                                <th style={{ width: '10%' }}>Rate</th>
                                <th style={{ width: '10%' }}>Amount</th>
                                <th style={{ width: '5%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoiceItems.map((item, index) => (
                                <tr key={index}>
                                    <td>
                                        <select
                                            className="input"
                                            value={item.itemId}
                                            onChange={e => updateItem(index, 'itemId', e.target.value)}
                                        >
                                            <option value="">Select Item</option>
                                            {items.map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>{item.make || '-'}</td>
                                    <td>{item.model || item.type || '-'}</td>
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
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.width}
                                            onChange={e => updateItem(index, 'width', Number(e.target.value))}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.height}
                                            onChange={e => updateItem(index, 'height', Number(e.target.value))}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.quantity}
                                            onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                                        />
                                    </td>
                                    <td style={{ textTransform: 'capitalize' }}>{item.unit}</td>
                                    <td>{item.sqft}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.rate}
                                            onChange={e => updateItem(index, 'rate', Number(e.target.value))}
                                        />
                                    </td>
                                    <td>{item.amount}</td>
                                    <td>
                                        <button type="button" onClick={() => removeItem(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button type="button" onClick={addItem} className="btn" style={{ marginTop: '1rem', background: '#f3f4f6', color: '#374151', border: '1px dashed #d1d5db' }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add Item
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Subtotal: ₹{calculateTotal().toFixed(2)}</p>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>GST (18%): ₹{(calculateTotal() * 0.18).toFixed(2)}</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>Total: ₹{(calculateTotal() * 1.18).toFixed(2)}</p>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                    <button type="button" onClick={onCancel} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Saving...' : 'Save Purchase'}
                    </button>
                </div>
            </form>

            <PartyModal
                isOpen={showNewSupplierModal}
                onClose={() => setShowNewSupplierModal(false)}
                onSave={handleSaveNewSupplier}
                initialData={{ type: 'supplier' } as Party}
            />
        </div>
    );
}
