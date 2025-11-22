'use client';

import { useState, useEffect } from 'react';
import { GlassItem, StockBatch } from '@/types';
import Modal from '@/components/Modal';
import { supabase } from '@/lib/supabase';

interface ItemHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: GlassItem | null;
}

export default function ItemHistoryModal({ isOpen, onClose, item }: ItemHistoryModalProps) {
    const [batches, setBatches] = useState<StockBatch[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            loadHistory();
        }
    }, [isOpen, item]);

    const loadHistory = async () => {
        if (!item) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('stock_batches')
            .select('*')
            .eq('item_id', item.id)
            .order('date', { ascending: false }); // Newest first for viewing

        if (error) {
            console.error(error);
        } else {
            // Map snake_case to camelCase
            const mappedBatches: StockBatch[] = (data || []).map((b: any) => ({
                id: b.id,
                itemId: b.item_id,
                invoiceId: b.invoice_id,
                date: b.date,
                rate: b.rate,
                quantity: b.quantity,
                remainingQuantity: b.remaining_quantity,
                warehouse: b.warehouse
            }));
            setBatches(mappedBatches);
        }
        setLoading(false);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Purchase History: ${item?.name || ''}`}
        >
            <div style={{ minWidth: '600px' }}>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>Loading history...</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Warehouse</th>
                                <th>Purchase Rate</th>
                                <th>Original Qty</th>
                                <th>Remaining Qty</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map((batch) => (
                                <tr key={batch.id}>
                                    <td>{new Date(batch.date).toLocaleDateString()}</td>
                                    <td>{batch.warehouse}</td>
                                    <td>₹{batch.rate}</td>
                                    <td>{batch.quantity}</td>
                                    <td style={{ fontWeight: 600 }}>{batch.remainingQuantity}</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            fontSize: '0.75rem',
                                            background: batch.remainingQuantity > 0 ? '#dcfce7' : '#f3f4f6',
                                            color: batch.remainingQuantity > 0 ? '#166534' : '#9ca3af',
                                        }}>
                                            {batch.remainingQuantity > 0 ? 'Active' : 'Consumed'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {batches.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No purchase history found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
                <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                    <button className="btn" onClick={onClose} style={{ background: '#f3f4f6', color: '#374151' }}>Close</button>
                </div>
            </div>
        </Modal>
    );
}
