import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

const browserSessionStorage = typeof window !== 'undefined'
    ? window.sessionStorage
    : undefined;

if (typeof window !== 'undefined') {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    window.localStorage.removeItem(`sb-${projectRef}-auth-token`);
}

export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
        auth: {
            // Keep a login across page refreshes, but not after the browser session ends.
            storage: browserSessionStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    }
);
