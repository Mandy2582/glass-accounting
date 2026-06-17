'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function AutoLogout() {
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const resetTimer = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(async () => {
                await supabase.auth.signOut();
                window.location.href = '/login';
            }, TIMEOUT_MS);
        };

        // Events to track
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

        // Add listeners
        events.forEach(event => {
            document.addEventListener(event, resetTimer);
        });

        // Initial start
        resetTimer();

        // Cleanup
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => {
                document.removeEventListener(event, resetTimer);
            });
        };
    }, []);

    return null;
}
