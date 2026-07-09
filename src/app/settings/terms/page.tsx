'use client';

import { useState, useEffect } from 'react';
import { Save, FileText, AlertCircle } from 'lucide-react';
import { db } from '@/lib/storage';
import { PricingConfig } from '@/types';

export default function TermsSettingsPage() {
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [pricing, setPricing] = useState<PricingConfig>({
        baseRatePerSqft: 0,
        holeCharge: 50,
        cutCharge: 30,
        complexityMultiplier: { simple: 1.0, medium: 1.0, complex: 1.0 },
        edgeFinishing: { polished: 0, beveled: 0, none: 0 },
        minimumCharge: 0
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadPricing();
    }, []);

    const loadPricing = async () => {
        setLoading(true);
        try {
            const config = await db.settings.getPricing();
            setPricing(config);
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await db.settings.updatePricing(pricing);
            setMessage({ type: 'success', text: 'Terms saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving terms:', error);
            setMessage({ type: 'error', text: 'Failed to save terms' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <FileText size={24} />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Terms & Conditions</h2>
                </div>
            </div>
            <div style={{ padding: '1.5rem' }}>
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
                {loading ? (
                    <p>Loading settings...</p>
                ) : (
                    <>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                These terms will be automatically included in all generated PDF estimates.
                            </p>
                            <textarea
                                className="form-input"
                                value={pricing.termsAndConditions || ''}
                                onChange={(e) => setPricing({ ...pricing, termsAndConditions: e.target.value })}
                                placeholder="1. Estimate is valid for 30 days&#10;2. 50% advance payment required&#10;3. Delivery within 7-10 days"
                                rows={8}
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={saving}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Terms'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
