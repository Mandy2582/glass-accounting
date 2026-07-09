import type { User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'manager' | 'sales' | 'inventory' | 'accounts';

export const ROLE_LABELS: Record<AppRole, string> = {
    admin: 'Admin',
    manager: 'Manager',
    sales: 'Sales Staff',
    inventory: 'Inventory Staff',
    accounts: 'Accountant',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
    admin: 'Full access to every module, including Settings and user management.',
    manager: 'Full access to day-to-day modules (orders, sales, inventory, employees, accounting, reports). Cannot manage users or Settings.',
    sales: 'Orders, Sales Invoices, and Customers & Suppliers only.',
    inventory: 'Inventory and Purchase Bills only.',
    accounts: 'Sales Invoices, Customers & Suppliers, Accounting, and Reports.',
};

export const ALL_ROLES: AppRole[] = ['admin', 'manager', 'sales', 'inventory', 'accounts'];

function isAppRole(value: string): value is AppRole {
    return (ALL_ROLES as string[]).includes(value);
}

// Modules that can be independently granted/revoked per role or per user.
// Dashboard, Notifications, and Operations are intentionally excluded --
// every logged-in user can see those regardless of role. Settings (and the
// Users & Roles page inside it) is intentionally excluded too -- it is
// always admin-only and never delegable, since it's where rights themselves
// are configured.
export type ModuleKey =
    | 'orders'
    | 'sales'
    | 'inventory'
    | 'purchases'
    | 'parties'
    | 'employees'
    | 'accounting'
    | 'reports'
    | 'tally';

export const ALL_MODULES: ModuleKey[] = [
    'orders', 'sales', 'inventory', 'purchases', 'parties', 'employees', 'accounting', 'reports', 'tally',
];

export const MODULE_LABELS: Record<ModuleKey, string> = {
    orders: 'Orders',
    sales: 'Sales Invoices',
    inventory: 'Inventory',
    purchases: 'Purchase Bills',
    parties: 'Customers & Suppliers',
    employees: 'Employees & Payroll',
    accounting: 'Accounting (Vouchers, Day Book, Ledgers)',
    reports: 'Reports Centre',
    tally: 'Tally Integration',
};

export type UserPermissions = Partial<Record<ModuleKey, boolean>>;

function allModules(value: boolean): Record<ModuleKey, boolean> {
    return ALL_MODULES.reduce((acc, key) => ({ ...acc, [key]: value }), {} as Record<ModuleKey, boolean>);
}

// Starting templates for a role -- an admin can still override any of these
// per user via UserPermissions, which always takes precedence when set.
export const ROLE_MODULE_DEFAULTS: Record<AppRole, Record<ModuleKey, boolean>> = {
    admin: allModules(true),
    manager: allModules(true),
    sales: { ...allModules(false), orders: true, sales: true, parties: true },
    inventory: { ...allModules(false), inventory: true, purchases: true },
    accounts: { ...allModules(false), sales: true, parties: true, accounting: true, reports: true },
};

const MODULE_PATH_PREFIXES: Record<ModuleKey, string[]> = {
    orders: ['/orders'],
    sales: ['/sales'],
    inventory: ['/inventory'],
    purchases: ['/purchases'],
    parties: ['/parties'],
    employees: ['/employees'],
    accounting: ['/vouchers', '/daybook', '/financials'],
    reports: ['/reports'],
    tally: ['/tally-sync'],
};

// Never delegable -- always admin-only regardless of role or per-user overrides.
const ADMIN_ONLY_PREFIXES = ['/settings', '/test-design'];

const getConfiguredAdminEmails = () => (
    process.env.NEXT_PUBLIC_ADMIN_EMAILS || ''
)
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

// Role and permissions live only in app_metadata, which is writable only by
// the service-role admin API (src/app/api/admin/users) -- never by the
// client SDK. A previous version of this function also fell back to
// user_metadata.role, which IS client-writable via supabase.auth.updateUser;
// any authenticated user could have self-escalated to admin by calling it
// with { data: { role: 'admin' } }. Do not reintroduce that fallback.
export function getUserRole(user: User | null): AppRole {
    if (!user) return 'manager';

    const email = user.email?.toLowerCase();
    if (email && getConfiguredAdminEmails().includes(email)) {
        return 'admin';
    }

    const metadataRole = String(user.app_metadata?.role || '').toLowerCase();
    if (isAppRole(metadataRole)) return metadataRole;

    // Unrecognized/missing role -- default to the most capable non-admin
    // tier rather than silently restricting an account an admin forgot to
    // tag, since every user created through the new Users & Roles page
    // always has an explicit role going forward.
    return 'manager';
}

export function getUserPermissions(user: User | null): UserPermissions {
    if (!user) return {};
    const raw = user.app_metadata?.permissions;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as UserPermissions;
    }
    return {};
}

export function hasModuleAccess(role: AppRole, permissions: UserPermissions, moduleKey: ModuleKey): boolean {
    if (role === 'admin') return true;
    const override = permissions[moduleKey];
    if (override !== undefined) return override;
    return ROLE_MODULE_DEFAULTS[role][moduleKey];
}

export function canAccessPath(role: AppRole, permissions: UserPermissions, pathname: string): boolean {
    if (role === 'admin') return true;
    if (pathname === '/login') return true;

    if (ADMIN_ONLY_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
        return false;
    }

    for (const moduleKey of ALL_MODULES) {
        const prefixes = MODULE_PATH_PREFIXES[moduleKey];
        if (prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
            return hasModuleAccess(role, permissions, moduleKey);
        }
    }

    // Not part of any gated module (dashboard, notifications, operations,
    // home) -- accessible to every logged-in user.
    return true;
}

export function isAdminOnlyPath(pathname: string): boolean {
    return ADMIN_ONLY_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function moduleForPath(pathname: string): ModuleKey | null {
    for (const moduleKey of ALL_MODULES) {
        const prefixes = MODULE_PATH_PREFIXES[moduleKey];
        if (prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
            return moduleKey;
        }
    }
    return null;
}
