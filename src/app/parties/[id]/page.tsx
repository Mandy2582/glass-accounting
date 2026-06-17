'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, Calendar, Search, RefreshCw, Phone, MapPin, Tag } from 'lucide-react';
import { db } from '@/lib/storage';
import { Party } from '@/types';

interface LedgerRow {
    id: string;
    date: string;
    refNo: string;
    type: 'Sales Invoice' | 'Purchase Invoice' | 'Receipt' | 'Payment';
    description: string;
    debit: number;
    credit: number;
    runningBalance: number;
}

export default function PartyLedgerPage() {
    const params = useParams();
    const router = useRouter();
    const [party, setParty] = useState<Party | null>(null);
    const [transactions, setTransactions] = useState<LedgerRow[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const loadData = useCallback(async (id: string) => {
        const [partiesData, invoicesData, vouchersData] = await Promise.all([
            db.parties.getAll(),
            db.invoices.getAll(),
            db.vouchers.getAll()
        ]);

        const foundParty = partiesData.find(p => p.id === id);
        if (!foundParty) {
            setParty(null);
            setLoading(false);
            return;
        }
        setParty(foundParty);

        // Filter invoices & vouchers for this party
        const partyInvoices = invoicesData.filter(i => i.partyId === id);
        const partyVouchers = vouchersData.filter(v => v.partyId === id);

        // Map them to unified transaction rows
        const rows: Omit<LedgerRow, 'runningBalance'>[] = [];

        partyInvoices.forEach(inv => {
            if (inv.type === 'sale') {
                rows.push({
                    id: inv.id,
                    date: inv.date,
                    refNo: inv.number,
                    type: 'Sales Invoice',
                    description: `Sales Invoice - items: ${inv.items.map(item => item.itemName).join(', ')}`,
                    debit: Number(inv.total) || 0,
                    credit: 0
                });
            } else if (inv.type === 'purchase') {
                rows.push({
                    id: inv.id,
                    date: inv.date,
                    refNo: inv.number || inv.supplierInvoiceNumber || 'PURCHASE',
                    type: 'Purchase Invoice',
                    description: `Purchase Invoice - items: ${inv.items.map(item => item.itemName).join(', ')}`,
                    debit: 0,
                    credit: Number(inv.total) || 0
                });
            }
        });

        partyVouchers.forEach(v => {
            if (v.type === 'receipt') {
                rows.push({
                    id: v.id,
                    date: v.date,
                    refNo: v.number,
                    type: 'Receipt',
                    description: v.description || `Payment received via ${v.mode.toUpperCase()}`,
                    debit: 0,
                    credit: Number(v.amount) || 0
                });
            } else if (v.type === 'payment') {
                rows.push({
                    id: v.id,
                    date: v.date,
                    refNo: v.number,
                    type: 'Payment',
                    description: v.description || `Payment made via ${v.mode.toUpperCase()}`,
                    debit: Number(v.amount) || 0,
                    credit: 0
                });
            }
        });

        // Sort chronologically by date
        rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Compute running balance
        let balance = 0;
        const finalRows: LedgerRow[] = rows.map(row => {
            const balanceChange = row.debit - row.credit;
            balance += balanceChange;
            return {
                ...row,
                runningBalance: balance
            };
        });

        setTransactions(finalRows);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (params.id) {
            queueMicrotask(() => {
                void loadData(params.id as string);
            });
        }
    }, [params.id, loadData]);

    const {
        filteredTransactions,
        openingBalance,
        totalDebit,
        totalCredit,
        closingBalance
    } = useMemo(() => {
        const query = searchQuery.toLowerCase();
        const summary = transactions.reduce<{
            openingBalance: number;
            totalDebit: number;
            totalCredit: number;
            filtered: LedgerRow[];
        }>((acc, t) => {
            const dateStr = t.date.split('T')[0];
            const balanceChange = t.debit - t.credit;

            // Calculate opening balance from transactions before start date
            if (startDate && dateStr < startDate) {
                return {
                    ...acc,
                    openingBalance: acc.openingBalance + balanceChange
                };
            }

            if (endDate && dateStr > endDate) {
                return acc;
            }

            // Text search match
            if (searchQuery) {
                const matchesText = 
                    t.refNo.toLowerCase().includes(query) ||
                    t.type.toLowerCase().includes(query) ||
                    t.description.toLowerCase().includes(query);
                if (!matchesText) return acc;
            }

            return {
                ...acc,
                totalDebit: acc.totalDebit + t.debit,
                totalCredit: acc.totalCredit + t.credit,
                filtered: [...acc.filtered, t]
            };
        }, {
            openingBalance: 0,
            totalDebit: 0,
            totalCredit: 0,
            filtered: []
        });

        // Re-calculate running balance for the filtered list, taking opening balance into account
        const filteredBalance = summary.filtered.reduce<{ balance: number; rows: LedgerRow[] }>((acc, t) => {
            const nextBalance = acc.balance + (t.debit - t.credit);
            return {
                balance: nextBalance,
                rows: [...acc.rows, {
                    ...t,
                    runningBalance: nextBalance
                }]
            };
        }, { balance: summary.openingBalance, rows: [] });

        return {
            filteredTransactions: [...filteredBalance.rows].reverse(),
            openingBalance: summary.openingBalance,
            totalDebit: summary.totalDebit,
            totalCredit: summary.totalCredit,
            closingBalance: filteredBalance.balance
        };
    }, [transactions, startDate, endDate, searchQuery]);

    const handlePrint = () => {
        window.print();
    };

    const handleResetFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchQuery('');
    };

    const formatCurrency = (amount: number) => {
        return `₹${Math.abs(amount).toFixed(2)}`;
    };

    const getBalanceType = (amount: number) => {
        if (amount > 0) return 'Dr';
        if (amount < 0) return 'Cr';
        return '';
    };

    if (loading) return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>Loading ledger data...</div>;
    if (!party) return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>Party not found.</div>;

    return (
        <div className="container">
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body {
                        background: white !important;
                        color: black !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                    .card {
                        box-shadow: none !important;
                        border: 1px solid #e2e8f0 !important;
                        background: transparent !important;
                        padding: 1rem !important;
                        margin-bottom: 1rem !important;
                    }
                    .table th {
                        background: #f1f5f9 !important;
                        color: black !important;
                        border-bottom: 2px solid #cbd5e1 !important;
                    }
                    .table td {
                        border-bottom: 1px solid #e2e8f0 !important;
                    }
                }
            `}} />

            {/* Back Button and Title */}
            <div className="no-print" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={() => router.back()} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                        <ArrowLeft size={16} />
                        Back
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {party.name}
                            <span style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: party.type === 'customer' ? '#e0f2fe' : '#fef3c7',
                                color: party.type === 'customer' ? '#0369a1' : '#b45309',
                                fontWeight: 600,
                                textTransform: 'capitalize'
                            }}>
                                {party.type}
                            </span>
                        </h1>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Transaction-Wise Ledger Statement</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Printer size={16} />
                    Print Statement
                </button>
            </div>

            {/* Printable header */}
            <div className="print-only" style={{ display: 'none', marginBottom: '2rem', textAlign: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '1rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>ARJUN GLASS HOUSE</h1>
                <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Premium Glass & Hardware Solutions</p>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '1rem' }}>LEDGER STATEMENT: {party.name.toUpperCase()}</h2>
                {startDate && endDate && (
                    <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Period: {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}</p>
                )}
            </div>

            {/* Party Profile Info */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <Phone size={14} /> Contact Details
                        </div>
                        <p style={{ fontWeight: 500 }}>{party.phone || 'N/A'}</p>
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <MapPin size={14} /> Address
                        </div>
                        <p style={{ fontWeight: 500 }}>{party.address || 'N/A'}</p>
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <Tag size={14} /> Current Outstanding
                        </div>
                        <p style={{ 
                            fontWeight: 700, 
                            fontSize: '1.2rem',
                            color: party.balance > 0 ? '#166534' : party.balance < 0 ? '#dc2626' : 'inherit'
                        }}>
                            {formatCurrency(party.balance)} {getBalanceType(party.balance)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters Toolbar */}
            <div className="card no-print" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={16} style={{ color: 'var(--color-text-muted)' }} />
                            <input 
                                type="date" 
                                className="input" 
                                style={{ width: 'auto', padding: '0.35rem 0.5rem' }} 
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                            <span style={{ color: 'var(--color-text-muted)' }}>to</span>
                            <input 
                                type="date" 
                                className="input" 
                                style={{ width: 'auto', padding: '0.35rem 0.5rem' }} 
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                        <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '350px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                            <input 
                                type="text" 
                                className="input" 
                                style={{ paddingLeft: '2.25rem' }} 
                                placeholder="Search by Ref # or Description..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <button 
                        className="btn" 
                        onClick={handleResetFilters}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: '1px solid var(--color-border)' }}
                    >
                        <RefreshCw size={14} /> Reset Filters
                    </button>
                </div>
            </div>

            {/* Financial Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ background: '#f8fafc', borderLeft: '4px solid #64748b' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>OPENING BALANCE</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: openingBalance > 0 ? '#166534' : openingBalance < 0 ? '#dc2626' : 'inherit' }}>
                        {formatCurrency(openingBalance)} {getBalanceType(openingBalance)}
                    </p>
                </div>
                <div className="card" style={{ background: '#f0fdf4', borderLeft: '4px solid #166534' }}>
                    <p style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>TOTAL DEBIT (+)</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: '#15803d' }}>
                        {formatCurrency(totalDebit)}
                    </p>
                </div>
                <div className="card" style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626' }}>
                    <p style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>TOTAL CREDIT (-)</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: '#b91c1c' }}>
                        {formatCurrency(totalCredit)}
                    </p>
                </div>
                <div className="card" style={{ background: '#eff6ff', borderLeft: '4px solid #2563eb' }}>
                    <p style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 600 }}>CLOSING BALANCE</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: closingBalance > 0 ? '#166534' : closingBalance < 0 ? '#dc2626' : 'inherit' }}>
                        {formatCurrency(closingBalance)} {getBalanceType(closingBalance)}
                    </p>
                </div>
            </div>

            {/* Statement Table */}
            <div className="card" style={{ padding: '0.5rem', overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', minWidth: '700px' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ width: '120px' }}>Date</th>
                            <th style={{ width: '120px' }}>Ref #</th>
                            <th style={{ width: '150px' }}>Type</th>
                            <th>Description</th>
                            <th style={{ textAlign: 'right', width: '120px' }}>Debit (Dr)</th>
                            <th style={{ textAlign: 'right', width: '120px' }}>Credit (Cr)</th>
                            <th style={{ textAlign: 'right', width: '150px' }}>Running Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Opening Balance row (if period filters are active) */}
                        {startDate && (
                            <tr style={{ background: '#f8fafc', fontStyle: 'italic', fontWeight: 500 }}>
                                <td>{new Date(startDate).toLocaleDateString()}</td>
                                <td>-</td>
                                <td>Opening Balance</td>
                                <td>Balance brought forward</td>
                                <td style={{ textAlign: 'right' }}>{openingBalance > 0 ? formatCurrency(openingBalance) : '-'}</td>
                                <td style={{ textAlign: 'right' }}>{openingBalance < 0 ? formatCurrency(openingBalance) : '-'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {formatCurrency(openingBalance)} {getBalanceType(openingBalance)}
                                </td>
                            </tr>
                        )}

                        {filteredTransactions.map((t) => (
                            <tr key={t.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td>{new Date(t.date).toLocaleDateString()}</td>
                                <td style={{ fontWeight: 500 }}>{t.refNo}</td>
                                <td>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        background: 
                                            t.type === 'Sales Invoice' ? '#e0fdf4' :
                                            t.type === 'Purchase Invoice' ? '#fef2f2' :
                                            t.type === 'Receipt' ? '#eff6ff' : '#fff7ed',
                                        color: 
                                            t.type === 'Sales Invoice' ? '#15803d' :
                                            t.type === 'Purchase Invoice' ? '#b91c1c' :
                                            t.type === 'Receipt' ? '#1d4ed8' : '#c2410c'
                                    }}>
                                        {t.type}
                                    </span>
                                </td>
                                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t.description}</td>
                                <td style={{ textAlign: 'right', fontWeight: 500, color: t.debit > 0 ? '#15803d' : 'inherit' }}>
                                    {t.debit > 0 ? formatCurrency(t.debit) : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 500, color: t.credit > 0 ? '#b91c1c' : 'inherit' }}>
                                    {t.credit > 0 ? formatCurrency(t.credit) : '-'}
                                </td>
                                <td style={{ 
                                    textAlign: 'right', 
                                    fontWeight: 700, 
                                    color: t.runningBalance > 0 ? '#166534' : t.runningBalance < 0 ? '#dc2626' : 'inherit'
                                }}>
                                    {formatCurrency(t.runningBalance)} {getBalanceType(t.runningBalance)}
                                </td>
                            </tr>
                        ))}

                        {filteredTransactions.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    No ledger transactions found in the specified range.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
