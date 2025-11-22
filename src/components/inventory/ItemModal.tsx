'use client';

import { useState, useEffect } from 'react';
import { GlassItem, Unit } from '@/types';
import Modal from '@/components/Modal';

interface ItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Omit<GlassItem, 'id'>) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    initialData?: GlassItem;
}

export default function ItemModal({ isOpen, onClose, onSave, onDelete, initialData }: ItemModalProps) {
    const [formData, setFormData] = useState<Partial<GlassItem>>({
        name: '',
        category: 'glass',
        type: 'Toughened',
        make: '',
        model: '',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'sqft',
        stock: 0,
        warehouseStock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        rate: 0,
        hsnCode: '',
        conversionFactor: 0
    });

    // Update form data when initialData changes (for Edit mode)
    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            // Reset for Add mode
            setFormData({
                name: '',
                category: 'glass',
                type: 'Toughened',
                make: '',
                model: '',
                thickness: 0,
                width: 0,
                height: 0,
                unit: 'sqft',
                stock: 0,
                warehouseStock: { 'Warehouse A': 0, 'Warehouse B': 0 },
                rate: 0,
                hsnCode: '',
                conversionFactor: 0
            });
        }
    }, [initialData, isOpen]);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData as Omit<GlassItem, 'id'>);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? 'Edit Item' : 'Add New Item'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Category Selector */}
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Category</label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="category"
                                value="glass"
                                checked={formData.category !== 'hardware'}
                                onChange={() => setFormData({ ...formData, category: 'glass', unit: 'sqft' })}
                            />
                            Glass
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="category"
                                value="hardware"
                                checked={formData.category === 'hardware'}
                                onChange={() => setFormData({ ...formData, category: 'hardware', unit: 'nos', width: 0, height: 0, thickness: 0 })}
                            />
                            Hardware
                        </label>
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Item Name</label>
                    <input
                        required
                        className="input"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder={formData.category === 'hardware' ? "e.g. Door Handle SS" : "e.g. 12mm Toughened Clear"}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Type</label>
                        {formData.category === 'hardware' ? (
                            <input
                                className="input"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                                placeholder="e.g. Handle, Hinge, Lock"
                            />
                        ) : (
                            <select
                                className="input"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="Toughened">Toughened</option>
                                <option value="Mirror">Mirror</option>
                                <option value="Lacquered">Lacquered</option>
                                <option value="Clear">Clear Float</option>
                                <option value="Tinted">Tinted</option>
                            </select>
                        )}
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Make (Brand)</label>
                        <input
                            className="input"
                            value={formData.make || ''}
                            onChange={e => setFormData({ ...formData, make: e.target.value })}
                            placeholder={formData.category === 'hardware' ? "e.g. Dorset" : "e.g. Saint-Gobain"}
                        />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>HSN Code</label>
                        <input
                            className="input"
                            value={formData.hsnCode || ''}
                            onChange={e => setFormData({ ...formData, hsnCode: e.target.value })}
                            placeholder="e.g. 7007"
                        />
                    </div>
                </div>

                {formData.category === 'hardware' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Model</label>
                            <input
                                className="input"
                                value={formData.model || ''}
                                onChange={e => setFormData({ ...formData, model: e.target.value })}
                                placeholder="e.g. DH-101"
                            />
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Thickness (mm)</label>
                                <input
                                    type="number"
                                    required
                                    className="input"
                                    value={formData.thickness}
                                    onChange={e => setFormData({ ...formData, thickness: Number(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Width (inch)</label>
                                <input
                                    type="number"
                                    required
                                    className="input"
                                    value={formData.width}
                                    onChange={e => setFormData({ ...formData, width: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Height (inch)</label>
                            <input
                                type="number"
                                required
                                className="input"
                                value={formData.height}
                                onChange={e => setFormData({ ...formData, height: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Unit</label>
                        <select
                            className="input"
                            value={formData.unit}
                            onChange={e => setFormData({ ...formData, unit: e.target.value as Unit })}
                            disabled={formData.category === 'hardware'}
                        >
                            <option value="sqft">Sq. Ft</option>
                            <option value="sheets">Sheets</option>
                            <option value="nos">Nos</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Selling Rate (₹)</label>
                        <input
                            type="number"
                            required
                            className="input"
                            value={formData.rate}
                            onChange={e => setFormData({ ...formData, rate: Number(e.target.value) })}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Purchase Rate (₹)</label>
                        <input
                            type="number"
                            className="input"
                            value={formData.purchaseRate || ''}
                            onChange={e => setFormData({ ...formData, purchaseRate: Number(e.target.value) })}
                            placeholder="Cost Price (Optional)"
                        />
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Stock (Warehouse A)</label>
                            <input
                                type="number"
                                className="input"
                                value={formData.warehouseStock?.['Warehouse A'] || 0}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    const currentB = formData.warehouseStock?.['Warehouse B'] || 0;
                                    setFormData({
                                        ...formData,
                                        warehouseStock: { ...formData.warehouseStock, 'Warehouse A': val },
                                        stock: val + currentB
                                    });
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Stock (Warehouse B)</label>
                            <input
                                type="number"
                                className="input"
                                value={formData.warehouseStock?.['Warehouse B'] || 0}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    const currentA = formData.warehouseStock?.['Warehouse A'] || 0;
                                    setFormData({
                                        ...formData,
                                        warehouseStock: { ...formData.warehouseStock, 'Warehouse B': val },
                                        stock: currentA + val
                                    });
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Min Stock Alert</label>
                        <input
                            type="number"
                            className="input"
                            value={formData.minStock || ''}
                            onChange={e => setFormData({ ...formData, minStock: Number(e.target.value) })}
                            placeholder="Default: 10"
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                    {initialData && onDelete && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (confirm('Are you sure you want to delete this item?')) {
                                    setLoading(true);
                                    await onDelete(initialData.id);
                                    setLoading(false);
                                    onClose();
                                }
                            }}
                            className="btn"
                            style={{ background: '#fee2e2', color: '#ef4444', border: 'none' }}
                        >
                            Delete Item
                        </button>
                    )}
                    <div style={{ display: 'flex', gap: '1rem', marginLeft: 'auto' }}>
                        <button type="button" onClick={onClose} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                        <button type="submit" disabled={loading} className="btn btn-primary">
                            {loading ? 'Saving...' : 'Save Item'}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
