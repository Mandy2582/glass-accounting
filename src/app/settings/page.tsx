'use client';

import { useState } from 'react';
import { Download, Database, AlertCircle } from 'lucide-react';
import { db } from '@/lib/storage';
import MigrationTool from '@/components/MigrationTool';

export default function SettingsPage() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleBackupData = async () => {
        try {
            setLoading(true);
            setMessage(null);

            // Fetch all data from all tables
            const [items, parties, invoices, orders, vouchers, employees, bankAccounts] = await Promise.all([
                db.items.getAll(),
                db.parties.getAll(),
                db.invoices.getAll(),
                db.orders.getAll(),
                db.vouchers.getAll(),
                db.employees.getAll(),
                db.bankAccounts.getAll()
            ]);

            const backupData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                data: {
                    items,
                    parties,
                    invoices,
                    orders,
                    vouchers,
                    employees,
                    bankAccounts
                }
            };

            // Create and download JSON file
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `arjun-glass-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setMessage({ type: 'success', text: 'Backup downloaded successfully!' });
        } catch (error) {
            console.error('Backup error:', error);
            setMessage({ type: 'error', text: 'Failed to create backup. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>Settings</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>Manage your application settings and data</p>
            </div>

            {/* Backup & Restore Section */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Database size={24} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Data Backup</h2>
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

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Backup Your Data</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                            Download a complete backup of all your data including items, parties, invoices, orders, vouchers, employees, and bank accounts.
                        </p>
                        <button
                            onClick={handleBackupData}
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Download size={18} />
                            {loading ? 'Creating Backup...' : 'Download Backup'}
                        </button>
                    </div>

                    <div style={{ padding: '1rem', background: '#fffbeb', border: '1px solid #fde047', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <AlertCircle size={20} style={{ color: '#ca8a04', flexShrink: 0, marginTop: '0.125rem' }} />
                            <div>
                                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#854d0e', marginBottom: '0.25rem' }}>Important Notes</h4>
                                <ul style={{ fontSize: '0.875rem', color: '#713f12', paddingLeft: '1.25rem', margin: 0 }}>
                                    <li>Backups are saved as JSON files on your computer</li>
                                    <li>Store backups in a safe location</li>
                                    <li>Regular backups are recommended (weekly or monthly)</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* General Settings */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>General Settings</h2>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <p style={{ color: 'var(--color-text-muted)' }}>App Version: 1.0.0 (Cloud)</p>
                </div>
            </div>

            {/* Migration Tool */}
            <MigrationTool />
        </div>
    );
}
