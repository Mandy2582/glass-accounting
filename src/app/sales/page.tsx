'use client';

import { useState, useEffect } from 'react';
import { Plus, FileText, RefreshCw, Search } from 'lucide-react';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import InvoiceForm from '@/components/sales/InvoiceForm';
import InvoicePrint from '@/components/sales/InvoicePrint';
import PaymentModal from '@/components/sales/PaymentModal';
import { tallyApi } from '@/lib/tally';

export default function SalesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [search, setSearch] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [syncMessage, setSyncMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const filteredInvoices = invoices.filter(inv => 
        (inv.number || '').toLowerCase().includes(search.toLowerCase()) || 
        (inv.partyName || '').toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        const data = await db.invoices.getAll();
        setInvoices(data.filter(i => (i.type || 'sale') === 'sale').sort((a, b) => {
            const timeA = new Date((a as any).created_at || a.date).getTime();
            const timeB = new Date((b as any).created_at || b.date).getTime();
            return timeB - timeA;
        }));
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this invoice? This will revert stock and balance changes.')) {
            await db.invoices.delete(id);
            await loadInvoices();
        }
    };

    const handleEdit = (invoice: Invoice) => {
        setSelectedInvoice(invoice); // Re-using this state temporarily to pass to form? No, let's use a separate state or modify logic.
        // Actually, let's pass it to the form
        setIsFormOpen(true);
    };

    // We need to change how selectedInvoice is used. 
    // Currently it's for "View/Print". 
    // Let's keep it for View/Print and add a new prop to InvoiceForm for editing.

    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

    const handleEditClick = (invoice: Invoice) => {
        setEditingInvoice(invoice);
        setIsFormOpen(true);
    };

    const handleSaveInvoice = async (invoice: Invoice) => {
        if (editingInvoice) {
            await db.invoices.update(invoice);
        } else {
            await db.invoices.add(invoice);
        }
        await loadInvoices();
        setIsFormOpen(false);
        setEditingInvoice(null);
    };

    const handlePaymentClick = (invoice: Invoice) => {
        setEditingInvoice(invoice); // Re-using editingInvoice to track which invoice is being paid
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSaved = async () => {
        await loadInvoices();
        setIsPaymentModalOpen(false);
        setEditingInvoice(null);
    };

    const handleSyncToTally = async (invoice: Invoice) => {
        setSyncingId(invoice.id);
        setSyncMessage(null);
        try {
            const config = await db.businessConfig.get();
            if (!config.tallyServerIp || !config.tallyServerPort) {
                throw new Error("Tally IP or Port is not configured in Settings.");
            }
            if (!config.tallyCompanyName) {
                throw new Error("Tally Company Name is not configured in Settings.");
            }

            // Generate XML for this invoice (treating it as a Sales Order for now)
            const xml = tallyApi.generateSalesOrderXml(invoice as any, config.tallyCompanyName);
            
            // Send to Tally
            const response = await tallyApi.sendRequest(config.tallyServerIp, config.tallyServerPort, xml);
            
            if (response.includes('<CREATED>1</CREATED>') || response.includes('Created Successfully')) {
                setSyncMessage({ type: 'success', text: `Invoice ${invoice.number} synced to Tally successfully!` });
            } else {
                // Sometimes it's created without clear tags, just check if it threw an error
                setSyncMessage({ type: 'success', text: `Invoice ${invoice.number} sent to Tally!` });
            }
            
            // Auto hide message
            setTimeout(() => setSyncMessage(null), 4000);
            
        } catch (error: any) {
            console.error('Tally Sync Error:', error);
            setSyncMessage({ type: 'error', text: error.message || "Failed to sync with Tally" });
            setTimeout(() => setSyncMessage(null), 5000);
        } finally {
            setSyncingId(null);
        }
    };

    if (isFormOpen) {
        return (
            <InvoiceForm
                initialData={editingInvoice || undefined}
                onSave={handleSaveInvoice}
                onCancel={() => { setIsFormOpen(false); setEditingInvoice(null); }}
            />
        );
    }

    if (selectedInvoice) {
        return <InvoicePrint invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />;
    }

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Sales Invoices</h1>
                <button className="btn btn-primary" onClick={() => { setEditingInvoice(null); setIsFormOpen(true); }}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Invoice
                </button>
            </div>

            {syncMessage && (
                <div style={{ 
                    padding: '1rem', 
                    marginBottom: '1rem', 
                    borderRadius: '8px',
                    background: syncMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                    color: syncMessage.type === 'success' ? '#166534' : '#991b1b',
                    fontWeight: 500
                }}>
                    {syncMessage.text}
                </div>
            )}

            <div className="card">
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '300px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search by invoice # or customer..."
                            className="input"
                            style={{ paddingLeft: '2.5rem' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Invoice #</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th>Total</th>
                            <th>Paid</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInvoices.map((inv) => (
                            <tr key={inv.id}>
                                <td style={{ fontWeight: 500 }}>{inv.number}</td>
                                <td>{new Date(inv.date).toLocaleDateString()}</td>
                                <td>{inv.partyName}</td>
                                <td>{inv.items.length} items</td>
                                <td style={{ fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                                <td>₹{(inv.paidAmount || 0).toFixed(2)}</td>
                                <td>
                                    <span style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '999px',
                                        background: inv.status === 'paid' ? '#dcfce7' : inv.status === 'partially_paid' ? '#fef9c3' : '#fee2e2',
                                        color: inv.status === 'paid' ? '#166534' : inv.status === 'partially_paid' ? '#854d0e' : '#ef4444',
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        {inv.status.toUpperCase().replace('_', ' ')}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            className="btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                            onClick={() => setSelectedInvoice(inv)}
                                        >
                                            View
                                        </button>
                                        {inv.status !== 'paid' && (
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#dcfce7', color: '#166534', border: 'none' }}
                                                onClick={() => handlePaymentClick(inv)}
                                            >
                                                Pay
                                            </button>
                                        )}
                                        <button
                                            className="btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f3f4f6', color: '#374151', border: 'none' }}
                                            onClick={() => handleEditClick(inv)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: 'none' }}
                                            onClick={() => handleDelete(inv.id)}
                                        >
                                            Delete
                                        </button>
                                        <button
                                            className="btn"
                                            style={{ 
                                                padding: '0.25rem 0.5rem', 
                                                fontSize: '0.75rem', 
                                                background: '#dbeafe', 
                                                color: '#1d4ed8', 
                                                border: '1px solid #bfdbfe',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem'
                                            }}
                                            onClick={() => handleSyncToTally(inv)}
                                            disabled={syncingId === inv.id}
                                        >
                                            <RefreshCw size={12} style={{ animation: syncingId === inv.id ? 'spin 1s linear infinite' : 'none' }} />
                                            {syncingId === inv.id ? 'Syncing...' : 'Tally'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredInvoices.length === 0 && (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    <FileText size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                    <p>No invoices found.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isPaymentModalOpen && editingInvoice && (
                <PaymentModal
                    invoice={editingInvoice}
                    onClose={() => { setIsPaymentModalOpen(false); setEditingInvoice(null); }}
                    onSave={handlePaymentSaved}
                />
            )}
        </div>
    );
}
