import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'sb_publishable_-yQW_9jh3L4fFAfLbt9YSw_AEghpWR9';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables. Cloud features will not work.');
}

export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
);
