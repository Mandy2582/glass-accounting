'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { db } from '@/lib/storage';
import { useParams } from 'next/navigation';
import { roundCurrency } from '@/lib/utils';
import { buildJournal, buildLedgerSummaries, formatDrCr, LedgerSummary } from '@/lib/accounting';

type Transaction = {
    id: string;
    date: string;
    type: 'invoice' | 'voucher' | 'salary' | 'opening';
    description: string;
    debit: number; // Money coming IN (Receivable increase / Payable decrease) -> actually let's stick to Dr/Cr
    credit: number; // Money going OUT
    balance: number; // Running Balance
    refNumber: string;
};

export default function LedgerDetailPage() {
    const params = useParams();
    const type = params.type as string;
    const id = params.id as string;

    const [entity, setEntity] = useState<LedgerSummary | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (type && id) {
            loadLedger();
        }
    }, [type, id]);

    const loadLedger = async () => {
        setLoading(true);
        try {
            const [parties, employees, config, vouchers, invoices, salarySlips, bankAccounts] = await Promise.all([
                db.parties.getAll(),
                db.employees.getAll(),
                db.businessConfig.get(),
                db.vouchers.getAll(),
                db.invoices.getAll(),
                db.payroll.getAll(),
                db.bankAccounts.getAll()
            ]);

            const journal = buildJournal({
                invoices,
                vouchers,
                parties,
                employees,
                salarySlips,
                bankAccounts,
                config,
            });
            const summaries = buildLedgerSummaries({ parties, employees, config, journal });
            const currentEntity = summaries.find(item => item.id === id && item.type === type) || summaries.find(item => item.id === id) || null;
            setEntity(currentEntity);

            if (!currentEntity) return;

            let allTransactions: Transaction[] = journal
                .filter(line => line.accountId === id)
                .map(line => ({
                    id: line.id,
                    date: line.date,
                    type: line.source,
                    description: line.description,
                    refNumber: line.refNumber,
                    debit: line.debit,
                    credit: line.credit,
                    balance: 0,
                }));

            allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const normalSign = ['asset', 'expense', 'general'].includes(currentEntity.accountType) ? 1 : -1;
            let runningDrMinusCr = 0;
            allTransactions = allTransactions.map(t => {
                runningDrMinusCr = roundCurrency(runningDrMinusCr + t.debit - t.credit);
                return { ...t, balance: roundCurrency(runningDrMinusCr * normalSign) };
            });

            // Reverse for display (Newest first) but keep running balance logic from oldest
            setTransactions(allTransactions.reverse());

        } catch (error) {
            console.error('Error loading ledger details:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount); // Allow negative for display? Or use Dr/Cr suffix
    };

    const formatBalance = (amount: number) => {
        const abs = Math.abs(amount);
        const str = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(abs);

        if (amount === 0 || !entity) return '-';
        const side = formatDrCr(amount, entity.accountType);
        return `${str} ${side.suffix}`;
    };

    if (loading) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>Loading ledger...</div>;
    }

    if (!entity) {
        return <div className="container">Entity not found</div>;
    }

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/financials/ledgers" className="btn" style={{ background: 'none', padding: 0, color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{entity.name}</h1>
                        <div style={{ color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                            {type === 'system' ? `${entity.accountType} ledger` : type === 'general' ? 'Custom Ledger' : `${type} Ledger • ${entity.phone || 'No Phone'}`}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                        <Printer size={18} style={{ marginRight: '0.5rem' }} /> Print
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                            Closing Balance
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: type === 'general' ? '#16a34a' : (entity.balance < 0 ? '#dc2626' : '#16a34a') }}>
                            {formatBalance(entity.balance || 0)}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Total Transactions</div>
                        <div style={{ fontWeight: 600 }}>{transactions.length}</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Particulars</th>
                            <th>Vch Type</th>
                            <th>Vch No.</th>
                            <th style={{ textAlign: 'right' }}>Debit (₹)</th>
                            <th style={{ textAlign: 'right' }}>Credit (₹)</th>
                            <th style={{ textAlign: 'right' }}>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(t => (
                            <tr key={`${t.type}-${t.id}`}>
                                <td>{new Date(t.date).toLocaleDateString()}</td>
                                <td>{t.description}</td>
                                <td style={{ textTransform: 'capitalize' }}>{t.type}</td>
                                <td>{t.refNumber}</td>
                                <td style={{ textAlign: 'right', color: t.debit > 0 ? 'inherit' : '#e5e7eb' }}>
                                    {t.debit > 0 ? formatCurrency(t.debit).replace('₹', '') : '-'}
                                </td>
                                <td style={{ textAlign: 'right', color: t.credit > 0 ? 'inherit' : '#e5e7eb' }}>
                                    {t.credit > 0 ? formatCurrency(t.credit).replace('₹', '') : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {formatBalance(t.balance)}
                                </td>
                            </tr>
                        ))}
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    No transactions found for this account.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
