'use client';

import { useEffect, useState } from 'react';
import { Bot, Save } from 'lucide-react';
import { db } from '@/lib/storage';
import type { AutomationConfig } from '@/types';

export default function AutomationSettingsPage() {
    const [config, setConfig] = useState<AutomationConfig | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    useEffect(() => {
        db.settings.getAutomation()
            .then(setConfig)
            .catch(() => setConfig(db.settings.getAutomationDefaults()));
    }, []);

    const save = async () => {
        if (!config) return;
        setSaving(true);
        setMessage(null);
        try {
            await db.settings.updateAutomation(config);
            setMessage({ kind: 'ok', text: 'Automation settings saved.' });
        } catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to save settings.' });
        } finally {
            setSaving(false);
        }
    };

    if (!config) return <div className="card" style={{ padding: '1.5rem' }}>Loading…</div>;

    return (
        <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <Bot size={20} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Order Automation</h2>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Controls what happens when an order arrives by WhatsApp or email.
            </p>

            <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', cursor: 'pointer', marginBottom: '1rem' }}>
                <input
                    type="checkbox"
                    checked={config.autoReviewEnabled}
                    onChange={e => setConfig({ ...config, autoReviewEnabled: e.target.checked })}
                    style={{ marginTop: '0.2rem', width: '18px', height: '18px' }}
                />
                <span>
                    <span style={{ fontWeight: 600, display: 'block' }}>Automatic review</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        When on, a qualifying order is priced and quoted to the customer automatically, with no staff
                        step. If the customer replies &quot;OK&quot;, the order is booked, invoiced, and they get a
                        written confirmation. When off, every order waits for a staff member to review and send the
                        quotation — the current behaviour.
                    </span>
                </span>
            </label>

            <div style={{ opacity: config.autoReviewEnabled ? 1 : 0.5, pointerEvents: config.autoReviewEnabled ? 'auto' : 'none' }}>
                <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', cursor: 'pointer', marginBottom: '1rem' }}>
                    <input
                        type="checkbox"
                        checked={config.autoReviewRequireCleanDrawing}
                        onChange={e => setConfig({ ...config, autoReviewRequireCleanDrawing: e.target.checked })}
                        style={{ marginTop: '0.2rem', width: '18px', height: '18px' }}
                    />
                    <span>
                        <span style={{ fontWeight: 600, display: 'block' }}>Only auto-quote drawings that were read cleanly</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                            Strongly recommended. A drawing whose hole or cut positions could not be read from the photo
                            (the amber-flagged ones) may be priced on a wrong area, so it is sent to staff instead.
                            Turning this off lets those be quoted automatically too.
                        </span>
                    </span>
                </label>

                <div style={{ padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                        Staff review above this order value
                    </label>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.6rem' }}>
                        Any order quoting above this amount goes to staff even when automatic review is on.
                        Set 0 for no limit.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600 }}>₹</span>
                        <input
                            className="input"
                            type="number"
                            min={0}
                            step={100}
                            value={config.autoReviewMaxOrderValue}
                            onChange={e => setConfig({ ...config, autoReviewMaxOrderValue: Number(e.target.value) || 0 })}
                            style={{ maxWidth: '220px' }}
                        />
                    </div>
                </div>
            </div>

            {message && (
                <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: message.kind === 'ok' ? '#059669' : '#dc2626' }}>
                    {message.text}
                </div>
            )}

            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Save size={16} /> {saving ? 'Saving…' : 'Save Settings'}
            </button>
        </div>
    );
}
