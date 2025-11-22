'use client';

import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem } from '@/types';
import styles from './inventory.module.css';
import ItemModal from '@/components/inventory/ItemModal';
import BreakageModal from '@/components/inventory/BreakageModal';
import ItemHistoryModal from '@/components/inventory/ItemHistoryModal';

export default function InventoryPage() {
    const [items, setItems] = useState<GlassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBreakageModalOpen, setIsBreakageModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const [editingItem, setEditingItem] = useState<GlassItem | undefined>(undefined);
    const [selectedItemForHistory, setSelectedItemForHistory] = useState<GlassItem | null>(null);

    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        const data = await db.items.getAll();
        setItems(data);
        setLoading(false);
    };

    const handleSaveItem = async (itemData: Omit<GlassItem, 'id'>) => {
        // Check for duplicates
        const getItemKey = (item: Partial<GlassItem>) => {
            if (item.category === 'hardware') {
                return `hardware-${item.name}-${item.make || ''}-${item.model || ''}`.toLowerCase();
            }
            return `glass-${item.name}-${item.type}-${item.thickness}-${item.width}-${item.height}`.toLowerCase();
        };

        const newKey = getItemKey(itemData);
        const isDuplicate = items.some(existingItem => {
            if (editingItem && existingItem.id === editingItem.id) return false; // Ignore self when editing
            return getItemKey(existingItem) === newKey;
        });

        if (isDuplicate) {
            alert('An item with these details already exists in the inventory.');
            return;
        }

        if (editingItem) {
            // Update existing
            const updatedItem = { ...itemData, id: editingItem.id };
            await db.items.update(updatedItem);
        } else {
            // Add new
            const newItem: GlassItem = {
                ...itemData,
                id: crypto.randomUUID(),
            };
            await db.items.add(newItem);
        }
        await loadItems();
        setEditingItem(undefined);
        setIsModalOpen(false);
        alert('Item saved successfully!');
    };

    const handleEditClick = (item: GlassItem) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setEditingItem(undefined);
        setIsModalOpen(false);
    };

    const handleBreakageSaved = async () => {
        await loadItems();
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.type.toLowerCase().includes(search.toLowerCase()) ||
        (item.make && item.make.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="container">
            <div className={styles.header}>
                <h1 className={styles.title}>Inventory Management</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn" style={{ background: '#fee2e2', color: '#ef4444', border: 'none' }} onClick={() => setIsBreakageModalOpen(true)}>
                        Record Breakage
                    </button>
                    <button className="btn btn-primary" onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add New Item
                    </button>
                </div>
            </div>

            <div className="card">
                <div className={styles.toolbar}>
                    <div className={styles.searchWrapper}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Search items..."
                            className="input"
                            style={{ paddingLeft: '2.5rem' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading inventory...</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Make</th>
                                <th>Type</th>
                                <th>Dimensions / Model</th>
                                <th>Thickness</th>
                                <th>Stock</th>
                                <th>Avg Cost</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((item) => (
                                <tr key={item.id}>
                                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                                    <td>{item.make || '-'}</td>
                                    <td>{item.type}</td>
                                    <td>
                                        {item.category === 'hardware' ? (
                                            <span style={{ color: 'var(--color-text-muted)' }}>
                                                {item.model || '-'}
                                            </span>
                                        ) : (
                                            `${item.width}" x ${item.height}"`
                                        )}
                                    </td>
                                    <td>
                                        {item.category === 'hardware' ? '-' : `${item.thickness}mm`}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '999px',
                                                background: item.stock < (item.minStock || 10) ? '#fee2e2' : '#dcfce7',
                                                color: item.stock < (item.minStock || 10) ? '#ef4444' : '#166534',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                width: 'fit-content'
                                            }}>
                                                {item.stock} {item.unit === 'sqft' ? 'Sheets' : item.unit}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                                A: {item.warehouseStock?.['Warehouse A'] || 0} | B: {item.warehouseStock?.['Warehouse B'] || 0}
                                            </span>
                                            {item.category !== 'hardware' && (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                                    {((item.width! * item.height! / 144) * item.stock).toFixed(2)} sq.ft
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>₹{item.purchaseRate || 0}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#e0e7ff', color: '#4338ca', border: 'none' }}
                                                onClick={() => {
                                                    setSelectedItemForHistory(item);
                                                    setIsHistoryModalOpen(true);
                                                }}
                                            >
                                                History
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                onClick={() => handleEditClick(item)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: 'none' }}
                                                onClick={async () => {
                                                    if (confirm('Are you sure you want to delete this item?')) {
                                                        try {
                                                            await db.items.delete(item.id);
                                                            await loadItems();
                                                        } catch (e: any) {
                                                            alert('Failed to delete item. It might be used in invoices.');
                                                            console.error(e);
                                                        }
                                                    }
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No items found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <ItemModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveItem}
                onDelete={async (id) => {
                    try {
                        await db.items.delete(id);
                        await loadItems();
                        alert('Item deleted successfully.');
                    } catch (e: any) {
                        alert('Failed to delete item. It might be used in invoices.');
                        console.error(e);
                    }
                }}
                initialData={editingItem}
            />

            <BreakageModal
                isOpen={isBreakageModalOpen}
                onClose={() => setIsBreakageModalOpen(false)}
                onSave={handleBreakageSaved}
            />

            <ItemHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                item={selectedItemForHistory}
            />
        </div>
    );
}
