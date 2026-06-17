'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, ShoppingCart, Eye, Pencil, Trash2, CreditCard } from 'lucide-react';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import PurchaseForm from '@/components/purchase/PurchaseForm';
import PaymentModal from '@/components/sales/PaymentModal';

export default function PurchasesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [viewOnly, setViewOnly] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        setLoading(true);
        const orders = await db.orders.getAll();
        const completedPOsMissingPurchase = orders.filter(order =>
            order.type === 'purchase_order' &&
            order.status === 'completed' &&
            !order.invoiceId
        );

        if (completedPOsMissingPurchase.length > 0) {
            for (const order of completedPOsMissingPurchase) {
                try {
                    await db.orders.convertToInvoice(order.id);
                } catch (error) {
                    console.error(`Failed to reflect purchase order ${order.number} in purchases:`, error);
                }
            }
        }

        const data = await db.invoices.getAll();
        // Filter for purchases only
        setInvoices(data.filter(i => i.type === 'purchase').sort((a, b) => {
            const timeA = new Date((a as any).created_at || a.date).getTime();
            const timeB = new Date((b as any).created_at || b.date).getTime();
            return timeB - timeA;
        }));
        setLoading(false);
    };

    const handleSave = async () => {
        await loadInvoices();
        setShowForm(false);
        setSelectedInvoice(null);
        setViewOnly(false);
    };

    const handleCancel = () => {
        setShowForm(false);
        setSelectedInvoice(null);
        setViewOnly(false);
    };

    const handleView = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setViewOnly(true);
        setShowForm(true);
    };

    const handleEdit = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setViewOnly(false);
        setShowForm(true);
    };

    const handleNewPurchase = () => {
        setSelectedInvoice(null);
        setViewOnly(false);
        setShowForm(true);
    };

    const handlePaymentClick = (invoice: Invoice) => {
        setPaymentInvoice(invoice);
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSave = async () => {
        setIsPaymentModalOpen(false);
        setPaymentInvoice(null);
        await loadInvoices();
    };

    const filteredInvoices = invoices.filter(inv =>
        (inv.partyName || '').toLowerCase().includes(search.toLowerCase()) ||
        (inv.number || '').toLowerCase().includes(search.toLowerCase()) ||
        (inv.supplierInvoiceNumber || '').toLowerCase().includes(search.toLowerCase())
    );

    if (showForm) {
        return (
            <div className="container">
                <PurchaseForm
                    onSave={handleSave}
                    onCancel={handleCancel}
                    initialData={selectedInvoice || undefined}
                    viewOnly={viewOnly}
                />
            </div>
        );
    }

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Purchase Bills</h1>
                    <p style={{ marginTop: '0.25rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                        Record supplier invoices and update purchase-side inventory.
                    </p>
                </div>
                <button className="btn btn-primary" onClick={handleNewPurchase}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Purchase Bill
                </button>
            </div>

            <div className="card">
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search purchases..."
                            className="input"
                            style={{ paddingLeft: '2.5rem' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading purchases...</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Purchase #</th>
                                <th>Supplier Inv #</th>
                                <th>Supplier</th>
                                <th>Items</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                                <th style={{ textAlign: 'right' }}>Paid</th>
                                <th style={{ textAlign: 'center' }}>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInvoices.map((inv) => (
                                <tr key={inv.id}>
                                    <td>{new Date(inv.date).toLocaleDateString()}</td>
                                    <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{inv.number}</td>
                                    <td>{inv.supplierInvoiceNumber || '-'}</td>
                                    <td style={{ fontWeight: 500 }}>{inv.partyName}</td>
                                    <td>{inv.items.length} items</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right' }}>₹{(inv.paidAmount || 0).toFixed(2)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            background: inv.status === 'paid' ? '#dcfce7' : inv.status === 'partially_paid' ? '#fef9c3' : '#fee2e2',
                                            color: inv.status === 'paid' ? '#166534' : inv.status === 'partially_paid' ? '#854d0e' : '#ef4444',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            {inv.status ? inv.status.toUpperCase().replace('_', ' ') : 'UNPAID'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                onClick={() => handleView(inv)}
                                                title="View Purchase"
                                            >
                                                <Eye size={14} />
                                                View
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.2)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                onClick={() => handleEdit(inv)}
                                                title="Edit Purchase"
                                            >
                                                <Pencil size={14} />
                                                Edit
                                            </button>
                                            {inv.status !== 'paid' && (
                                                <button
                                                    className="btn"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                    onClick={() => handlePaymentClick(inv)}
                                                    title="Record Payment"
                                                >
                                                    <CreditCard size={14} />
                                                    Pay
                                                </button>
                                            )}
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                onClick={async () => {
                                                    if (confirm('Are you sure you want to delete this purchase? This will revert stock and balance changes.')) {
                                                        await db.invoices.delete(inv.id);
                                                        await loadInvoices();
                                                    }
                                                }}
                                                title="Delete Purchase"
                                            >
                                                <Trash2 size={14} />
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredInvoices.length === 0 && (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No purchase invoices found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {isPaymentModalOpen && paymentInvoice && (
                <PaymentModal
                    invoice={paymentInvoice}
                    onClose={() => { setIsPaymentModalOpen(false); setPaymentInvoice(null); }}
                    onSave={handlePaymentSave}
                />
            )}
        </div>
    );
}
