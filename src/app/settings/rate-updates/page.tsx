'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Plus, Save, Trash2 } from 'lucide-react';
import { db } from '@/lib/storage';
import type { RateUpdateConfig } from '@/types';

export default function RateUpdateSettingsPage() {
    const [config, setConfig] = useState<RateUpdateConfig | null>(null);
    const [newPhone, setNewPhone] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    useEffect(() => {
        db.settings.getRateUpdateConfig()
            .then(setConfig)
            .catch(() => setConfig(db.settings.getRateUpdateDefaults()));
    }, []);

    const save = async () => {
        if (!config) return;
        setSaving(true);
        setMessage(null);
        try {
            await db.settings.updateRateUpdateConfig(config);
            setMessage({ kind: 'ok', text: 'Rate update settings saved.' });
        } catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to save settings.' });
        } finally {
            setSaving(false);
        }
    };

    const addPhone = () => {
        if (!config) return;
        const cleaned = newPhone.replace(/[^0-9]/g, '');
        if (!cleaned || config.authorizedPhones.includes(cleaned)) return;
        setConfig({ ...config, authorizedPhones: [...config.authorizedPhones, cleaned] });
        setNewPhone('');
    };

    const removePhone = (phone: string) => {
        if (!config) return;
        setConfig({ ...config, authorizedPhones: config.authorizedPhones.filter(p => p !== phone) });
    };

    if (!config) return <div className="card" style={{ padding: '1.5rem' }}>Loading…</div>;

    return (
        <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <MessageSquare size={20} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Rate Updates via WhatsApp</h2>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Lets specific phone numbers reprice a whole product line by sending a message to this WhatsApp business
                number -- e.g. <code>12mm Saint Gobain Clear 85</code> sets the rate for every size of that make,
                thickness and type at once, since they all share the same rate per sqft.
            </p>

            <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', cursor: 'pointer', marginBottom: '1.25rem' }}>
                <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                    style={{ marginTop: '0.2rem', width: '18px', height: '18px' }}
                />
                <span>
                    <span style={{ fontWeight: 600, display: 'block' }}>Enable rate updates by WhatsApp</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        Only messages from the numbers listed below are ever treated as a rate update -- every other
                        number is unaffected and continues through the normal order flow.
                    </span>
                </span>
            </label>

            <div style={{ padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>Authorized numbers</label>
                {config.authorizedPhones.length === 0 && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                        No numbers added yet -- add at least one below before turning this on.
                    </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {config.authorizedPhones.map(phone => (
                        <div key={phone} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderRadius: '8px' }}>
                            <span>{phone}</span>
                            <button onClick={() => removePhone(phone)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Remove">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        className="input"
                        placeholder="e.g. 919876543210"
                        value={newPhone}
                        onChange={e => setNewPhone(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhone(); } }}
                        style={{ maxWidth: '260px' }}
                    />
                    <button className="btn btn-secondary" onClick={addPhone} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Plus size={16} /> Add
                    </button>
                </div>
            </div>

            <div style={{ padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', background: '#f8fafc', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Message format</div>
                <div style={{ color: 'var(--color-text-muted)' }}>
                    <div><code>&lt;thickness&gt;mm &lt;make&gt; &lt;type/color&gt; &lt;rate&gt;</code></div>
                    <div style={{ marginTop: '0.4rem' }}>Examples:</div>
                    <ul style={{ marginTop: '0.2rem', paddingLeft: '1.2rem' }}>
                        <li><code>12mm Saint Gobain Clear 85</code></li>
                        <li><code>Gold Plus 5mm Reflective Gold Rs 150 per sqft</code></li>
                    </ul>
                    <div style={{ marginTop: '0.4rem' }}>
                        If a make + thickness has more than one type/color in stock, the type/color word is required --
                        the shop gets a reply back listing the available options if it&apos;s missing or ambiguous.
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
