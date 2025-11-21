'use client';

import { useState, useEffect } from 'react';
import { Voucher, Party, VoucherType } from '@/types';
import Modal from '@/components/Modal';
import { db } from '@/lib/storage';

interface VoucherModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (voucher: Omit<Voucher, 'id'>) => Promise<void>;
}

export default function VoucherModal({ isOpen, onClose, onSave }: VoucherModalProps) {
    const [parties, setParties] = useState<Party[]>([]);
    const [formData, setFormData] = useState<Partial<Voucher>>({
        type: 'receipt',
        date: new Date().toISOString().split('T')[0],
        mode: 'cash',
        amount: 0,
        description: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadParties = async () => {
            const data = await db.parties.getAll();
            setParties(data);
        };
        if (isOpen) loadParties();
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const party = parties.find(p => p.id === formData.partyId);
            await onSave({
                ...formData as Omit<Voucher, 'id'>,
                partyName: party?.name,
                number: `VCH-${Date.now().toString().substr(-6)}`
            });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="New Voucher"
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Voucher Type</label>
                        <select
                            className="input"
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value as VoucherType })}
                        >
                            <option value="receipt">Receipt (In)</option>
                            <option value="payment">Payment (Out)</option>
                            <option value="expense">Expense</option>
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Date</label>
                        <input
                            type="date"
                            required
                            className="input"
                            value={formData.date}
                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Party / Account</label>
                    <select
                        className="input"
                        required={formData.type !== 'expense'}
                        value={formData.partyId || ''}
                        onChange={e => setFormData({ ...formData, partyId: e.target.value })}
                    >
                        <option value="">Select Party</option>
                        {parties.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Amount (₹)</label>
                        <input
                            type="number"
                            required
                            className="input"
                            value={formData.amount}
                            onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Mode</label>
                        <select
                            className="input"
                            value={formData.mode}
                            onChange={e => setFormData({ ...formData, mode: e.target.value as 'cash' | 'bank' })}
                        >
                            <option value="cash">Cash</option>
                            <option value="bank">Bank Transfer</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Description</label>
                    <textarea
                        className="input"
                        rows={2}
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Narration..."
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                    <button type="button" onClick={onClose} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Saving...' : 'Save Voucher'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
