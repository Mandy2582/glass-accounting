'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Invoice, Voucher } from '@/types';
import { Calendar } from 'lucide-react';

type Transaction = {
    id: string;
    date: string;
    type: 'Sale' | 'Receipt' | 'Payment' | 'Expense';
    number: string;
    party: string;
    description: string;
    amountIn: number;
    amountOut: number;
};

export default function DayBookPage() {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [date]);

    const loadData = async () => {
        setLoading(true);
        const [invoices, vouchers] = await Promise.all([
            db.invoices.getAll(),
            db.vouchers.getAll()
        ]);

        const dayInvoices = invoices.filter(i => i.date === date);
        const dayVouchers = vouchers.filter(v => v.date === date);

        const combined: Transaction[] = [
            ...dayInvoices.map(i => ({
                id: i.id,
                date: i.date,
                type: 'Sale' as const,
                number: i.number,
                party: i.partyName,
                description: `Invoice for ${i.items.length} items`,
                amountIn: i.total, // Sales are inflow (Receivable)
                amountOut: 0
            })),
            ...dayVouchers.map(v => ({
                id: v.id,
                date: v.date,
                type: (v.type === 'receipt' ? 'Receipt' : v.type === 'payment' ? 'Payment' : 'Expense') as 'Receipt' | 'Payment' | 'Expense',
                number: v.number,
                party: v.partyName || 'Expense',
                description: v.description,
                amountIn: v.type === 'receipt' ? v.amount : 0,
                amountOut: v.type !== 'receipt' ? v.amount : 0
            }))
        ];

        setTransactions(combined);
        setLoading(false);
    };

    const totalIn = transactions.reduce((sum, t) => sum + t.amountIn, 0);
    const totalOut = transactions.reduce((sum, t) => sum + t.amountOut, 0);

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Day Book</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={18} style={{ color: 'var(--color-text-muted)' }} />
                    <input
                        type="date"
                        className="input"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        style={{ width: 'auto' }}
                    />
                </div>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center' }}>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Total Inflow</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#166534' }}>₹{totalIn.toFixed(2)}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Total Outflow</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ef4444' }}>₹{totalOut.toFixed(2)}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Net Change</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 600, color: (totalIn - totalOut) >= 0 ? '#166534' : '#ef4444' }}>
                            ₹{(totalIn - totalOut).toFixed(2)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading transactions...</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Ref #</th>
                                <th>Type</th>
                                <th>Party / Particulars</th>
                                <th style={{ textAlign: 'right' }}>In Amount</th>
                                <th style={{ textAlign: 'right' }}>Out Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((t) => (
                                <tr key={t.id}>
                                    <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.number}</td>
                                    <td>
                                        <span style={{ fontWeight: 500 }}>{t.type}</span>
                                    </td>
                                    <td>
                                        <div>{t.party}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.description}</div>
                                    </td>
                                    <td style={{ textAlign: 'right', color: t.amountIn > 0 ? '#166534' : 'inherit' }}>
                                        {t.amountIn > 0 ? `₹${t.amountIn.toFixed(2)}` : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', color: t.amountOut > 0 ? '#ef4444' : 'inherit' }}>
                                        {t.amountOut > 0 ? `₹${t.amountOut.toFixed(2)}` : '-'}
                                    </td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No transactions for this date.
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
