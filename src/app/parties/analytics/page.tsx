'use client';

import { useState, useEffect, Fragment } from 'react';
import { getCustomerAnalytics } from '@/lib/notificationEngine';
import { db } from '@/lib/storage';
import { ArrowLeft, Search, TrendingUp, AlertTriangle, MessageCircle, DollarSign, Calendar, Clock, BarChart2, ShieldAlert, ChevronDown, ChevronUp, History } from 'lucide-react';
import Link from 'next/link';
import { formatIndianCurrency } from '@/lib/utils';

export default function CustomerAnalyticsPage() {
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [filteredAnalytics, setFilteredAnalytics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'urge' | 'risk'>('all');
    const [expandedCustomerIds, setExpandedCustomerIds] = useState<string[]>([]);

    const toggleExpand = (id: string) => {
        setExpandedCustomerIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Summary aggregates
    const [summary, setSummary] = useState({
        totalOutstanding: 0,
        avgDso: 0,
        urgeCount: 0,
        riskCount: 0
    });

    useEffect(() => {
        loadAnalytics();
    }, []);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const data = await getCustomerAnalytics();
            setAnalytics(data);
            
            // Calculate summary stats
            const totalOutstanding = data.reduce((sum, item) => sum + Math.max(0, item.outstandingBalance), 0);
            const activeCustomersWithSales = data.filter(item => item.totalSales > 0);
            const avgDso = activeCustomersWithSales.length > 0 
                ? activeCustomersWithSales.reduce((sum, item) => sum + item.dsoDays, 0) / activeCustomersWithSales.length
                : 0;
            const urgeCount = data.filter(item => item.recommendationType === 'urge').length;
            const riskCount = data.filter(item => item.recommendationType === 'risk').length;

            setSummary({
                totalOutstanding,
                avgDso,
                urgeCount,
                riskCount
            });
        } catch (error) {
            console.error('Error loading customer analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let result = [...analytics];

        // Search Filter
        if (search) {
            result = result.filter(item => 
                item.name.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Tab Filter
        if (activeTab === 'urge') {
            result = result.filter(item => item.recommendationType === 'urge');
        } else if (activeTab === 'risk') {
            result = result.filter(item => item.recommendationType === 'risk');
        }

        // Sort: highest sales first by default
        result.sort((a, b) => b.totalSales - a.totalSales);

        setFilteredAnalytics(result);
    }, [analytics, search, activeTab]);

    const formatCurrency = formatIndianCurrency;

    const triggerWhatsApp = (phone: string, message: string) => {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    if (loading) return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>Loading customer buying intelligence...</div>;

    return (
        <div className="container">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/parties" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <ArrowLeft size={16} />
                        Back
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Customer Analytics & Intelligence</h1>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Predict customer buying patterns and credit risks</p>
                    </div>
                </div>
                <button
                    onClick={async () => {
                        if (confirm('Do you want to seed dummy customer analytics test data into your database?')) {
                            try {
                                const { seedAnalyticsTestData } = await import('@/lib/notificationEngine');
                                await seedAnalyticsTestData();
                                alert('Analytics and notification test data successfully seeded! Reloading...');
                                window.location.reload();
                            } catch (e: any) {
                                alert(`Failed to seed: ${e.message}`);
                            }
                        }
                    }}
                    className="btn"
                    style={{ background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                    Seed Test Data
                </button>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #10b981' }}>
                    <div style={{ background: '#dcfce7', color: '#10b981', padding: '0.5rem', borderRadius: '8px' }}>
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>OUTSTANDING DUES</p>
                        <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{formatCurrency(summary.totalOutstanding)}</h3>
                    </div>
                </div>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ background: '#dbeafe', color: '#3b82f6', padding: '0.5rem', borderRadius: '8px' }}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>AVG PAYMENT DELAY</p>
                        <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{Math.round(summary.avgDso)} Days</h3>
                    </div>
                </div>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #eab308', cursor: 'pointer' }} onClick={() => setActiveTab('urge')}>
                    <div style={{ background: '#fef9c3', color: '#eab308', padding: '0.5rem', borderRadius: '8px' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>URGE CHECK-INS</p>
                        <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{summary.urgeCount} Accounts</h3>
                    </div>
                </div>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #ef4444', cursor: 'pointer' }} onClick={() => setActiveTab('risk')}>
                    <div style={{ background: '#fee2e2', color: '#ef4444', padding: '0.5rem', borderRadius: '8px' }}>
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>CREDIT RISK WARNINGS</p>
                        <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{summary.riskCount} Accounts</h3>
                    </div>
                </div>
            </div>

            {/* Filter and Tab Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '8px', gap: '4px' }}>
                    <button
                        onClick={() => setActiveTab('all')}
                        style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === 'all' ? 'white' : 'transparent',
                            color: activeTab === 'all' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        All Customers
                    </button>
                    <button
                        onClick={() => setActiveTab('urge')}
                        style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === 'urge' ? 'white' : 'transparent',
                            color: activeTab === 'urge' ? '#eab308' : 'var(--color-text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Urge to Buy ({summary.urgeCount})
                    </button>
                    <button
                        onClick={() => setActiveTab('risk')}
                        style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === 'risk' ? 'white' : 'transparent',
                            color: activeTab === 'risk' ? '#ef4444' : 'var(--color-text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Credit Risks ({summary.riskCount})
                    </button>
                </div>

                {/* Search Bar */}
                <div style={{ position: 'relative', width: '300px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search customers..."
                        className="input"
                        style={{ paddingLeft: '2.5rem' }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Analytics Table */}
            <div className="card" style={{ padding: '0.5rem', overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', minWidth: '950px' }}>
                    <thead>
                        <tr>
                            <th>Customer Name</th>
                            <th style={{ textAlign: 'right' }}>Total Sales (Val)</th>
                            <th>Most Preferred Item</th>
                            <th style={{ textAlign: 'center' }}>Frequency</th>
                            <th style={{ textAlign: 'center' }}>Last Purchase</th>
                            <th style={{ textAlign: 'right' }}>Dues Balance</th>
                            <th style={{ textAlign: 'center' }}>Avg Delay (DSO)</th>
                            <th style={{ textAlign: 'center' }}>Peak Order Week</th>
                            <th>Action & Recommendations</th>
                            <th style={{ width: '130px' }}>Quick Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAnalytics.map((item) => (
                            <Fragment key={item.id}>
                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <td style={{ fontWeight: 600 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <button
                                                onClick={() => toggleExpand(item.id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    padding: '4px',
                                                    color: 'var(--color-text-muted)',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderRadius: '4px',
                                                    transition: 'all 0.2s',
                                                }}
                                                title="View Purchase History"
                                            >
                                                {expandedCustomerIds.includes(item.id) ? (
                                                    <ChevronUp size={16} />
                                                ) : (
                                                    <ChevronDown size={16} />
                                                )}
                                            </button>
                                            <Link href={`/parties/${item.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                                                {item.name}
                                            </Link>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                                        {formatCurrency(item.totalSales)}
                                        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                            {item.orderCount} order(s)
                                        </p>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                            {item.topItem}
                                        </span>
                                        {item.topItemArea > 0 && (
                                            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                                {item.topItemArea.toFixed(1)} sqft ({item.topItemQty} pcs)
                                            </p>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        Every {Math.round(item.frequencyDays)} days
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {item.lastPurchaseDate}
                                        {item.daysSinceLast < 999 && (
                                            <p style={{ fontSize: '0.75rem', color: item.recommendationType === 'urge' ? '#eab308' : 'var(--color-text-muted)', margin: 0, fontWeight: item.recommendationType === 'urge' ? 600 : 400 }}>
                                                {Math.round(item.daysSinceLast)} days ago
                                            </p>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: item.outstandingBalance > 0 ? '#166534' : 'inherit' }}>
                                        {formatCurrency(item.outstandingBalance)}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 500 }}>
                                        {Math.round(item.dsoDays)} Days
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {item.peakWeek > 0 ? (
                                            <span style={{ 
                                                padding: '2px 8px', 
                                                borderRadius: '4px', 
                                                background: '#eff6ff', 
                                                color: '#1e40af', 
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                            }}>
                                                Week {item.peakWeek}
                                            </span>
                                        ) : 'N/A'}
                                    </td>
                                    <td>
                                        <span style={{
                                            fontSize: '0.8rem',
                                            fontWeight: 500,
                                            color: 
                                                item.recommendationType === 'risk' ? '#ef4444' :
                                                item.recommendationType === 'urge' ? '#b45309' :
                                                'var(--color-text-muted)'
                                        }}>
                                            {item.recommendation}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                            {item.recommendationType === 'urge' && (
                                                <button
                                                    className="btn"
                                                    onClick={() => triggerWhatsApp(
                                                        item.phone,
                                                        `Hello ${item.name}, we noticed you haven't placed an order in ${Math.round(item.daysSinceLast)} days. Is there any glass project/requirement we can help you with today? - Arjun Glass House`
                                                    )}
                                                    style={{ 
                                                        padding: '0.25rem 0.5rem', 
                                                        background: '#22c55e', 
                                                        color: 'white', 
                                                        border: 'none', 
                                                        fontSize: '0.75rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}
                                                >
                                                    <MessageCircle size={14} />
                                                    Ping
                                                </button>
                                            )}
                                            {item.recommendationType === 'risk' && (
                                                <button
                                                    className="btn"
                                                    onClick={() => triggerWhatsApp(
                                                        item.phone,
                                                        `Dear ${item.name}, this is a friendly reminder regarding your outstanding dues of ₹${item.outstandingBalance.toLocaleString('en-IN')} which are overdue. Please clear them at your earliest convenience. Thank you - Arjun Glass House`
                                                    )}
                                                    style={{ 
                                                        padding: '0.25rem 0.5rem', 
                                                        background: '#ef4444', 
                                                        color: 'white', 
                                                        border: 'none', 
                                                        fontSize: '0.75rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}
                                                >
                                                    <MessageCircle size={14} />
                                                    Remind
                                                </button>
                                            )}
                                            {item.recommendationType === 'neutral' && (
                                                <Link
                                                    href={`/parties/${item.id}`}
                                                    className="btn"
                                                    style={{ 
                                                        padding: '0.25rem 0.5rem', 
                                                        background: 'var(--color-bg)', 
                                                        border: '1px solid var(--color-border)', 
                                                        fontSize: '0.75rem',
                                                        textDecoration: 'none'
                                                    }}
                                                >
                                                    Ledger
                                                </Link>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                {expandedCustomerIds.includes(item.id) && (
                                    <tr style={{ background: 'rgba(0,0,0,0.015)' }}>
                                        <td colSpan={10} style={{ padding: '1rem 1.5rem 1.5rem 1.5rem' }}>
                                            <div style={{
                                                background: 'white',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '8px',
                                                padding: '1.25rem',
                                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                            }}>
                                                <h4 style={{ 
                                                    fontSize: '0.9rem', 
                                                    fontWeight: 600, 
                                                    marginBottom: '1rem', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '0.5rem',
                                                    color: 'var(--color-text)'
                                                }}>
                                                    <History size={16} style={{ color: 'var(--color-primary)' }} />
                                                    Purchase & Order History
                                                </h4>
                                                {item.purchaseHistory && item.purchaseHistory.length > 0 ? (
                                                    <div style={{ overflowX: 'auto' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                                                    <th style={{ padding: '0.75rem 0.5rem' }}>Invoice Number</th>
                                                                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                                                                    <th style={{ padding: '0.75rem 0.5rem' }}>Items Purchased</th>
                                                                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Amount</th>
                                                                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Payment Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {item.purchaseHistory.map((inv: any) => (
                                                                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                                            {inv.number}
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>
                                                                            {inv.date}
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text)', maxWidth: '450px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inv.items}>
                                                                            {inv.items}
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                                                                            {formatCurrency(inv.total)}
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                                                            <span style={{
                                                                                padding: '4px 8px',
                                                                                borderRadius: '12px',
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: 600,
                                                                                display: 'inline-block',
                                                                                background: 
                                                                                    inv.status === 'paid' ? '#dcfce7' :
                                                                                    inv.status === 'partially_paid' ? '#fef9c3' :
                                                                                    '#fee2e2',
                                                                                color: 
                                                                                    inv.status === 'paid' ? '#166534' :
                                                                                    inv.status === 'partially_paid' ? '#854d0e' :
                                                                                    '#991b1b',
                                                                            }}>
                                                                                {inv.status.replace('_', ' ').toUpperCase()}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                                                        No purchase invoices found for this customer.
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                        {filteredAnalytics.length === 0 && (
                            <tr>
                                <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    No customer records found matching search filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
