'use client';

import { useState, useEffect } from 'react';
import { Invoice, Voucher, BankAccount } from '@/types';
import { db } from '@/lib/storage';
import { X } from 'lucide-react';
import { formatIndianCurrency, roundCurrency } from '@/lib/utils';

interface PaymentModalProps {
    invoice: Invoice;
    onClose: () => void;
    onSave: () => void;
}

export default function PaymentModal({ invoice, onClose, onSave }: PaymentModalProps) {
    const [amount, setAmount] = useState<number>(invoice.total - (invoice.paidAmount || 0));
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [mode, setMode] = useState<'cash' | 'bank'>('cash');
    const [bankAccountId, setBankAccountId] = useState<string>('');
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadBankAccounts();
    }, []);

    const loadBankAccounts = async () => {
        const accounts = await db.bankAccounts.getAll();
        setBankAccounts(accounts);
        if (accounts.length > 0) {
            setBankAccountId(accounts[0].id);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate bank account selection for bank transfers
        if (mode === 'bank' && !bankAccountId) {
            alert('Please select a bank account for bank transfer');
            return;
        }
        if (amount <= 0 || amount > roundCurrency(invoice.total - (invoice.paidAmount || 0))) {
            alert('Please enter an amount greater than zero and not more than the balance due.');
            return;
        }

        setLoading(true);

        try {
            const isPurchase = invoice.type === 'purchase';
            // 1. Create Voucher (Receipt or Payment)
            const voucher: Voucher = {
                id: crypto.randomUUID(),
                number: `${isPurchase ? 'PMT' : 'RCP'}-${Date.now().toString().substr(-6)}`,
                date,
                type: isPurchase ? 'payment' : 'receipt',
                partyId: invoice.partyId,
                partyName: invoice.partyName,
                amount: roundCurrency(amount),
                description: isPurchase 
                    ? `Payment to Supplier for Invoice ${invoice.number}`
                    : `Payment for Invoice ${invoice.number}`,
                mode,
                ...(mode === 'bank' && { bankAccountId })
            };
            await db.vouchers.add(voucher);

            // 2. Update Invoice Payment Status
            const newPaidAmount = roundCurrency((invoice.paidAmount || 0) + amount);
            let newStatus: Invoice['status'] = 'partially_paid';
            if (newPaidAmount >= invoice.total) {
                newStatus = 'paid';
            }

            // Update invoice status and paid amount in Supabase
            await db.invoices.updatePaymentStatus(invoice.id, newPaidAmount, newStatus);

            setLoading(false);
            onSave();
        } catch (error) {
            console.error('Payment error:', error);
            alert('Failed to record payment. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        {invoice.type === 'purchase' ? 'Record Payment' : 'Record Receipt'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Invoice Total</div>
                    <div style={{ fontWeight: 600 }}>{formatIndianCurrency(invoice.total)}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Already Paid</div>
                    <div style={{ fontWeight: 600 }}>{formatIndianCurrency(invoice.paidAmount || 0)}</div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Amount</label>
                        <input
                            type="number"
                            className="input money-input"
                            required
                            min="0.01"
                            step="0.01"
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

                    {mode === 'bank' && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Bank Account</label>
                            <select
                                className="input"
                                value={bankAccountId}
                                onChange={e => setBankAccountId(e.target.value)}
                                required
                            >
                                <option value="">Select Bank Account</option>
                                {bankAccounts.map(account => (
                                    <option key={account.id} value={account.id}>
                                        {account.name} - {account.accountNumber}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
                        {loading ? 'Saving...' : 'Save Payment'}
                    </button>
                </form>
            </div>
        </div>
    );
}
