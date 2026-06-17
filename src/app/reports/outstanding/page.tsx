'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Party } from '@/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { formatIndianCurrency } from '@/lib/utils';

export default function OutstandingReportPage() {
    const [receivables, setReceivables] = useState<Party[]>([]);
    const [payables, setPayables] = useState<Party[]>([]);
    const [customerAdvances, setCustomerAdvances] = useState<Party[]>([]);
    const [supplierAdvances, setSupplierAdvances] = useState<Party[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadData() {
        const parties = await db.parties.getAll();
        setReceivables(parties.filter(p => p.type === 'customer' && p.balance > 0));
        setPayables(parties.filter(p => p.type === 'supplier' && p.balance < 0));
        setCustomerAdvances(parties.filter(p => p.type === 'customer' && p.balance < 0));
        setSupplierAdvances(parties.filter(p => p.type === 'supplier' && p.balance > 0));
        setLoading(false);
    }

    useEffect(() => {
        queueMicrotask(() => {
            void loadData();
        });
    }, []);

    const totalReceivable = receivables.reduce((sum, p) => sum + p.balance, 0);
    const totalPayable = payables.reduce((sum, p) => sum + Math.abs(p.balance), 0);
    const totalCustomerAdvance = customerAdvances.reduce((sum, p) => sum + Math.abs(p.balance), 0);
    const totalSupplierAdvance = supplierAdvances.reduce((sum, p) => sum + p.balance, 0);

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/reports" className="btn" style={{ background: 'none', padding: 0 }}>
                    <ArrowLeft size={24} />
                </Link>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Outstanding Report</h1>
            </div>

            {(customerAdvances.length > 0 || supplierAdvances.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #7c3aed' }}>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Customer Advances Held</p>
                        <strong style={{ color: '#6d28d9', fontSize: '1.15rem' }}>{formatIndianCurrency(totalCustomerAdvance)}</strong>
                    </div>
                    <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #0f766e' }}>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Supplier Advances Paid</p>
                        <strong style={{ color: '#0f766e', fontSize: '1.15rem' }}>{formatIndianCurrency(totalSupplierAdvance)}</strong>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Receivables */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#166534' }}>Receivables (To Collect)</h2>
                        <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{formatIndianCurrency(totalReceivable)}</span>
                    </div>
                    {loading ? (
                        <div style={{ padding: '1rem', textAlign: 'center' }}>Loading...</div>
                    ) : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Party Name</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receivables.map(p => (
                                    <tr key={p.id}>
                                        <td>{p.name}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatIndianCurrency(p.balance)}</td>
                                    </tr>
                                ))}
                                {receivables.length === 0 && (
                                    <tr>
                                        <td colSpan={2} style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>No receivables.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Payables */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#ef4444' }}>Payables (To Pay)</h2>
                        <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{formatIndianCurrency(totalPayable)}</span>
                    </div>
                    {loading ? (
                        <div style={{ padding: '1rem', textAlign: 'center' }}>Loading...</div>
                    ) : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Party Name</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payables.map(p => (
                                    <tr key={p.id}>
                                        <td>{p.name}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatIndianCurrency(Math.abs(p.balance))}</td>
                                    </tr>
                                ))}
                                {payables.length === 0 && (
                                    <tr>
                                        <td colSpan={2} style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>No payables.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
