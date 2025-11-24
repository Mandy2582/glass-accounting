import styles from './Layout.module.css';

export default function Header() {
    return (
        <header className={styles.header}>
            <h1 style={{
                fontFamily: 'var(--font-cinzel)',
                fontSize: '1.5rem',
                fontWeight: 700,
                letterSpacing: '0.5px',
                background: 'linear-gradient(to right, #4158D0, #C850C0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
            }}>
                ARJUN GLASS HOUSE
            </h1>
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
