'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Box, FileText, Users, Settings, Calendar, ShoppingCart, ClipboardList, UserCheck, DollarSign, LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import styles from './Layout.module.css';

const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Inventory', href: '/inventory', icon: Box },
    { label: 'Sales', href: '/sales', icon: FileText },
    { label: 'Purchases', href: '/purchases', icon: ShoppingCart },
    { label: 'Orders', href: '/orders', icon: ClipboardList },
    { label: 'Parties', href: '/parties', icon: Users },
    { label: 'Financials', href: '/financials', icon: FileText },
    { label: 'Day Book', href: '/daybook', icon: Calendar },
    { label: 'Reports', href: '/reports', icon: FileText },
    { label: 'Settings', href: '/settings', icon: Settings },
];

const employeeItems = [
    { label: 'Employees', href: '/employees', icon: Users },
    { label: 'Attendance', href: '/employees/attendance', icon: UserCheck },
    { label: 'Payroll', href: '/employees/payroll', icon: DollarSign },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [employeesExpanded, setEmployeesExpanded] = useState(
        pathname.startsWith('/employees')
    );

    const handleLogout = () => {
        console.log('Logging out...');
        window.location.href = '/login';
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <div className={styles.logo} style={{ gap: '0.75rem' }}>
                    <div style={{
                        padding: '6px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <img
                            src="/logo.png"
                            alt="Arjun Glass House Logo"
                            style={{ width: '32px', height: '32px' }}
                        />
                    </div>
                    <span style={{
                        fontFamily: 'var(--font-cinzel)',
                        fontSize: '1.1rem',
                        letterSpacing: '0.5px',
                        background: 'linear-gradient(to right, #4158D0, #C850C0)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontWeight: 700
                    }}>
                        ARJUN GLASS HOUSE
                    </span>
                </div>
            </div>
            <nav className={styles.nav}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                        >
                            <Icon size={20} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}

                {/* Employees Section with Submenu */}
                <div>
                    <button
                        onClick={() => setEmployeesExpanded(!employeesExpanded)}
                        className={`${styles.navItem} ${pathname.startsWith('/employees') ? styles.navItemActive : ''}`}
                        style={{
                            width: '100%',
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: 'inherit',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Users size={20} />
                            <span>Employees</span>
                        </div>
                        {employeesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {employeesExpanded && (
                        <div style={{ paddingLeft: '2.5rem' }}>
                            {employeeItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                                        style={{ fontSize: '0.875rem' }}
                                    >
                                        <Icon size={18} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </nav>
            <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)' }}>
                <button
                    onClick={handleLogout}
                    className={styles.navItem}
                    style={{
                        color: '#ef4444',
                        cursor: 'pointer',
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        fontSize: 'inherit',
                        fontFamily: 'inherit'
                    }}
                >
                    <LogOut size={20} />
                    <span>Log Out</span>
                </button>
            </div>
        </aside>
    );
}
