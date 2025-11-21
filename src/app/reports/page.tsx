'use client';

import Link from 'next/link';
import { FileText, TrendingUp, AlertCircle } from 'lucide-react';

export default function ReportsPage() {
    return (
        <div className="container">
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Reports</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                <Link href="/reports/outstanding" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: '#e0e7ff', color: 'var(--color-primary)' }}>
                            <AlertCircle size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontWeight: 600 }}>Outstanding Report</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Receivables & Payables</p>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        View detailed list of customers who owe you money and suppliers you need to pay.
                    </p>
                </Link>

                <Link href="/reports/sales" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: '#f3f4f6', color: '#6b7280' }}>
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontWeight: 600 }}>Sales Analysis</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Trends & Top Items</p>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        Visualize monthly sales trends and identify your best-performing products.
                    </p>
                </Link>

                <Link href="/reports/profit-loss" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: '#dcfce7', color: '#166534' }}>
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontWeight: 600 }}>Profit & Loss</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Net Profit Calculation</p>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        Calculate Net Profit by deducting COGS and Expenses from Revenue.
                    </p>
                </Link>

                <Link href="/reports/gst" className="card" style={{ textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: '#f3f4f6', color: '#4b5563' }}>
                            <FileText size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontWeight: 600 }}>GST Reports</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>GSTR-1 Summary</p>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        GSTR-1 and GSTR-3B summary for tax filing.
                    </p>
                </Link>
            </div>
        </div>
    );
}
