'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import { db } from '@/lib/storage';
import { formatIndianCurrency } from '@/lib/utils';
import { buildJournal, buildLedgerSummaries, formatDrCr, LedgerSummary, LedgerType } from '@/lib/accounting';

export default function LedgersListPage() {
    const [items, setItems] = useState<LedgerSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | LedgerType>('all');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
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
            setItems(buildLedgerSummaries({ parties, employees, config, journal }));
        } catch (error) {
            console.error('Error loading ledgers:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || item.type === filterType;
        return matchesSearch && matchesType;
    });

    const formatCurrency = (amount: number) => formatIndianCurrency(Math.abs(amount));

    const getBalanceColor = (item: LedgerSummary) => {
        if (item.balance === 0) return 'var(--color-text-muted)';
        return item.balance >= 0 ? '#16a34a' : '#dc2626';
    };

    const getBalanceLabel = (item: LedgerSummary) => {
        if (item.balance === 0) return '-';
        const side = formatDrCr(item.balance, item.accountType);
        return `${formatCurrency(side.amount)} ${side.suffix}`;
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href="/financials" style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                        <ArrowRight size={20} style={{ transform: 'rotate(180deg)' }} />
                    </Link>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Ledgers</h1>
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginLeft: '2rem' }}>View and manage account statements.</p>
            </div>

            <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="input-group" style={{ flex: '1 1 400px', maxWidth: '600px' }}>
                        <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search accounts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input"
                            style={{ paddingLeft: '3rem', fontSize: '1rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                            className={`btn ${filterType === 'system' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterType('system')}
                        >
                            System Accounts
                        </button>
                        <button
                            className={`btn ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterType('all')}
                        >
                            All
                        </button>
                        <button
                            className={`btn ${filterType === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterType('customer')}
                        >
                            Customers
                        </button>
                        <button
                            className={`btn ${filterType === 'supplier' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterType('supplier')}
                        >
                            Suppliers
                        </button>
                        <button
                            className={`btn ${filterType === 'employee' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterType('employee')}
                        >
                            Employees
                        </button>
                        <button
                            className={`btn ${filterType === 'general' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterType('general')}
                        >
                            Custom Ledgers
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>Loading ledgers...</div>
            ) : (
                <div className="card">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Phone</th>
                                <th style={{ textAlign: 'right' }}>Current Balance</th>
                                <th style={{ width: '50px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map(item => (
                                <tr key={`${item.type}-${item.id}`} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/financials/ledgers/${item.type}/${item.id}`}>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                                    </td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            fontSize: '0.75rem',
                                            background: item.type === 'system' ? '#ecfeff' : item.type === 'employee' ? '#eff6ff' : item.type === 'general' ? '#faf5ff' : '#f3f4f6',
                                            color: item.type === 'system' ? '#0e7490' : item.type === 'employee' ? '#2563eb' : item.type === 'general' ? '#7c3aed' : '#4b5563',
                                            textTransform: 'capitalize'
                                        }}>
                                            {item.type === 'general' ? 'custom ledger' : item.type === 'system' ? item.accountType : item.type}
                                        </span>
                                    </td>
                                    <td>{item.phone || '-'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: getBalanceColor(item) }}>
                                        {getBalanceLabel(item)}
                                    </td>
                                    <td>
                                        <ArrowRight size={16} style={{ color: 'var(--color-text-muted)' }} />
                                    </td>
                                </tr>
                            ))}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                        No accounts found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
