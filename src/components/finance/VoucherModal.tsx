'use client';

import { useState, useEffect } from 'react';
import { Voucher, Party, Employee, VoucherType, BankAccount } from '@/types';
import Modal from '@/components/Modal';
import { db } from '@/lib/storage';

interface VoucherModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (voucher: Omit<Voucher, 'id'>) => Promise<void>;
}

export default function VoucherModal({ isOpen, onClose, onSave }: VoucherModalProps) {
    const [parties, setParties] = useState<Party[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [partyType, setPartyType] = useState<'party' | 'employee'>('party');

    const [formData, setFormData] = useState<Partial<Voucher>>({
        type: 'receipt',
        date: new Date().toISOString().split('T')[0],
        mode: 'cash',
        amount: 0,
        description: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            const [partiesData, employeesData, bankData] = await Promise.all([
                db.parties.getAll(),
                db.employees.getAll(),
                db.bankAccounts.getAll()
            ]);
            setParties(partiesData);
            setEmployees(employeesData);
            setBankAccounts(bankData);
        };
        if (isOpen) loadData();
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate bank account selection for bank transfers
        if (formData.mode === 'bank' && !formData.bankAccountId) {
            alert('Please select a bank account for bank transfer');
            return;
        }

        setLoading(true);
        try {
            let voucherData: Omit<Voucher, 'id'> = {
                ...formData as Omit<Voucher, 'id'>,
                number: `VCH-${Date.now().toString().substr(-6)}`
            };

            if (voucherData.mode === 'cash') {
                voucherData.bankAccountId = undefined;
            }

            if (partyType === 'party') {
                const party = parties.find(p => p.id === formData.partyId);
                voucherData.partyName = party?.name;
                voucherData.employeeId = undefined;
                voucherData.employeeName = undefined;
            } else {
                const employee = employees.find(e => e.id === formData.employeeId);
                voucherData.employeeId = employee?.id;
                voucherData.employeeName = employee?.name;
                voucherData.partyId = undefined;
                voucherData.partyName = undefined;
            }

            await onSave(voucherData);

            // Reset form
            setFormData({
                type: 'receipt',
                date: new Date().toISOString().split('T')[0],
                mode: 'cash',
                amount: 0,
                description: ''
            });
            setPartyType('party');

            onClose();
        } catch (error) {
            console.error('Voucher save error:', error);
            alert(`Failed to save voucher: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

                {/* Party Type Selector */}
                {formData.type !== 'expense' && (
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="partyType"
                                checked={partyType === 'party'}
                                onChange={() => setPartyType('party')}
                            />
                            Customer / Supplier
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="partyType"
                                checked={partyType === 'employee'}
                                onChange={() => setPartyType('employee')}
                            />
                            Employee
                        </label>
                    </div>
                )}

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                        {partyType === 'party' ? 'Party / Account' : 'Employee'}
                    </label>

                    {partyType === 'party' ? (
                        <select
                            className="input"
                            required={formData.type !== 'expense'}
                            value={formData.partyId || ''}
                            onChange={e => setFormData({ ...formData, partyId: e.target.value, employeeId: undefined })}
                        >
                            <option value="">Select Party</option>
                            {parties.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                            ))}
                        </select>
                    ) : (
                        <select
                            className="input"
                            required={formData.type !== 'expense'}
                            value={formData.employeeId || ''}
                            onChange={e => setFormData({ ...formData, employeeId: e.target.value, partyId: undefined })}
                        >
                            <option value="">Select Employee</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.name} ({e.designation})</option>
                            ))}
                        </select>
                    )}
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

                {formData.mode === 'bank' && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Bank Account</label>
                        <select
                            className="input"
                            required
                            value={formData.bankAccountId || ''}
                            onChange={e => setFormData({ ...formData, bankAccountId: e.target.value })}
                        >
                            <option value="">Select Bank Account</option>
                            {bankAccounts.map(b => (
                                <option key={b.id} value={b.id}>{b.name} (Limit: ₹{(b.odLimit || 0).toLocaleString()})</option>
                            ))}
                        </select>
                    </div>
                )}

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
