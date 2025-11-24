'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { db } from '@/lib/storage';
import { Party, Employee, Invoice, Voucher, SalarySlip } from '@/types';
import { useParams } from 'next/navigation';

type Transaction = {
    id: string;
    date: string;
    type: 'invoice' | 'voucher' | 'salary';
    description: string;
    debit: number; // Money coming IN (Receivable increase / Payable decrease) -> actually let's stick to Dr/Cr
    credit: number; // Money going OUT
    balance: number; // Running Balance
    refNumber: string;
};

export default function LedgerDetailPage() {
    const params = useParams();
    const type = params.type as string;
    const id = params.id as string;

    const [entity, setEntity] = useState<Party | Employee | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (type && id) {
            loadLedger();
        }
    }, [type, id]);

    const loadLedger = async () => {
        setLoading(true);
        try {
            let currentEntity: Party | Employee | null = null;
            let allTransactions: Transaction[] = [];

            // 1. Fetch Entity
            if (type === 'employee') {
                const employees = await db.employees.getAll();
                currentEntity = employees.find(e => e.id === id) || null;
            } else {
                const parties = await db.parties.getAll();
                currentEntity = parties.find(p => p.id === id) || null;
            }

            setEntity(currentEntity);

            if (!currentEntity) return;

            // 2. Fetch Transactions
            const [invoices, vouchers, salarySlips] = await Promise.all([
                db.invoices.getAll(),
                db.vouchers.getAll(),
                db.payroll.getAll()
            ]);

            // Filter relevant records
            const entityInvoices = invoices.filter(i => i.partyId === id);
            const entityVouchers = vouchers.filter(v => v.partyId === id || v.employeeId === id);
            const entitySlips = type === 'employee' ? salarySlips.filter(s => s.employeeId === id) : [];

            // 3. Map to Transactions
            // Accounting Logic:
            // Customer: Sale = Dr (Receivable), Receipt = Cr (Reduces Receivable)
            // Supplier: Purchase = Cr (Payable), Payment = Dr (Reduces Payable)
            // Employee: Advance = Dr, Salary Due = Cr, Payment = Dr (Reduces Payable/Increases Advance)

            // Let's normalize to Dr/Cr columns

            // Invoices
            entityInvoices.forEach(inv => {
                allTransactions.push({
                    id: inv.id,
                    date: inv.date,
                    type: 'invoice',
                    description: `${inv.type === 'sale' ? 'Sale' : 'Purchase'} Invoice`,
                    refNumber: inv.number,
                    debit: inv.type === 'sale' ? inv.total : 0,
                    credit: inv.type === 'purchase' ? inv.total : 0,
                    balance: 0
                });
            });

            // Vouchers
            entityVouchers.forEach(v => {
                let dr = 0;
                let cr = 0;

                if (type === 'customer') {
                    // Receipt from Customer = Cr
                    // Payment to Customer (Refund?) = Dr
                    if (v.type === 'receipt') cr = v.amount;
                    if (v.type === 'payment') dr = v.amount;
                } else if (type === 'supplier') {
                    // Payment to Supplier = Dr
                    // Receipt from Supplier (Refund?) = Cr
                    if (v.type === 'payment') dr = v.amount;
                    if (v.type === 'receipt') cr = v.amount;
                } else if (type === 'employee') {
                    // Payment to Employee = Dr
                    // Receipt from Employee = Cr
                    if (v.type === 'payment') dr = v.amount;
                    if (v.type === 'receipt') cr = v.amount;
                }

                allTransactions.push({
                    id: v.id,
                    date: v.date,
                    type: 'voucher',
                    description: `${v.type === 'payment' ? 'Payment' : 'Receipt'} (${v.mode}) - ${v.description}`,
                    refNumber: v.number,
                    debit: dr,
                    credit: cr,
                    balance: 0
                });
            });

            // Salary Slips (Only for Employees)
            entitySlips.forEach(slip => {
                // Salary Due = Cr (Payable)
                allTransactions.push({
                    id: slip.id,
                    date: slip.paymentDate || slip.month + '-28', // Approximate date if not paid
                    type: 'salary',
                    description: `Salary for ${slip.month}`,
                    refNumber: '-',
                    debit: 0,
                    credit: slip.netSalary,
                    balance: 0
                });
            });

            // 4. Sort Chronologically
            allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // 5. Calculate Running Balance
            let runningBalance = 0;
            allTransactions = allTransactions.map(t => {
                // Dr adds to balance (Asset/Expense), Cr subtracts (Liability/Income)
                // For Customer: Dr (Sale) increases Receivable. Cr (Receipt) decreases it.
                // For Supplier: Cr (Purchase) decreases balance (more negative). Dr (Payment) increases it (less negative).
                // Wait, let's stick to standard: Balance = Dr - Cr
                // Customer: Start 0. Sale 100 (Dr). Bal 100. Receipt 100 (Cr). Bal 0. Correct.
                // Supplier: Start 0. Purchase 100 (Cr). Bal -100. Payment 100 (Dr). Bal 0. Correct.
                // Employee: Start 0. Salary 100 (Cr). Bal -100. Payment 100 (Dr). Bal 0. Correct.

                runningBalance += (t.debit - t.credit);
                return { ...t, balance: runningBalance };
            });

            // Reverse for display (Newest first) but keep running balance logic from oldest
            setTransactions(allTransactions.reverse());

        } catch (error) {
            console.error('Error loading ledger details:', error);
        } finally {
            setLoading(false);
        }
    };

    const recalculateBalance = async () => {
        if (!entity || transactions.length === 0) return;

        if (!confirm('This will update the database balance to match the calculated balance from transactions. Continue?')) {
            return;
        }

        try {
            // Get the calculated balance (first transaction in reversed array = last chronologically)
            const calculatedBalance = transactions[0].balance;

            // Update the entity balance
            const updatedEntity = { ...entity, balance: calculatedBalance };

            if (type === 'employee') {
                await db.employees.update(updatedEntity as Employee);
            } else {
                await db.parties.update(updatedEntity as Party);
            }

            alert(`Balance updated successfully!\nOld: ${formatBalance(entity.balance || 0)}\nNew: ${formatBalance(calculatedBalance)}`);

            // Reload to show updated balance
            await loadLedger();
        } catch (error) {
            console.error('Error recalculating balance:', error);
            alert('Failed to update balance. Please try again.');
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount); // Allow negative for display? Or use Dr/Cr suffix
    };

    const formatBalance = (amount: number) => {
        const abs = Math.abs(amount);
        const str = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(abs);

        if (amount === 0) return '-';
        return amount > 0 ? `${str} Dr` : `${str} Cr`;
    };

    if (loading) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>Loading ledger...</div>;
    }

    if (!entity) {
        return <div className="container">Entity not found</div>;
    }

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/financials/ledgers" className="btn" style={{ background: 'none', padding: 0, color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{entity.name}</h1>
                        <div style={{ color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                            {type} Ledger • {entity.phone || 'No Phone'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                        <Printer size={18} style={{ marginRight: '0.5rem' }} /> Print
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Closing Balance (Database)</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: entity.balance < 0 ? '#dc2626' : '#16a34a' }}>
                            {formatBalance(entity.balance || 0)}
                        </div>
                        {transactions.length > 0 && transactions[0].balance !== entity.balance && (
                            <div style={{
                                marginTop: '0.5rem',
                                padding: '0.75rem',
                                background: 'rgba(251, 191, 36, 0.2)',
                                border: '1px solid rgba(251, 191, 36, 0.5)',
                                borderRadius: '6px',
                                fontSize: '0.875rem'
                            }}>
                                <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                                    ⚠️ Balance Mismatch Detected
                                </div>
                                <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', opacity: 0.9 }}>
                                    Database: {formatBalance(entity.balance || 0)} | Calculated: {formatBalance(transactions[0].balance)}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); recalculateBalance(); }}
                                    className="btn"
                                    style={{
                                        padding: '0.375rem 0.75rem',
                                        fontSize: '0.75rem',
                                        background: '#f59e0b',
                                        color: 'white',
                                        border: 'none'
                                    }}
                                >
                                    Fix Balance Now
                                </button>
                            </div>
                        )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Total Transactions</div>
                        <div style={{ fontWeight: 600 }}>{transactions.length}</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Particulars</th>
                            <th>Vch Type</th>
                            <th>Vch No.</th>
                            <th style={{ textAlign: 'right' }}>Debit (₹)</th>
                            <th style={{ textAlign: 'right' }}>Credit (₹)</th>
                            <th style={{ textAlign: 'right' }}>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(t => (
                            <tr key={`${t.type}-${t.id}`}>
                                <td>{new Date(t.date).toLocaleDateString()}</td>
                                <td>{t.description}</td>
                                <td style={{ textTransform: 'capitalize' }}>{t.type}</td>
                                <td>{t.refNumber}</td>
                                <td style={{ textAlign: 'right', color: t.debit > 0 ? 'inherit' : '#e5e7eb' }}>
                                    {t.debit > 0 ? formatCurrency(t.debit).replace('₹', '') : '-'}
                                </td>
                                <td style={{ textAlign: 'right', color: t.credit > 0 ? 'inherit' : '#e5e7eb' }}>
                                    {t.credit > 0 ? formatCurrency(t.credit).replace('₹', '') : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {formatBalance(t.balance)}
                                </td>
                            </tr>
                        ))}
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    No transactions found for this account.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
