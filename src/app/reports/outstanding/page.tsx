'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Party } from '@/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function OutstandingReportPage() {
    const [receivables, setReceivables] = useState<Party[]>([]);
    const [payables, setPayables] = useState<Party[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const parties = await db.parties.getAll();
        setReceivables(parties.filter(p => p.balance > 0));
        setPayables(parties.filter(p => p.balance < 0));
        setLoading(false);
    };

    const totalReceivable = receivables.reduce((sum, p) => sum + p.balance, 0);
    const totalPayable = payables.reduce((sum, p) => sum + Math.abs(p.balance), 0);

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/reports" className="btn" style={{ background: 'none', padding: 0 }}>
                    <ArrowLeft size={24} />
                </Link>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Outstanding Report</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Receivables */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#166534' }}>Receivables (To Collect)</h2>
                        <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>₹{totalReceivable.toFixed(2)}</span>
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
                                        <td style={{ textAlign: 'right', fontWeight: 500 }}>₹{p.balance.toFixed(2)}</td>
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
                        <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>₹{totalPayable.toFixed(2)}</span>
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
                                        <td style={{ textAlign: 'right', fontWeight: 500 }}>₹{Math.abs(p.balance).toFixed(2)}</td>
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
