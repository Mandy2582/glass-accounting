'use client';

import { useState, useEffect } from 'react';
import { Save, DollarSign, AlertCircle } from 'lucide-react';
import { db } from '@/lib/storage';
import { PricingConfig, BusinessConfig } from '@/types';

export default function PricingSettingsPage() {
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [pricing, setPricing] = useState<PricingConfig>({
        baseRatePerSqft: 0,
        holeCharge: 50,
        cutCharge: 30,
        complexityMultiplier: { simple: 1.0, medium: 1.0, complex: 1.0 },
        edgeFinishing: { polished: 0, beveled: 0, none: 0 },
        minimumCharge: 0
    });
    const [pricingLoading, setPricingLoading] = useState(true);
    const [savingPricing, setSavingPricing] = useState(false);
    const [thicknessPricing, setThicknessPricing] = useState<Array<{ thickness: number; ratePerSqft: number; glassType?: string }>>([]);
    const [savingThickness, setSavingThickness] = useState(false);

    const [businessConfig, setBusinessConfig] = useState<BusinessConfig>(db.businessConfig.getDefaults());
    const [businessLoading, setBusinessLoading] = useState(true);
    const [savingCharges, setSavingCharges] = useState(false);

    useEffect(() => {
        loadPricing();
        loadThicknessPricing();
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

    const handleSaveCharges = async () => {
        setSavingCharges(true);
        try {
            await db.businessConfig.update(businessConfig);
            setMessage({ type: 'success', text: 'Checkout charges saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving checkout charges:', error);
            setMessage({ type: 'error', text: 'Failed to save checkout charges' });
        } finally {
            setSavingCharges(false);
        }
    };

    const loadPricing = async () => {
        setPricingLoading(true);
        try {
            const config = await db.settings.getPricing();
            setPricing({
                ...config,
                baseRatePerSqft: 0,
                minimumCharge: 0,
                complexityMultiplier: { simple: 1, medium: 1, complex: 1 },
                edgeFinishing: { polished: 0, beveled: 0, none: 0 },
            });
        } catch (error) {
            console.error('Error loading pricing:', error);
        } finally {
            setPricingLoading(false);
        }
    };

    const loadThicknessPricing = async () => {
        try {
            const thicknessPricingData = await db.settings.getThicknessPricing();
            setThicknessPricing(thicknessPricingData);
        } catch (error) {
            console.error('Error loading thickness pricing:', error);
        }
    };

    const handleSavePricing = async () => {
        setSavingPricing(true);
        try {
            await db.settings.updatePricing({
                ...pricing,
                baseRatePerSqft: 0,
                minimumCharge: 0,
                complexityMultiplier: { simple: 1, medium: 1, complex: 1 },
                edgeFinishing: { polished: 0, beveled: 0, none: 0 },
            });
            setMessage({ type: 'success', text: 'Pricing configuration saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving pricing:', error);
            setMessage({ type: 'error', text: 'Failed to save pricing configuration' });
        } finally {
            setSavingPricing(false);
        }
    };

    const handleSaveThicknessPricing = async () => {
        setSavingThickness(true);
        try {
            await db.settings.updateThicknessPricing(thicknessPricing);
            setMessage({ type: 'success', text: 'Thickness pricing saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving thickness pricing:', error);
            setMessage({ type: 'error', text: 'Failed to save thickness pricing' });
        } finally {
            setSavingThickness(false);
        }
    };

    const handleThicknessChange = (index: number, field: 'thickness' | 'ratePerSqft', value: number) => {
        const updated = [...thicknessPricing];
        updated[index] = { ...updated[index], [field]: value };
        setThicknessPricing(updated);
    };

    const handleThicknessTypeChange = (index: number, value: string) => {
        const updated = [...thicknessPricing];
        updated[index] = { ...updated[index], glassType: value };
        setThicknessPricing(updated);
    };

    const handleAddThickness = () => {
        setThicknessPricing([...thicknessPricing, { thickness: 6, ratePerSqft: 0 }]);
    };

    const handleRemoveThickness = (index: number) => {
        setThicknessPricing(thicknessPricing.filter((_, i) => i !== index));
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

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <DollarSign size={24} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Pricing Configuration</h2>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {pricingLoading ? (
                        <p>Loading pricing configuration...</p>
                    ) : (
                        <>
                            {/* Thickness-Based Glass Rates */}
                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Thickness-Wise Glass Rates</h3>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                            Used for custom design glass cost as: area × rate for selected thickness.
                                            Leave Glass Type blank for a generic rate at that thickness. For Toughened Glass,
                                            add one row per colour (e.g. 12mm + Clear, 12mm + Brown) so a WhatsApp order for
                                            a specific colour is priced correctly.
                                        </p>
                                    </div>
                                    <button type="button" className="btn" onClick={handleAddThickness}>
                                        Add Thickness
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {thicknessPricing.map((item, index) => (
                                        <div
                                            key={`${item.thickness}-${index}`}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(120px, 1fr) minmax(160px, 1fr) minmax(160px, 1fr) auto',
                                                gap: '0.75rem',
                                                alignItems: 'end'
                                            }}
                                        >
                                            <div>
                                                <label className="form-label">Thickness (mm)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={item.thickness}
                                                    onChange={(e) => handleThicknessChange(index, 'thickness', parseFloat(e.target.value) || 0)}
                                                    min="0"
                                                    step="0.5"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Glass Type (optional)</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={item.glassType || ''}
                                                    onChange={(e) => handleThicknessTypeChange(index, e.target.value)}
                                                    placeholder="e.g. Clear, Brown"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Rate (₹ per sq ft)</label>
                                                <input
                                                    type="number"
                                                    className="form-input money-input"
                                                    value={item.ratePerSqft}
                                                    onChange={(e) => handleThicknessChange(index, 'ratePerSqft', parseFloat(e.target.value) || 0)}
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                            <button type="button" className="btn btn-secondary" onClick={() => handleRemoveThickness(index)}>
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSaveThicknessPricing}
                                        disabled={savingThickness}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        <Save size={18} />
                                        {savingThickness ? 'Saving...' : 'Save Thickness Rates'}
                                    </button>
                                </div>
                            </div>

                            {/* Additional Charges */}
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Design Processing Charges</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                    Custom design estimates use only hole and cut charges.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    <div>
                                        <label className="form-label">Hole Charge (₹ per hole)</label>
                                        <input
                                            type="number"
                                            className="form-input money-input"
                                            value={pricing.holeCharge}
                                            onChange={(e) => setPricing({ ...pricing, holeCharge: parseFloat(e.target.value) || 0 })}
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Cut Charge (₹ per cut)</label>
                                        <input
                                            type="number"
                                            className="form-input money-input"
                                            value={pricing.cutCharge}
                                            onChange={(e) => setPricing({ ...pricing, cutCharge: parseFloat(e.target.value) || 0 })}
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Save Button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={loadPricing}
                                    disabled={savingPricing}
                                >
                                    Reset
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSavePricing}
                                    disabled={savingPricing}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={18} />
                                    {savingPricing ? 'Saving...' : 'Save Pricing'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Checkout Charges */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <DollarSign size={24} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Checkout Charges</h2>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {businessLoading ? (
                        <p>Loading checkout charges...</p>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Installation charge per sq.ft</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="input"
                                        value={businessConfig.installationChargePerSqft ?? 0}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, installationChargePerSqft: Number(e.target.value) || 0 })}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                                    <div>
                                        <strong>Transportation by delivery place</strong>
                                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
                                            Zone is auto-detected from the customer&apos;s delivery pincode &mdash; no dropdown shown at checkout.
                                            Leave &quot;Pincode prefixes&quot; empty on one zone to make it the fallback for anything unmatched.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => setBusinessConfig({
                                            ...businessConfig,
                                            deliveryChargeRules: [
                                                ...(businessConfig.deliveryChargeRules || []),
                                                { id: Date.now().toString(), place: '', charge: 0, pincodePrefixes: [] }
                                            ]
                                        })}
                                    >
                                        Add Place
                                    </button>
                                </div>
                                {(businessConfig.deliveryChargeRules || []).map((rule, index) => (
                                    <div key={rule.id || index} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(160px, 1fr) minmax(120px, 140px) auto', gap: '0.75rem', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            className="input"
                                            value={rule.place}
                                            onChange={(e) => setBusinessConfig({
                                                ...businessConfig,
                                                deliveryChargeRules: (businessConfig.deliveryChargeRules || []).map((item, itemIndex) => itemIndex === index ? { ...item, place: e.target.value } : item)
                                            })}
                                            placeholder="Delivery place"
                                        />
                                        <input
                                            type="text"
                                            className="input"
                                            value={(rule.pincodePrefixes || []).join(', ')}
                                            onChange={(e) => setBusinessConfig({
                                                ...businessConfig,
                                                deliveryChargeRules: (businessConfig.deliveryChargeRules || []).map((item, itemIndex) => itemIndex === index ? {
                                                    ...item,
                                                    pincodePrefixes: e.target.value.split(',').map(p => p.trim()).filter(Boolean)
                                                } : item)
                                            })}
                                            placeholder="Pincode prefixes, e.g. 180010, 180"
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="input"
                                            value={rule.charge}
                                            onChange={(e) => setBusinessConfig({
                                                ...businessConfig,
                                                deliveryChargeRules: (businessConfig.deliveryChargeRules || []).map((item, itemIndex) => itemIndex === index ? { ...item, charge: Number(e.target.value) || 0 } : item)
                                            })}
                                            placeholder="Charge"
                                        />
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setBusinessConfig({
                                                ...businessConfig,
                                                deliveryChargeRules: (businessConfig.deliveryChargeRules || []).filter((_, itemIndex) => itemIndex !== index)
                                            })}
                                            style={{ background: '#fee2e2', color: '#991b1b' }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                <button
                                    className="btn"
                                    onClick={loadBusinessConfig}
                                    disabled={savingCharges}
                                    style={{ background: '#f1f5f9', border: '1px solid var(--color-border)' }}
                                >
                                    Reset
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSaveCharges}
                                    disabled={savingCharges}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={18} />
                                    {savingCharges ? 'Saving...' : 'Save Checkout Charges'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
