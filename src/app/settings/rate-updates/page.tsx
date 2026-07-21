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
            setMessage({ kind: 'ok', text: 'Settings saved.' });
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
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Catalogue Commands via WhatsApp</h2>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Lets specific phone numbers reprice a product line, correct a stock count, or record a purchase by
                sending a message to this WhatsApp business number, instead of editing inventory by hand. Each message
                starts with a code word below to say which of the three it is.
            </p>

            <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', cursor: 'pointer', marginBottom: '1.25rem' }}>
                <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                    style={{ marginTop: '0.2rem', width: '18px', height: '18px' }}
                />
                <span>
                    <span style={{ fontWeight: 600, display: 'block' }}>Enable catalogue commands by WhatsApp</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        Only messages from the numbers listed below are ever treated as one of these commands -- every
                        other number is unaffected and continues through the normal order flow.
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

            <div style={{ padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.75rem' }}>Code words</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Rate update</label>
                        <input
                            className="input"
                            value={config.rateKeyword}
                            onChange={e => setConfig({ ...config, rateKeyword: e.target.value.toUpperCase() })}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Stock correction</label>
                        <input
                            className="input"
                            value={config.stockKeyword}
                            onChange={e => setConfig({ ...config, stockKeyword: e.target.value.toUpperCase() })}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Purchase entry</label>
                        <input
                            className="input"
                            value={config.purchaseKeyword}
                            onChange={e => setConfig({ ...config, purchaseKeyword: e.target.value.toUpperCase() })}
                        />
                    </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.6rem', marginBottom: 0 }}>
                    Each message must start with the matching word (not case-sensitive) -- e.g. the default <code>RATE</code> means
                    a message has to begin with <code>RATE</code> to be treated as a rate update.
                </p>
            </div>

            <div style={{ padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '10px', background: '#f8fafc', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Message formats</div>
                <div style={{ color: 'var(--color-text-muted)' }}>
                    <div style={{ fontWeight: 600, marginTop: '0.6rem' }}>{config.rateKeyword} -- reprice a whole product line</div>
                    <div><code>{config.rateKeyword} &lt;thickness&gt;mm [make] &lt;type/colour&gt; &lt;rate&gt;</code> (glass) or <code>{config.rateKeyword} &lt;make&gt; &lt;item name&gt; &lt;rate&gt;</code> (hardware)</div>
                    <ul style={{ marginTop: '0.2rem', paddingLeft: '1.2rem' }}>
                        <li><code>{config.rateKeyword} 12mm Saint Gobain Clear 85</code></li>
                        <li><code>{config.rateKeyword} 5mm grey 150</code> -- no make named, applies to Gold Plus and Asahi</li>
                        <li><code>{config.rateKeyword} 5mm ref grey 180</code> -- &quot;ref&quot;/&quot;r&quot; means Reflective; a bare colour with no marker means Tinted</li>
                        <li><code>{config.rateKeyword} Ozone Top Patch Fitting 900</code></li>
                    </ul>

                    <div style={{ fontWeight: 600, marginTop: '0.9rem' }}>{config.stockKeyword} -- correct a stock count</div>
                    <div>Same as a rate message, but glass also needs the exact size (stock is tracked per size, not per whole line):</div>
                    <ul style={{ marginTop: '0.2rem', paddingLeft: '1.2rem' }}>
                        <li><code>{config.stockKeyword} 12mm Saint Gobain Clear 4x6ft 50</code></li>
                        <li><code>{config.stockKeyword} Ozone Top Patch Fitting 40</code></li>
                    </ul>

                    <div style={{ fontWeight: 600, marginTop: '0.9rem' }}>{config.purchaseKeyword} -- record a purchase from a supplier</div>
                    <div>First line is the supplier name; one item per line after that, each ending in <code>@&lt;purchase rate&gt;</code>:</div>
                    <pre style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.6rem', marginTop: '0.3rem', whiteSpace: 'pre-wrap' }}>
{`${config.purchaseKeyword} ABC Traders
12mm Saint Gobain Clear 4x6ft - 50 sheets @800
Ozone Top Patch Fitting - 20 @750`}
                    </pre>
                    <div style={{ marginTop: '0.4rem' }}>
                        An unrecognised supplier name is added automatically as a new supplier. This actually updates stock
                        and cost accounting (unlike the stock command, which is a plain correction) -- use it for real
                        deliveries received.
                    </div>

                    <div style={{ marginTop: '0.9rem' }}>
                        If a make + thickness has more than one type/colour in stock, the type/colour word is required --
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
