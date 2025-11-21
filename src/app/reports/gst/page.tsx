'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';

export default function GstReportPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    useEffect(() => {
        loadData();
    }, [month]);

    const loadData = async () => {
        setLoading(true);
        const allInvoices = await db.invoices.getAll();
        const filtered = allInvoices.filter(i => i.date.startsWith(month));
        setInvoices(filtered);
        setLoading(false);
    };

    const totalTaxable = invoices.reduce((sum, i) => sum + i.subtotal, 0);
    const totalTax = invoices.reduce((sum, i) => sum + (i.total - i.subtotal), 0);
    const totalAmount = invoices.reduce((sum, i) => sum + i.total, 0);

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/reports" className="btn" style={{ background: 'none', padding: 0 }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>GSTR-1 Summary</h1>
                </div>
                <input
                    type="month"
                    className="input"
                    value={month}
                    onChange={e => setMonth(e.target.value)}
                    style={{ width: 'auto' }}
                />
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center' }}>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Total Taxable Value</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>₹{totalTaxable.toFixed(2)}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Total Tax (GST)</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ef4444' }}>₹{totalTax.toFixed(2)}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Total Invoice Value</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#166534' }}>₹{totalAmount.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading data...</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Invoice #</th>
                                <th>Customer</th>
                                <th style={{ textAlign: 'right' }}>Taxable</th>
                                <th style={{ textAlign: 'right' }}>Tax</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv) => (
                                <tr key={inv.id}>
                                    <td>{new Date(inv.date).toLocaleDateString()}</td>
                                    <td>{inv.number}</td>
                                    <td>{inv.partyName}</td>
                                    <td style={{ textAlign: 'right' }}>₹{inv.subtotal.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right' }}>₹{(inv.total - inv.subtotal).toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                                </tr>
                            ))}
                            {invoices.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No invoices found for this month.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
