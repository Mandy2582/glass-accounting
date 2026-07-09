export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>Settings</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>Manage your business configuration, pricing, catalogue defaults, users, and data</p>
            </div>

            {children}
        </div>
    );
}
