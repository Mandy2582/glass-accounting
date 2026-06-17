import { supabase } from './supabase';

export async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
        throw new Error('Your session has expired. Please log in again.');
    }

    return {
        Authorization: `Bearer ${session.access_token}`,
    };
}
