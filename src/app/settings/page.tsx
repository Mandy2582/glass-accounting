'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsIndexPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/settings/company');
    }, [router]);

    return null;
}
