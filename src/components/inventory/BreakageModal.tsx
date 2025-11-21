'use client';

import { useState, useEffect } from 'react';
import { GlassItem } from '@/types';
import Modal from '@/components/Modal';
import { db } from '@/lib/storage';

interface BreakageModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => Promise<void>;
}

export default function BreakageModal({ isOpen, onClose, onSave }: BreakageModalProps) {
    const [items, setItems] = useState<GlassItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [quantity, setQuantity] = useState(0);
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadItems = async () => {
            const data = await db.items.getAll();
            setItems(data);
        };
        if (isOpen) loadItems();
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItemId || quantity <= 0) return;

        setLoading(true);
        try {
            const item = items.find(i => i.id === selectedItemId);
            if (item) {
                // Update stock
                const updatedItem = { ...item, stock: item.stock - quantity };
                await db.items.update(updatedItem);

                // Ideally log this in a "Stock Journal" or "Expense" voucher
                // For now, we just reduce stock and maybe create an expense voucher automatically?
                // Let's keep it simple: Just reduce stock.

                await onSave();
                onClose();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const selectedItem = items.find(i => i.id === selectedItemId);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Record Breakage / Loss"
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Select Item</label>
                    <select
                        className="input"
                        required
                        value={selectedItemId}
                        onChange={e => setSelectedItemId(e.target.value)}
                    >
                        <option value="">Select Item</option>
                        {items.map(i => (
                            <option key={i.id} value={i.id}>{i.name} ({i.stock} {i.unit} in stock)</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Quantity Broken</label>
                    <input
                        type="number"
                        required
                        min="1"
                        className="input"
                        value={quantity}
                        onChange={e => setQuantity(Number(e.target.value))}
                    />
                    {selectedItem && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                            Unit: {selectedItem.unit}
                        </p>
                    )}
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Reason</label>
                    <textarea
                        className="input"
                        rows={2}
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="e.g. Broken during transport"
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                    <button type="button" onClick={onClose} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn" style={{ background: '#ef4444', color: 'white', border: 'none' }}>
                        {loading ? 'Recording...' : 'Record Loss'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
