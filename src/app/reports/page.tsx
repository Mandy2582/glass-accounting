'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/storage';
import { FileText, TrendingUp, AlertCircle, IndianRupee, ArrowUpRight, ShoppingBag } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatIndianCurrency } from '@/lib/utils';

export default function ReportsPage() {
    type MonthlyMetric = { month: string; Revenue: number; Expenses: number };

    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        revenue: 0,
        netProfit: 0,
        gstLiability: 0,
        receivables: 0,
        payables: 0,
        monthlyData: [] as MonthlyMetric[]
    });

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const [invoices, vouchers, parties] = await Promise.all([
                db.invoices.getAll(),
                db.vouchers.getAll(),
                db.parties.getAll()
            ]);

            const sales = invoices.filter(i => i.type === 'sale');
            const purchases = invoices.filter(i => i.type === 'purchase');

            // 1. Revenue
            const revenue = sales.reduce((sum, i) => sum + i.subtotal, 0);

            // 2. Gross Profit & Net Profit calculation
            let cogs = 0;
            sales.forEach(sale => {
                sale.items.forEach(invItem => {
                    if (invItem.cost_amount !== undefined && invItem.cost_amount !== null && invItem.cost_amount > 0) {
                        cogs += Number(invItem.cost_amount);
                    } else {
                        const isGlass = invItem.unit !== 'nos';
                        cogs += (invItem.rate * 0.7) * (isGlass ? invItem.sqft : invItem.quantity); // Fallback estimation
                    }
                });
            });

            const expenses = vouchers.filter(v => v.type === 'expense').reduce((sum, v) => sum + v.amount, 0);
            const netProfit = revenue - cogs - expenses;

            // 3. GST Liability (Sales GST - Purchase GST)
            const salesGst = sales.reduce((sum, i) => sum + (i.total - i.subtotal), 0);
            const purchaseGst = purchases.reduce((sum, i) => sum + (i.total - i.subtotal), 0);
            const gstLiability = salesGst - purchaseGst;

            // 4. Receivables & Payables
            const receivables = parties.filter(p => p.type === 'customer' && p.balance > 0).reduce((sum, p) => sum + p.balance, 0);
            const payables = parties.filter(p => p.type === 'supplier' && p.balance < 0).reduce((sum, p) => sum + Math.abs(p.balance), 0);

            // 5. Monthly breakdown for chart
            const monthsMap: Record<string, { month: string; Revenue: number; Expenses: number }> = {};
            
            // Initializing last 6 months
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
                monthsMap[label] = { month: label, Revenue: 0, Expenses: 0 };
            }

            sales.forEach(inv => {
                const monthLabel = new Date(inv.date).toLocaleString('default', { month: 'short', year: '2-digit' });
                if (monthsMap[monthLabel]) {
                    monthsMap[monthLabel].Revenue += inv.subtotal;
                }
            });

            vouchers.filter(v => v.type === 'expense').forEach(v => {
                const monthLabel = new Date(v.date).toLocaleString('default', { month: 'short', year: '2-digit' });
                if (monthsMap[monthLabel]) {
                    monthsMap[monthLabel].Expenses += v.amount;
                }
            });

            const monthlyData = Object.values(monthsMap);

            setMetrics({
                revenue,
                netProfit,
                gstLiability,
                receivables,
                payables,
                monthlyData
            });
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="container" style={{ textAlign: 'center', padding: '3rem' }}>Loading Reports Centre...</div>;
    }

    return (
        <div className="container">
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Reports Centre</h1>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '4px solid var(--color-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                        <span>Total Revenue</span>
                        <IndianRupee size={16} />
                    </div>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatIndianCurrency(metrics.revenue)}</span>
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '4px solid #10b981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                        <span>Net Profit</span>
                        <TrendingUp size={16} />
                    </div>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: metrics.netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatIndianCurrency(metrics.netProfit)}
                    </span>
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                        <span>Net GST Liability</span>
                        <FileText size={16} />
                    </div>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatIndianCurrency(metrics.gstLiability)}</span>
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                        <span>Outstanding Receivables</span>
                        <ArrowUpRight size={16} />
                    </div>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{formatIndianCurrency(metrics.receivables)}</span>
                </div>
            </div>

            {/* Chart Section */}
            <div className="card" style={{ marginBottom: '2rem', height: '350px' }}>
                <h3 style={{ marginBottom: '1rem', fontWeight: 600, fontSize: '1rem' }}>Revenue vs Expenses (Last 6 Months)</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={metrics.monthlyData}>
                        <defs>
                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => formatIndianCurrency(Number(value))} />
                        <Legend />
                        <Area type="monotone" dataKey="Revenue" stroke="var(--color-primary)" fillOpacity={1} fill="url(#colorRev)" />
                        <Area type="monotone" dataKey="Expenses" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExp)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Navigation Grid */}
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Detailed Analysis & Reports</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                <Link href="/reports/outstanding" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'all 0.2s', borderLeft: '3px solid #3b82f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', background: '#eff6ff', color: '#3b82f6' }}>
                            <AlertCircle size={20} />
                        </div>
                        <h4 style={{ fontWeight: 600, margin: 0 }}>Outstanding Reports</h4>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                        View exact receivables from customers and payables to suppliers.
                    </p>
                </Link>

                <Link href="/reports/sales" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'all 0.2s', borderLeft: '3px solid var(--color-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', background: '#e0e7ff', color: 'var(--color-primary)' }}>
                            <TrendingUp size={20} />
                        </div>
                        <h4 style={{ fontWeight: 600, margin: 0 }}>Sales Analysis & Projections</h4>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                        Analyse sales trends and see automated 3-month sales forecasts.
                    </p>
                </Link>

                <Link href="/reports/profit-loss" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'all 0.2s', borderLeft: '3px solid #10b981' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', background: '#ecfdf5', color: '#10b981' }}>
                            <ShoppingBag size={20} />
                        </div>
                        <h4 style={{ fontWeight: 600, margin: 0 }}>Profit & Loss Statements</h4>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                        Inspect cost margins, operational expenditures, and monthly net profit margins.
                    </p>
                </Link>

                <Link href="/reports/gst" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'all 0.2s', borderLeft: '3px solid #f59e0b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', background: '#fffbeb', color: '#f59e0b' }}>
                            <FileText size={20} />
                        </div>
                        <h4 style={{ fontWeight: 600, margin: 0 }}>GST Compliance Hub</h4>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                        Calculate GSTR-1 and GSTR-3B tax details and export XML/PDF records.
                    </p>
                </Link>
            </div>
        </div>
    );
}
