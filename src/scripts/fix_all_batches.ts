// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fixAllBatches() {
    console.log('Fixing all batches by resetting to original quantities...\n');

    // Get all batches
    const { data: batches } = await supabase
        .from('stock_batches')
        .select('*');

    console.log(`Found ${batches.length} batches`);

    // Reset each batch to its original quantity
    for (const batch of batches) {
        if (batch.remaining_quantity !== batch.quantity) {
            console.log(`Resetting batch ${batch.id}: ${batch.remaining_quantity} -> ${batch.quantity}`);
            await supabase
                .from('stock_batches')
                .update({ remaining_quantity: batch.quantity })
                .eq('id', batch.id);
        }
    }

    console.log('\nDone! All batches reset to original quantities.');
    console.log('This assumes there are NO active sales invoices.');
}

fixAllBatches();
