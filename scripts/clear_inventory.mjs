import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('Clearing stock_batches table...');
    const { error: batchError } = await supabase.from('stock_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (batchError) {
        console.error('Error clearing stock_batches:', batchError);
    } else {
        console.log('Successfully cleared stock_batches.');
    }

    console.log('Clearing items table...');
    const { error: itemError } = await supabase.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (itemError) {
        console.error('Error clearing items:', itemError);
    } else {
        console.log('Successfully cleared items.');
    }
}

run();
