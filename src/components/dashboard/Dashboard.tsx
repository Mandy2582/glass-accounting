'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import { TrendingUp, Users, AlertCircle, DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight, Package } from 'lucide-react';

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalSales: 0,
        totalPurchases: 0,
        totalReceivables: 0,
        totalPayables: 0,
        lowStockItems: 0,
        totalItems: 0
    });
    const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentDate, setCurrentDate] = useState('');

    useEffect(() => {
        setCurrentDate(new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        loadStats();

        const handleFocus = () => loadStats();
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    const [error, setError] = useState<string | null>(null);

    const loadStats = async () => {
        setLoading(true);
        setError(null);
        try {
            // Use optimized queries
            const [statsData, recentInvoicesData] = await Promise.all([
                db.dashboard.getStats(),
                db.invoices.getRecent(5)
            ]);

            setStats(statsData);
            setRecentInvoices(recentInvoicesData);
        } catch (err: any) {
            console.error('Dashboard Error:', err);
            setError('Failed to load data. Please check your connection or database setup.');
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ title, value, icon: Icon, color, subColor }: any) => (
        <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: subColor, color: color }}>
                    <Icon size={24} />
                </div>
                {/* Decorative background icon */}
                <Icon size={100} style={{ position: 'absolute', right: -20, bottom: -20, opacity: 0.05, color: color }} />
            </div>
            <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{title}</p>
                <h3 style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }} title={typeof value === 'number' ? `₹${value.toLocaleString()}` : value}>
                    {typeof value === 'number' ? `₹${value.toLocaleString()}` : value}
                </h3>
            </div>
        </div>
    );

    return (
        <div className="container">
            {/* Header Section */}
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{currentDate}</p>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em' }}>Welcome back!</h1>
                </div>
                <button
                    onClick={loadStats}
                    className="btn"
                    style={{ background: 'white', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    disabled={loading}
                >
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    {loading ? 'Refreshing...' : 'Refresh Data'}
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    borderRadius: '8px',
                    background: '#fee2e2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca'
                }}>
                    {error}
                </div>
            )}

            {/* Financial Overview */}
            <div style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <DollarSign size={20} className="text-muted" />
                    Financial Overview
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                    <StatCard
                        title="Total Sales"
                        value={stats.totalSales}
                        icon={TrendingUp}
                        color="#166534"
                        subColor="#dcfce7"
                    />
                    <StatCard
                        title="Receivables"
                        value={stats.totalReceivables}
                        icon={ArrowDownRight}
                        color="#0369a1"
                        subColor="#e0f2fe"
                    />
                    <StatCard
                        title="Total Purchases"
                        value={stats.totalPurchases}
                        icon={DollarSign}
                        color="#c2410c"
                        subColor="#ffedd5"
                    />
                    <StatCard
                        title="Payables"
                        value={stats.totalPayables}
                        icon={ArrowUpRight}
                        color="#b91c1c"
                        subColor="#fee2e2"
                    />
                </div>
            </div>

            {/* Inventory & Activity Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>

                {/* Inventory Health */}
                <div>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Package size={20} className="text-muted" />
                        Inventory Health
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: 'white' }}>
                            <div style={{ marginBottom: '1rem', opacity: 0.9 }}>
                                <Package size={24} />
                            </div>
                            <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Total Items</p>
                            <h3 style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.totalItems}</h3>
                        </div>
                        <div className="card" style={{ padding: '1.5rem', background: stats.lowStockItems > 0 ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                            <div style={{ marginBottom: '1rem', opacity: 0.9 }}>
                                <AlertCircle size={24} />
                            </div>
                            <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Low Stock Alerts</p>
                            <h3 style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.lowStockItems}</h3>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <RefreshCw size={20} className="text-muted" />
                        Recent Activity
                    </h2>
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <table className="table" style={{ margin: 0 }}>
                            <thead style={{ background: '#f9fafb' }}>
                                <tr>
                                    <th style={{ padding: '1rem' }}>Type</th>
                                    <th style={{ padding: '1rem' }}>Party</th>
                                    <th style={{ padding: '1rem', textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentInvoices.map(inv => (
                                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: (inv.type || 'sale') === 'sale' ? '#166534' : '#374151',
                                                    marginBottom: '0.125rem'
                                                }}>
                                                    {(inv.type || 'sale').toUpperCase()}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{new Date(inv.date).toLocaleDateString()}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: 500 }}>{inv.partyName}</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>₹{inv.total.toLocaleString()}</td>
                                    </tr>
                                ))}
                                {recentInvoices.length === 0 && (
                                    <tr>
                                        <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No recent activity</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
