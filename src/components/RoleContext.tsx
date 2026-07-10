'use client';

import React, { createContext, useContext } from 'react';
import { AppRole, UserPermissions } from '@/lib/roles';

interface RoleContextType {
    role: AppRole;
    permissions: UserPermissions;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

// Populated once by ClientLayout, which already resolves the session's role
// before rendering any page -- lets any page gate an action (not just whole
// routes) on the current user's role without re-fetching the session itself.
export function RoleProvider({ role, permissions, children }: { role: AppRole; permissions: UserPermissions; children: React.ReactNode }) {
    return (
        <RoleContext.Provider value={{ role, permissions }}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole(): RoleContextType {
    const context = useContext(RoleContext);
    if (context === undefined) {
        throw new Error('useRole must be used within a RoleProvider');
    }
    return context;
}
