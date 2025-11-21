import styles from './Layout.module.css';

export default function Header() {
    return (
        <header className={styles.header}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Glass Wholesale</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem',
                    fontWeight: 600
                }}>
                    A
                </div>
            </div>
        </header>
    );
}
