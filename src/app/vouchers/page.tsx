'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { db } from '@/lib/storage';
import { Voucher } from '@/types';
import VoucherModal from '@/components/finance/VoucherModal';

export default function VouchersPage() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        loadVouchers();
    }, []);

    const loadVouchers = async () => {
        const data = await db.vouchers.getAll();
        setVouchers(data.reverse());
        setLoading(false);
    };

    const handleSaveVoucher = async (voucherData: Omit<Voucher, 'id'>) => {
        const newVoucher: Voucher = {
            ...voucherData,
            id: Math.random().toString(36).substr(2, 9),
        };
        await db.vouchers.add(newVoucher);
        await loadVouchers();
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Financial Vouchers</h1>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Voucher
                </button>
            </div>

            <div className="card">
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading vouchers...</div>
                ) : (
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
                            {vouchers.map((v) => (
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
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{v.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {vouchers.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No vouchers recorded yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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
