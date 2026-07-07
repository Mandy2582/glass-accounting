import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    const { data, error } = await supabase.from('items').select('*');
    if (error) {
        console.error(error);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}
run();
