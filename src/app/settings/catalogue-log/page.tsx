'use client';

import { useEffect, useState } from 'react';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { db } from '@/lib/storage';

type LogEntry = Awaited<ReturnType<typeof db.catalogueLog.getAll>>[number];

const TYPE_LABELS: Record<LogEntry['commandType'], string> = {
    rate: 'Rate',
    stock: 'Stock',
    purchase: 'Purchase',
};

const TYPE_COLORS: Record<LogEntry['commandType'], string> = {
    rate: '#2563eb',
    stock: '#7c3aed',
    purchase: '#059669',
};

export default function CatalogueLogPage() {
    const [entries, setEntries] = useState<LogEntry[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    const load = () => {
        db.catalogueLog.getAll().then(setEntries).catch(() => setEntries([]));
    };

    useEffect(() => {
        load();
    }, []);

    const revert = async (entry: LogEntry) => {
        if (!confirm(`Revert this entry?\n\n${entry.summary}\n\nThis restores the previous state.`)) return;
        setBusyId(entry.id);
        setMessage(null);
        try {
            await db.catalogueLog.revert(entry.id);
            setMessage({ kind: 'ok', text: 'Entry reverted.' });
            load();
        } catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to revert.' });
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (entry: LogEntry) => {
        if (!confirm(`Delete this log entry?\n\n${entry.summary}\n\nThis only removes the record -- it does not undo the change.`)) return;
        setBusyId(entry.id);
        setMessage(null);
        try {
            await db.catalogueLog.remove(entry.id);
            setMessage({ kind: 'ok', text: 'Log entry deleted.' });
            load();
        } catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to delete.' });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <History size={20} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Catalogue Command Log</h2>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Every RATE, STOCK, and PURCHASE command applied via WhatsApp is recorded here. Revert restores the
                previous state (for a purchase, this deletes the recorded invoice and reverses its stock/cost effects).
                Delete only removes the log entry -- it does not undo anything.
            </p>

            {message && (
                <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: message.kind === 'ok' ? '#059669' : '#dc2626' }}>
                    {message.text}
                </div>
            )}

            {entries === null ? (
                <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : entries.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)' }}>No commands recorded yet.</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                <th style={{ padding: '0.6rem 0.5rem' }}>When</th>
                                <th style={{ padding: '0.6rem 0.5rem' }}>Type</th>
                                <th style={{ padding: '0.6rem 0.5rem' }}>From</th>
                                <th style={{ padding: '0.6rem 0.5rem' }}>Summary</th>
                                <th style={{ padding: '0.6rem 0.5rem' }}>Status</th>
                                <th style={{ padding: '0.6rem 0.5rem' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
                                        {new Date(entry.createdAt).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>
                                        <span style={{
                                            display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                                            fontSize: '0.75rem', fontWeight: 600, color: 'white', background: TYPE_COLORS[entry.commandType],
                                        }}>
                                            {TYPE_LABELS[entry.commandType]}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>{entry.fromPhone}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>{entry.summary}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>
                                        {entry.reverted ? (
                                            <span style={{ color: '#dc2626', fontWeight: 500 }}>Reverted</span>
                                        ) : (
                                            <span style={{ color: '#059669', fontWeight: 500 }}>Applied</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {!entry.reverted && (
                                                <button
                                                    onClick={() => revert(entry)}
                                                    disabled={busyId === entry.id}
                                                    title="Revert"
                                                    style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#2563eb' }}
                                                >
                                                    <RotateCcw size={14} /> Revert
                                                </button>
                                            )}
                                            <button
                                                onClick={() => remove(entry)}
                                                disabled={busyId === entry.id}
                                                title="Delete log entry"
                                                style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#dc2626' }}
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
