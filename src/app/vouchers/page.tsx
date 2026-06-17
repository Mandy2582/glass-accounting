'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { db } from '@/lib/storage';
import { Voucher } from '@/types';
import VoucherModal from '@/components/finance/VoucherModal';
import { formatIndianCurrency } from '@/lib/utils';

export default function VouchersPage() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const filteredVouchers = vouchers.filter(v => 
        (v.partyName || '').toLowerCase().includes(search.toLowerCase()) || 
        (v.number || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.description || '').toLowerCase().includes(search.toLowerCase())
    );
    const receipts = vouchers.filter(v => v.type === 'receipt').reduce((sum, v) => sum + v.amount, 0);
    const payments = vouchers.filter(v => v.type === 'payment').reduce((sum, v) => sum + v.amount, 0);
    const expenses = vouchers.filter(v => v.type === 'expense').reduce((sum, v) => sum + v.amount, 0);
    const netMovement = receipts - payments - expenses;

    async function loadVouchers() {
        const data = await db.vouchers.getAll();
        setVouchers(data.sort((a, b) => {
            const timeA = new Date((a as Voucher & { created_at?: string }).created_at || a.date).getTime();
            const timeB = new Date((b as Voucher & { created_at?: string }).created_at || b.date).getTime();
            return timeB - timeA;
        }));
        setLoading(false);
    }

    useEffect(() => {
        queueMicrotask(() => {
            void loadVouchers();
        });
    }, []);

    const handleSaveVoucher = async (voucherData: Omit<Voucher, 'id'>) => {
        const newVoucher: Voucher = {
            ...voucherData,
            id: crypto.randomUUID(),
        };
        await db.vouchers.add(newVoucher);
        await loadVouchers();
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Vouchers</h1>
                    <p style={{ marginTop: '0.25rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                        Record receipts, payments, and expenses in one accounting entry screen.
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Voucher
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #16a34a' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Receipts</p>
                    <strong style={{ color: '#166534', fontSize: '1.15rem' }}>{formatIndianCurrency(receipts)}</strong>
                </div>
                <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #dc2626' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Payments</p>
                    <strong style={{ color: '#dc2626', fontSize: '1.15rem' }}>{formatIndianCurrency(payments)}</strong>
                </div>
                <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Expenses</p>
                    <strong style={{ color: '#b45309', fontSize: '1.15rem' }}>{formatIndianCurrency(expenses)}</strong>
                </div>
                <div className="card" style={{ padding: '1rem', borderLeft: `4px solid ${netMovement >= 0 ? '#2563eb' : '#dc2626'}` }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Net Cash Movement</p>
                    <strong style={{ color: netMovement >= 0 ? '#1d4ed8' : '#dc2626', fontSize: '1.15rem' }}>{formatIndianCurrency(netMovement)}</strong>
                </div>
            </div>

            <div className="card">
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '300px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search by party, voucher #, or description..."
                            className="input"
                            style={{ paddingLeft: '2.5rem' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading vouchers...</div>
                ) : (
                    <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Voucher #</th>
                                <th>Type</th>
                                <th>Party / Description</th>
                                <th>Mode</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVouchers.map((v) => (
                                <tr key={v.id}>
                                    <td>{new Date(v.date).toLocaleDateString()}</td>
                                    <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{v.number}</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            background: v.type === 'receipt' ? '#dcfce7' : '#fee2e2',
                                            color: v.type === 'receipt' ? '#166534' : '#ef4444',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}>
                                            {v.type === 'receipt' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                                            {v.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{v.partyName || 'Expense'}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{v.description}</div>
                                    </td>
                                    <td style={{ textTransform: 'capitalize' }}>{v.mode}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatIndianCurrency(v.amount)}</td>
                                </tr>
                            ))}
                            {filteredVouchers.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No vouchers found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>

            <VoucherModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveVoucher}
            />
        </div>
    );
}
