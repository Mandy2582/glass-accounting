'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AutoLogout from '@/components/AutoLogout';
import styles from '@/components/Layout.module.css';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    if (isLoginPage) {
        return <>{children}</>;
    }

    return (
        <div className={styles.layout}>
            <AutoLogout />
            <Sidebar />
            <div className={styles.mainContent}>
                <Header />
                <main className={styles.pageContent}>
                    {children}
                </main>
            </div>
        </div>
    );
}
