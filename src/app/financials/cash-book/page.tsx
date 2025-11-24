'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { db } from '@/lib/storage';
import { Voucher } from '@/types';

export default function CashBookPage() {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cashInHand, setCashInHand] = useState(0);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const vouchers = await db.vouchers.getAll();
            const cashVouchers = vouchers.filter(v => v.mode === 'cash');

            // Sort by Date Ascending for calculation
            cashVouchers.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            let balance = 0;
            const processed = cashVouchers.map(v => {
                // Receipt = Money In (Dr) -> Increases Cash
                // Payment = Money Out (Cr) -> Decreases Cash
                // Expense = Money Out (Cr) -> Decreases Cash

                let debit = 0;
                let credit = 0;

                if (v.type === 'receipt') {
                    debit = v.amount;
                    balance += v.amount;
                } else {
                    credit = v.amount;
                    balance -= v.amount;
                }

                return {
                    ...v,
                    debit,
                    credit,
                    balance
                };
            });

            setCashInHand(balance);
            // Reverse for display (Newest first)
            setTransactions(processed.reverse());

        } catch (error) {
            console.error('Error loading cash book:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/financials" className="btn" style={{ background: 'none', padding: 0, color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Cash Book</h1>
                        <div style={{ color: 'var(--color-text-muted)' }}>Daily Cash Register</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                        <Printer size={18} style={{ marginRight: '0.5rem' }} /> Print
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: '#166534', marginBottom: '0.25rem' }}>Cash in Hand</div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#15803d' }}>
                            {formatCurrency(cashInHand)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Voucher #</th>
                            <th>Particulars</th>
                            <th style={{ textAlign: 'right' }}>Receipt (In)</th>
                            <th style={{ textAlign: 'right' }}>Payment (Out)</th>
                            <th style={{ textAlign: 'right' }}>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(t => (
                            <tr key={t.id}>
                                <td>{new Date(t.date).toLocaleDateString()}</td>
                                <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.number}</td>
                                <td>
                                    <div style={{ fontWeight: 500 }}>{t.partyName || t.employeeName || 'Expense'}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.description}</div>
                                </td>
                                <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: t.debit > 0 ? 600 : 400 }}>
                                    {t.debit > 0 ? formatCurrency(t.debit).replace('₹', '') : '-'}
                                </td>
                                <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: t.credit > 0 ? 600 : 400 }}>
                                    {t.credit > 0 ? formatCurrency(t.credit).replace('₹', '') : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {formatCurrency(t.balance)}
                                </td>
                            </tr>
                        ))}
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    No cash transactions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
