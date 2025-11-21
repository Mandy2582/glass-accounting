'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, ShoppingCart } from 'lucide-react';
import { db } from '@/lib/storage';
import { Invoice } from '@/types';
import PurchaseForm from '@/components/purchase/PurchaseForm';

export default function PurchasesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        const data = await db.invoices.getAll();
        // Filter for purchases only
        setInvoices(data.filter(i => i.type === 'purchase').reverse());
        setLoading(false);
    };

    const handleSave = async () => {
        await loadInvoices();
        setShowForm(false);
    };

    const filteredInvoices = invoices.filter(inv =>
        inv.partyName.toLowerCase().includes(search.toLowerCase()) ||
        inv.number.toLowerCase().includes(search.toLowerCase()) ||
        (inv.supplierInvoiceNumber && inv.supplierInvoiceNumber.toLowerCase().includes(search.toLowerCase()))
    );

    if (showForm) {
        return (
            <div className="container">
                <PurchaseForm onSave={handleSave} onCancel={() => setShowForm(false)} />
            </div>
        );
    }

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Purchase Management</h1>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    New Purchase
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
                                </tr>
                            ))}
                            {filteredInvoices.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No purchase invoices found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
