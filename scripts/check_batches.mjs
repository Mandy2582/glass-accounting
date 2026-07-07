import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    const { data, error } = await supabase.from('stock_batches').select('*');
    if (error) {
        console.error('Error fetching stock_batches:', error);
    } else {
        console.log('stock_batches data:', data);
    }
}

run();
