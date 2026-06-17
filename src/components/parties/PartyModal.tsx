'use client';

import { useState, useEffect } from 'react';
import { Party } from '@/types';
import Modal from '@/components/Modal';

interface PartyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (party: Omit<Party, 'id'>) => Promise<void>;
    initialData?: Party;
}

export default function PartyModal({ isOpen, onClose, onSave, initialData }: PartyModalProps) {
    const defaultPartyData: Partial<Party> = {
        name: '',
        type: 'customer',
        phone: '',
        email: '',
        address: '',
        balance: 0
    };
    const [formData, setFormData] = useState<Partial<Party>>(defaultPartyData);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({ ...defaultPartyData, ...initialData });
        } else {
            setFormData(defaultPartyData);
        }
    }, [initialData, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData as Omit<Party, 'id'>);
            onClose();
        } catch (error: any) {
            console.error(error);
            alert(`Failed to save party: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData?.id ? 'Edit Party' : 'Add New Party'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Party Name</label>
                    <input
                        required
                        className="input"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. ABC Glass Works"
                    />
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Type</label>
                    <select
                        className="input"
                        value={formData.type}
                        onChange={e => setFormData({ ...formData, type: e.target.value as 'customer' | 'supplier' })}
                    >
                        <option value="customer">Customer</option>
                        <option value="supplier">Supplier</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Phone</label>
                    <input
                        className="input"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Email Address</label>
                    <input
                        type="email"
                        className="input"
                        value={formData.email || ''}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="e.g. contact@example.com"
                    />
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Address</label>
                    <textarea
                        className="input"
                        rows={3}
                        value={formData.address}
                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Opening Balance</label>
                    <input
                        type="number"
                        className="input money-input"
                        step="0.01"
                        value={formData.balance}
                        onChange={e => setFormData({ ...formData, balance: Number(e.target.value) })}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Positive = Receivable, Negative = Payable</p>
                </div>

                <div className="form-actions" style={{ marginTop: '1rem' }}>
                    <button type="button" onClick={onClose} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Saving...' : 'Save Party'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
