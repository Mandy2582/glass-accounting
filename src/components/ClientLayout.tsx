'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AutoLogout from '@/components/AutoLogout';
import TallyBackgroundSync from '@/components/TallyBackgroundSync';
import styles from '@/components/Layout.module.css';
import { supabase } from '@/lib/supabase';
import { AppRole, MODULE_LABELS, ROLE_LABELS, UserPermissions, canAccessPath, getUserPermissions, getUserRole, isAdminOnlyPath, moduleForPath } from '@/lib/roles';
import { ShieldAlert } from 'lucide-react';

import { NotificationProvider } from '@/components/NotificationContext';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const isLoginPage = pathname === '/login';
    const isPublicPage = pathname === '/' || isLoginPage || pathname === '/track' || pathname === '/measure' || pathname === '/estimate' || pathname === '/guide' || pathname === '/shop' || pathname.startsWith('/shop/');

    // Start with the sidebar collapsed so modules have full viewport width initially
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [role, setRole] = useState<AppRole>('manager');
    const [permissions, setPermissions] = useState<UserPermissions>({});

    useEffect(() => {
        if (isPublicPage) {
            return;
        }

        let isMounted = true;

        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!isMounted) return;

            if (!session) {
                router.replace('/login');
                return;
            }

            setRole(getUserRole(session.user));
            setPermissions(getUserPermissions(session.user));
            setIsCheckingSession(false);
        };

        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                router.replace('/login');
            } else {
                setRole(getUserRole(session.user));
                setPermissions(getUserPermissions(session.user));
                setIsCheckingSession(false);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [isPublicPage, router]);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    if (isPublicPage) {
        return <div className="customerTheme">{children}</div>;
    }

    if (isCheckingSession) {
        return (
            <div className={styles.sessionLoader} role="status" aria-live="polite">
                <div className={styles.sessionLoaderSpinner} />
                <span>Loading workspace...</span>
            </div>
        );
    }

    const hasPageAccess = canAccessPath(role, permissions, pathname);
    const blockedModule = moduleForPath(pathname);
    const isSettingsPath = isAdminOnlyPath(pathname);

    return (
        <NotificationProvider>
            <div className={styles.layout}>
                <AutoLogout />
                {role === 'admin' && <TallyBackgroundSync />}
                <Sidebar isCollapsed={isSidebarCollapsed} toggleSidebar={toggleSidebar} role={role} permissions={permissions} />
                <div className={`${styles.mainContent} ${isSidebarCollapsed ? styles.mainContentCollapsed : ''}`}>
                    <Header toggleSidebar={toggleSidebar} isSidebarCollapsed={isSidebarCollapsed} role={role} />
                    <main className={styles.pageContent}>
                        {hasPageAccess ? children : (
                            <div className={styles.accessDeniedCard}>
                                <div className={styles.accessDeniedIcon}>
                                    <ShieldAlert size={28} />
                                </div>
                                <div>
                                    <p className={styles.accessDeniedEyebrow}>Restricted Area</p>
                                    <h1>{isSettingsPath ? 'Admin access required' : 'Access restricted'}</h1>
                                    <p>
                                        Your current role is <strong>{ROLE_LABELS[role]}</strong>.{' '}
                                        {isSettingsPath
                                            ? 'System settings and user management are available only to admin users.'
                                            : `Your role doesn't include access to ${blockedModule ? MODULE_LABELS[blockedModule] : 'this module'}. Ask an admin to grant it from Settings → Users & Roles if you need it.`}
                                    </p>
                                    <button className="btn btn-primary" onClick={() => router.replace('/dashboard')}>
                                        Go to Dashboard
                                    </button>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </NotificationProvider>
    );
}
