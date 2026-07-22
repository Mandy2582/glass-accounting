'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BarChart3,
    Bell,
    BookOpen,
    Box,
    Briefcase,
    Building2,
    Calendar,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Database,
    DollarSign,
    FileText,
    History,
    Landmark,
    LayoutDashboard,
    LogOut,
    Receipt,
    RefreshCw,
    Route,
    Settings,
    ShoppingCart,
    Tags,
    TrendingUp,
    UserCheck,
    Users,
    WalletCards, Bot, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import styles from './Layout.module.css';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { AppRole, UserPermissions, canAccessPath } from '@/lib/roles';

type NavItem = {
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
};

type NavSection = {
    title: string;
    icon: typeof LayoutDashboard;
    items: NavItem[];
};

const sections: NavSection[] = [
    {
        title: 'Home',
        icon: LayoutDashboard,
        items: [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Notifications', href: '/notifications', icon: Bell },
            { label: 'Operations', href: '/operations', icon: Route },
        ],
    },
    {
        title: 'Sales & Orders',
        icon: ClipboardList,
        items: [
            { label: 'Orders', href: '/orders', icon: ClipboardList },
            { label: 'Sales Invoices', href: '/sales', icon: FileText },
            { label: 'Customer Analytics', href: '/parties/analytics', icon: TrendingUp },
        ],
    },
    {
        title: 'Inventory & Purchase',
        icon: Box,
        items: [
            { label: 'Inventory', href: '/inventory', icon: Box },
            { label: 'Purchase Bills', href: '/purchases', icon: ShoppingCart },
        ],
    },
    {
        title: 'People',
        icon: Users,
        items: [
            { label: 'Customers & Suppliers', href: '/parties', icon: Users },
            { label: 'Employees', href: '/employees', icon: UserCheck },
            { label: 'Attendance', href: '/employees/attendance', icon: Calendar },
            { label: 'Payroll', href: '/employees/payroll', icon: WalletCards },
        ],
    },
    {
        title: 'Accounting',
        icon: Landmark,
        items: [
            { label: 'Vouchers', href: '/vouchers', icon: Receipt },
            { label: 'Day Book', href: '/daybook', icon: Calendar },
            { label: 'Cash Book', href: '/financials/cash-book', icon: Receipt },
            { label: 'Bank Book', href: '/financials/bank-book', icon: Briefcase },
            { label: 'Ledgers', href: '/financials/ledgers', icon: BookOpen },
            { label: 'Chart of Accounts', href: '/financials/accounts', icon: BarChart3 },
        ],
    },
    {
        title: 'Reports',
        icon: FileText,
        items: [
            { label: 'Reports Centre', href: '/reports', icon: FileText },
        ],
    },
    {
        title: 'Setup',
        icon: Settings,
        items: [
            { label: 'Tally Integration', href: '/tally-sync', icon: RefreshCw },
            { label: 'Company Details', href: '/settings/company', icon: Building2 },
            { label: 'Pricing', href: '/settings/pricing', icon: DollarSign },
            { label: 'Order Automation', href: '/settings/automation', icon: Bot },
            { label: 'Catalogue Commands (WhatsApp)', href: '/settings/rate-updates', icon: MessageSquare },
            { label: 'Catalogue Command Log', href: '/settings/catalogue-log', icon: History },
            { label: 'Items Configuration', href: '/settings/items', icon: Tags },
            { label: 'Users & Roles', href: '/settings/users', icon: Users },
            { label: 'Terms & Conditions', href: '/settings/terms', icon: FileText },
            { label: 'Data & Backup', href: '/settings/data', icon: Database },
        ],
    },
];

interface SidebarProps {
    isCollapsed: boolean;
    toggleSidebar: () => void;
    role: AppRole;
    permissions: UserPermissions;
}

export default function Sidebar({ isCollapsed, toggleSidebar, role, permissions }: SidebarProps) {
    const pathname = usePathname();
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        sections.forEach(section => {
            initial[section.title] = section.items.some(item => isPathActive(pathname, item.href));
        });
        initial.Home = true;
        return initial;
    });

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const handleNavigation = () => {
        if (!isCollapsed) toggleSidebar();
    };

    const toggleSection = (title: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [title]: !prev[title],
        }));
    };

    const visibleSections = sections
        .map(section => ({
            ...section,
            items: section.items.filter(item => canAccessPath(role, permissions, item.href)),
        }))
        .filter(section => section.items.length > 0);

    return (
        <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}>
            <div className={styles.sidebarHeader}>
                <div className={styles.logo}>
                    <Link href="/dashboard" className={styles.sidebarBrand} onClick={handleNavigation}>
                        <span className={styles.sidebarBrandMark}>
                            <Image
                                src="/logo.svg"
                                alt="Arjun Glass House Logo"
                                width={34}
                                height={34}
                                unoptimized
                            />
                        </span>
                        <span className={styles.sidebarBrandText}>
                            <strong>Arjun Glass House</strong>
                        </span>
                    </Link>
                    <button
                        onClick={toggleSidebar}
                        className={styles.sidebarCollapseButton}
                        title="Collapse Sidebar"
                    >
                        <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                </div>
            </div>

            <nav className={styles.nav}>
                {visibleSections.map(section => {
                    const SectionIcon = section.icon;
                    const isExpanded = expandedSections[section.title];
                    const isSectionActive = section.items.some(item => isPathActive(pathname, item.href));

                    return (
                        <div key={section.title} className={styles.navSection}>
                            <button
                                type="button"
                                onClick={() => toggleSection(section.title)}
                                className={`${styles.navSectionHeader} ${isSectionActive ? styles.navSectionHeaderActive : ''}`}
                            >
                                <span className={styles.navSectionTitle}>
                                    <SectionIcon size={17} />
                                    <span>{section.title}</span>
                                </span>
                                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>

                            {isExpanded && (
                                <div className={styles.navSectionItems}>
                                    {section.items.map(item => {
                                        const Icon = item.icon;
                                        const isActive = isPathActive(pathname, item.href);
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={handleNavigation}
                                                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                                            >
                                                <Icon size={18} />
                                                <span>{item.label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className={styles.sidebarFooter}>
                <button
                    onClick={handleLogout}
                    className={`${styles.navItem} ${styles.logoutButton}`}
                >
                    <LogOut size={20} />
                    <span>Log Out</span>
                </button>
            </div>
        </aside>
    );
}

function isPathActive(pathname: string, href: string) {
    if (href === '/') return pathname === '/' || pathname === '/dashboard';
    if (href === '/parties' || href === '/financials') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
}
