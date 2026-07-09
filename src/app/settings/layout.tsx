'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, DollarSign, Tags, Users, FileText, Database } from 'lucide-react';

const TABS = [
    { label: 'Company Details', href: '/settings/company', icon: Building2 },
    { label: 'Pricing', href: '/settings/pricing', icon: DollarSign },
    { label: 'Items Configuration', href: '/settings/items', icon: Tags },
    { label: 'Users & Roles', href: '/settings/users', icon: Users },
    { label: 'Terms & Conditions', href: '/settings/terms', icon: FileText },
    { label: 'Data & Backup', href: '/settings/data', icon: Database },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>Settings</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>Manage your business configuration, pricing, catalogue defaults, users, and data</p>
            </div>

            <div style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginBottom: '1.5rem',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '0.75rem',
            }}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 0.9rem',
                                borderRadius: '999px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                                background: isActive ? 'var(--color-primary)' : 'var(--color-bg)',
                                color: isActive ? 'white' : 'var(--color-text-main)',
                                border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                transition: 'all 0.15s',
                            }}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </Link>
                    );
                })}
            </div>

            {children}
        </div>
    );
}
