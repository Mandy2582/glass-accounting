'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem, Party, Order, InvoiceItem, OrderType } from '@/types';

interface OrderFormProps {
    onSave: () => void;
    onCancel: () => void;
}

export default function OrderForm({ onSave, onCancel }: OrderFormProps) {
    const [orderType, setOrderType] = useState<OrderType>('sale_order');
    const [parties, setParties] = useState<Party[]>([]);
    const [items, setItems] = useState<GlassItem[]>([]);
    const [selectedPartyId, setSelectedPartyId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [deliveryDate, setDeliveryDate] = useState('');

    const [orderItems, setOrderItems] = useState<InvoiceItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, [orderType]);

    const loadData = async () => {
        const [partiesData, itemsData] = await Promise.all([
            db.parties.getAll(),
            db.items.getAll()
        ]);

        // Filter parties based on order type
        const partyType = orderType === 'sale_order' ? 'customer' : 'supplier';
        setParties(partiesData.filter(p => p.type === partyType));
        setItems(itemsData);
    };

    const addItem = () => {
        setOrderItems([...orderItems, {
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
        const newItems = [...orderItems];
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
        setOrderItems(newItems);
    };

    const removeItem = (index: number) => {
        setOrderItems(orderItems.filter((_, i) => i !== index));
    };

    const calculateTotal = () => {
        return orderItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPartyId || orderItems.length === 0) return;

        // Validate Warehouse
        if (orderItems.some(i => !i.warehouse)) {
            alert('Please select a warehouse for all items.');
            return;
        }

        setLoading(true);
        try {
            const party = parties.find(p => p.id === selectedPartyId);
            const subtotal = calculateTotal();
            const taxRate = 18;
            const taxAmount = subtotal * (taxRate / 100);
            const total = subtotal + taxAmount;

            const prefix = orderType === 'sale_order' ? 'SO' : 'PO';

            const order: Order = {
                id: Math.random().toString(36).substr(2, 9),
                type: orderType,
                number: `${prefix}-${Date.now().toString().substr(-6)}`,
                date: orderDate,
                deliveryDate,
                partyId: selectedPartyId,
                partyName: party?.name || 'Unknown',
                items: orderItems,
                subtotal,
                taxRate,
                taxAmount,
                total,
                status: 'pending'
            };

            await db.orders.add(order);
            onSave();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                New {orderType === 'sale_order' ? 'Sales Order' : 'Purchase Order'}
            </h2>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button
                            type="button"
                            className={`btn ${orderType === 'sale_order' ? 'btn-primary' : ''}`}
                            onClick={() => setOrderType('sale_order')}
                            style={{ flex: 1, background: orderType !== 'sale_order' ? 'var(--color-bg)' : undefined, border: orderType !== 'sale_order' ? '1px solid var(--color-border)' : undefined }}
                        >
                            Sales Order
                        </button>
                        <button
                            type="button"
                            className={`btn ${orderType === 'purchase_order' ? 'btn-primary' : ''}`}
                            onClick={() => setOrderType('purchase_order')}
                            style={{ flex: 1, background: orderType !== 'purchase_order' ? 'var(--color-bg)' : undefined, border: orderType !== 'purchase_order' ? '1px solid var(--color-border)' : undefined }}
                        >
                            Purchase Order
                        </button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                            {orderType === 'sale_order' ? 'Customer' : 'Supplier'}
                        </label>
                        <select
                            className="input"
                            required
                            value={selectedPartyId}
                            onChange={e => setSelectedPartyId(e.target.value)}
                        >
                            <option value="">Select Party</option>
                            {parties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Order Date</label>
                        <input
                            type="date"
                            required
                            className="input"
                            value={orderDate}
                            onChange={e => setOrderDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Delivery Date</label>
                        <input
                            type="date"
                            className="input"
                            value={deliveryDate}
                            onChange={e => setDeliveryDate(e.target.value)}
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
                            {orderItems.map((item, index) => (
                                <tr key={index}>
                                    <td>
                                        <select
                                            className="input"
                                            value={item.itemId}
                                            onChange={e => updateItem(index, 'itemId', e.target.value)}
                                            style={{ padding: '0.25rem' }}
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
                                            style={{ padding: '0.25rem' }}
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
                                            style={{ padding: '0.25rem' }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.height}
                                            onChange={e => updateItem(index, 'height', Number(e.target.value))}
                                            style={{ padding: '0.25rem' }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.quantity}
                                            onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                                            style={{ padding: '0.25rem' }}
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
                                            style={{ padding: '0.25rem' }}
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
                        {loading ? 'Save Order' : 'Save Order'}
                    </button>
                </div>
            </form>
        </div>
    );
}
