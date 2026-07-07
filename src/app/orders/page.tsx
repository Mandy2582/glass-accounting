'use client';

import { useState, useEffect } from 'react';
import { Plus, Package, Truck, CheckCircle, XCircle, ArrowRight, Search } from 'lucide-react';
import { db } from '@/lib/storage';
import { Order, Party } from '@/types';
import Link from 'next/link';

type ViewMode = 'tabs' | 'grouped';
type TabType = 'sale_order' | 'purchase_order' | 'all';

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('tabs');
    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const [ordersData, partiesData] = await Promise.all([
            db.orders.getAll(),
            db.parties.getAll()
        ]);
        setOrders(ordersData.sort((a, b) => {
            const timeA = new Date((a as any).created_at || a.date).getTime();
            const timeB = new Date((b as any).created_at || b.date).getTime();
            return timeB - timeA;
        }));
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

    const getOrderNoteValue = (order: Order | null | undefined, label: string) => {
        if (!order?.notes) return '';
        const line = order.notes.split('\n').find(entry => entry.toLowerCase().startsWith(`${label.toLowerCase()}:`));
        return line ? line.slice(line.indexOf(':') + 1).trim() : '';
    };

    const getOrderSource = (order: Order | null | undefined) => {
        const source = getOrderNoteValue(order, 'Source');
        if (source) return source;
        return order?.notes?.toLowerCase().includes('online') ? 'Online' : 'Staff';
    };

    const hasPaymentConfirmation = (order: Order | null | undefined) => {
        return !!order?.notes?.includes('[Payment confirmation');
    };

    const getPaymentSummary = (order: Order | null | undefined) => {
        if (!order) return '-';
        const mode = getOrderNoteValue(order, 'Payment mode') || 'Not selected';
        const status = (order.paymentStatus || 'unpaid').replace(/_/g, ' ');
        const paid = Number(order.paidAmount || 0);
        const balance = Math.max(0, Number(order.total || 0) - paid);
        const customerSubmittedReference = hasPaymentConfirmation(order);
        return `${mode} • ${status}${customerSubmittedReference ? ' • confirmation submitted' : ''}${balance > 0 ? ` • ₹${balance.toLocaleString('en-IN')}` : ''}`;
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

    const generalOrdersList = (() => {
        // Find all Sales Orders (SO is always the entry point for custom orders)
        const saleOrders = orders.filter(o => o.type === 'sale_order');
        
        // Map each Sales Order to a combined object
        const list = saleOrders.map(so => {
            const po = so.linkedOrderId ? orders.find(o => o.id === so.linkedOrderId) : null;
            return {
                id: so.id,
                generalNumber: so.generalNumber || so.number.replace('SO-', ''), // fallback if legacy
                soNumber: so.soNumber || so.number,
                poNumber: po ? (po.poNumber || po.number) : '',
                customerName: so.partyName,
                supplierName: po ? po.partyName : '',
                date: so.date,
                total: so.total,
                status: so.status,
                saleOrder: so,
                purchaseOrder: po
            };
        });

        // Add any standalone Purchase Orders that are not linked to any Sales Order (for backward compatibility)
        const standalonePOs = orders.filter(o => o.type === 'purchase_order' && !orders.some(so => so.linkedOrderId === o.id));
        standalonePOs.forEach(po => {
            list.push({
                id: po.id,
                generalNumber: po.generalNumber || po.number.replace('PO-', ''),
                soNumber: '',
                poNumber: po.poNumber || po.number,
                customerName: '',
                supplierName: po.partyName,
                date: po.date,
                total: po.total,
                status: po.status,
                saleOrder: null as any,
                purchaseOrder: po
            });
        });

        // Apply filters & search
        return list.filter(item => {
            const orderForSignals = item.saleOrder || item.purchaseOrder;
            const matchesStatus = filterStatus === 'all'
                || (filterStatus === 'payment_confirmation' ? hasPaymentConfirmation(orderForSignals) : item.status === filterStatus);
            const matchesSearch = search === '' || 
                (item.generalNumber || '').toLowerCase().includes(search.toLowerCase()) || 
                (item.soNumber || '').toLowerCase().includes(search.toLowerCase()) || 
                (item.poNumber || '').toLowerCase().includes(search.toLowerCase()) || 
                (item.customerName || '').toLowerCase().includes(search.toLowerCase()) || 
                (item.supplierName || '').toLowerCase().includes(search.toLowerCase());
            return matchesStatus && matchesSearch;
        }).sort((a, b) => {
            const timeA = new Date((a.saleOrder as any)?.created_at || (a.purchaseOrder as any)?.created_at || a.date).getTime();
            const timeB = new Date((b.saleOrder as any)?.created_at || (b.purchaseOrder as any)?.created_at || b.date).getTime();
            return timeB - timeA;
        });
    })();

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

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Orders</h1>
                <Link href="/orders/new" className="btn btn-primary">
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Customer Order
                </Link>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '250px' }}>
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

                <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />

                {/* Status Filter */}
                <select
                    className="input"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{ width: 'auto' }}
                >
                    <option value="all">All Statuses</option>
                    <option value="payment_confirmation">Payment Confirmations</option>
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
            ) : (
                <div className="card">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>General Order #</th>
                                <th>SO #</th>
                                <th>PO #</th>
                                <th>Source</th>
                                <th>Customer</th>
                                <th>Supplier</th>
                                <th>Date</th>
                                <th>Total</th>
                                <th>Payment</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {generalOrdersList.map(item => (
                                <tr key={item.id}>
                                    <td style={{ fontWeight: 700 }}>{item.generalNumber}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{item.soNumber || '-'}</td>
                                    <td style={{ fontWeight: 600, color: '#e0465e' }}>{item.poNumber || '-'}</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            background: getOrderSource(item.saleOrder || item.purchaseOrder).toLowerCase().includes('online') ? 'rgba(14, 165, 233, 0.14)' : 'rgba(148, 163, 184, 0.14)',
                                            color: getOrderSource(item.saleOrder || item.purchaseOrder).toLowerCase().includes('online') ? '#0284c7' : 'var(--color-text-muted)'
                                        }}>
                                            {getOrderSource(item.saleOrder || item.purchaseOrder)}
                                        </span>
                                    </td>
                                    <td>{item.customerName || '-'}</td>
                                    <td>{item.supplierName || '-'}</td>
                                    <td>{new Date(item.date).toLocaleDateString()}</td>
                                    <td style={{ fontWeight: 600 }}>{item.total ? `₹${item.total.toLocaleString()}` : '-'}</td>
                                    <td style={{ maxWidth: 240, color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                                        {getPaymentSummary(item.saleOrder || item.purchaseOrder)}
                                    </td>
                                    <td>
                                        {item.status ? (
                                            <span style={{
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '999px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                background: `${getStatusColor(item.status)}20`,
                                                color: getStatusColor(item.status)
                                            }}>
                                                {getStatusLabel(item.status)}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <Link href={`/orders/${item.id}`} className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {generalOrdersList.length === 0 && (
                                <tr>
                                    <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                        No orders found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
