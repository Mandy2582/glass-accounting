'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Ban, CheckCircle2, Pencil, Plus, Trash2, Users as UsersIcon, X } from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
    ALL_MODULES,
    ALL_ROLES,
    AppRole,
    MODULE_LABELS,
    ModuleKey,
    ROLE_DESCRIPTIONS,
    ROLE_LABELS,
    ROLE_MODULE_DEFAULTS,
    UserPermissions,
} from '@/lib/roles';

type AppUser = {
    id: string;
    email: string;
    name: string;
    role: AppRole;
    permissions: UserPermissions;
    createdAt: string;
    lastSignInAt: string | null;
    disabled: boolean;
};

type FormState = {
    name: string;
    email: string;
    password: string;
    role: AppRole;
    permissions: UserPermissions;
};

const emptyForm: FormState = { name: '', email: '', password: '', role: 'sales', permissions: {} };

export default function UsersSettingsPage() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [editingUser, setEditingUser] = useState<AppUser | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const authHeaders = await getAuthHeaders();
            const res = await fetch('/api/admin/users', { headers: authHeaders });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load users');
            setUsers(data.users);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to load users' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
        supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
    }, [loadUsers]);

    const openAddForm = () => {
        setEditingUser(null);
        setForm(emptyForm);
        setShowForm(true);
    };

    const openEditForm = (user: AppUser) => {
        setEditingUser(user);
        setForm({ name: user.name, email: user.email, password: '', role: user.role, permissions: user.permissions });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingUser(null);
        setForm(emptyForm);
    };

    const handleSubmit = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const authHeaders = await getAuthHeaders();

            if (editingUser) {
                const res = await fetch(`/api/admin/users/${editingUser.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                    body: JSON.stringify({ name: form.name, role: form.role, permissions: form.permissions }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update user');
                setMessage({ type: 'success', text: `${form.name} updated successfully.` });
            } else {
                if (!form.email || !form.password || !form.name) {
                    throw new Error('Name, email, and password are required.');
                }
                const res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                    body: JSON.stringify(form),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to create user');
                setMessage({ type: 'success', text: `${form.name} added successfully.` });
            }

            closeForm();
            await loadUsers();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Something went wrong' });
        } finally {
            setSaving(false);
        }
    };

    const toggleDisabled = async (user: AppUser) => {
        setMessage(null);
        try {
            const authHeaders = await getAuthHeaders();
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ disabled: !user.disabled }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update user');
            await loadUsers();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to update user' });
        }
    };

    const handleDelete = async (user: AppUser) => {
        if (!confirm(`Delete ${user.name || user.email}? This permanently removes their login. This cannot be undone.`)) return;
        setMessage(null);
        try {
            const authHeaders = await getAuthHeaders();
            const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: authHeaders });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete user');
            await loadUsers();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to delete user' });
        }
    };

    return (
        <>
            {message && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    borderRadius: '0.5rem',
                    background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                    color: message.type === 'success' ? '#166534' : '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <AlertCircle size={20} />
                    {message.text}
                </div>
            )}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <UsersIcon size={24} />
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Users & Roles</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Add staff logins, assign a role, and fine-tune exactly which modules they can access.</p>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={openAddForm} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={18} />
                        Add User
                    </button>
                </div>

                <div style={{ padding: '1.5rem' }}>
                    {loading ? (
                        <p>Loading users...</p>
                    ) : users.length === 0 ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>No users found.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                                        <th style={{ padding: '0.6rem' }}>Name</th>
                                        <th style={{ padding: '0.6rem' }}>Email</th>
                                        <th style={{ padding: '0.6rem' }}>Role</th>
                                        <th style={{ padding: '0.6rem' }}>Status</th>
                                        <th style={{ padding: '0.6rem' }}>Last Login</th>
                                        <th style={{ padding: '0.6rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => {
                                        const isSelf = user.id === currentUserId;
                                        return (
                                            <tr key={user.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '0.6rem', fontWeight: 600 }}>
                                                    {user.name || '—'} {isSelf && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>(you)</span>}
                                                </td>
                                                <td style={{ padding: '0.6rem' }}>{user.email}</td>
                                                <td style={{ padding: '0.6rem' }}>
                                                    <span style={{
                                                        padding: '2px 10px',
                                                        borderRadius: '999px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        background: user.role === 'admin' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(99, 102, 241, 0.1)',
                                                        color: user.role === 'admin' ? '#0369a1' : '#4338ca',
                                                    }}>
                                                        {ROLE_LABELS[user.role]}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.6rem' }}>
                                                    {user.disabled ? (
                                                        <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.8rem' }}>Disabled</span>
                                                    ) : (
                                                        <span style={{ color: '#166534', fontWeight: 600, fontSize: '0.8rem' }}>Active</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.6rem', color: 'var(--color-text-muted)' }}>
                                                    {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString('en-IN') : 'Never'}
                                                </td>
                                                <td style={{ padding: '0.6rem' }}>
                                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                        <button
                                                            className="btn"
                                                            title="Edit"
                                                            onClick={() => openEditForm(user)}
                                                            style={{ padding: '0.35rem 0.5rem', background: 'white', border: '1px solid var(--color-border)' }}
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            className="btn"
                                                            title={user.disabled ? 'Enable' : 'Disable'}
                                                            onClick={() => toggleDisabled(user)}
                                                            disabled={isSelf}
                                                            style={{ padding: '0.35rem 0.5rem', background: 'white', border: '1px solid var(--color-border)', opacity: isSelf ? 0.4 : 1 }}
                                                        >
                                                            {user.disabled ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                                                        </button>
                                                        <button
                                                            className="btn"
                                                            title="Delete"
                                                            onClick={() => handleDelete(user)}
                                                            disabled={isSelf}
                                                            style={{ padding: '0.35rem 0.5rem', background: 'white', border: '1px solid #fca5a5', color: '#dc2626', opacity: isSelf ? 0.4 : 1 }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {showForm && (
                <UserFormModal
                    form={form}
                    setForm={setForm}
                    isEditing={!!editingUser}
                    saving={saving}
                    onCancel={closeForm}
                    onSubmit={handleSubmit}
                />
            )}
        </>
    );
}

function UserFormModal({
    form,
    setForm,
    isEditing,
    saving,
    onCancel,
    onSubmit,
}: {
    form: FormState;
    setForm: (form: FormState) => void;
    isEditing: boolean;
    saving: boolean;
    onCancel: () => void;
    onSubmit: () => void;
}) {
    const setModuleOverride = (moduleKey: ModuleKey, value: boolean | undefined) => {
        const updated = { ...form.permissions };
        if (value === undefined) {
            delete updated[moduleKey];
        } else {
            updated[moduleKey] = value;
        }
        setForm({ ...form, permissions: updated });
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: '1rem',
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{isEditing ? 'Edit User' : 'Add User'}</h2>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Full Name *</label>
                            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ravi Kumar" />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Email *</label>
                            <input
                                className="input"
                                type="email"
                                value={form.email}
                                disabled={isEditing}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="ravi@arjunglasshouse.com"
                                style={isEditing ? { opacity: 0.6 } : undefined}
                            />
                        </div>
                        {!isEditing && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Temporary Password *</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    placeholder="At least 8 characters"
                                />
                                <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Share this with them directly -- there is no invite email.</small>
                            </div>
                        )}
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Role *</label>
                            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole, permissions: {} })}>
                                {ALL_ROLES.map(role => (
                                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                        {ROLE_DESCRIPTIONS[form.role]}
                    </p>

                    {form.role !== 'admin' && (
                        <div>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Module Access</h3>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                                Defaults to the role above. Override any module individually if this person needs more or less than the role template.
                            </p>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {ALL_MODULES.map(moduleKey => {
                                    const roleDefault = ROLE_MODULE_DEFAULTS[form.role][moduleKey];
                                    const override = form.permissions[moduleKey];
                                    const effective = override !== undefined ? override : roleDefault;
                                    return (
                                        <div key={moduleKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: effective ? 'rgba(34,197,94,0.06)' : 'rgba(0,0,0,0.02)' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{MODULE_LABELS[moduleKey]}</span>
                                            <select
                                                className="input"
                                                style={{ width: '160px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                                                value={override === undefined ? 'default' : override ? 'allow' : 'deny'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setModuleOverride(moduleKey, val === 'default' ? undefined : val === 'allow');
                                                }}
                                            >
                                                <option value="default">Default ({roleDefault ? 'Allowed' : 'Not allowed'})</option>
                                                <option value="allow">Allowed</option>
                                                <option value="deny">Not allowed</option>
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button className="btn" onClick={onCancel} disabled={saving} style={{ background: '#f1f5f9', border: '1px solid var(--color-border)' }}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>
                        {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add User'}
                    </button>
                </div>
            </div>
        </div>
    );
}
