import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
    console.log('Fetching invoice AGH/26-27/003...');
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('number', 'AGH/26-27/003');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Invoices found:', JSON.stringify(invoices, null, 2));
}

inspect();
