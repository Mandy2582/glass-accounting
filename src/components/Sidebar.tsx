'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Box, FileText, Users, Settings, Calendar, ShoppingCart, ClipboardList, UserCheck, DollarSign } from 'lucide-react';
import styles from './Layout.module.css';

const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Inventory', href: '/inventory', icon: Box },
    { label: 'Sales', href: '/sales', icon: FileText },
    { label: 'Purchases', href: '/purchases', icon: ShoppingCart },
    { label: 'Orders', href: '/orders', icon: ClipboardList },
    { label: 'Parties', href: '/parties', icon: Users },
    { label: 'Financials', href: '/vouchers', icon: FileText },
    { label: 'Day Book', href: '/daybook', icon: Calendar },
    { label: 'Employees', href: '/employees', icon: Users },
    { label: 'Attendance', href: '/employees/attendance', icon: UserCheck },
    { label: 'Payroll', href: '/employees/payroll', icon: DollarSign },
    { label: 'Reports', href: '/reports', icon: FileText },
    { label: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <div className={styles.logo}>
                    <Box size={24} />
                    <span>GlassBooks</span>
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
            </nav>
        </aside>
    );
}
