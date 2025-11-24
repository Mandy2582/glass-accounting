'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/storage';
import { Order, Party, GlassItem, InvoiceItem } from '@/types';
import Link from 'next/link';

export default function NewOrderPage() {
    const router = useRouter();
    const [customers, setCustomers] = useState<Party[]>([]);
    const [items, setItems] = useState<GlassItem[]>([]);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        partyId: '',
        date: new Date().toISOString().split('T')[0],
        deliveryDate: '',
        taxRate: 18,
        notes: ''
    });

    const [orderItems, setOrderItems] = useState<InvoiceItem[]>([{
        id: crypto.randomUUID(),
        itemId: '',
        itemName: '',
        description: '',
        width: 0,
        height: 0,
        quantity: 1,
        unit: 'sqft',
        sqft: 0,
        rate: 0,
        amount: 0
    }]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [partiesData, itemsData] = await Promise.all([
            db.parties.getAll(),
            db.items.getAll()
        ]);
        setCustomers(partiesData.filter(p => p.type === 'customer'));
        setItems(itemsData);
    };

    const addItem = () => {
        setOrderItems([...orderItems, {
            id: crypto.randomUUID(),
            itemId: '',
            itemName: '',
            description: '',
            width: 0,
            height: 0,
            quantity: 1,
            unit: 'sqft',
            sqft: 0,
            rate: 0,
            amount: 0
        }]);
    };

    const removeItem = (index: number) => {
        if (orderItems.length > 1) {
            setOrderItems(orderItems.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: string, value: any) => {
        const updated = [...orderItems];
        updated[index] = { ...updated[index], [field]: value };

        // Auto-calculate sqft and amount
        if (field === 'width' || field === 'height' || field === 'quantity') {
            const item = updated[index];
            item.sqft = (item.width * item.height * item.quantity) / 144; // Convert to sqft
            item.amount = item.sqft * item.rate;
        }

        if (field === 'rate') {
            const item = updated[index];
            item.amount = item.sqft * item.rate;
        }

        // If selecting from catalog
        if (field === 'itemId' && value) {
            const catalogItem = items.find(i => i.id === value);
            if (catalogItem) {
                updated[index].itemName = catalogItem.name;
                updated[index].rate = catalogItem.rate;
                updated[index].unit = catalogItem.unit;
                // Recalculate amount
                updated[index].amount = updated[index].sqft * catalogItem.rate;
            }
        }

        setOrderItems(updated);
    };

    const calculateTotals = () => {
        const subtotal = orderItems.reduce((sum, item) => sum + item.amount, 0);
        const taxAmount = (subtotal * formData.taxRate) / 100;
        const total = subtotal + taxAmount;
        return { subtotal, taxAmount, total };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.partyId) {
            alert('Please select a customer');
            return;
        }

        if (orderItems.some(item => (!item.itemName && !item.description) || item.amount === 0)) {
            alert('Please fill in all item details (Description/Item Name and Amount)');
            return;
        }

        setLoading(true);

        try {
            const { subtotal, taxAmount, total } = calculateTotals();
            const customer = customers.find(c => c.id === formData.partyId);

            const order: Order = {
                id: crypto.randomUUID(),
                type: 'sale_order',
                number: `SO-${Date.now().toString().substr(-6)}`,
                date: formData.date,
                deliveryDate: formData.deliveryDate || undefined,
                partyId: formData.partyId,
                partyName: customer?.name || '',
                items: orderItems,
                subtotal,
                taxRate: formData.taxRate,
                taxAmount,
                total,
                status: 'pending',
                notes: formData.notes,
                deliveredToUs: 0,
                deliveredToCustomer: 0
            };

            await db.orders.add(order);
            alert('Order created successfully!');
            router.push('/orders');
        } catch (error) {
            console.error('Error creating order:', error);
            alert('Failed to create order. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const { subtotal, taxAmount, total } = calculateTotals();

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href="/orders" style={{ color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>New Customer Order</h1>
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginLeft: '2.5rem' }}>
                    Create a new sale order for a customer
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Order Details</h2>
                    </div>
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Customer *
                                </label>
                                <select
                                    className="input"
                                    required
                                    value={formData.partyId}
                                    onChange={(e) => setFormData({ ...formData, partyId: e.target.value })}
                                >
                                    <option value="">Select Customer</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Order Date *
                                </label>
                                <input
                                    type="date"
                                    className="input"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Expected Delivery Date
                                </label>
                                <input
                                    type="date"
                                    className="input"
                                    value={formData.deliveryDate}
                                    onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Tax Rate (%)
                                </label>
                                <input
                                    type="number"
                                    className="input"
                                    value={formData.taxRate}
                                    onChange={(e) => setFormData({ ...formData, taxRate: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Order Items</h2>
                        <button type="button" onClick={addItem} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                            <Plus size={16} style={{ marginRight: '0.5rem' }} />
                            Add Item
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ minWidth: '200px' }}>Item / Description</th>
                                    <th style={{ minWidth: '150px' }}>From Catalog</th>
                                    <th style={{ width: '100px' }}>Width (in)</th>
                                    <th style={{ width: '100px' }}>Height (in)</th>
                                    <th style={{ width: '80px' }}>Qty</th>
                                    <th style={{ width: '100px' }}>Sqft</th>
                                    <th style={{ width: '100px' }}>Rate/Sqft</th>
                                    <th style={{ width: '120px' }}>Amount</th>
                                    <th style={{ width: '60px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderItems.map((item, index) => (
                                    <tr key={item.id}>
                                        <td>
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="e.g., Glass Door, Window, Table Top"
                                                value={item.description || item.itemName}
                                                onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                style={{ fontSize: '0.875rem' }}
                                            />
                                        </td>
                                        <td>
                                            <select
                                                className="input"
                                                value={item.itemId}
                                                onChange={(e) => updateItem(index, 'itemId', e.target.value)}
                                                style={{ fontSize: '0.875rem' }}
                                            >
                                                <option value="">Custom Item</option>
                                                {items.map(i => (
                                                    <option key={i.id} value={i.id}>{i.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="input"
                                                value={item.width || ''}
                                                onChange={(e) => updateItem(index, 'width', Number(e.target.value))}
                                                style={{ fontSize: '0.875rem' }}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="input"
                                                value={item.height || ''}
                                                onChange={(e) => updateItem(index, 'height', Number(e.target.value))}
                                                style={{ fontSize: '0.875rem' }}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="input"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                                                min="1"
                                                style={{ fontSize: '0.875rem' }}
                                            />
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            {item.sqft.toFixed(2)}
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="input"
                                                value={item.rate || ''}
                                                onChange={(e) => updateItem(index, 'rate', Number(e.target.value))}
                                                style={{ fontSize: '0.875rem' }}
                                            />
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            ₹{item.amount.toFixed(2)}
                                        </td>
                                        <td>
                                            {orderItems.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Totals */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{ maxWidth: '400px', marginLeft: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <span>Subtotal:</span>
                                <span style={{ fontWeight: 600 }}>₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <span>Tax ({formData.taxRate}%):</span>
                                <span style={{ fontWeight: 600 }}>₹{taxAmount.toFixed(2)}</span>
                            </div>
                            <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem' }}>
                                <span style={{ fontWeight: 700 }}>Total:</span>
                                <span style={{ fontWeight: 700 }}>₹{total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notes */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                            Notes
                        </label>
                        <textarea
                            className="input"
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Additional notes or instructions..."
                        />
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <Link href="/orders" className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        Cancel
                    </Link>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Creating...' : 'Create Order'}
                    </button>
                </div>
            </form>
        </div>
    );
}
