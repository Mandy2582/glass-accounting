// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkInvoices() {
    const { data: allInvoices } = await supabase
        .from('invoices')
        .select('id, number, type, date, total')
        .order('created_at', { ascending: false })
        .limit(20);

    console.log('Recent Invoices:');
    console.table(allInvoices);

    const sales = allInvoices.filter(i => i.type === 'sale');
    const purchases = allInvoices.filter(i => i.type === 'purchase');

    console.log(`\nTotal: ${allInvoices.length} invoices (${sales.length} sales, ${purchases.length} purchases)`);
}

checkInvoices();
