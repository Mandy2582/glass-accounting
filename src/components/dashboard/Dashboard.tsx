'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import { TrendingUp, AlertCircle, RefreshCw, ArrowUpRight, ArrowDownRight, Package, AlertTriangle, IndianRupee, ShoppingCart, FileText, ClipboardList, Route, CheckCircle, type LucideIcon } from 'lucide-react';
import { formatIndianCurrency, roundCurrency } from '@/lib/utils';
import { getOrderWorkSummary } from '@/lib/orderWork';

export default function Dashboard() {
    type LowStockItem = {
        id: string;
        name: string;
        stock: number;
        min_stock: number;
        unit: string;
    };

    const router = useRouter();
    const [stats, setStats] = useState({
        totalSales: 0,
        totalPurchases: 0,
        totalReceivables: 0,
        totalPayables: 0,
        lowStockItems: 0,
        totalItems: 0
    });
    const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
    const [lowStockDetails, setLowStockDetails] = useState<LowStockItem[]>([]);
    const [operationsSummary, setOperationsSummary] = useState({ openTasks: 0, overdue: 0, dueToday: 0, pendingCollection: 0 });
    const [loading, setLoading] = useState(false);
    const [currentDate, setCurrentDate] = useState('');
    const [greeting, setGreeting] = useState('');
    const [error, setError] = useState<string | null>(null);
    const visibleLowStockDetails = lowStockDetails.slice(0, 8);
    const netPosition = stats.totalReceivables - stats.totalPayables;
    const stockAlertLabel = stats.lowStockItems > 0 ? `${stats.lowStockItems} low stock` : 'Stock healthy';

    useEffect(() => {
        // Auth check bypassed for demo
        setCurrentDate(new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 17) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');

        loadStats();

        const handleFocus = () => loadStats();
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    const loadStats = async () => {
        setLoading(true);
        setError(null);
        try {
            // Use optimized queries
            const [statsData, recentInvoicesData, lowStock, orders] = await Promise.all([
                db.dashboard.getStats(),
                db.invoices.getRecent(5),
                db.reports.getLowStockItems(),
                db.orders.getAll(),
            ]);

            setStats(statsData);
            setRecentInvoices(recentInvoicesData);
            setLowStockDetails(lowStock);

            const todayKey = new Date().toISOString().slice(0, 10);
            const openTasks = orders
                .filter(order => order.type === 'sale_order' && order.status !== 'cancelled')
                .flatMap(order => getOrderWorkSummary(order).open.map(task => ({ order, task })));
            // Dedupe by order before summing balances -- an order with both an
            // open transport and installation task would otherwise count its
            // balance due twice.
            const ordersWithOpenWork = new Map(openTasks.map(({ order }) => [order.id, order]));
            setOperationsSummary({
                openTasks: openTasks.length,
                dueToday: openTasks.filter(({ task }) => task.scheduledDate === todayKey).length,
                overdue: openTasks.filter(({ task }) => task.scheduledDate && task.scheduledDate < todayKey).length,
                pendingCollection: roundCurrency(Array.from(ordersWithOpenWork.values()).reduce((sum, order) => (
                    sum + Math.max(0, roundCurrency(order.total - (order.paidAmount || 0)))
                ), 0)),
            });
        } catch (err: unknown) {
            console.error('Dashboard Error:', err);
            setError('Failed to load data. Please check your connection or database setup.');
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ title, value, icon: Icon, color, subColor, suffix, onClick }: {
        title: string;
        value: number | string;
        icon: LucideIcon;
        color: string;
        subColor: string;
        suffix?: string;
        onClick?: () => void;
    }) => (
        <div
            className="card dashboard-stat-card"
            style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '1.25rem 1.5rem',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onClick={onClick}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 25px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ padding: '0.6rem', borderRadius: '10px', background: subColor, color: color }}>
                    <Icon size={22} />
                </div>
                {/* Decorative background icon */}
                <Icon size={80} style={{ position: 'absolute', right: -15, bottom: -15, opacity: 0.04, color: color }} />
            </div>
            <div>
                <p style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{title}</p>
                <h3 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }} title={typeof value === 'number' ? formatIndianCurrency(value) : String(value)}>
                    {typeof value === 'number' ? formatIndianCurrency(value) : value}{suffix || ''}
                </h3>
            </div>
        </div>
    );

    return (
        <div className="container">
            <div className="dashboard-hero">
                <div>
                    <p className="dashboard-kicker">{currentDate}</p>
                    <h1>{greeting}</h1>
                    <p>Today&apos;s snapshot for Arjun Glass House.</p>
                </div>
                <div className="dashboard-hero-stats">
                    <div>
                        <span>Net Position</span>
                        <strong className={netPosition >= 0 ? 'positive' : 'negative'}>{formatIndianCurrency(netPosition)}</strong>
                    </div>
                    <div>
                        <span>Inventory</span>
                        <strong>{stockAlertLabel}</strong>
                    </div>
                </div>
                <div className="dashboard-actions">
                    <button
                        onClick={() => router.push('/orders/new')}
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem' }}
                    >
                        <ClipboardList size={16} />
                        New Order
                    </button>
                    <button
                        onClick={() => router.push('/sales')}
                        className="btn"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem' }}
                    >
                        <FileText size={16} />
                        New Invoice
                    </button>
                    <button
                        onClick={loadStats}
                        className="btn"
                        style={{
                            background: 'white',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    borderRadius: '8px',
                    background: '#fee2e2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            <div style={{ marginBottom: '2rem' }}>
                <h2 className="dashboard-section-title">
                    <IndianRupee size={18} />
                    Business Snapshot
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <StatCard
                        title="Total Sales"
                        value={stats.totalSales}
                        icon={TrendingUp}
                        color="#166534"
                        subColor="#dcfce7"
                        onClick={() => router.push('/sales')}
                    />
                    <StatCard
                        title="Receivables"
                        value={stats.totalReceivables}
                        icon={ArrowDownRight}
                        color="#0369a1"
                        subColor="#e0f2fe"
                        onClick={() => router.push('/parties')}
                    />
                    <StatCard
                        title="Total Purchases"
                        value={stats.totalPurchases}
                        icon={ShoppingCart}
                        color="#c2410c"
                        subColor="#ffedd5"
                        onClick={() => router.push('/purchases')}
                    />
                    <StatCard
                        title="Payables"
                        value={stats.totalPayables}
                        icon={ArrowUpRight}
                        color="#b91c1c"
                        subColor="#fee2e2"
                        onClick={() => router.push('/parties')}
                    />
                </div>
            </div>

            {(operationsSummary.openTasks > 0 || operationsSummary.overdue > 0) && (
                <div style={{ marginBottom: '2rem' }}>
                    <h2 className="dashboard-section-title">
                        <Route size={18} />
                        Operations Snapshot
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <StatCard
                            title="Open Transport / Installation"
                            value={operationsSummary.openTasks}
                            icon={Route}
                            color="#2563eb"
                            subColor="#dbeafe"
                            onClick={() => router.push('/operations')}
                        />
                        <StatCard
                            title="Overdue"
                            value={operationsSummary.overdue}
                            icon={AlertTriangle}
                            color="#b91c1c"
                            subColor="#fee2e2"
                            onClick={() => router.push('/operations')}
                        />
                        <StatCard
                            title="Due Today"
                            value={operationsSummary.dueToday}
                            icon={CheckCircle}
                            color="#0f766e"
                            subColor="#ccfbf1"
                            onClick={() => router.push('/operations')}
                        />
                        <StatCard
                            title="Pending Collection"
                            value={operationsSummary.pendingCollection}
                            icon={IndianRupee}
                            color="#7c3aed"
                            subColor="#ede9fe"
                            onClick={() => router.push('/operations')}
                        />
                    </div>
                </div>
            )}

            {/* Three Column Grid */}
            <div className="dashboard-content-grid">
                {/* Low Stock Alerts */}
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                        <AlertTriangle size={18} />
                        Low Stock Alerts
                        {lowStockDetails.length > 0 && (
                            <span style={{
                                background: '#ef4444',
                                color: 'white',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                animation: 'pulse 2s infinite'
                            }}>
                                {lowStockDetails.length}
                            </span>
                        )}
                    </h2>
                    <div className="card" style={{ padding: 0, overflow: 'hidden', maxHeight: '320px', overflowY: 'auto' }}>
                        {lowStockDetails.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                <Package size={36} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
                                <p style={{ fontSize: '0.875rem' }}>All items are well stocked.</p>
                            </div>
                        ) : (
                            visibleLowStockDetails.map((item, idx) => (
                                <div key={item.id || idx} style={{
                                    padding: '0.75rem 1rem',
                                    borderBottom: '1px solid var(--color-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: item.stock <= 0 ? '#fef2f2' : 'transparent'
                                }}>
                                    <div>
                                        <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.name}</p>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                            Min: {item.min_stock || 0} {item.unit}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            color: item.stock <= 0 ? '#dc2626' : '#f59e0b',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: item.stock <= 0 ? '#fee2e2' : '#fef3c7'
                                        }}>
                                            {item.stock} {item.unit}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                        {lowStockDetails.length > visibleLowStockDetails.length && (
                            <button
                                type="button"
                                onClick={() => router.push('/inventory')}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    border: 'none',
                                    background: 'rgba(99, 102, 241, 0.06)',
                                    color: 'var(--color-primary)',
                                    cursor: 'pointer',
                                    fontWeight: 700
                                }}
                            >
                                View all {lowStockDetails.length} alerts in Inventory
                            </button>
                        )}
                    </div>
                </div>

                {/* Inventory Quick Stats */}
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                        <Package size={18} />
                        Inventory Health
                    </h2>
                    <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '1rem' }}>
                        <div className="card" style={{
                            padding: '1.25rem',
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            color: 'white',
                            cursor: 'pointer',
                            transition: 'transform 0.2s'
                        }}
                            onClick={() => router.push('/inventory')}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                        >
                            <Package size={22} style={{ marginBottom: '0.5rem', opacity: 0.9 }} />
                            <p style={{ fontSize: '0.8rem', opacity: 0.85, marginBottom: '0.125rem' }}>Total Items</p>
                            <h3 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats.totalItems}</h3>
                        </div>
                        <div className="card" style={{
                            padding: '1.25rem',
                            background: stats.lowStockItems > 0
                                ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            cursor: 'pointer',
                            transition: 'transform 0.2s'
                        }}
                            onClick={() => router.push('/inventory')}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                        >
                            <AlertCircle size={22} style={{ marginBottom: '0.5rem', opacity: 0.9 }} />
                            <p style={{ fontSize: '0.8rem', opacity: 0.85, marginBottom: '0.125rem' }}>
                                {stats.lowStockItems > 0 ? 'Low Stock Alerts' : 'Stock Status'}
                            </p>
                            <h3 style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                                {stats.lowStockItems > 0 ? stats.lowStockItems : 'All Good'}
                            </h3>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                        <RefreshCw size={18} />
                        Recent Activity
                    </h2>
                    <div className="card" style={{ padding: 0, overflow: 'hidden', maxHeight: '320px', overflowY: 'auto' }}>
                        {recentInvoices.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                <FileText size={36} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
                                <p style={{ fontSize: '0.875rem' }}>No recent activity</p>
                            </div>
                        ) : (
                            recentInvoices.map((inv, idx) => (
                                <div key={inv.id} style={{
                                    padding: '0.75rem 1rem',
                                    borderBottom: idx < recentInvoices.length - 1 ? '1px solid var(--color-border)' : 'none',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s'
                                }}
                                    onClick={() => router.push('/sales')}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.125rem' }}>
                                            <span style={{
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                background: (inv.type || 'sale') === 'sale' ? '#dcfce7' : '#e0f2fe',
                                                color: (inv.type || 'sale') === 'sale' ? '#166534' : '#0369a1',
                                                textTransform: 'uppercase'
                                            }}>
                                                {(inv.type || 'sale')}
                                            </span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{inv.partyName}</span>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                            {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                        </span>
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                                        {formatIndianCurrency(inv.total)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
