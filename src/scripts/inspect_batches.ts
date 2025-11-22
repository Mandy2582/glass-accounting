import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
    console.log('Inspecting Stock Batches...');

    const { data: batches, error } = await supabase.from('stock_batches').select('*');
    if (error) throw error;

    console.log(`Found ${batches.length} batches.`);
    if (batches.length > 0) {
        console.log(JSON.stringify(batches, null, 2));
    }

    const { data: invoices, error: invError } = await supabase.from('invoices').select('id, number');
    if (invError) throw invError;
    console.log(`Found ${invoices.length} invoices.`);
    console.log(JSON.stringify(invoices, null, 2));
}

inspect();
