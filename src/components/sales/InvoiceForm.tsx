'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import { db } from '@/lib/storage';
import { Invoice, InvoiceItem, GlassItem, Party } from '@/types';

interface InvoiceFormProps {
    initialData?: Invoice;
    onSave: (invoice: Invoice) => Promise<void>;
    onCancel: () => void;
}

export default function InvoiceForm({ initialData, onSave, onCancel }: InvoiceFormProps) {
    const [items, setItems] = useState<GlassItem[]>([]);
    const [parties, setParties] = useState<Party[]>([]);

    const [selectedPartyId, setSelectedPartyId] = useState(initialData?.partyId || '');
    const [invoiceDate, setInvoiceDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(initialData?.items || []);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            const [itemsData, partiesData] = await Promise.all([
                db.items.getAll(),
                db.parties.getAll()
            ]);
            setItems(itemsData);
            setParties(partiesData);
        };
        loadData();
    }, []);

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
                item.unit = selectedItem.unit;
            }
        }

        // Calculate Sqft and Amount
        if (['width', 'height', 'quantity', 'rate', 'itemId'].includes(field)) {
            const width = field === 'width' ? Number(value) : item.width;
            const height = field === 'height' ? Number(value) : item.height;
            const qty = field === 'quantity' ? Number(value) : item.quantity;
            const rate = field === 'rate' ? Number(value) : item.rate;
            const unit = item.unit || 'sqft';

            // Sqft calculation: (W * H) / 144 * Qty
            const sqft = Number(((width * height) / 144 * qty).toFixed(2));
            item.sqft = sqft;

            // Amount calculation based on Unit
            if (unit === 'sqft') {
                item.amount = Number((sqft * rate).toFixed(2));
            } else {
                // For sheets/nos, Rate is per piece
                item.amount = Number((qty * rate).toFixed(2));
            }
        }

        newItems[index] = item;
        setInvoiceItems(newItems);
    };

    const removeItem = (index: number) => {
        setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    };

    const calculateTotal = () => {
        return invoiceItems.reduce((sum, item) => sum + item.amount, 0);
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
        const subtotal = calculateTotal();
        const taxRate = 18; // Example GST
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        const party = parties.find(p => p.id === selectedPartyId);

        const invoice: Invoice = {
            id: initialData?.id || crypto.randomUUID(),
            type: 'sale',
            number: initialData?.number || `INV-${Date.now().toString().substr(-6)}`,
            date: invoiceDate,
            partyId: selectedPartyId,
            partyName: party?.name || 'Unknown',
            items: invoiceItems,
            subtotal,
            taxRate,
            taxAmount,
            total,
            status: initialData?.status || 'unpaid',
            paidAmount: initialData?.paidAmount || 0
        };

        await onSave(invoice);
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={onCancel} className="btn" style={{ background: 'none', padding: 0 }}>
                    <ArrowLeft size={24} />
                </button>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{initialData ? 'Edit Invoice' : 'New Sales Invoice'}</h1>
            </div>

            <form onSubmit={handleSubmit} className="card" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Customer</label>
                        <select
                            className="input"
                            required
                            value={selectedPartyId}
                            onChange={e => setSelectedPartyId(e.target.value)}
                        >
                            <option value="">Select Customer</option>
                            {parties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Date</label>
                        <input
                            type="date"
                            className="input"
                            required
                            value={invoiceDate}
                            onChange={e => setInvoiceDate(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '20%' }}>Item</th>
                                <th style={{ width: '10%' }}>Make</th>
                                <th style={{ width: '10%' }}>Type/Model</th>
                                <th style={{ width: '10%' }}>Warehouse</th>
                                <th style={{ width: '9%' }}>W (in)</th>
                                <th style={{ width: '9%' }}>H (in)</th>
                                <th style={{ width: '7%' }}>Qty</th>
                                <th style={{ width: '6%' }}>Unit</th>
                                <th style={{ width: '8%' }}>Sq.ft</th>
                                <th style={{ width: '11%' }}>Rate</th>
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
                                            value={item.width || ''}
                                            onChange={e => updateItem(index, 'width', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.height || ''}
                                            onChange={e => updateItem(index, 'height', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.quantity || ''}
                                            onChange={e => updateItem(index, 'quantity', e.target.value)}
                                        />
                                    </td>
                                    <td style={{ textTransform: 'capitalize' }}>{item.unit}</td>
                                    <td>{item.sqft}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.rate || ''}
                                            onChange={e => updateItem(index, 'rate', e.target.value)}
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
                    <button type="button" onClick={addItem} className="btn" style={{ marginTop: '1rem', border: '1px dashed var(--color-border)', width: '100%' }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add Item
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
                    <div style={{ width: '300px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Subtotal:</span>
                            <span style={{ fontWeight: 600 }}>₹{calculateTotal().toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Tax (18%):</span>
                            <span>₹{(calculateTotal() * 0.18).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 700, marginTop: '1rem' }}>
                            <span>Total:</span>
                            <span>₹{(calculateTotal() * 1.18).toFixed(2)}</span>
                        </div>

                        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }}>
                            <Save size={18} style={{ marginRight: '0.5rem' }} />
                            {loading ? 'Saving...' : 'Save Invoice'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
