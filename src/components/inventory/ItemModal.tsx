'use client';

import { useState, useEffect } from 'react';
import { GlassItem, Unit } from '@/types';
import Modal from '@/components/Modal';
import FractionInput from '@/components/FractionInput';
import NumericInput from '@/components/NumericInput';
import { convertRateForItemUnit, getUnitOptionsForItem, UNIT_OPTIONS_BY_GROUP } from '@/lib/units';
import { db } from '@/lib/storage';

interface ItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Omit<GlassItem, 'id'>) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    initialData?: GlassItem;
}

export default function ItemModal({ isOpen, onClose, onSave, onDelete, initialData }: ItemModalProps) {
    const defaultItemData: Partial<GlassItem> = {
        name: '',
        category: 'glass',
        type: 'Toughened',
        productGroup: 'Toughened',
        showOnline: true,
        imageUrl: '',
        make: '',
        model: '',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'sqft',
        stock: 0,
        warehouseStock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        rate: 0,
        rateUnit: 'sqft',
        purchaseRateUnit: 'sqft',
        hsnCode: '',
        conversionFactor: 0
    };
    const [formData, setFormData] = useState<Partial<GlassItem>>(defaultItemData);
    const [productGroups, setProductGroups] = useState<{ glass: string[]; hardware: string[] }>({
        glass: db.settings.getProductGroups().glass,
        hardware: db.settings.getProductGroups().hardware
    });
    const [defaultUnits, setDefaultUnits] = useState<{ glass: Unit; hardware: Unit }>({ glass: 'sqft', hardware: 'nos' });

    // Update form data when initialData changes (for Edit mode)
    useEffect(() => {
        db.settings.getShopProductGroups()
            .then(setProductGroups)
            .catch(error => console.error('Failed to load product groups:', error));
        db.businessConfig.get()
            .then(config => setDefaultUnits({
                glass: config.unitPreferences?.defaultGlassBillingUnit || 'sqft',
                hardware: config.unitPreferences?.defaultCountUnit || 'nos',
            }))
            .catch(error => console.error('Failed to load unit preferences:', error));
    }, [isOpen]);

    // Update form data when initialData changes (for Edit mode)
    useEffect(() => {
        if (initialData) {
            setFormData({
                ...defaultItemData,
                ...initialData,
                productGroup: initialData.productGroup || initialData.type,
                rateUnit: initialData.rateUnit || initialData.unit || (initialData.category === 'hardware' ? 'nos' : 'sqft'),
                purchaseRateUnit: initialData.purchaseRateUnit || initialData.rateUnit || initialData.unit || (initialData.category === 'hardware' ? 'nos' : 'sqft'),
            });
        } else {
            // Reset for Add mode
            setFormData(defaultItemData);
        }
    }, [initialData, isOpen]);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave({
                ...formData,
                rateUnit: formData.rateUnit || formData.unit || 'nos',
                purchaseRateUnit: formData.purchaseRateUnit || formData.rateUnit || formData.unit || 'nos',
            } as Omit<GlassItem, 'id'>);
            onClose();
        } catch (error: any) {
            console.error(error);
            alert(`Failed to save item: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleRateUnitChange = (unit: Unit, field: 'rateUnit' | 'purchaseRateUnit') => {
        const previousUnit = formData[field] || formData.unit || 'nos';
        const rateField = field === 'rateUnit' ? 'rate' : 'purchaseRate';
        setFormData({
            ...formData,
            [field]: unit,
            [rateField]: convertRateForItemUnit({
                rate: Number(formData[rateField]) || 0,
                fromUnit: previousUnit,
                toUnit: unit,
                width: formData.width,
                height: formData.height,
                conversionFactor: formData.conversionFactor,
            }),
        });
    };

    const rateUnitGroups = getUnitOptionsForItem({ category: formData.category, type: formData.type, unit: formData.unit });
    const currentProductGroups = formData.category === 'hardware' ? productGroups.hardware : productGroups.glass;

    const handleImageUpload = (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }
        if (file.size > 900 * 1024) {
            alert('Please select an image up to 900 KB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => setFormData(prev => ({ ...prev, imageUrl: String(reader.result || '') }));
        reader.readAsDataURL(file);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData?.id ? 'Edit Item' : 'Add New Item'}
            maxWidth="760px"
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
                                onChange={() => setFormData({ ...formData, category: 'glass', type: productGroups.glass[0] || 'Toughened', productGroup: productGroups.glass[0] || 'Toughened', unit: 'sheets', rateUnit: defaultUnits.glass, purchaseRateUnit: defaultUnits.glass })}
                            />
                            Glass
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="category"
                                value="hardware"
                                checked={formData.category === 'hardware'}
                                onChange={() => setFormData({ ...formData, category: 'hardware', type: productGroups.hardware[0] || 'Handles', productGroup: productGroups.hardware[0] || 'Handles', unit: defaultUnits.hardware, rateUnit: defaultUnits.hardware, purchaseRateUnit: defaultUnits.hardware, width: 0, height: 0, thickness: 0 })}
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

                <div className="form-grid form-grid-2">
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Product Type / Group</label>
                        <select
                            className="input"
                            value={formData.productGroup || formData.type || ''}
                            onChange={e => setFormData({ ...formData, productGroup: e.target.value, type: e.target.value })}
                        >
                            {currentProductGroups.map(group => (
                                <option key={group} value={group}>{group}</option>
                            ))}
                        </select>
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
                <div className="form-grid form-grid-2">
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

                <div style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1rem', background: 'var(--color-bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                        <div>
                            <div style={{ fontWeight: 700 }}>Online Product Settings</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Controls how this inventory item appears on the customer product page.</div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                            <input
                                type="checkbox"
                                checked={Boolean(formData.showOnline)}
                                onChange={e => setFormData({ ...formData, showOnline: e.target.checked })}
                            />
                            Show online
                        </label>
                    </div>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Product Image URL</label>
                            <input
                                className="input"
                                value={formData.imageUrl || ''}
                                onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                                placeholder="/shop-products/photos/clear-glass-panels.png"
                            />
                            <label className="btn" style={{ marginTop: '0.5rem', display: 'inline-flex', cursor: 'pointer', background: 'white', border: '1px solid var(--color-border)' }}>
                                Upload Image
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e.target.files)} />
                            </label>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Preview</label>
                            <div style={{ height: 120, border: '1px dashed var(--color-border)', borderRadius: '12px', display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'white' }}>
                                {formData.imageUrl ? (
                                    <img src={formData.imageUrl} alt="Product preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No image selected</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {formData.category === 'hardware' ? (
                    <div className="form-grid form-grid-2">
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
                    <div className="form-grid form-grid-2">
                        <div className="form-grid form-grid-2">
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Thickness (mm)</label>
                                <NumericInput
                                    required
                                    className="input"
                                    value={formData.thickness ?? ''}
                                    onChange={val => setFormData({ ...formData, thickness: val })}
                                    min={0}
                                    step={0.01}
                                />
                            </div>
                             <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Width (inch)</label>
                                <FractionInput
                                    className="input"
                                    value={formData.width || 0}
                                    onChange={val => setFormData({ ...formData, width: val })}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Height (inch)</label>
                            <FractionInput
                                className="input"
                                value={formData.height || 0}
                                onChange={val => setFormData({ ...formData, height: val })}
                                required
                            />
                        </div>
                    </div>
                )}

                <div className="form-grid form-grid-3">
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Stock Unit</label>
                        <select
                            className="input"
                            value={formData.unit}
                            onChange={e => setFormData({ ...formData, unit: e.target.value as Unit })}
                        >
                            {UNIT_OPTIONS_BY_GROUP.map(group => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.units.map(unit => (
                                        <option key={unit.value} value={unit.value}>{unit.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Selling Rate (₹)</label>
                        <NumericInput
                            required
                            className="input money-input"
                            min="0"
                            step="0.01"
                            precision={2}
                            value={formData.rate ?? ''}
                            onChange={val => setFormData({ ...formData, rate: val })}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Selling Rate Unit</label>
                        <select
                            className="input"
                            value={formData.rateUnit || formData.unit || 'nos'}
                            onChange={e => handleRateUnitChange(e.target.value as Unit, 'rateUnit')}
                        >
                            {rateUnitGroups.map(group => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.units.map(unit => (
                                        <option key={unit.value} value={unit.value}>{unit.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-grid form-grid-2">
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Purchase Rate (₹)</label>
                        <NumericInput
                            className="input money-input"
                            min="0"
                            step="0.01"
                            precision={2}
                            value={formData.purchaseRate || ''}
                            onChange={val => setFormData({ ...formData, purchaseRate: val })}
                            placeholder="Cost Price (Optional)"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Purchase Rate Unit</label>
                        <select
                            className="input"
                            value={formData.purchaseRateUnit || formData.rateUnit || formData.unit || 'nos'}
                            onChange={e => handleRateUnitChange(e.target.value as Unit, 'purchaseRateUnit')}
                        >
                            {rateUnitGroups.map(group => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.units.map(unit => (
                                        <option key={unit.value} value={unit.value}>{unit.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className="form-grid form-grid-2" style={{ gridColumn: '1 / -1' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Stock (Warehouse A)</label>
                            <NumericInput
                                className="input"
                                value={formData.warehouseStock?.['Warehouse A'] || 0}
                                onChange={val => {
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
                            <NumericInput
                                className="input"
                                value={formData.warehouseStock?.['Warehouse B'] || 0}
                                onChange={val => {
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
                        <NumericInput
                            className="input"
                            value={formData.minStock || ''}
                            onChange={val => setFormData({ ...formData, minStock: val })}
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
