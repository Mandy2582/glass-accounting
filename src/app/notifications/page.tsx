'use client';

import { useState, useEffect } from 'react';
import { useNotifications } from '@/components/NotificationContext';
import { db } from '@/lib/storage';
import { ArrowLeft, Bell, AlertCircle, AlertTriangle, Lightbulb, Package, Check, Trash2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function NotificationsHubPage() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications();
    const [activeFilter, setActiveFilter] = useState<'all' | 'insight' | 'pending_order' | 'overdue_payment' | 'low_stock'>('all');
    const [filteredNotifications, setFilteredNotifications] = useState<any[]>([]);

    useEffect(() => {
        let result = [...notifications];
        if (activeFilter !== 'all') {
            result = result.filter(n => n.type === activeFilter);
        }
        setFilteredNotifications(result);
    }, [notifications, activeFilter]);

    const getIcon = (type: string, severity: string) => {
        const style = { marginRight: '0.75rem', flexShrink: 0 };
        if (type === 'low_stock') return <Package size={22} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#eab308' }} />;
        if (type === 'overdue_payment') return <AlertCircle size={22} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#eab308' }} />;
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
                            Notifications Hub
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
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Follow up on critical items and business intelligence</p>
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

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', background: 'rgba(0,0,0,0.03)', padding: '6px', borderRadius: '8px' }}>
                <button
                    onClick={() => setActiveFilter('all')}
                    className="btn"
                    style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        background: activeFilter === 'all' ? 'var(--color-primary)' : 'transparent',
                        color: activeFilter === 'all' ? 'white' : 'var(--color-text-muted)',
                        border: 'none'
                    }}
                >
                    All Notifications
                </button>
                <button
                    onClick={() => setActiveFilter('insight')}
                    className="btn"
                    style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        background: activeFilter === 'insight' ? 'var(--color-primary)' : 'transparent',
                        color: activeFilter === 'insight' ? 'white' : 'var(--color-text-muted)',
                        border: 'none'
                    }}
                >
                    Buying Insights
                </button>
                <button
                    onClick={() => setActiveFilter('pending_order')}
                    className="btn"
                    style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        background: activeFilter === 'pending_order' ? 'var(--color-primary)' : 'transparent',
                        color: activeFilter === 'pending_order' ? 'white' : 'var(--color-text-muted)',
                        border: 'none'
                    }}
                >
                    Pending Orders
                </button>
                <button
                    onClick={() => setActiveFilter('overdue_payment')}
                    className="btn"
                    style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        background: activeFilter === 'overdue_payment' ? 'var(--color-primary)' : 'transparent',
                        color: activeFilter === 'overdue_payment' ? 'white' : 'var(--color-text-muted)',
                        border: 'none'
                    }}
                >
                    Overdue Payments
                </button>
                <button
                    onClick={() => setActiveFilter('low_stock')}
                    className="btn"
                    style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        background: activeFilter === 'low_stock' ? 'var(--color-primary)' : 'transparent',
                        color: activeFilter === 'low_stock' ? 'white' : 'var(--color-text-muted)',
                        border: 'none'
                    }}
                >
                    Low Stock Alerts
                </button>
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
                                alignItems: 'center',
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
                                {n.link && (
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
