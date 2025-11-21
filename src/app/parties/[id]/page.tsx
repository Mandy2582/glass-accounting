'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/storage';
import { Party, Invoice } from '@/types';

export default function PartyLedgerPage() {
    const params = useParams();
    const [party, setParty] = useState<Party | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (params.id) {
            loadData(params.id as string);
        }
    }, [params.id]);

    const loadData = async (id: string) => {
        const [partiesData, invoicesData] = await Promise.all([
            db.parties.getAll(),
            db.invoices.getAll()
        ]);

        const foundParty = partiesData.find(p => p.id === id);
        const partyInvoices = invoicesData.filter(i => i.partyId === id);

        setParty(foundParty || null);
        setInvoices(partyInvoices.reverse());
        setLoading(false);
    };

    if (loading) return <div className="container">Loading...</div>;
    if (!party) return <div className="container">Party not found</div>;

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/parties" className="btn" style={{ background: 'none', padding: 0 }}>
                    <ArrowLeft size={24} />
                </Link>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{party.name}</h1>
                    <p style={{ color: 'var(--color-text-muted)' }}>Ledger Account</p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Phone</p>
                        <p style={{ fontWeight: 500 }}>{party.phone || '-'}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Address</p>
                        <p style={{ fontWeight: 500 }}>{party.address || '-'}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Current Balance</p>
                        <p style={{ fontWeight: 600, color: party.balance > 0 ? '#166534' : '#ef4444', fontSize: '1.125rem' }}>
                            ₹{Math.abs(party.balance)} {party.balance > 0 ? 'Dr' : 'Cr'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="card">
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Transaction History</h3>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Ref #</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Debit</th>
                            <th>Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((inv) => (
                            <tr key={inv.id}>
                                <td>{new Date(inv.date).toLocaleDateString()}</td>
                                <td>{inv.number}</td>
                                <td>Sales</td>
                                <td>Invoice generated</td>
                                <td style={{ fontWeight: 500 }}>₹{inv.total.toFixed(2)}</td>
                                <td>-</td>
                            </tr>
                        ))}
                        {invoices.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                    No transactions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
