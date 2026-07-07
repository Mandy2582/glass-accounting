'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AutoLogout from '@/components/AutoLogout';
import TallyBackgroundSync from '@/components/TallyBackgroundSync';
import styles from '@/components/Layout.module.css';
import { supabase } from '@/lib/supabase';
import { AppRole, ROLE_LABELS, canAccessPath, getUserRole } from '@/lib/roles';
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
    const [role, setRole] = useState<AppRole>('normal');

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
            setIsCheckingSession(false);
        };

        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                router.replace('/login');
            } else {
                setRole(getUserRole(session.user));
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

    const hasPageAccess = canAccessPath(role, pathname);

    return (
        <NotificationProvider>
            <div className={styles.layout}>
                <AutoLogout />
                {role === 'admin' && <TallyBackgroundSync />}
                <Sidebar isCollapsed={isSidebarCollapsed} toggleSidebar={toggleSidebar} role={role} />
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
                                    <h1>Admin access required</h1>
                                    <p>
                                        Your current role is <strong>{ROLE_LABELS[role]}</strong>. This module contains sensitive accounting, employee, purchase, reporting, or system settings data, so it is available only to admin users.
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
