'use client';

import MigrationTool from '@/components/MigrationTool';

export default function SettingsPage() {
    return (
        <div className="container">
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Settings</h1>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>General Settings</h2>
                <p style={{ color: 'var(--color-text-muted)' }}>App Version: 1.0.0 (Cloud)</p>
            </div>

            <MigrationTool />
        </div>
    );
}
