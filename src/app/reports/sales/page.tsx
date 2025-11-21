'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function SalesAnalysisPage() {
    const [salesData, setSalesData] = useState<any[]>([]);
    const [topItems, setTopItems] = useState<any[]>([]);
    const [summary, setSummary] = useState({ totalSales: 0, totalInvoices: 0, avgOrderValue: 0 });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const invoices = await db.invoices.getAll();
        const sales = invoices.filter(i => i.type === 'sale');

        // 1. Monthly Sales Trend
        const monthlyData: { [key: string]: number } = {};
        sales.forEach(sale => {
            const date = new Date(sale.date);
            const month = date.toLocaleString('default', { month: 'short', year: '2-digit' }); // e.g. Nov 24
            monthlyData[month] = (monthlyData[month] || 0) + sale.total;
        });

        const chartData = Object.keys(monthlyData).map(month => ({
            name: month,
            sales: monthlyData[month]
        }));
        setSalesData(chartData);

        // 2. Top Selling Items
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

        // 3. Summary Metrics
        const totalSales = sales.reduce((sum, i) => sum + i.total, 0);
        setSummary({
            totalSales,
            totalInvoices: sales.length,
            avgOrderValue: sales.length ? totalSales / sales.length : 0
        });
    };

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/reports" style={{ color: 'inherit' }}>
                    <ArrowLeft size={24} />
                </Link>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Sales Analysis</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="card">
                    <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Total Sales</h3>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{summary.totalSales.toLocaleString()}</p>
                </div>
                <div className="card">
                    <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Total Invoices</h3>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.totalInvoices}</p>
                </div>
                <div className="card">
                    <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Avg. Order Value</h3>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{summary.avgOrderValue.toFixed(0)}</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                <div className="card" style={{ height: '400px' }}>
                    <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Monthly Sales Trend</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                            <Legend />
                            <Bar dataKey="sales" fill="#4f46e5" name="Sales Amount" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card" style={{ height: '400px' }}>
                    <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Top 5 Selling Items (Qty)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={topItems}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }: { name?: string, percent?: number }) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                                outerRadius={100}
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
            </div>
        </div>
    );
}
