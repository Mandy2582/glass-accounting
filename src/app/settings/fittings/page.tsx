'use client';

import { useState, useEffect } from 'react';
import { Save, Wrench, AlertCircle, CheckCircle } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem, FittingRole } from '@/types';

// The glass prep each hardware fitting needs, edited here once so the Glass
// Systems Designer can draw the right holes/cut-outs and add the right
// priced line whenever that fitting is used.
const ROLE_OPTIONS: { value: FittingRole; label: string }[] = [
    { value: 'top_patch', label: 'Top patch fitting' },
    { value: 'bottom_patch', label: 'Bottom patch fitting' },
    { value: 'overpanel_patch', label: 'Overpanel patch' },
    { value: 'floor_spring', label: 'Floor spring' },
    { value: 'wall_hinge', label: 'Wall-to-glass hinge' },
    { value: 'glass_hinge', label: 'Glass-to-glass hinge' },
    { value: 'door_lock', label: 'Door lock' },
    { value: 'sliding_lock', label: 'Sliding lock' },
    { value: 'connector', label: 'Connector (L / patch)' },
    { value: 'clamp', label: 'Clamp' },
    { value: 'spigot', label: 'Spigot' },
    { value: 'handle', label: 'Handle' },
    { value: 'sliding_kit', label: 'Sliding kit' },
    { value: 'other', label: 'Other (no auto-placement)' },
];

export default function FittingsSettingsPage() {
    const [fittings, setFittings] = useState<GlassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    // ids of rows the user has touched, so we only write those back.
    const [dirty, setDirty] = useState<Set<string>>(new Set());

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const all = await db.items.getAll();
            const hw = all
                .filter(i => i.category === 'hardware')
                .sort((a, b) => a.name.localeCompare(b.name));
            setFittings(hw);
        } catch (error) {
            console.error('Error loading fittings:', error);
            setMessage({ type: 'error', text: 'Could not load your hardware fittings. Refresh and try again.' });
        } finally {
            setLoading(false);
        }
    };

    const update = (id: string, patch: Partial<GlassItem>) => {
        setFittings(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
        setDirty(prev => new Set(prev).add(id));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const toSave = fittings.filter(f => dirty.has(f.id));
            for (const f of toSave) {
                await db.items.update(f);
            }
            setDirty(new Set());
            setMessage({ type: 'success', text: `Saved glass prep for ${toSave.length} fitting${toSave.length === 1 ? '' : 's'}.` });
        } catch (error) {
            console.error('Error saving fittings:', error);
            setMessage({ type: 'error', text: 'Something went wrong saving. Your changes are still on screen — try again.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <Wrench size={22} />
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Hardware Fittings</h1>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: '0 0 1.25rem', maxWidth: '68ch' }}>
                Set what each fitting is and how much glass prep it needs. The Glass Systems Designer uses this to place the right holes and cut-outs — and add the fitting to the quote — automatically. Defaults are filled in; correct any that are off.
            </p>

            {message && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 0.9rem', borderRadius: '10px', marginBottom: '1rem',
                    background: message.type === 'success' ? 'rgba(16,185,129,.12)' : 'rgba(220,38,38,.1)',
                    color: message.type === 'success' ? '#047857' : '#b91c1c', fontSize: '0.88rem',
                }}>
                    {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {message.text}
                </div>
            )}

            {loading ? (
                <p style={{ color: 'var(--color-text-muted)' }}>Loading fittings…</p>
            ) : fittings.length === 0 ? (
                <div className="card" style={{ padding: '1.25rem' }}>
                    <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
                        No hardware items in your catalogue yet. Add fittings under Inventory (category: hardware), then set their glass prep here.
                    </p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-subtle, #f8fafb)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.7rem 0.9rem', fontWeight: 700 }}>Fitting</th>
                                    <th style={{ padding: '0.7rem 0.9rem', fontWeight: 700, width: '210px' }}>Role</th>
                                    <th style={{ padding: '0.7rem 0.9rem', fontWeight: 700, width: '90px' }}>Holes</th>
                                    <th style={{ padding: '0.7rem 0.9rem', fontWeight: 700, width: '90px' }}>Cuts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fittings.map(f => (
                                    <tr key={f.id} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
                                        <td style={{ padding: '0.55rem 0.9rem' }}>
                                            <div style={{ fontWeight: 600 }}>{f.name}</div>
                                            {f.make && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{f.make}{f.model ? ` · ${f.model}` : ''}</div>}
                                        </td>
                                        <td style={{ padding: '0.55rem 0.9rem' }}>
                                            <select
                                                className="input"
                                                value={f.fittingRole || ''}
                                                onChange={e => update(f.id, { fittingRole: (e.target.value || undefined) as FittingRole | undefined })}
                                                style={{ width: '100%' }}
                                            >
                                                <option value="">— not set —</option>
                                                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ padding: '0.55rem 0.9rem' }}>
                                            <input
                                                className="input" type="number" min={0} max={20} step={1}
                                                value={f.holesRequired ?? ''}
                                                onChange={e => update(f.id, { holesRequired: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                style={{ width: '100%' }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.55rem 0.9rem' }}>
                                            <input
                                                className="input" type="number" min={0} max={20} step={1}
                                                value={f.cutsRequired ?? ''}
                                                onChange={e => update(f.id, { cutsRequired: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                style={{ width: '100%' }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loading && fittings.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || dirty.size === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Save size={16} />
                        {saving ? 'Saving…' : dirty.size > 0 ? `Save ${dirty.size} change${dirty.size === 1 ? '' : 's'}` : 'Saved'}
                    </button>
                    {dirty.size > 0 && <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Unsaved changes</span>}
                </div>
            )}
        </div>
    );
}
