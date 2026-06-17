'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save, FileText, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/storage';
import { LedgerAccount } from '@/types';
import { mergeChartAccounts, SYSTEM_ACCOUNTS } from '@/lib/accounting';

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [type, setType] = useState<LedgerAccount['type']>('expense');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const config = await db.businessConfig.get();
            setAccounts(mergeChartAccounts(config));
        } catch (error) {
            console.error('Error loading accounts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setSaving(true);
        try {
            const config = await db.businessConfig.get();
            const currentAccounts = config.customAccounts || [];

            // Prevent duplicate names
            if (currentAccounts.some(acc => acc.name.toLowerCase() === name.trim().toLowerCase())) {
                setMessage({ type: 'error', text: 'An account with this name already exists.' });
                setTimeout(() => setMessage(null), 3000);
                setSaving(false);
                return;
            }

            const newAccount: LedgerAccount = {
                id: typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                }),
                name: name.trim(),
                type: type
            };

            const updatedAccounts = [...currentAccounts, newAccount];
            await db.businessConfig.update({
                ...config,
                customAccounts: updatedAccounts
            });

            setAccounts(mergeChartAccounts({ ...config, customAccounts: updatedAccounts }));
            setName('');
            setMessage({ type: 'success', text: `Account "${newAccount.name}" created successfully!` });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error adding account:', error);
            setMessage({ type: 'error', text: 'Failed to create account.' });
            setTimeout(() => setMessage(null), 3000);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAccount = async (accId: string, accName: string) => {
        // Protect system accounts
        const systemAccounts = SYSTEM_ACCOUNTS.map(account => account.id);
        if (systemAccounts.includes(accId)) {
            alert('System accounts cannot be deleted as they are required for operations.');
            return;
        }

        if (!confirm(`Are you sure you want to delete the ledger account "${accName}"?`)) {
            return;
        }

        setSaving(true);
        try {
            const config = await db.businessConfig.get();
            const currentAccounts = config.customAccounts || [];
            const updatedAccounts = currentAccounts.filter(acc => acc.id !== accId);

            await db.businessConfig.update({
                ...config,
                customAccounts: updatedAccounts
            });

            setAccounts(mergeChartAccounts({ ...config, customAccounts: updatedAccounts }));
            setMessage({ type: 'success', text: `Account "${accName}" deleted successfully.` });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error deleting account:', error);
            setMessage({ type: 'error', text: 'Failed to delete account.' });
            setTimeout(() => setMessage(null), 3000);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="container">
            {/* Header */}
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href="/financials" style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                        <ArrowLeft size={20} />
                    </Link>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Chart of Accounts</h1>
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginLeft: '2.25rem' }}>
                    Manage expense, revenue, and general ledger accounts for double-entry bookkeeping.
                </p>
            </div>

            {message && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    borderRadius: '0.5rem',
                    background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                    color: message.type === 'success' ? '#166534' : '#991b1b',
                    fontWeight: 500,
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <CheckCircle2 size={18} />
                    {message.text}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>
                {/* Form to Add Account */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.25rem' }}>Create Ledger Account</h2>
                    <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Account Name</label>
                            <input
                                type="text"
                                required
                                className="input"
                                placeholder="e.g. Office Stationery, Tea & Snacks"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Account Type</label>
                            <select
                                className="input"
                                value={type}
                                onChange={e => setType(e.target.value as any)}
                            >
                                <option value="expense">Expense</option>
                                <option value="revenue">Revenue / Income</option>
                                <option value="asset">Asset</option>
                                <option value="liability">Liability</option>
                                <option value="equity">Equity / Capital</option>
                                <option value="general">General Ledger</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
                        >
                            <Plus size={18} />
                            {saving ? 'Creating...' : 'Create Account'}
                        </button>
                    </form>
                </div>

                {/* Accounts List Table */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.25rem' }}>Active Ledgers</h2>
                    {loading ? (
                        <p style={{ color: 'var(--color-text-muted)', padding: '1rem 0' }}>Loading ledger accounts...</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Account Name</th>
                                        <th>Account Code (ID)</th>
                                        <th>Type</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accounts.map(acc => {
                                        const systemAccounts = [
                                            ...SYSTEM_ACCOUNTS.map(account => account.id)
                                        ];
                                        const isSystem = acc.system || systemAccounts.includes(acc.id);

                                        return (
                                            <tr key={acc.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ fontWeight: 600 }}>{acc.name}</td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{acc.id}</td>
                                                <td>
                                                    <span style={{
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '999px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        background: acc.type === 'expense' ? '#fef2f2' : acc.type === 'revenue' ? '#f0fdf4' : acc.type === 'liability' ? '#fff7ed' : '#eff6ff',
                                                        color: acc.type === 'expense' ? '#991b1b' : acc.type === 'revenue' ? '#166534' : acc.type === 'liability' ? '#c2410c' : '#1e40af',
                                                        textTransform: 'capitalize'
                                                    }}>
                                                        {acc.type}
                                                    </span>
                                                    {isSystem && (
                                                        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                                            [SYSTEM]
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {!isSystem && (
                                                        <button
                                                            className="btn"
                                                            style={{
                                                                padding: '0.375rem',
                                                                color: '#dc2626',
                                                                background: '#fef2f2',
                                                                border: 'none',
                                                                cursor: 'pointer'
                                                            }}
                                                            onClick={() => handleDeleteAccount(acc.id, acc.name)}
                                                            title="Delete Ledger Account"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                    {isSystem && (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                            Locked
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {accounts.length === 0 && (
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                                No ledger accounts found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
