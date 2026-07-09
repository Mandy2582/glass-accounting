import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/serverAuth';
import { getSupabaseAdmin, isUserDisabled } from '@/lib/supabaseAdmin';
import { ALL_ROLES, AppRole, UserPermissions, getUserPermissions, getUserRole } from '@/lib/roles';

export async function GET(request: NextRequest) {
    const authError = await requireAdminRequest(request);
    if (authError) return authError;

    try {
        const admin = getSupabaseAdmin();
        const users: { id: string; email: string | undefined; name: string; role: AppRole; permissions: UserPermissions; createdAt: string; lastSignInAt: string | null; disabled: boolean }[] = [];

        // listUsers is paginated (default 50/page) -- walk all pages so the
        // Users & Roles screen never silently drops accounts once a
        // business grows past the first page.
        let page = 1;
        const perPage = 200;
        while (true) {
            const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            for (const user of data.users) {
                users.push({
                    id: user.id,
                    email: user.email,
                    name: String(user.user_metadata?.name || ''),
                    role: getUserRole(user),
                    permissions: getUserPermissions(user),
                    createdAt: user.created_at,
                    lastSignInAt: user.last_sign_in_at || null,
                    disabled: isUserDisabled(user),
                });
            }

            if (data.users.length < perPage) break;
            page += 1;
        }

        users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return NextResponse.json({ users });
    } catch (error: any) {
        console.error('Failed to list users:', error);
        return NextResponse.json({ error: error.message || 'Failed to list users' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireAdminRequest(request);
    if (authError) return authError;

    try {
        const { email, password, name, role, permissions } = await request.json();

        if (!email || !password || !name || !role) {
            return NextResponse.json({ error: 'Missing required fields (email, password, name, role)' }, { status: 400 });
        }
        if (!ALL_ROLES.includes(role)) {
            return NextResponse.json({ error: `Invalid role. Must be one of: ${ALL_ROLES.join(', ')}` }, { status: 400 });
        }
        if (String(password).length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            app_metadata: { role, permissions: permissions || {} },
            user_metadata: { name },
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                name,
                role,
                permissions: permissions || {},
                createdAt: data.user.created_at,
                lastSignInAt: null,
                disabled: false,
            },
        });
    } catch (error: any) {
        console.error('Failed to create user:', error);
        return NextResponse.json({ error: error.message || 'Failed to create user' }, { status: 500 });
    }
}
