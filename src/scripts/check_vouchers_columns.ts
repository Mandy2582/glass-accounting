import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkVoucherSchema() {
    console.log('Querying vouchers details...');
    // We can select one row and print its keys
    const { data, error } = await supabase.from('vouchers').select('*').limit(1);
    if (error) {
        console.error('Error fetching vouchers:', error);
    } else {
        console.log('Voucher row keys:', data.length > 0 ? Object.keys(data[0]) : 'No records found');
        console.log('Voucher row sample:', data[0]);
    }
}

checkVoucherSchema();
