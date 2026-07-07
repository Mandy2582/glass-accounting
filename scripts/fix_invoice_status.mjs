import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fix() {
    console.log('Fixing status for invoice AGH/26-27/003...');
    const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('number', 'AGH/26-27/003');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Invoice status fixed successfully!');
}

fix();
