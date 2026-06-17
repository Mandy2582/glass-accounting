'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { ArrowLeft, TrendingUp, Sparkles, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function ProfitLossPage() {
    const [data, setData] = useState({
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0
    });
    const [monthlyPL, setMonthlyPL] = useState<any[]>([]);
    const [projections, setProjections] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        calculatePL();
    }, []);

    const calculatePL = async () => {
        try {
            const [invoices, vouchers, items] = await Promise.all([
                db.invoices.getAll(),
                db.vouchers.getAll(),
                db.items.getAll()
            ]);

            const sales = invoices.filter(i => i.type === 'sale');

            // 1. Calculate overall metrics
            const revenue = sales.reduce((sum, i) => sum + i.subtotal, 0);

            let cogs = 0;
            sales.forEach(sale => {
                sale.items.forEach(invItem => {
                    if (invItem.cost_amount !== undefined && invItem.cost_amount !== null && invItem.cost_amount > 0) {
                        cogs += Number(invItem.cost_amount);
                    } else {
                        const itemDef = items.find(i => i.id === invItem.itemId);
                        const isGlass = itemDef ? itemDef.category !== 'hardware' : invItem.unit !== 'nos';
                        const costPrice = itemDef?.purchaseRate || 0;
                        if (isGlass) {
                            cogs += costPrice * invItem.sqft;
                        } else {
                            cogs += costPrice * invItem.quantity;
                        }
                    }
                });
            });

            const expenseVouchers = vouchers.filter(v => v.type === 'expense');
            const expenses = expenseVouchers.reduce((sum, v) => sum + v.amount, 0);

            setData({
                revenue,
                cogs,
                grossProfit: revenue - cogs,
                expenses,
                netProfit: revenue - cogs - expenses
            });

            // 2. Monthly P&L Breakdown (last 6 months)
            const monthsMap: Record<string, { month: string; rawDate: Date; Revenue: number; COGS: number; GrossProfit: number; Expenses: number; NetProfit: number; 'G.P. Margin (%)': number; 'N.P. Margin (%)': number }> = {};
            
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
                monthsMap[label] = {
                    month: label,
                    rawDate: new Date(d.getFullYear(), d.getMonth(), 1),
                    Revenue: 0,
                    COGS: 0,
                    GrossProfit: 0,
                    Expenses: 0,
                    NetProfit: 0,
                    'G.P. Margin (%)': 0,
                    'N.P. Margin (%)': 0
                };
            }

            sales.forEach(sale => {
                const date = new Date(sale.date);
                const label = date.toLocaleString('default', { month: 'short', year: '2-digit' });
                if (monthsMap[label]) {
                    monthsMap[label].Revenue += sale.subtotal;
                    sale.items.forEach(invItem => {
                        if (invItem.cost_amount !== undefined && invItem.cost_amount !== null && invItem.cost_amount > 0) {
                            monthsMap[label].COGS += Number(invItem.cost_amount);
                        } else {
                            const itemDef = items.find(i => i.id === invItem.itemId);
                            const isGlass = itemDef ? itemDef.category !== 'hardware' : invItem.unit !== 'nos';
                            const costPrice = itemDef?.purchaseRate || 0;
                            if (isGlass) {
                                monthsMap[label].COGS += costPrice * invItem.sqft;
                            } else {
                                monthsMap[label].COGS += costPrice * invItem.quantity;
                            }
                        }
                    });
                }
            });

            expenseVouchers.forEach(v => {
                const date = new Date(v.date);
                const label = date.toLocaleString('default', { month: 'short', year: '2-digit' });
                if (monthsMap[label]) {
                    monthsMap[label].Expenses += v.amount;
                }
            });

            // Finalise margins and structure
            const plList = Object.values(monthsMap)
                .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime())
                .map(m => {
                    const gross = m.Revenue - m.COGS;
                    const net = gross - m.Expenses;
                    return {
                        ...m,
                        GrossProfit: Number(gross.toFixed(2)),
                        NetProfit: Number(net.toFixed(2)),
                        'G.P. Margin (%)': m.Revenue > 0 ? Number(((gross / m.Revenue) * 100).toFixed(1)) : 0,
                        'N.P. Margin (%)': m.Revenue > 0 ? Number(((net / m.Revenue) * 100).toFixed(1)) : 0
                    };
                });
            setMonthlyPL(plList);

            // 3. Projections for next 3 months
            // Calculate rolling averages for revenue and expenses
            const avgRev = plList.reduce((sum, m) => sum + m.Revenue, 0) / plList.length;
            const avgExp = plList.reduce((sum, m) => sum + m.Expenses, 0) / plList.length;
            const avgCogs = plList.reduce((sum, m) => sum + m.COGS, 0) / plList.length;

            const projList = [];
            const lastDate = plList[plList.length - 1].rawDate;
            for (let i = 1; i <= 3; i++) {
                const nextD = new Date(lastDate);
                nextD.setMonth(nextD.getMonth() + i);
                const nextLabel = nextD.toLocaleString('default', { month: 'short', year: '2-digit' });
                
                const projectedRev = avgRev;
                const projectedCogs = avgCogs;
                const projectedExp = avgExp;
                const projectedGross = projectedRev - projectedCogs;
                const projectedNet = projectedGross - projectedExp;

                projList.push({
                    month: nextLabel,
                    Revenue: Number(projectedRev.toFixed(2)),
                    Expenses: Number(projectedExp.toFixed(2)),
                    NetProfit: Number(projectedNet.toFixed(2))
                });
            }
            setProjections(projList);

        } catch (error) {
            console.error('Error generating Profit & Loss Statement:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="container" style={{ textAlign: 'center', padding: '3rem' }}>Loading Profit & Loss...</div>;

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/reports" style={{ color: 'inherit' }}>
                    <ArrowLeft size={24} />
                </Link>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Profit & Loss Analysis</h1>
            </div>

            {/* Overall Statement Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="card">
                    <h3 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>P&L Overall Statement</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontWeight: 500 }}>Revenue (Net Sales)</span>
                        <span style={{ fontWeight: 600 }}>₹{data.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)', color: '#ef4444' }}>
                        <span>Less: Cost of Goods Sold (COGS)</span>
                        <span>(₹{data.cogs.toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '2px solid var(--color-border)', background: '#f9fafb' }}>
                        <span style={{ fontWeight: 600 }}>Gross Profit</span>
                        <span style={{ fontWeight: 600 }}>₹{data.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)', color: '#ef4444' }}>
                        <span>Less: Operating Expenses</span>
                        <span>(₹{data.expenses.toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0.5rem', marginTop: '0.5rem', background: data.netProfit >= 0 ? '#ecfdf5' : '#fee2e2', borderRadius: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Net Profit</span>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: data.netProfit >= 0 ? '#10b981' : '#b91c1c' }}>
                            ₹{data.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* Projections Card */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1rem' }}>
                        <Sparkles size={18} style={{ color: '#8b5cf6' }} /> Future P&L Projections (Next 3 Months)
                    </h3>
                    <div style={{ flex: 1 }}>
                        <table className="table" style={{ fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <th>Month</th>
                                    <th style={{ textAlign: 'right' }}>Revenue</th>
                                    <th style={{ textAlign: 'right' }}>Expenses</th>
                                    <th style={{ textAlign: 'right' }}>Net Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projections.map((p, idx) => (
                                    <tr key={idx} style={{ background: '#f5f3ff' }}>
                                        <td style={{ fontWeight: 600 }}>{p.month}</td>
                                        <td style={{ textAlign: 'right' }}>₹{p.Revenue.toLocaleString()}</td>
                                        <td style={{ textAlign: 'right' }}>₹{p.Expenses.toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: p.NetProfit >= 0 ? '#10b981' : '#b91c1c' }}>₹{p.NetProfit.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <AlertCircle size={16} style={{ flexShrink: 0 }} />
                        <span>Calculated using rolling monthly averages of historical P&L parameters.</span>
                    </div>
                </div>
            </div>

            {/* Margin Chart */}
            <div className="card" style={{ height: '350px', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1rem' }}>Margins & Profitability Trends</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <ComposedChart data={monthlyPL}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" label={{ value: 'Amount (INR)', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: 'Percentage (%)', angle: 90, position: 'insideRight' }} />
                        <Tooltip formatter={(value, name) => name.toString().includes('%') ? `${value}%` : `₹${Number(value).toLocaleString()}`} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Revenue" fill="var(--color-primary)" opacity={0.8} radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="NetProfit" fill="#10b981" opacity={0.8} radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="G.P. Margin (%)" stroke="#f59e0b" strokeWidth={2} />
                        <Line yAxisId="right" type="monotone" dataKey="N.P. Margin (%)" stroke="#8b5cf6" strokeWidth={2} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Detailed Monthly P&L Breakdown Table */}
            <div className="card">
                <h3 style={{ margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1rem' }}>Monthly Performance Ledger</h3>
                <table className="table" style={{ fontSize: '0.9rem' }}>
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th style={{ textAlign: 'right' }}>Revenue</th>
                            <th style={{ textAlign: 'right' }}>COGS</th>
                            <th style={{ textAlign: 'right' }}>Gross Profit</th>
                            <th style={{ textAlign: 'right' }}>Expenses</th>
                            <th style={{ textAlign: 'right' }}>Net Profit</th>
                            <th style={{ textAlign: 'right' }}>GP Margin</th>
                            <th style={{ textAlign: 'right' }}>NP Margin</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyPL.map((m, idx) => (
                            <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{m.month}</td>
                                <td style={{ textAlign: 'right' }}>₹{m.Revenue.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', color: '#ef4444' }}>₹{m.COGS.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontWeight: 500 }}>₹{m.GrossProfit.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', color: '#ef4444' }}>₹{m.Expenses.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: m.NetProfit >= 0 ? '#10b981' : '#b91c1c' }}>₹{m.NetProfit.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{m['G.P. Margin (%)']}%</td>
                                <td style={{ textAlign: 'right', color: '#8b5cf6', fontWeight: 600 }}>{m['N.P. Margin (%)']}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
