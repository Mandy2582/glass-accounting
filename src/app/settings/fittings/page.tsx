'use client';

import { useState, useEffect, useMemo } from 'react';
import { Save, Wrench, AlertCircle, CheckCircle, Layers, RefreshCw } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem, FittingRole } from '@/types';
import { getCutoutSpecsForItem } from '@/lib/fabricationSpecs';

// The glass prep each hardware fitting needs, edited here once so the Glass
// Systems Designer can draw the right holes/cut-outs and add the right
// priced line whenever that fitting is used.
const ROLE_OPTIONS: { value: FittingRole; label: string }[] = [
    { value: 'top_patch', label: 'Top patch fitting' },
    { value: 'bottom_patch', label: 'Bottom patch fitting' },
    { value: 'overpanel_patch', label: 'TM-30 overpanel patch' },
    { value: 'floor_spring', label: 'Floor spring' },
    { value: 'wall_hinge', label: 'Wall-to-glass hinge' },
    { value: 'glass_hinge', label: 'Glass-to-glass hinge' },
    { value: 'door_lock', label: 'Door lock' },
    { value: 'sliding_lock', label: 'Sliding lock' },
    { value: 'l_connector', label: 'L Connector (fixed-panel fixing)' },
    { value: 'glass_to_glass_connector', label: 'Glass-to-glass connector (fixed panels)' },
    { value: 'l_bracket_small', label: 'L bracket -- Small (light duty)' },
    { value: 'l_bracket_big', label: 'L bracket -- Big (heavy duty)' },
    { value: 'base_channel', label: 'Base channel (continuous run)' },
    { value: 'connector', label: 'Connector (spider / patch)' },
    { value: 'clamp', label: 'Clamp' },
    { value: 'spigot', label: 'Spigot' },
    { value: 'handle', label: 'Handle' },
    { value: 'sliding_kit', label: 'Sliding kit' },
    { value: 'other', label: 'Other (no auto-placement)' },
];

const BRAND_TABS = [
    { id: 'All', label: '🌟 All Fittings' },
    { id: 'DORMA', label: '🇩🇪 DORMA' },
    { id: 'Ozone', label: '🇮🇳 Ozone' },
    { id: 'Icon', label: '🏗️ Icon' },
    { id: 'Hafele', label: '✨ Häfele' },
    { id: 'Hardwyn', label: '🔧 Hardwyn' },
    { id: 'Enox', label: '🔒 Enox' },
    { id: 'CRL', label: '🇺🇸 CRL' },
    { id: 'Other', label: '📦 Custom / Other' }
];

export default function FittingsSettingsPage() {
    const [fittings, setFittings] = useState<GlassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedBrand, setSelectedBrand] = useState<string>('All');
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

    const filteredFittings = useMemo(() => {
        if (selectedBrand === 'All') return fittings;
        if (selectedBrand === 'Other') {
            const known = ['dorma', 'dormakaba', 'ozone', 'icon', 'hafele', 'häfele', 'hardwyn', 'enox', 'crl'];
            return fittings.filter(f => !f.make || !known.includes(f.make.toLowerCase()));
        }
        return fittings.filter(f => f.make && f.make.toLowerCase().includes(selectedBrand.toLowerCase()));
    }, [fittings, selectedBrand]);

    return (
        <div style={{ maxWidth: '1100px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                        <Wrench size={24} style={{ color: '#3b82f6' }} />
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Architectural Hardware Fittings & Cutout Registry</h1>
                    </div>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.92rem', margin: 0, maxWidth: '75ch' }}>
                        Manage manufacturer hardware catalogs, architectural notch cutouts, drill hole preps, and standard placement roles for DORMA, Ozone, Icon, Häfele, Hardwyn, Enox, and CRL.
                    </p>
                </div>
            </div>

            {message && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.85rem 1.1rem', borderRadius: '10px', marginBottom: '1.25rem',
                    background: message.type === 'success' ? 'rgba(16,185,129,.12)' : 'rgba(220,38,38,.1)',
                    color: message.type === 'success' ? '#047857' : '#b91c1c', fontSize: '0.9rem', fontWeight: 600
                }}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Brand Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                {BRAND_TABS.map(tab => {
                    const count = tab.id === 'All'
                        ? fittings.length
                        : tab.id === 'Other'
                            ? fittings.filter(f => !f.make || !['dorma', 'dormakaba', 'ozone', 'icon', 'hafele', 'häfele', 'hardwyn', 'enox', 'crl'].includes(f.make.toLowerCase())).length
                            : fittings.filter(f => f.make && f.make.toLowerCase().includes(tab.id.toLowerCase())).length;
                    const isActive = selectedBrand === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setSelectedBrand(tab.id)}
                            style={{
                                background: isActive ? '#0f172a' : '#f1f5f9',
                                color: isActive ? '#ffffff' : '#475569',
                                border: 'none',
                                padding: '0.45rem 0.85rem',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {tab.label} <span style={{ opacity: 0.8, fontSize: '0.78rem', marginLeft: '0.25rem', background: isActive ? 'rgba(255,255,255,0.2)' : '#e2e8f0', padding: '0.15rem 0.4rem', borderRadius: '12px' }}>{count}</span>
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#3b82f6' }} />
                    Loading architectural hardware catalogs...
                </div>
            ) : filteredFittings.length === 0 ? (
                <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                    <Layers size={36} style={{ color: '#94a3b8', margin: '0 auto 0.75rem' }} />
                    <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '1rem', fontWeight: 600 }}>
                        No fittings found for brand &quot;{selectedBrand}&quot;. Click &quot;⚡ Sync Brand Catalogs&quot; above to seed standard manufacturer inventory.
                    </p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', borderRadius: '12px' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#334155' }}>
                                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Fitting & Manufacturer Code</th>
                                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>CAD Cutout Specification</th>
                                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800, width: '220px' }}>Architectural Role</th>
                                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800, width: '90px' }}>Holes</th>
                                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800, width: '90px' }}>Cuts</th>
                                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800, width: '110px' }}>Live Rate (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredFittings.map(f => {
                                    const cadSpec = getCutoutSpecsForItem(f);
                                    return (
                                        <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: dirty.has(f.id) ? '#fffbeb' : 'transparent', transition: 'background 0.2s' }}>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{f.name}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '0.4rem', marginTop: '0.15rem' }}>
                                                    {f.make && <span style={{ fontWeight: 700, color: '#2563eb' }}>{f.make}</span>}
                                                    {f.model && <span>• {f.model}</span>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                                                    {cadSpec ? cadSpec.name : 'Standard Generic Prep'}
                                                </div>
                                                {cadSpec && (
                                                    <div style={{ fontSize: '0.74rem', color: cadSpec.notchWidthMm > 0 ? '#b91c1c' : '#047857', fontWeight: 600, marginTop: '0.15rem' }}>
                                                        {cadSpec.notchWidthMm > 0 ? `Notch: ${cadSpec.notchWidthMm}×${cadSpec.notchHeightMm}mm` : 'No notch required'}
                                                        {cadSpec.pivotOffsetMm ? ` • Setback: ${cadSpec.pivotOffsetMm}mm` : ''}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <select
                                                    className="input"
                                                    value={f.fittingRole || ''}
                                                    onChange={e => update(f.id, { fittingRole: (e.target.value || undefined) as FittingRole | undefined })}
                                                    style={{ width: '100%', fontSize: '0.85rem', fontWeight: 600, padding: '0.4rem 0.6rem', borderRadius: '6px' }}
                                                >
                                                    <option value="">— not set —</option>
                                                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                </select>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <input
                                                    className="input" type="number" min={0} max={20} step={1}
                                                    value={f.holesRequired ?? ''}
                                                    onChange={e => update(f.id, { holesRequired: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                    style={{ width: '100%', padding: '0.4rem', textAlign: 'center', fontWeight: 600, borderRadius: '6px' }}
                                                />
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <input
                                                    className="input" type="number" min={0} max={20} step={1}
                                                    value={f.cutsRequired ?? ''}
                                                    onChange={e => update(f.id, { cutsRequired: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                    style={{ width: '100%', padding: '0.4rem', textAlign: 'center', fontWeight: 600, borderRadius: '6px' }}
                                                />
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#059669', textAlign: 'right' }}>
                                                ₹{Number(f.rate || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loading && fittings.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={saving || dirty.size === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', fontWeight: 700, borderRadius: '8px', cursor: dirty.size > 0 ? 'pointer' : 'not-allowed', background: dirty.size > 0 ? '#2563eb' : '#94a3b8' }}
                        >
                            <Save size={18} />
                            {saving ? 'Saving...' : dirty.size > 0 ? `Save ${dirty.size} Pending Change${dirty.size === 1 ? '' : 's'}` : 'All Changes Saved'}
                        </button>
                        {dirty.size > 0 && <span style={{ fontSize: '0.85rem', color: '#d97706', fontWeight: 700 }}>⚠️ You have unsaved fitting configuration changes!</span>}
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                        Showing {filteredFittings.length} of {fittings.length} hardware items
                    </span>
                </div>
            )}
        </div>
    );
}
