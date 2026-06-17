import { Menu, Bell, AlertCircle, AlertTriangle, Lightbulb, Package } from 'lucide-react';
import styles from './Layout.module.css';
import { useState } from 'react';
import { useNotifications } from '@/components/NotificationContext';
import Link from 'next/link';
import { AppRole, ROLE_LABELS } from '@/lib/roles';
import Image from 'next/image';

interface HeaderProps {
    toggleSidebar: () => void;
    isSidebarCollapsed: boolean;
    role: AppRole;
}

export default function Header({ toggleSidebar, isSidebarCollapsed, role }: HeaderProps) {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const [showPanel, setShowPanel] = useState(false);

    const activeNotifications = notifications.slice(0, 5);

    const getIcon = (type: string, severity: string) => {
        const style = { marginRight: '0.5rem', flexShrink: 0 };
        if (type === 'low_stock') return <Package size={16} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#eab308' }} />;
        if (type === 'overdue_payment') return <AlertCircle size={16} style={{ ...style, color: severity === 'error' ? '#ef4444' : '#eab308' }} />;
        if (type === 'pending_order') return <AlertTriangle size={16} style={{ ...style, color: '#eab308' }} />;
        return <Lightbulb size={16} style={{ ...style, color: '#3b82f6' }} />;
    };

    return (
        <header className={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                    onClick={toggleSidebar}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        color: 'var(--color-text-main)',
                        transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(14,165,233,0.12)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title={isSidebarCollapsed ? "Expand Navigation Menu" : "Collapse Navigation Menu"}
                >
                    <Menu size={20} />
                </button>
                {isSidebarCollapsed && (
                    <Link href="/dashboard" className={styles.headerBrand} title="Go to dashboard">
                        <span className={styles.headerBrandMark}>
                            <Image
                                src="/logo.svg"
                                alt="Arjun Glass House"
                                width={28}
                                height={28}
                                unoptimized
                            />
                        </span>
                        <span className={styles.headerBrandText}>
                            <strong>Arjun Glass House</strong>
                        </span>
                    </Link>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.3rem 0.65rem',
                    borderRadius: '999px',
                    border: role === 'admin' ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid rgba(34, 197, 94, 0.35)',
                    background: role === 'admin' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(20, 184, 166, 0.12)',
                    color: role === 'admin' ? '#0369a1' : '#0f766e',
                    fontSize: '0.75rem',
                    fontWeight: 700
                }}>
                    {ROLE_LABELS[role]}
                </span>

                {/* Notification Bell */}
                <button
                    onClick={() => setShowPanel(!showPanel)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        color: 'var(--color-text-main)',
                        position: 'relative',
                        transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(14,165,233,0.12)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Notifications"
                >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: '#ef4444',
                            color: 'white',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '2px 5px',
                            borderRadius: '999px',
                            lineHeight: 1,
                            minWidth: '16px',
                            textAlign: 'center'
                        }}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>

                {/* Notifications Flyout Panel */}
                {showPanel && (
                    <div style={{
                        position: 'absolute',
                        top: '45px',
                        right: '0',
                        width: '340px',
                        background: 'var(--color-surface)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '12px',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 1000,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{
                            padding: '0.75rem 1rem',
                            borderBottom: '1px solid var(--color-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'rgba(0,0,0,0.02)'
                        }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Notifications</span>
                            {unreadCount > 0 && (
                                <button 
                                    onClick={markAllAsRead}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-primary)',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Mark all as read
                                </button>
                            )}
                        </div>

                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {activeNotifications.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                                    All clear! No pending notifications.
                                </div>
                            ) : (
                                activeNotifications.map((n) => (
                                    <div 
                                        key={n.id}
                                        onClick={() => {
                                            markAsRead(n.id);
                                            setShowPanel(false);
                                            if (n.link) {
                                                window.location.href = n.link;
                                            }
                                        }}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderBottom: '1px solid var(--color-border)',
                                            cursor: 'pointer',
                                            background: n.read ? 'transparent' : 'rgba(99, 102, 241, 0.04)',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(99,102,241,0.08)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = n.read ? 'transparent' : 'rgba(99, 102, 241, 0.04)'}
                                    >
                                        {getIcon(n.type, n.severity)}
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                            <span style={{ 
                                                fontSize: '0.8rem', 
                                                fontWeight: n.read ? 600 : 700,
                                                color: 'var(--color-text-main)' 
                                            }}>
                                                {n.title}
                                            </span>
                                            <p style={{ 
                                                fontSize: '0.75rem', 
                                                color: 'var(--color-text-muted)', 
                                                margin: 0,
                                                lineHeight: 1.3
                                            }}>
                                                {n.message}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <Link 
                            href="/notifications" 
                            onClick={() => setShowPanel(false)}
                            style={{
                                padding: '0.75rem',
                                textAlign: 'center',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: 'var(--color-primary)',
                                background: 'rgba(0,0,0,0.02)',
                                borderTop: '1px solid var(--color-border)',
                                textDecoration: 'none'
                            }}
                        >
                            View All Notifications
                        </Link>
                    </div>
                )}

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
