'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, User, Phone, MapPin } from 'lucide-react';
import { db } from '@/lib/storage';
import { Party } from '@/types';
import PartyModal from '@/components/parties/PartyModal';

export default function PartiesPage() {
    const [parties, setParties] = useState<Party[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingParty, setEditingParty] = useState<Party | undefined>(undefined);

    useEffect(() => {
        loadParties();
    }, []);

    const loadParties = async () => {
        const data = await db.parties.getAll();
        setParties(data);
        setLoading(false);
    };

    const handleSaveParty = async (partyData: Omit<Party, 'id'>) => {
        if (editingParty) {
            await db.parties.update({ ...partyData, id: editingParty.id });
        } else {
            const newParty: Party = {
                ...partyData,
                id: crypto.randomUUID(),
            };
            await db.parties.add(newParty);
        }
        await loadParties();
        setEditingParty(undefined);
        alert('Party saved successfully!');
    };

    const handleEdit = (party: Party) => {
        setEditingParty(party);
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setEditingParty(undefined);
    };

    const filteredParties = parties.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.phone.includes(search)
    );

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Party Management</h1>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    Add New Party
                </button>
            </div>

            <div className="card">
                <div style={{ marginBottom: '1.5rem', position: 'relative', maxWidth: '300px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search parties..."
                        className="input"
                        style={{ paddingLeft: '2.5rem' }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading parties...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                        {filteredParties.map((party) => (
                            <div key={party.id} style={{
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: '1rem',
                                background: 'var(--color-bg)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <User size={20} style={{ color: 'var(--color-primary)' }} />
                                        <h3 style={{ fontWeight: 600 }}>{party.name}</h3>
                                    </div>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '999px',
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)'
                                    }}>
                                        {party.type}
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                        <Phone size={14} />
                                        <span>{party.phone || 'No phone'}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <MapPin size={14} />
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{party.address || 'No address'}</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                                    <div style={{ fontSize: '0.875rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Balance: </span>
                                        <span style={{ fontWeight: 600, color: party.balance > 0 ? '#166534' : '#ef4444' }}>
                                            ₹{Math.abs(party.balance)} {party.balance > 0 ? 'Dr' : 'Cr'}
                                        </span>
                                    </div>
                                    <button
                                        className="btn"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                                        onClick={() => handleEdit(party)}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        className="btn"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: 'none', marginLeft: '0.5rem' }}
                                        onClick={async () => {
                                            if (confirm('Are you sure you want to delete this party?')) {
                                                try {
                                                    await db.parties.delete(party.id);
                                                    await loadParties();
                                                    alert('Party deleted successfully.');
                                                } catch (e) {
                                                    console.error(e);
                                                    alert('Failed to delete party. They might have linked invoices.');
                                                }
                                            }
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <PartyModal
                isOpen={isModalOpen}
                onClose={handleClose}
                onSave={handleSaveParty}
                initialData={editingParty}
            />
        </div>
    );
}
