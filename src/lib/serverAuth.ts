import { createClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getRequestUser(request: Request): Promise<{ user: User | null; error: NextResponse | null }> {
    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!token) {
        return { user: null, error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return { user: null, error: NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 }) };
    }

    return { user, error: null };
}

export async function requireAuthenticatedRequest(request: Request): Promise<NextResponse | null> {
    const { error } = await getRequestUser(request);
    return error;
}

// Same as requireAuthenticatedRequest, but also verifies the caller's own
// role is 'admin' (from their app_metadata, the only place role is ever
// stored -- see roles.ts). Used to gate the user-management API routes so
// only admins can create/edit/delete other accounts or grant roles.
export async function requireAdminRequest(request: Request): Promise<NextResponse | null> {
    const { error } = await requireAdminCaller(request);
    return error;
}

// Same admin check, but also hands back the caller's own user record --
// routes that act on a specific target user id (edit/disable/delete) need
// this to stop an admin from locking themselves out (self-demote, self-
// disable, or self-delete their own account).
export async function requireAdminCaller(request: Request): Promise<{ user: User | null; error: NextResponse | null }> {
    const { user, error } = await getRequestUser(request);
    if (error) return { user: null, error };

    if (getUserRole(user) !== 'admin') {
        return { user: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
    }

    return { user, error: null };
}
