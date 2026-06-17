'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { ArrowLeft, TrendingUp, Sparkles, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function SalesAnalysisPage() {
    const [salesData, setSalesData] = useState<any[]>([]);
    const [projectionData, setProjectionData] = useState<any[]>([]);
    const [topItems, setTopItems] = useState<any[]>([]);
    const [summary, setSummary] = useState({ totalSales: 0, totalInvoices: 0, avgOrderValue: 0, monthlyGrowth: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const invoices = await db.invoices.getAll();
            const sales = invoices.filter(i => i.type === 'sale');

            // 1. Monthly Sales Trend
            const monthsMap: Record<string, { month: string; rawDate: Date; sales: number }> = {};
            
            // Generate last 6 months to ensure we have continuous slots
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
                monthsMap[label] = { month: label, rawDate: new Date(d.getFullYear(), d.getMonth(), 1), sales: 0 };
            }

            sales.forEach(sale => {
                const date = new Date(sale.date);
                const monthLabel = date.toLocaleString('default', { month: 'short', year: '2-digit' });
                if (monthsMap[monthLabel]) {
                    monthsMap[monthLabel].sales += sale.subtotal;
                }
            });

            const chartData = Object.values(monthsMap).sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
            setSalesData(chartData);

            // 2. Growth and Projections (3-Month Sales Projection)
            // Calculate simple growth rate between successive months
            let totalGrowth = 0;
            let growthCount = 0;
            for (let i = 1; i < chartData.length; i++) {
                const prev = chartData[i - 1].sales;
                const curr = chartData[i].sales;
                if (prev > 0) {
                    totalGrowth += (curr - prev) / prev;
                    growthCount++;
                }
            }

            const avgGrowthRate = growthCount > 0 ? (totalGrowth / growthCount) : 0.05; // default 5% growth fallback
            const monthlyGrowthPercent = avgGrowthRate * 100;

            // Forecast next 3 months
            const projectionList = [...chartData.map(d => ({ month: d.month, Sales: d.sales, Projected: d.sales, isForecast: false }))];
            let lastSales = chartData[chartData.length - 1].sales;
            const lastDate = new Date(chartData[chartData.length - 1].rawDate);

            for (let i = 1; i <= 3; i++) {
                const nextD = new Date(lastDate);
                nextD.setMonth(nextD.getMonth() + i);
                const nextLabel = nextD.toLocaleString('default', { month: 'short', year: '2-digit' });
                const projectedVal = Math.max(0, lastSales * Math.pow(1 + avgGrowthRate, i));
                
                projectionList.push({
                    month: nextLabel,
                    Sales: 0,
                    Projected: Number(projectedVal.toFixed(2)),
                    isForecast: true
                });
            }
            setProjectionData(projectionList);

            // 3. Top Selling Items
            const itemSales: { [key: string]: number } = {};
            sales.forEach(sale => {
                sale.items.forEach(item => {
                    itemSales[item.itemName] = (itemSales[item.itemName] || 0) + item.quantity;
                });
            });

            const topItemsData = Object.keys(itemSales)
                .map(name => ({ name, value: itemSales[name] }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 5);
            setTopItems(topItemsData);

            // 4. Metrics calculation
            const totalSales = sales.reduce((sum, i) => sum + i.subtotal, 0);
            setSummary({
                totalSales,
                totalInvoices: sales.length,
                avgOrderValue: sales.length ? totalSales / sales.length : 0,
                monthlyGrowth: monthlyGrowthPercent
            });
        } catch (error) {
            console.error('Error generating sales analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/reports" style={{ color: 'inherit' }}>
                    <ArrowLeft size={24} />
                </Link>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Sales Analysis & Forecasting</h1>
            </div>

            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading sales analytics...</div>
            ) : (
                <>
                    {/* Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div className="card">
                            <h3 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.5rem 0' }}>Total Net Sales</h3>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>₹{summary.totalSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="card">
                            <h3 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.5rem 0' }}>Total Invoices</h3>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{summary.totalInvoices}</p>
                        </div>
                        <div className="card">
                            <h3 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.5rem 0' }}>Avg. Invoice Value</h3>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>₹{summary.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="card">
                            <h3 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.5rem 0' }}>Average Growth Rate</h3>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: summary.monthlyGrowth >= 0 ? '#10b981' : '#f43f5e' }}>
                                {summary.monthlyGrowth >= 0 ? '+' : ''}{summary.monthlyGrowth.toFixed(1)}% / mo
                            </p>
                        </div>
                    </div>

                    {/* Projections Chart */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="card" style={{ height: '400px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1rem' }}>
                                <Sparkles size={18} style={{ color: '#8b5cf6' }} /> Sales Forecast (Next 3 Months)
                            </h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <LineChart data={projectionData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                                    <Legend />
                                    <Line type="monotone" dataKey="Sales" stroke="var(--color-primary)" strokeWidth={3} activeDot={{ r: 8 }} name="Historical Sales" />
                                    <Line type="monotone" dataKey="Projected" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" name="Projected Sales" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Projection Table */}
                        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1rem' }}>Forecasting Details</h3>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <table className="table" style={{ fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr>
                                            <th>Month</th>
                                            <th style={{ textAlign: 'right' }}>Projected Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {projectionData.filter(d => d.isForecast).map((d, index) => (
                                            <tr key={index} style={{ background: '#f5f3ff' }}>
                                                <td style={{ fontWeight: 600 }}>{d.month} <span style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 'normal' }}>(Forecast)</span></td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#8b5cf6' }}>₹{d.Projected.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                <HelpCircle size={16} style={{ flexShrink: 0 }} />
                                <span>Projections are calculated based on a rolling growth trend of {summary.monthlyGrowth.toFixed(1)}% across historical sales.</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                        {/* Historical Monthly Sales */}
                        <div className="card" style={{ height: '400px' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1rem' }}>Monthly Sales Trend</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <BarChart data={salesData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                                    <Legend />
                                    <Bar dataKey="sales" fill="var(--color-primary)" name="Sales Revenue" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Top Selling Items */}
                        <div className="card" style={{ height: '400px' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1rem' }}>Top 5 Selling Items (Qty)</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '90%', alignItems: 'center' }}>
                                <div style={{ height: '250px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={topItems}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {topItems.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {topItems.map((entry, index) => (
                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                            <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: COLORS[index % COLORS.length] }}></div>
                                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '150px' }} title={entry.name}>
                                                {entry.name}
                                            </span>
                                            <strong style={{ marginLeft: 'auto' }}>{entry.value} pcs</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
