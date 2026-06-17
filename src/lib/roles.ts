import type { User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'normal';

export const ROLE_LABELS: Record<AppRole, string> = {
    admin: 'Admin',
    normal: 'Normal User'
};

const adminOnlyPathPrefixes = [
    '/purchases',
    '/financials',
    '/vouchers',
    '/daybook',
    '/reports',
    '/employees',
    '/tally-sync',
    '/settings',
    '/test-design'
];

const adminOnlyExactPaths = [
    '/parties/analytics'
];

const getConfiguredAdminEmails = () => (
    process.env.NEXT_PUBLIC_ADMIN_EMAILS || ''
)
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

export function getUserRole(user: User | null): AppRole {
    if (!user) return 'normal';

    const metadataRole = String(
        user.app_metadata?.role ||
        user.user_metadata?.role ||
        ''
    ).toLowerCase();

    if (metadataRole === 'admin') return 'admin';

    const email = user.email?.toLowerCase();
    if (email && getConfiguredAdminEmails().includes(email)) {
        return 'admin';
    }

    return 'normal';
}

export function canAccessPath(role: AppRole, pathname: string): boolean {
    if (role === 'admin') return true;
    if (pathname === '/login') return true;

    if (adminOnlyExactPaths.includes(pathname)) {
        return false;
    }

    return !adminOnlyPathPrefixes.some(prefix => (
        pathname === prefix || pathname.startsWith(`${prefix}/`)
    ));
}

export function isAdminOnlyPath(pathname: string): boolean {
    return !canAccessPath('normal', pathname);
}
