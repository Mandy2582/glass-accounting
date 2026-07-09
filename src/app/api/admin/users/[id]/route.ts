import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCaller } from '@/lib/serverAuth';
import { getSupabaseAdmin, isUserDisabled } from '@/lib/supabaseAdmin';
import { ALL_ROLES } from '@/lib/roles';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { user: caller, error: authError } = await requireAdminCaller(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const { name, role, permissions, disabled } = await request.json();

        if (role !== undefined && !ALL_ROLES.includes(role)) {
            return NextResponse.json({ error: `Invalid role. Must be one of: ${ALL_ROLES.join(', ')}` }, { status: 400 });
        }

        // An admin editing their own account can't demote themselves out of
        // admin or disable themselves -- otherwise the last admin could lock
        // everyone (including themselves) out with no way back in short of
        // going to the database directly.
        if (caller?.id === id) {
            if (role !== undefined && role !== 'admin') {
                return NextResponse.json({ error: 'You cannot remove your own admin role.' }, { status: 400 });
            }
            if (disabled === true) {
                return NextResponse.json({ error: 'You cannot disable your own account.' }, { status: 400 });
            }
        }

        const admin = getSupabaseAdmin();
        const { data: existing, error: fetchError } = await admin.auth.admin.getUserById(id);
        if (fetchError || !existing.user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const updatedAppMetadata = {
            ...existing.user.app_metadata,
            ...(role !== undefined ? { role } : {}),
            ...(permissions !== undefined ? { permissions } : {}),
        };
        const updatedUserMetadata = {
            ...existing.user.user_metadata,
            ...(name !== undefined ? { name } : {}),
        };

        const { data, error } = await admin.auth.admin.updateUserById(id, {
            app_metadata: updatedAppMetadata,
            user_metadata: updatedUserMetadata,
            ...(disabled !== undefined ? { ban_duration: disabled ? '876000h' : 'none' } : {}),
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                name: String(data.user.user_metadata?.name || ''),
                role: updatedAppMetadata.role,
                permissions: updatedAppMetadata.permissions || {},
                createdAt: data.user.created_at,
                lastSignInAt: data.user.last_sign_in_at || null,
                disabled: isUserDisabled(data.user),
            },
        });
    } catch (error: any) {
        console.error('Failed to update user:', error);
        return NextResponse.json({ error: error.message || 'Failed to update user' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { user: caller, error: authError } = await requireAdminCaller(request);
    if (authError) return authError;

    const { id } = await params;

    if (caller?.id === id) {
        return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    try {
        const admin = getSupabaseAdmin();
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Failed to delete user:', error);
        return NextResponse.json({ error: error.message || 'Failed to delete user' }, { status: 500 });
    }
}
