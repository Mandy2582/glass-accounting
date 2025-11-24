'use client';

import { useState, useEffect } from 'react';
import { Plus, Package, Truck, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { db } from '@/lib/storage';
import { Order, Party } from '@/types';
import Link from 'next/link';

type ViewMode = 'tabs' | 'grouped';
type TabType = 'sale_orders' | 'purchase_orders' | 'all';

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('tabs');
    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const [ordersData, partiesData] = await Promise.all([
            db.orders.getAll(),
            db.parties.getAll()
        ]);
        setOrders(ordersData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setParties(partiesData);
        setLoading(false);
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: '#fbbf24',
            supplier_ordered: '#60a5fa',
            supplier_delivered: '#a78bfa',
            customer_delivered: '#34d399',
            completed: '#10b981',
            cancelled: '#ef4444'
        };
        return colors[status] || '#9ca3af';
    };

    const getStatusLabel = (status: string) => {
        return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const getStatusProgress = (status: string) => {
        const progress: Record<string, number> = {
            pending: 1,
            supplier_ordered: 2,
            supplier_delivered: 3,
            customer_delivered: 4,
            completed: 5,
            cancelled: 0
        };
        return progress[status] || 0;
    };

    const filteredOrders = orders.filter(order => {
        const matchesTab = activeTab === 'all' || order.type === activeTab;
        const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
        return matchesTab && matchesStatus;
    });

    // Group orders by parent/linked relationship
    const groupedOrders = orders.reduce((acc, order) => {
        if (order.type === 'sale_order') {
            const key = order.id;
            if (!acc[key]) {
                acc[key] = { saleOrder: order, purchaseOrder: null };
            } else {
                acc[key].saleOrder = order;
            }

            // Find linked PO
            if (order.linkedOrderId) {
                const po = orders.find(o => o.id === order.linkedOrderId);
                if (po) acc[key].purchaseOrder = po;
            }
        }
        return acc;
    }, {} as Record<string, { saleOrder: Order; purchaseOrder: Order | null }>);

    const renderStatusDots = (status: string) => {
        const progress = getStatusProgress(status);
        return (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {[1, 2, 3, 4, 5].map(step => (
                    <div
                        key={step}
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: step <= progress ? getStatusColor(status) : '#e5e7eb'
                        }}
                    />
                ))}
            </div>
        );
    };

    const renderTabsView = () => (
        <div className="card">
            <table className="table">
                <thead>
                    <tr>
                        <th>Order #</th>
                        <th>Date</th>
                        <th>Party</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Progress</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredOrders.map(order => (
                        <tr key={order.id}>
                            <td style={{ fontWeight: 600 }}>{order.number}</td>
                            <td>{new Date(order.date).toLocaleDateString()}</td>
                            <td>{order.partyName}</td>
                            <td>{order.items?.length || 0} items</td>
                            <td style={{ fontWeight: 600 }}>₹{order.total.toLocaleString()}</td>
                            <td>
                                <span style={{
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '999px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background: `${getStatusColor(order.status)}20`,
                                    color: getStatusColor(order.status)
                                }}>
                                    {getStatusLabel(order.status)}
                                </span>
                            </td>
                            <td>{renderStatusDots(order.status)}</td>
                            <td>
                                <Link href={`/orders/${order.id}`} className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                    View
                                </Link>
                            </td>
                        </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                        <tr>
                            <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                No orders found
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderGroupedView = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.values(groupedOrders).map(({ saleOrder, purchaseOrder }) => (
                <div key={saleOrder.id} className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: purchaseOrder ? '1fr auto 1fr' : '1fr', gap: '2rem', alignItems: 'center' }}>
                        {/* Sale Order */}
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Customer Order</div>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{saleOrder.number}</div>
                            <div style={{ marginBottom: '0.5rem' }}>{saleOrder.partyName}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                {saleOrder.items?.length || 0} items • ₹{saleOrder.total.toLocaleString()}
                            </div>
                            <div style={{ marginTop: '0.75rem' }}>
                                <span style={{
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '999px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background: `${getStatusColor(saleOrder.status)}20`,
                                    color: getStatusColor(saleOrder.status)
                                }}>
                                    {getStatusLabel(saleOrder.status)}
                                </span>
                            </div>
                            <Link href={`/orders/${saleOrder.id}`} className="btn" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                                View Details
                            </Link>
                        </div>

                        {/* Arrow */}
                        {purchaseOrder && (
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <ArrowRight size={32} color="var(--color-text-muted)" />
                            </div>
                        )}

                        {/* Purchase Order */}
                        {purchaseOrder && (
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Supplier Order</div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{purchaseOrder.number}</div>
                                <div style={{ marginBottom: '0.5rem' }}>{purchaseOrder.partyName}</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                    {purchaseOrder.items?.length || 0} items • ₹{purchaseOrder.total.toLocaleString()}
                                </div>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <span style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        background: `${getStatusColor(purchaseOrder.status)}20`,
                                        color: getStatusColor(purchaseOrder.status)
                                    }}>
                                        {getStatusLabel(purchaseOrder.status)}
                                    </span>
                                </div>
                                <Link href={`/orders/${purchaseOrder.id}`} className="btn" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                                    View Details
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Progress indicator */}
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                        {renderStatusDots(saleOrder.status)}
                    </div>
                </div>
            ))}
            {Object.keys(groupedOrders).length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No orders found
                </div>
            )}
        </div>
    );

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Orders</h1>
                <Link href="/orders/new" className="btn btn-primary">
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Customer Order
                </Link>
            </div>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`btn ${viewMode === 'tabs' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('tabs')}
                    >
                        Separate View
                    </button>
                    <button
                        className={`btn ${viewMode === 'grouped' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('grouped')}
                    >
                        Grouped View
                    </button>
                </div>

                {viewMode === 'tabs' && (
                    <>
                        <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setActiveTab('all')}
                            >
                                All Orders
                            </button>
                            <button
                                className={`btn ${activeTab === 'sale_order' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setActiveTab('sale_order')}
                            >
                                Sale Orders
                            </button>
                            <button
                                className={`btn ${activeTab === 'purchase_order' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setActiveTab('purchase_order')}
                            >
                                Purchase Orders
                            </button>
                        </div>
                    </>
                )}

                <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />

                {/* Status Filter */}
                <select
                    className="input"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{ width: 'auto' }}
                >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="supplier_ordered">Supplier Ordered</option>
                    <option value="supplier_delivered">Supplier Delivered</option>
                    <option value="customer_delivered">Customer Delivered</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
                    Loading orders...
                </div>
            ) : viewMode === 'tabs' ? renderTabsView() : renderGroupedView()}
        </div>
    );
}
