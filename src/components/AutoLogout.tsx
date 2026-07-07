'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const LAST_ACTIVITY_KEY = 'agh_last_activity_at';

export default function AutoLogout() {
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        let isLoggingOut = false;

        const logout = async () => {
            if (isLoggingOut) return;
            isLoggingOut = true;
            sessionStorage.removeItem(LAST_ACTIVITY_KEY);
            await supabase.auth.signOut();
            window.location.replace('/login');
        };

        const scheduleLogout = (delay = TIMEOUT_MS) => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(logout, Math.max(0, delay));
        };

        const recordActivity = () => {
            sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
            scheduleLogout();
        };

        const validateActivity = () => {
            const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY));
            if (lastActivity && Date.now() - lastActivity >= TIMEOUT_MS) {
                void logout();
                return;
            }

            const remaining = lastActivity
                ? TIMEOUT_MS - (Date.now() - lastActivity)
                : TIMEOUT_MS;
            scheduleLogout(remaining);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                validateActivity();
            }
        };

        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

        events.forEach(event => {
            document.addEventListener(event, recordActivity);
        });
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', validateActivity);

        validateActivity();

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => {
                document.removeEventListener(event, recordActivity);
            });
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', validateActivity);
        };
    }, []);

    return null;
}
