'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, ClipboardList, ArrowRight } from 'lucide-react';
import { db } from '@/lib/storage';
import { Order, Invoice } from '@/types';
import OrderForm from '@/components/orders/OrderForm';

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed'>('all');

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        const data = await db.orders.getAll();
        setOrders(data.reverse());
        setLoading(false);
    };

    const handleSave = async () => {
        await loadOrders();
        setShowForm(false);
    };

    const convertToInvoice = async (order: Order) => {
        if (!confirm('Are you sure you want to convert this order to an invoice? This will update your stock and accounts.')) return;

        const invoice: Invoice = {
            id: Math.random().toString(36).substr(2, 9),
            type: order.type === 'sale_order' ? 'sale' : 'purchase',
            number: order.type === 'sale_order' ? `INV-${Date.now().toString().substr(-6)}` : `PUR-${Date.now().toString().substr(-6)}`,
            date: new Date().toISOString().split('T')[0],
            partyId: order.partyId,
            partyName: order.partyName,
            items: order.items,
            subtotal: order.subtotal,
            taxRate: order.taxRate,
            taxAmount: order.taxAmount,
            total: order.total,
            status: 'unpaid'
        };

        await db.invoices.add(invoice);

        // Update order status
        const updatedOrder = { ...order, status: 'completed' as const };
        await db.orders.update(updatedOrder);

        await loadOrders();
        alert('Order converted to invoice successfully!');
    };

    const filteredOrders = orders.filter(order => {
        const matchesSearch =
            order.partyName.toLowerCase().includes(search.toLowerCase()) ||
            order.number.toLowerCase().includes(search.toLowerCase());

        if (activeTab === 'all') return matchesSearch;
        return matchesSearch && order.status === activeTab;
    });

    if (showForm) {
        return (
            <div className="container">
                <OrderForm onSave={handleSave} onCancel={() => setShowForm(false)} />
            </div>
        );
    }

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Order Management</h1>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Order
                </button>
            </div>

            <div className="card">
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search orders..."
                            className="input"
                            style={{ paddingLeft: '2.5rem' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            className={`btn ${activeTab === 'all' ? 'btn-primary' : ''}`}
                            onClick={() => setActiveTab('all')}
                            style={activeTab !== 'all' ? { background: 'var(--color-bg)', border: '1px solid var(--color-border)' } : {}}
                        >
                            All
                        </button>
                        <button
                            className={`btn ${activeTab === 'pending' ? 'btn-primary' : ''}`}
                            onClick={() => setActiveTab('pending')}
                            style={activeTab !== 'pending' ? { background: 'var(--color-bg)', border: '1px solid var(--color-border)' } : {}}
                        >
                            Pending
                        </button>
                        <button
                            className={`btn ${activeTab === 'completed' ? 'btn-primary' : ''}`}
                            onClick={() => setActiveTab('completed')}
                            style={activeTab !== 'completed' ? { background: 'var(--color-bg)', border: '1px solid var(--color-border)' } : {}}
                        >
                            Completed
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading orders...</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Order #</th>
                                <th>Type</th>
                                <th>Party</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order) => (
                                <tr key={order.id}>
                                    <td>{new Date(order.date).toLocaleDateString()}</td>
                                    <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{order.number}</td>
                                    <td>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            padding: '0.125rem 0.375rem',
                                            borderRadius: '4px',
                                            background: order.type === 'sale_order' ? '#e0e7ff' : '#f3f4f6',
                                            color: order.type === 'sale_order' ? '#4338ca' : '#374151',
                                            fontWeight: 500
                                        }}>
                                            {order.type === 'sale_order' ? 'SALE' : 'PURCHASE'}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{order.partyName}</td>
                                    <td style={{ fontWeight: 600 }}>₹{order.total.toFixed(2)}</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            background: order.status === 'completed' ? '#dcfce7' : '#ffedd5',
                                            color: order.status === 'completed' ? '#166534' : '#c2410c',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            {order.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        {order.status === 'pending' && (
                                            <button
                                                className="btn"
                                                onClick={() => convertToInvoice(order)}
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                title="Convert to Invoice"
                                            >
                                                Convert <ArrowRight size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredOrders.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No orders found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
