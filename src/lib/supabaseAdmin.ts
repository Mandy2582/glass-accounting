import 'server-only';
import { createClient, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client for server-side admin operations only (creating/
// updating/deleting auth users, setting app_metadata). Never import this
// from a client component -- the 'server-only' guard above throws if it
// ends up in a browser bundle, and the key itself is not NEXT_PUBLIC_-
// prefixed so Next.js won't inline it client-side regardless.
export function getSupabaseAdmin() {
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase admin environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

// banned_until is returned by GoTrue's admin API but isn't in the
// @supabase/supabase-js User type, hence the cast.
export function isUserDisabled(user: User): boolean {
    const bannedUntil = (user as unknown as { banned_until?: string }).banned_until;
    return Boolean(bannedUntil && new Date(bannedUntil) > new Date());
}
