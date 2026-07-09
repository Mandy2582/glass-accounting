'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/components/NotificationContext';
import { db } from '@/lib/storage';
import { withApprovalCleared } from '@/lib/orderNotes';
import { ArrowLeft, Bell, AlertCircle, AlertTriangle, Lightbulb, Package, Check, X, ArrowRight, Mail, Truck } from 'lucide-react';
import Link from 'next/link';

export default function NotificationsHubPage() {
    const router = useRouter();
    const { notifications, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications();
    const [activeFilter, setActiveFilter] = useState<'all' | 'order_approval' | 'operation' | 'pending_order' | 'overdue_payment' | 'low_stock' | 'insight'>('all');
    const [filteredNotifications, setFilteredNotifications] = useState<any[]>([]);
    const [actioningId, setActioningId] = useState<string | null>(null);

    useEffect(() => {
        let result = [...notifications];
        if (activeFilter !== 'all') {
            result = result.filter(n => n.type === activeFilter);
        }
        setFilteredNotifications(result);
    }, [notifications, activeFilter]);

    const approveOrder = async (notificationId: string, orderId: string) => {
        setActioningId(notificationId);
        try {
            const orders = await db.orders.getAll();
            const order = orders.find(o => o.id === orderId);
            if (!order) {
                alert('This order could not be found -- it may have already been approved or rejected.');
                await refresh();
                return;
            }
            await db.orders.update({ ...order, notes: withApprovalCleared(order.notes) });
            markAsRead(notificationId);
            await refresh();
            router.push(`/orders/${orderId}`);
        } catch (error) {
            console.error('Failed to approve order:', error);
            alert('Failed to approve this order. Please try again.');
        } finally {
            setActioningId(null);
        }
    };

    const rejectOrder = async (notificationId: string, orderId: string) => {
        if (!confirm('Reject and delete this order? This cannot be undone.')) return;
        setActioningId(notificationId);
        try {
            await db.orders.delete(orderId);
            markAsRead(notificationId);
            await refresh();
        } catch (error) {
            console.error('Failed to reject order:', error);
            alert('Failed to reject this order. Please try again.');
        } finally {
            setActioningId(null);
        }
    };

    const getIcon = (type: string, severity: string) => {
        const style = { marginRight: '0.75rem', flexShrink: 0 };
        if (type === 'low_stock') return <Package size={22} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#eab308' }} />;
        if (type === 'overdue_payment') return <AlertCircle size={22} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#eab308' }} />;
        if (type === 'order_approval') return <Mail size={22} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#2563eb' }} />;
        if (type === 'operation') return <Truck size={22} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#0f766e' }} />;
        if (type === 'pending_order') return <AlertTriangle size={22} style={{ ...style, color: '#eab308' }} />;
        return <Lightbulb size={22} style={{ ...style, color: '#3b82f6' }} />;
    };

    const getSeverityLabel = (severity: string) => {
        if (severity === 'error') return 'High Action';
        if (severity === 'warning') return 'Needs Follow-up';
        return 'Insight';
    };

    const getSeverityBg = (severity: string) => {
        if (severity === 'error') return '#fee2e2';
        if (severity === 'warning') return '#fef3c7';
        return '#eff6ff';
    };

    const getSeverityColor = (severity: string) => {
        if (severity === 'error') return '#ef4444';
        if (severity === 'warning') return '#b45309';
        return '#1d4ed8';
    };

    return (
        <div className="container">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <ArrowLeft size={16} />
                        Back to Dashboard
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Notifications
                            {unreadCount > 0 && (
                                <span style={{
                                    fontSize: '0.8rem',
                                    padding: '4px 10px',
                                    borderRadius: '999px',
                                    background: '#ef4444',
                                    color: 'white',
                                    fontWeight: 700
                                }}>
                                    {unreadCount} new
                                </span>
                            )}
                        </h1>
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {unreadCount > 0 && (
                        <button className="btn btn-primary" onClick={markAllAsRead}>
                            <Check size={16} />
                            Mark All Read
                        </button>
                    )}
                    <button className="btn" onClick={refresh} style={{ background: 'white', border: '1px solid var(--color-border)' }}>
                        Refresh
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                    className="input"
                    value={activeFilter}
                    onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)}
                    style={{ width: '220px' }}
                >
                    <option value="all">All notifications</option>
                    <option value="order_approval">New orders (needs approval)</option>
                    <option value="operation">Operations</option>
                    <option value="pending_order">Pending orders</option>
                    <option value="overdue_payment">Overdue payments</option>
                    <option value="low_stock">Low stock</option>
                    <option value="insight">Buying insights</option>
                </select>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredNotifications.length === 0 ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Bell size={48} style={{ marginBottom: '1rem', opacity: 0.3, display: 'block', margin: '0 auto' }} />
                        <p style={{ fontWeight: 600 }}>All catch-up completed!</p>
                        <p style={{ fontSize: '0.85rem' }}>No notifications are active in this category.</p>
                    </div>
                ) : (
                    filteredNotifications.map((n) => (
                        <div
                            key={n.id}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                padding: '1.25rem',
                                borderRadius: '12px',
                                border: '1px solid var(--color-border)',
                                background: n.read ? 'var(--color-surface)' : 'rgba(99, 102, 241, 0.04)',
                                borderLeft: n.read ? '4px solid var(--color-border)' : `4px solid var(--color-primary)`,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: n.read ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.05)'
                            }}
                            onClick={() => {
                                markAsRead(n.id);
                                if (n.link) {
                                    window.location.href = n.link;
                                }
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateX(4px)';
                                e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.backgroundColor = n.read ? 'var(--color-surface)' : 'rgba(99, 102, 241, 0.04)';
                            }}
                        >
                            {getIcon(n.type, n.severity)}
                            
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{n.title}</span>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: getSeverityBg(n.severity),
                                        color: getSeverityColor(n.severity)
                                    }}>
                                        {getSeverityLabel(n.severity)}
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-main)', margin: 0, lineHeight: 1.4 }}>
                                    {n.message}
                                </p>
                                {n.details?.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', marginTop: '0.6rem' }}>
                                        {n.details.map((detail: any) => (
                                            <div key={`${n.id}-${detail.label}`} style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.55rem', background: 'rgba(255,255,255,0.55)' }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{detail.label}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-main)', whiteSpace: 'pre-wrap', maxHeight: detail.value.length > 180 ? '120px' : 'none', overflow: 'auto' }}>{detail.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                    {new Date(n.timestamp).toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
                                {!n.read && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            markAsRead(n.id);
                                        }}
                                        className="btn"
                                        style={{ 
                                            padding: '0.35rem 0.75rem', 
                                            fontSize: '0.75rem', 
                                            background: 'white', 
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text-main)'
                                        }}
                                    >
                                        Mark Read
                                    </button>
                                )}
                                {n.type === 'order_approval' && n.orderId ? (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void approveOrder(n.id, n.orderId);
                                            }}
                                            disabled={actioningId === n.id}
                                            className="btn btn-primary"
                                            style={{ padding: '0.45rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                        >
                                            <Check size={14} />
                                            Approve
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void rejectOrder(n.id, n.orderId);
                                            }}
                                            disabled={actioningId === n.id}
                                            className="btn"
                                            style={{ padding: '0.45rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap', background: 'white', border: '1px solid #fca5a5', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                        >
                                            <X size={14} />
                                            Reject
                                        </button>
                                    </>
                                ) : n.link && (
                                    <Link
                                        href={n.link}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            markAsRead(n.id);
                                        }}
                                        className="btn btn-primary"
                                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                    >
                                        {n.actionLabel || 'Open'}
                                    </Link>
                                )}
                                {n.secondaryLink && (
                                    <Link
                                        href={n.secondaryLink}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            markAsRead(n.id);
                                        }}
                                        className="btn"
                                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap', background: 'white', border: '1px solid var(--color-border)' }}
                                    >
                                        {n.secondaryActionLabel || 'View'}
                                    </Link>
                                )}
                                {n.link && !n.actionLabel && (
                                    <ArrowRight size={18} style={{ color: 'var(--color-text-muted)', opacity: 0.6 }} />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
