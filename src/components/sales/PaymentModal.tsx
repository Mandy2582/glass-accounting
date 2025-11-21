'use client';

import { useState } from 'react';
import { Invoice, Voucher } from '@/types';
import { db } from '@/lib/storage';
import { X } from 'lucide-react';

interface PaymentModalProps {
    invoice: Invoice;
    onClose: () => void;
    onSave: () => void;
}

export default function PaymentModal({ invoice, onClose, onSave }: PaymentModalProps) {
    const [amount, setAmount] = useState<number>(invoice.total - (invoice.paidAmount || 0));
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [mode, setMode] = useState<'cash' | 'bank'>('cash');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // 1. Create Voucher (Receipt)
        const voucher: Voucher = {
            id: Math.random().toString(36).substr(2, 9),
            number: `RCP-${Date.now().toString().substr(-6)}`,
            date,
            type: 'receipt',
            partyId: invoice.partyId,
            partyName: invoice.partyName,
            amount,
            description: `Payment for Invoice ${invoice.number}`,
            mode
        };
        await db.vouchers.add(voucher);

        // 2. Update Invoice Status
        const newPaidAmount = (invoice.paidAmount || 0) + amount;
        let newStatus: Invoice['status'] = 'partially_paid';
        if (newPaidAmount >= invoice.total) {
            newStatus = 'paid';
        }

        // We update the invoice directly without triggering the full "update" logic 
        // because that would revert stock/balance which we don't want here.
        // We ONLY want to update the status and paidAmount.
        // However, our db.invoices.update implementation DOES revert.
        // So we need to be careful.
        // Actually, for status update, we should probably have a specific method or 
        // just update the local storage directly for this specific field to avoid side effects.
        // OR, we can use the update method but we need to make sure the 'balance' update in voucher 
        // doesn't conflict with the balance reversion in invoice update.

        // WAIT: db.invoices.update REVERTS the invoice effect on balance.
        // But here we are just paying it. The invoice effect (Debit) remains valid.
        // We are just adding a Credit (Receipt).
        // So we should NOT call db.invoices.update because that would revert the original sale debit.

        // CORRECT APPROACH: We need a way to update just the invoice metadata without side effects.
        // Let's implement a lightweight update here or add a method to storage.
        // For now, I will read, modify, and write back to localStorage directly here to avoid the heavy update logic.

        const invoices = await db.invoices.getAll();
        const index = invoices.findIndex(i => i.id === invoice.id);
        if (index !== -1) {
            invoices[index].paidAmount = newPaidAmount;
            invoices[index].status = newStatus;
            localStorage.setItem('glass_invoices', JSON.stringify(invoices));
        }

        setLoading(false);
        onSave();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Record Payment</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Invoice Total</div>
                    <div style={{ fontWeight: 600 }}>₹{invoice.total.toFixed(2)}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Already Paid</div>
                    <div style={{ fontWeight: 600 }}>₹{(invoice.paidAmount || 0).toFixed(2)}</div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Amount</label>
                        <input
                            type="number"
                            className="input"
                            required
                            max={invoice.total - (invoice.paidAmount || 0)}
                            value={amount}
                            onChange={e => setAmount(Number(e.target.value))}
                        />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Date</label>
                        <input
                            type="date"
                            className="input"
                            required
                            value={date}
                            onChange={e => setDate(e.target.value)}
                        />
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Mode</label>
                        <select
                            className="input"
                            value={mode}
                            onChange={e => setMode(e.target.value as 'cash' | 'bank')}
                        >
                            <option value="cash">Cash</option>
                            <option value="bank">Bank Transfer</option>
                        </select>
                    </div>

                    <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
                        {loading ? 'Saving...' : 'Save Payment'}
                    </button>
                </form>
            </div>
        </div>
    );
}
