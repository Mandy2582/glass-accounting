'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, AlertCircle, TrendingDown, Plus } from 'lucide-react';
import { db } from '@/lib/storage';
import { BankAccount, Voucher } from '@/types';

export default function BankBookPage() {
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('');
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        currentBalance: 0,
        interestDue: 0,
        availableLimit: 0
    });
    const [showAddModal, setShowAddModal] = useState(false);
    const [newAccount, setNewAccount] = useState<Partial<BankAccount>>({
        name: '',
        accountNumber: '',
        type: 'current',
        odLimit: 0,
        interestRate: 0,
        openingBalance: 0
    });

    useEffect(() => {
        loadAccounts();
    }, []);

    useEffect(() => {
        if (selectedAccount) {
            loadTransactions(selectedAccount);
        }
    }, [selectedAccount]);

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await db.bankAccounts.add(newAccount as BankAccount);
            setShowAddModal(false);
            setNewAccount({
                name: '',
                accountNumber: '',
                type: 'current',
                odLimit: 0,
                interestRate: 0,
                openingBalance: 0
            });
            loadAccounts();
        } catch (error) {
            console.error('Error adding account:', error);
        }
    };

    const loadAccounts = async () => {
        try {
            const data = await db.bankAccounts.getAll();
            setAccounts(data);
            if (data.length > 0) {
                setSelectedAccount(data[0].id);
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
        }
    };

    const loadTransactions = async (accountId: string) => {
        setLoading(true);
        try {
            const vouchers = await db.vouchers.getAll();
            const account = accounts.find(a => a.id === accountId);

            if (!account) return;

            // Filter for this account
            const bankVouchers = vouchers.filter(v => v.mode === 'bank' && v.bankAccountId === accountId);

            // Sort by Date Ascending
            bankVouchers.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            let balance = account.openingBalance || 0;
            let totalInterest = 0;

            // Interest Calculation Logic
            // We need to calculate interest day by day based on the closing balance of that day.
            // Simplified approach: Iterate through all days from first transaction to today.

            const processed = [];

            // Map transactions to date buckets if we want precise daily interest
            // But for the table, we just list transactions.

            // Let's do a simple pass for transactions first
            for (const v of bankVouchers) {
                let debit = 0;
                let credit = 0;

                if (v.type === 'receipt') {
                    debit = v.amount;
                    balance += v.amount;
                } else {
                    credit = v.amount;
                    balance -= v.amount;
                }

                processed.push({
                    ...v,
                    debit,
                    credit,
                    balance
                });
            }

            // Now Calculate Interest
            // 1. Get date range (Opening Date -> Today)
            // Assuming Opening Balance is from "beginning of time" or a specific date.
            // Let's assume interest starts from the date of the first transaction or today - 30 days if no transactions?
            // Better: Calculate interest from the first transaction date found.

            if (bankVouchers.length > 0) {
                const startDate = new Date(bankVouchers[0].date);
                const endDate = new Date();

                let currentDate = new Date(startDate);
                let dailyBalance = account.openingBalance || 0;
                let txIndex = 0;

                while (currentDate <= endDate) {
                    const dateStr = currentDate.toISOString().split('T')[0];

                    // Process all transactions for this day
                    while (txIndex < bankVouchers.length && bankVouchers[txIndex].date === dateStr) {
                        const v = bankVouchers[txIndex];
                        if (v.type === 'receipt') dailyBalance += v.amount;
                        else dailyBalance -= v.amount;
                        txIndex++;
                    }

                    // Calculate Interest for this day if Balance is Negative (OD Used)
                    if (dailyBalance < 0) {
                        // Formula: (Abs(Balance) * Rate) / 365 / 100
                        const interest = (Math.abs(dailyBalance) * (account.interestRate || 0)) / 365 / 100;
                        totalInterest += interest;
                    }

                    // Next Day
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            }

            setStats({
                currentBalance: balance,
                interestDue: totalInterest,
                availableLimit: (account.odLimit || 0) + balance // If balance is -10L, Limit 50L. Available = 40L.
            });

            setTransactions(processed.reverse());

        } catch (error) {
            console.error('Error loading bank book:', error);
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

    const currentAccount = accounts.find(a => a.id === selectedAccount);

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/financials" className="btn" style={{ background: 'none', padding: 0, color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bank Book</h1>
                        <div style={{ color: 'var(--color-text-muted)' }}>Transfers & OD Management</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} /> New Account
                    </button>
                    <select
                        className="input"
                        style={{ width: 'auto' }}
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                    >
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({a.type.toUpperCase()})</option>
                        ))}
                    </select>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                        <Printer size={18} style={{ marginRight: '0.5rem' }} /> Print
                    </button>
                </div>
            </div>

            {currentAccount && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div className="card" style={{ padding: '1.5rem', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.25rem' }}>Current Balance</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stats.currentBalance < 0 ? '#dc2626' : '#1e40af' }}>
                            {formatCurrency(stats.currentBalance)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '0.5rem' }}>
                            {stats.currentBalance < 0 ? 'Overdraft Used' : 'Credit Balance'}
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1.5rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Available Limit</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                            {formatCurrency(stats.availableLimit)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                            Total Limit: {formatCurrency(currentAccount.odLimit)}
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1.5rem', background: '#fff7ed', border: '1px solid #fed7aa' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <TrendingDown size={16} color="#c2410c" />
                            <div style={{ fontSize: '0.875rem', color: '#c2410c' }}>Interest Due (Est.)</div>
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c2410c' }}>
                            {formatCurrency(stats.interestDue)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#fdba74', marginTop: '0.5rem' }}>
                            @{currentAccount.interestRate}% p.a. on daily OD
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Voucher #</th>
                            <th>Particulars</th>
                            <th style={{ textAlign: 'right' }}>Deposit (In)</th>
                            <th style={{ textAlign: 'right' }}>Withdrawal (Out)</th>
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
                                <td style={{ textAlign: 'right', fontWeight: 600, color: t.balance < 0 ? '#dc2626' : 'inherit' }}>
                                    {formatCurrency(t.balance)}
                                </td>
                            </tr>
                        ))}
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    No bank transactions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Account Modal */}
            {showAddModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Add Bank Account</h2>
                        <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Account Name</label>
                                <input
                                    className="input"
                                    required
                                    placeholder="e.g. HDFC Current A/c"
                                    value={newAccount.name}
                                    onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Account Number</label>
                                <input
                                    className="input"
                                    placeholder="Optional"
                                    value={newAccount.accountNumber}
                                    onChange={e => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Type</label>
                                    <select
                                        className="input"
                                        value={newAccount.type}
                                        onChange={e => setNewAccount({ ...newAccount, type: e.target.value as any })}
                                    >
                                        <option value="current">Current</option>
                                        <option value="savings">Savings</option>
                                        <option value="od">OD / CC</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>OD Limit (₹)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={newAccount.odLimit}
                                        onChange={e => setNewAccount({ ...newAccount, odLimit: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Interest Rate (%)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        placeholder="e.g. 10"
                                        value={newAccount.interestRate}
                                        onChange={e => setNewAccount({ ...newAccount, interestRate: Number(e.target.value) })}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Opening Balance</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={newAccount.openingBalance}
                                        onChange={e => setNewAccount({ ...newAccount, openingBalance: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Account</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
