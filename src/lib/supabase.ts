import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables. Cloud features will not work.');
}

export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
);
