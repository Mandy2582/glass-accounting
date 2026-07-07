import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
    console.log('Fetching recent order...');
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Order columns/keys:', Object.keys(data[0] || {}));
    console.log('Sample order data:', JSON.stringify(data[0], null, 2));
}

inspect();
