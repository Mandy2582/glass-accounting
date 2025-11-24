'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Filter, ArrowRight, User, Briefcase } from 'lucide-react';
import { db } from '@/lib/storage';
import { Party, Employee } from '@/types';

type LedgerItem = {
    id: string;
    name: string;
    type: 'customer' | 'supplier' | 'employee';
    balance: number;
    phone?: string;
};

export default function LedgersListPage() {
    const [items, setItems] = useState<LedgerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'customer' | 'supplier' | 'employee'>('all');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [parties, employees] = await Promise.all([
                db.parties.getAll(),
                db.employees.getAll()
            ]);

            const ledgerItems: LedgerItem[] = [
                ...parties.map(p => ({
                    id: p.id,
                    name: p.name,
                    type: p.type,
                    balance: p.balance,
                    phone: p.phone
                })),
                ...employees.map(e => ({
                    id: e.id,
                    name: e.name,
                    type: 'employee' as const,
                    balance: e.balance || 0,
                    phone: e.phone
                }))
            ];

            setItems(ledgerItems.sort((a, b) => a.name.localeCompare(b.name)));
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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(Math.abs(amount));
    };

    const getBalanceColor = (item: LedgerItem) => {
        if (item.balance === 0) return 'var(--color-text-muted)';

        if (item.type === 'customer') {
            return item.balance > 0 ? '#dc2626' : '#16a34a'; // Positive = Receivable (Red/Asset?), wait. 
            // Receivable is Asset. Usually Dr. 
            // Let's stick to: Receivable (Positive) = Green? No, usually Red in accounting software means "Due".
            // Let's use: Positive (Receivable) = Orange/Red (Money to come), Negative (Advance) = Green.
            // Actually, let's keep it simple:
            // > 0 : Dr (Receivable)
            // < 0 : Cr (Payable/Advance)
        }

        if (item.type === 'supplier') {
            return item.balance < 0 ? '#dc2626' : '#16a34a'; // Negative = Payable (Red/Liability)
        }

        if (item.type === 'employee') {
            return item.balance < 0 ? '#dc2626' : '#16a34a'; // Negative = Salary Due (Payable)
        }

        return 'inherit';
    };

    const getBalanceLabel = (item: LedgerItem) => {
        if (item.balance === 0) return '-';
        const amount = formatCurrency(item.balance);

        if (item.type === 'customer') {
            return item.balance > 0 ? `${amount} Dr (Receivable)` : `${amount} Cr (Advance)`;
        }
        if (item.type === 'supplier') {
            return item.balance < 0 ? `${amount} Cr (Payable)` : `${amount} Dr (Advance)`;
        }
        if (item.type === 'employee') {
            return item.balance < 0 ? `${amount} Cr (Salary Due)` : `${amount} Dr (Advance)`;
        }
        return amount;
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
                                            background: item.type === 'employee' ? '#eff6ff' : '#f3f4f6',
                                            color: item.type === 'employee' ? '#2563eb' : '#4b5563',
                                            textTransform: 'capitalize'
                                        }}>
                                            {item.type}
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
