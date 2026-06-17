'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/storage';
import { tallyApi } from '@/lib/tally';
import { BusinessConfig } from '@/types';
import { getAuthHeaders } from '@/lib/auth';
import { 
    RefreshCw, 
    Save, 
    CheckCircle, 
    AlertCircle, 
    FileText, 
    Server, 
    Settings, 
    Clock, 
    Terminal,
    Trash2,
    Upload,
    Download,
    FolderOpen,
    Info
} from 'lucide-react';

export default function TallySyncPage() {
    const [config, setConfig] = useState<BusinessConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'online' | 'offline'>('idle');
    const [syncing, setSyncing] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Manual import state
    const [importType, setImportType] = useState<'auto' | 'ledgers' | 'items' | 'vouchers'>('auto');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [importLogs, setImportLogs] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const currentConfig = await db.businessConfig.get();
            setConfig(currentConfig);
            if (currentConfig.tallySyncLogs) {
                setLogs(currentConfig.tallySyncLogs);
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        if (!config) return;
        setSaveStatus(null);
        try {
            await db.businessConfig.update(config);
            setSaveStatus({ type: 'success', message: 'Tally configuration saved successfully!' });
            setTimeout(() => setSaveStatus(null), 3000);
        } catch (error: any) {
            setSaveStatus({ type: 'error', message: `Failed to save configuration: ${error.message}` });
        }
    };

    const testTallyConnection = async () => {
        if (!config?.tallyServerIp || !config?.tallyServerPort) {
            setConnectionStatus('offline');
            return;
        }
        setTestingConnection(true);
        setConnectionStatus('idle');
        try {
            // Simple ping XML request to fetch Tally version
            const pingXml = `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Version</REPORTNAME>
            </REQUESTDESC>
            <REQUESTDATA/>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>
            `.trim();
            const res = await tallyApi.sendRequest(config.tallyServerIp, config.tallyServerPort, pingXml);
            if (res && res.includes('ENVELOPE')) {
                setConnectionStatus('online');
            } else {
                setConnectionStatus('offline');
            }
        } catch (error) {
            console.error('Connection test failed:', error);
            setConnectionStatus('offline');
        } finally {
            setTestingConnection(false);
        }
    };

    const runManualSync = async () => {
        if (!config?.tallyServerIp || !config?.tallyServerPort || !config?.tallyCompanyName) {
            setLogs(prev => [...prev, '❌ Sync failed: IP, Port, or Company Name not configured.']);
            return;
        }

        setSyncing(true);
        setLogs(prev => [...prev, `🔄 Manual sync triggered...`]);

        try {
            const result = await tallyApi.syncFromTally(
                config.tallyServerIp,
                config.tallyServerPort,
                config.tallyCompanyName
            );

            // Update configuration state and database with logs and sync time
            const nowStr = new Date().toISOString();
            const updatedConfig = {
                ...config,
                tallyLastSyncTime: nowStr,
                tallySyncLogs: result.logs
            };
            setConfig(updatedConfig);
            await db.businessConfig.update(updatedConfig);

            setLogs(result.logs);
        } catch (error: any) {
            setLogs(prev => [...prev, `❌ Sync failed: ${error.message}`]);
        } finally {
            setSyncing(false);
        }
    };

    const clearLogs = async () => {
        if (!config) return;
        try {
            const updatedConfig = {
                ...config,
                tallySyncLogs: []
            };
            setConfig(updatedConfig);
            await db.businessConfig.update(updatedConfig);
            setLogs([]);
        } catch (error) {
            console.error('Failed to clear logs:', error);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--color-primary)' }}>
                <RefreshCw className="animate-spin" size={48} />
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, background: 'linear-gradient(to right, #2563eb, #db2777)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Tally Autonomous Sync Panel
                    </h1>
                    <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0' }}>
                        Configure real-time, hands-free integration with your local Tally Prime software.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                        className={`btn ${testingConnection ? 'disabled' : ''}`}
                        onClick={testTallyConnection}
                        disabled={testingConnection}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--color-border)' }}
                    >
                        <Server size={16} />
                        {testingConnection ? 'Pinging Tally...' : 'Test Connection'}
                    </button>
                    <button 
                        className={`btn btn-primary ${syncing ? 'disabled' : ''}`}
                        onClick={runManualSync}
                        disabled={syncing}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RefreshCw className={syncing ? 'animate-spin' : ''} size={16} />
                        {syncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                </div>
            </div>

            {/* Connection Banner */}
            {connectionStatus !== 'idle' && (
                <div style={{
                    padding: '1rem 1.5rem',
                    borderRadius: '12px',
                    marginBottom: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    backgroundColor: connectionStatus === 'online' ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${connectionStatus === 'online' ? '#bbf7d0' : '#fecaca'}`,
                    color: connectionStatus === 'online' ? '#15803d' : '#b91c1c'
                }}>
                    {connectionStatus === 'online' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <div>
                        <strong style={{ display: 'block' }}>
                            {connectionStatus === 'online' ? 'Tally Connected!' : 'Tally Connection Failed'}
                        </strong>
                        <span style={{ fontSize: '0.875rem' }}>
                            {connectionStatus === 'online' 
                                ? `Successfully established link to Tally Prime Server at ${config?.tallyServerIp}:${config?.tallyServerPort}.` 
                                : `Could not reach Tally Prime server. Make sure Tally is open and running ODBC/XML server on port ${config?.tallyServerPort}.`}
                        </span>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Configuration Panel */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                        <Settings size={20} style={{ color: 'var(--color-primary)' }} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Sync Configurations</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                        <div>
                            <label className="label">Tally IP Address</label>
                            <input 
                                type="text"
                                className="input"
                                value={config?.tallyServerIp || ''}
                                onChange={(e) => setConfig(prev => prev ? { ...prev, tallyServerIp: e.target.value } : null)}
                                placeholder="e.g. 192.168.1.100"
                            />
                        </div>
                        <div>
                            <label className="label">Tally XML Port</label>
                            <input 
                                type="text"
                                className="input"
                                value={config?.tallyServerPort || ''}
                                onChange={(e) => setConfig(prev => prev ? { ...prev, tallyServerPort: e.target.value } : null)}
                                placeholder="9000"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Exact Tally Company Name</label>
                        <input 
                            type="text"
                            className="input"
                            value={config?.tallyCompanyName || ''}
                            onChange={(e) => setConfig(prev => prev ? { ...prev, tallyCompanyName: e.target.value } : null)}
                            placeholder="e.g. Arjun Glass House"
                        />
                    </div>

                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', marginTop: '1rem' }}>
                            <div>
                                <strong style={{ display: 'block', fontSize: '0.95rem' }}>Enable Background Auto-Sync</strong>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Autonomously sync stock and ledgers in the background.</span>
                            </div>
                            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                                <input 
                                    type="checkbox"
                                    checked={config?.tallyAutoSyncEnabled || false}
                                    onChange={(e) => setConfig(prev => prev ? { ...prev, tallyAutoSyncEnabled: e.target.checked } : null)}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span className="slider round" style={{
                                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                    backgroundColor: config?.tallyAutoSyncEnabled ? '#3b82f6' : '#ccc',
                                    transition: '0.4s', borderRadius: '24px'
                                }}>
                                    <span style={{
                                        position: 'absolute', content: '""', height: '18px', width: '18px', left: '3px', bottom: '3px',
                                        backgroundColor: 'white', transition: '0.4s', borderRadius: '50%',
                                        transform: config?.tallyAutoSyncEnabled ? 'translateX(24px)' : 'none'
                                    }}/>
                                </span>
                            </label>
                        </div>

                        {config?.tallyAutoSyncEnabled && (
                            <div style={{ marginTop: '1rem' }}>
                                <label className="label">Sync Interval (Minutes)</label>
                                <select 
                                    className="input"
                                    value={config?.tallySyncInterval || 60}
                                    onChange={(e) => setConfig(prev => prev ? { ...prev, tallySyncInterval: parseInt(e.target.value) } : null)}
                                >
                                    <option value={15}>Every 15 Minutes</option>
                                    <option value={30}>Every 30 Minutes</option>
                                    <option value={60}>Every 1 Hour (Recommended)</option>
                                    <option value={360}>Every 6 Hours</option>
                                    <option value={1440}>Every 24 Hours</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {saveStatus && (
                        <div style={{
                            padding: '0.75rem',
                            borderRadius: '8px',
                            backgroundColor: saveStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                            color: saveStatus.type === 'success' ? '#15803d' : '#b91c1c',
                            fontSize: '0.875rem'
                        }}>
                            {saveStatus.message}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                        <button 
                            className="btn btn-primary"
                            onClick={handleSaveConfig}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Save size={16} />
                            Save Config
                        </button>
                    </div>
                </div>

                {/* Logs / Console Panel */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--color-border)', backgroundColor: '#0f172a', color: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Terminal size={20} style={{ color: '#38bdf8' }} />
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#f8fafc' }}>Execution logs</h2>
                        </div>
                        {logs.length > 0 && (
                            <button 
                                onClick={clearLogs}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                                <Trash2 size={16} />
                                <span style={{ fontSize: '0.8rem' }}>Clear</span>
                            </button>
                        )}
                    </div>

                    <div style={{
                        flex: 1,
                        backgroundColor: '#020617',
                        padding: '1rem',
                        borderRadius: '8px',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        overflowY: 'auto',
                        minHeight: '280px',
                        maxHeight: '350px',
                        border: '1px solid #1e293b'
                    }}>
                        {logs.length === 0 ? (
                            <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: '6rem' }}>
                                No integration logs available. Run a sync or test connection to see results here.
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div key={index} style={{ 
                                    marginBottom: '0.5rem', 
                                    color: log.includes('❌') ? '#f87171' : log.includes('✅') ? '#4ade80' : '#e2e8f0',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {log}
                                </div>
                            ))
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={14} />
                            <span>Last sync: {config?.tallyLastSyncTime ? new Date(config.tallyLastSyncTime).toLocaleString() : 'Never'}</span>
                        </div>
                        {config?.tallyAutoSyncEnabled && (
                            <span style={{ color: '#38bdf8' }}>● Background Sync Active</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Manual Import Section ── */}
            <div style={{ marginTop: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <Upload size={24} style={{ color: 'var(--color-primary)' }} />
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Manual Import from Tally</h2>
                        <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                            Export XML from Tally Prime and import directly — no network access needed.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

                    {/* Left: How to Export Guide */}
                    <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                            <Info size={18} style={{ color: '#2563eb' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>How to Export from Tally Prime</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {[
                                { step: 1, title: 'Export Masters (Ledgers & Stock)', desc: 'Gateway of Tally → Alt+E (Export) → Masters → Configure → File Format: XML → Press Export. This exports all your parties and stock items at once!', color: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
                                { step: 2, title: 'Export Transactions (Invoices/Vouchers)', desc: 'Gateway of Tally → Alt+E (Export) → Transactions → Configure → File Format: XML → Press Export. This exports all sales, receipts, and payments!', color: '#fef9c3', border: '#fde047', text: '#854d0e' },
                                { step: 3, title: 'Export Custom Reports (Optional)', desc: 'For individual reports, go to Day Book or Stock Summary → Press E (Export) → Current → File Format: XML → Export.', color: '#dcfce7', border: '#86efac', text: '#15803d' },
                                { step: 4, title: 'Upload & Import Here', desc: 'Choose the exported XML file below, select "Auto-Detect All" (or limit to a specific type), and click "Import".', color: '#f3e8ff', border: '#c084fc', text: '#7e22ce' },
                            ].map(({ step, title, desc, color, border, text }) => (
                                <div key={step} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.75rem', borderRadius: '10px', background: color, border: `1px solid ${border}` }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: text, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>{step}</div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: text, marginBottom: '0.25rem' }}>{title}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.5 }}>{desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid var(--color-border)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            💡 <strong>Tip:</strong> The XML importer will automatically parse whatever is inside the file. Standard exports (Alt+E) are recommended for complete ledger and voucher sync.
                        </div>
                    </div>

                    {/* Right: Upload & Import */}
                    <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                            <FolderOpen size={18} style={{ color: 'var(--color-primary)' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Upload Tally XML File</h3>
                        </div>

                        {/* Import Type Selector */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Import Type</label>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {([['auto', 'Auto-Detect All'], ['ledgers', 'Ledgers Only'], ['items', 'Stock Items Only'], ['vouchers', 'Vouchers Only']] as const).map(([val, label]) => (
                                    <button
                                        key={val}
                                        onClick={() => setImportType(val)}
                                        style={{
                                            padding: '0.375rem 0.75rem',
                                            borderRadius: '999px',
                                            fontSize: '0.8rem',
                                            fontWeight: 500,
                                            border: `1.5px solid ${importType === val ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                            background: importType === val ? 'var(--color-primary)' : 'transparent',
                                            color: importType === val ? 'white' : 'var(--color-text)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >{label}</button>
                                ))}
                            </div>
                        </div>

                        {/* Drop Zone */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                const f = e.dataTransfer.files[0];
                                if (f) setImportFile(f);
                            }}
                            style={{
                                border: `2px dashed ${isDragging ? 'var(--color-primary)' : importFile ? '#22c55e' : 'var(--color-border)'}`,
                                borderRadius: '12px',
                                padding: '2rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: isDragging ? 'rgba(99,102,241,0.05)' : importFile ? '#f0fdf4' : 'transparent',
                                transition: 'all 0.2s'
                            }}
                        >
                            {importFile ? (
                                <>
                                    <CheckCircle size={32} style={{ color: '#22c55e', marginBottom: '0.5rem' }} />
                                    <div style={{ fontWeight: 600, color: '#15803d' }}>{importFile.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>{(importFile.size / 1024).toFixed(1)} KB — Click to change</div>
                                </>
                            ) : (
                                <>
                                    <Upload size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
                                    <div style={{ fontWeight: 600 }}>Drop XML file here</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>or click to browse</div>
                                </>
                            )}
                            <input ref={fileInputRef} type="file" accept=".xml" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) setImportFile(e.target.files[0]); }} />
                        </div>

                        {/* Import Button */}
                        <button
                            className="btn btn-primary"
                            disabled={!importFile || importing}
                            onClick={async () => {
                                if (!importFile) return;
                                setImporting(true);
                                setImportLogs(['🔄 Starting import...']);
                                try {
                                    const fd = new FormData();
                                    fd.append('file', importFile);
                                    fd.append('type', importType);
                                    const authHeaders = await getAuthHeaders();
                                    const res = await fetch('/api/tally/import', { method: 'POST', headers: authHeaders, body: fd });
                                    const data = await res.json();
                                    if (data.success) {
                                        setImportLogs(data.logs || ['✅ Import completed!']);
                                    } else {
                                        setImportLogs([`❌ Import failed: ${data.error}`]);
                                    }
                                } catch (err: any) {
                                    setImportLogs([`❌ Error: ${err.message}`]);
                                } finally {
                                    setImporting(false);
                                }
                            }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem' }}
                        >
                            <Download size={18} />
                            {importing ? 'Importing...' : 'Import from Tally XML'}
                        </button>

                        {/* Import Logs */}
                        {importLogs.length > 0 && (
                            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', maxHeight: '180px', overflowY: 'auto' }}>
                                {importLogs.map((log, i) => (
                                    <div key={i} style={{ color: log.includes('❌') ? '#f87171' : log.includes('✅') || log.includes('🎉') ? '#4ade80' : '#e2e8f0', marginBottom: '0.25rem' }}>
                                        {log}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
