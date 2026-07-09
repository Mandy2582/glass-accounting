'use client';

import { useState, useEffect } from 'react';
import { Save, Tags, AlertCircle } from 'lucide-react';
import { db } from '@/lib/storage';
import { BusinessConfig, Unit } from '@/types';
import { UNIT_DEFINITIONS } from '@/lib/units';

export default function ItemsSettingsPage() {
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [shopProductGroups, setShopProductGroups] = useState<{ glass: string[]; hardware: string[] }>(db.settings.getProductGroups());
    const [savingProductGroups, setSavingProductGroups] = useState(false);

    const [businessConfig, setBusinessConfig] = useState<BusinessConfig>(db.businessConfig.getDefaults());
    const [businessLoading, setBusinessLoading] = useState(true);
    const [savingUnits, setSavingUnits] = useState(false);

    useEffect(() => {
        loadShopProductGroups();
        loadBusinessConfig();
    }, []);

    const loadBusinessConfig = async () => {
        setBusinessLoading(true);
        try {
            const config = await db.businessConfig.get();
            setBusinessConfig(config);
        } catch (error) {
            console.error('Error loading business config:', error);
        } finally {
            setBusinessLoading(false);
        }
    };

    const handleSaveUnits = async () => {
        setSavingUnits(true);
        try {
            await db.businessConfig.update(businessConfig);
            setMessage({ type: 'success', text: 'Unit handling defaults saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving unit handling:', error);
            setMessage({ type: 'error', text: 'Failed to save unit handling defaults' });
        } finally {
            setSavingUnits(false);
        }
    };

    const updateUnitPreference = (field: keyof NonNullable<BusinessConfig['unitPreferences']>, value: Unit) => {
        const defaults = db.businessConfig.getDefaults().unitPreferences!;
        setBusinessConfig({
            ...businessConfig,
            unitPreferences: {
                ...defaults,
                ...(businessConfig.unitPreferences || {}),
                [field]: value,
            },
        });
    };

    const loadShopProductGroups = async () => {
        try {
            const groups = await db.settings.getShopProductGroups();
            setShopProductGroups(groups);
        } catch (error) {
            console.error('Error loading product groups:', error);
        }
    };

    const handleProductGroupChange = (category: 'glass' | 'hardware', index: number, value: string) => {
        const updated = { ...shopProductGroups, [category]: [...shopProductGroups[category]] };
        updated[category][index] = value;
        setShopProductGroups(updated);
    };

    const handleAddProductGroup = (category: 'glass' | 'hardware') => {
        setShopProductGroups({
            ...shopProductGroups,
            [category]: [...shopProductGroups[category], category === 'glass' ? 'New Glass Group' : 'New Hardware Group']
        });
    };

    const handleRemoveProductGroup = (category: 'glass' | 'hardware', index: number) => {
        setShopProductGroups({
            ...shopProductGroups,
            [category]: shopProductGroups[category].filter((_, i) => i !== index)
        });
    };

    const handleSaveProductGroups = async () => {
        setSavingProductGroups(true);
        try {
            await db.settings.updateShopProductGroups(shopProductGroups);
            setMessage({ type: 'success', text: 'Online product groups saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving product groups:', error);
            setMessage({ type: 'error', text: 'Failed to save online product groups' });
        } finally {
            setSavingProductGroups(false);
        }
    };

    return (
        <>
            {message && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    borderRadius: '0.5rem',
                    background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                    color: message.type === 'success' ? '#166534' : '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <AlertCircle size={20} />
                    {message.text}
                </div>
            )}

            {/* Online Product Groups */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Tags size={24} />
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Online Product Groups</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>These presets appear in inventory item type dropdowns and control shop grouping.</p>
                        </div>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {(['glass', 'hardware'] as const).map(category => (
                            <div key={category}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, textTransform: 'capitalize' }}>{category} Groups</h3>
                                    <button type="button" className="btn btn-secondary" onClick={() => handleAddProductGroup(category)}>
                                        Add
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gap: '0.65rem' }}>
                                    {shopProductGroups[category].map((group, index) => (
                                        <div key={`${category}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem' }}>
                                            <input
                                                className="input"
                                                value={group}
                                                onChange={(e) => handleProductGroupChange(category, index, e.target.value)}
                                                placeholder={category === 'glass' ? 'e.g. Reflective' : 'e.g. Handles'}
                                            />
                                            <button type="button" className="btn" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }} onClick={() => handleRemoveProductGroup(category, index)}>
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={loadShopProductGroups} disabled={savingProductGroups}>Reset</button>
                        <button type="button" className="btn btn-primary" onClick={handleSaveProductGroups} disabled={savingProductGroups} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Save size={18} />
                            {savingProductGroups ? 'Saving...' : 'Save Product Groups'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Unit Handling */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Tags size={24} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Unit Handling</h2>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {businessLoading ? (
                        <p>Loading unit handling defaults...</p>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Default Count Unit</label>
                                    <select
                                        className="input"
                                        value={businessConfig.unitPreferences?.defaultCountUnit || 'nos'}
                                        onChange={(e) => updateUnitPreference('defaultCountUnit', e.target.value as Unit)}
                                    >
                                        {UNIT_DEFINITIONS.filter(unit => unit.category === 'count').map(unit => (
                                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Glass Billing Unit</label>
                                    <select
                                        className="input"
                                        value={businessConfig.unitPreferences?.defaultGlassBillingUnit || 'sqft'}
                                        onChange={(e) => updateUnitPreference('defaultGlassBillingUnit', e.target.value as Unit)}
                                    >
                                        {UNIT_DEFINITIONS.filter(unit => unit.category === 'area' || unit.value === 'sheets').map(unit => (
                                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Unknown Unit Fallback</label>
                                    <select
                                        className="input"
                                        value={businessConfig.unitPreferences?.unknownUnitFallback || 'nos'}
                                        onChange={(e) => updateUnitPreference('unknownUnitFallback', e.target.value as Unit)}
                                    >
                                        {UNIT_DEFINITIONS.filter(unit => ['count', 'area'].includes(unit.category)).map(unit => (
                                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                                Default Count Unit and Glass Billing Unit pre-fill new hardware/glass items in inventory.
                                Unknown Unit Fallback is used when an order line&apos;s unit can&apos;t be recognized (e.g. from email/WhatsApp intake).
                                The app also accepts common aliases such as sq ft, feet, inches, pcs, pieces, sheet, metre, meter, mm and cm.
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                <button
                                    className="btn"
                                    onClick={loadBusinessConfig}
                                    disabled={savingUnits}
                                    style={{ background: '#f1f5f9', border: '1px solid var(--color-border)' }}
                                >
                                    Reset
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSaveUnits}
                                    disabled={savingUnits}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={18} />
                                    {savingUnits ? 'Saving...' : 'Save Unit Handling'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
