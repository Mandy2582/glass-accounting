'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Voucher, Party, Employee, VoucherType, BankAccount, LedgerAccount } from '@/types';
import Modal from '@/components/Modal';
import PartyModal from '@/components/parties/PartyModal';
import { db } from '@/lib/storage';
import { formatIndianCurrency, generateUUID, roundCurrency } from '@/lib/utils';

interface VoucherModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (voucher: Omit<Voucher, 'id'>) => Promise<void>;
}

export default function VoucherModal({ isOpen, onClose, onSave }: VoucherModalProps) {
    const [parties, setParties] = useState<Party[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [customAccounts, setCustomAccounts] = useState<LedgerAccount[]>([]);
    const [partyType, setPartyType] = useState<'party' | 'employee' | 'general'>('party');
    const [showNewPartyModal, setShowNewPartyModal] = useState(false);

    const [formData, setFormData] = useState<Partial<Voucher>>({
        type: 'receipt',
        date: new Date().toISOString().split('T')[0],
        mode: 'cash',
        amount: 0,
        description: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) loadData();
    }, [isOpen]);

    const loadData = async () => {
        const [partiesData, employeesData, bankData, configData] = await Promise.all([
            db.parties.getAll(),
            db.employees.getAll(),
            db.bankAccounts.getAll(),
            db.businessConfig.get()
        ]);
        setParties(partiesData);
        setEmployees(employeesData);
        setBankAccounts(bankData);
        setCustomAccounts(configData.customAccounts || []);
    };

    const handleSaveNewParty = async (partyData: Omit<Party, 'id'>) => {
        const newParty: Party = {
            ...partyData,
            id: generateUUID(),
        };

        await db.parties.add(newParty);
        await loadData();
        setPartyType('party');
        setFormData(prev => ({ ...prev, partyId: newParty.id, employeeId: undefined }));
        setShowNewPartyModal(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate bank account selection for bank transfers
        if (formData.mode === 'bank' && !formData.bankAccountId) {
            alert('Please select a bank account for bank transfer');
            return;
        }

        setLoading(true);
        try {
            const voucherData: Omit<Voucher, 'id'> = {
                ...formData as Omit<Voucher, 'id'>,
                amount: roundCurrency(formData.amount || 0),
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
            } else if (partyType === 'employee') {
                const employee = employees.find(e => e.id === formData.employeeId);
                voucherData.employeeId = employee?.id;
                voucherData.employeeName = employee?.name;
                voucherData.partyId = undefined;
                voucherData.partyName = undefined;
            } else if (partyType === 'general') {
                const gAcc = customAccounts.find(a => a.id === formData.partyId);
                voucherData.partyId = gAcc?.id;
                voucherData.partyName = gAcc?.name;
                voucherData.employeeId = undefined;
                voucherData.employeeName = undefined;
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
                <div className="responsive-row">
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Voucher Type</label>
                        <select
                            className="input"
                            value={formData.type}
                            onChange={e => {
                                const newType = e.target.value as VoucherType;
                                setFormData({ ...formData, type: newType });
                                if (newType === 'expense') {
                                    setPartyType('general');
                                } else {
                                    setPartyType('party');
                                }
                            }}
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
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="partyType"
                            checked={partyType === 'general'}
                            onChange={() => setPartyType('general')}
                        />
                        Ledger Account
                    </label>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                        {partyType === 'party' ? 'Party / Account' : partyType === 'employee' ? 'Employee' : 'Ledger Account'}
                    </label>

                    {partyType === 'party' && (
                        <div className="quick-add-field">
                            <select
                                className="input"
                                required
                                value={formData.partyId || ''}
                                onChange={e => {
                                    if (e.target.value === '__add_party__') {
                                        setShowNewPartyModal(true);
                                    } else {
                                        setFormData({ ...formData, partyId: e.target.value, employeeId: undefined });
                                    }
                                }}
                            >
                                <option value="">Select Party</option>
                                <option value="__add_party__">+ Add New Customer / Supplier</option>
                                {parties.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="quick-add-button"
                                onClick={() => setShowNewPartyModal(true)}
                                title="Add New Customer / Supplier"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    )}

                    {partyType === 'employee' && (
                        <select
                            className="input"
                            required
                            value={formData.employeeId || ''}
                            onChange={e => setFormData({ ...formData, employeeId: e.target.value, partyId: undefined })}
                        >
                            <option value="">Select Employee</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.name} ({e.designation})</option>
                            ))}
                        </select>
                    )}

                    {partyType === 'general' && (
                        <select
                            className="input"
                            required
                            value={formData.partyId || ''}
                            onChange={e => setFormData({ ...formData, partyId: e.target.value, employeeId: undefined })}
                        >
                            <option value="">Select Ledger Account</option>
                            {customAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.type.toUpperCase()})</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="responsive-row">
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Amount (₹)</label>
                        <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            className="input money-input"
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
                                <option key={b.id} value={b.id}>{b.name} (Limit: {formatIndianCurrency(b.odLimit || 0)})</option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Description</label>
                    <textarea
                        className="input"
                        rows={2}
                        required
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Narration..."
                    />
                </div>

                <div className="form-actions" style={{ marginTop: '1rem' }}>
                    <button type="button" onClick={onClose} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Saving...' : 'Save Voucher'}
                    </button>
                </div>
            </form>
            <PartyModal
                isOpen={showNewPartyModal}
                onClose={() => setShowNewPartyModal(false)}
                onSave={handleSaveNewParty}
            />
        </Modal>
    );
}
