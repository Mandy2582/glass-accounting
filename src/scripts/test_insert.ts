import { createClient } from '@supabase/supabase-js';


const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Mock generateUUID if utils not available in this context (ts-node)
const uuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

async function testInsert() {
    console.log('Starting Test Insert...');

    const invoiceId = uuid();
    const itemId = uuid(); // Generate ID for item explicitly

    // 1. Insert Invoice
    const dbInvoice = {
        id: invoiceId,
        type: 'purchase',
        number: 'TEST-001',
        date: new Date().toISOString(),
        subtotal: 100,
        total: 100,
        status: 'test'
    };

    console.log('Inserting Invoice:', dbInvoice);
    const { error: invError } = await supabase.from('invoices').insert(dbInvoice);
    if (invError) {
        console.error('Invoice Insert Failed:', invError);
        return;
    }
    console.log('Invoice Insert Success');

    // 2. Insert Item WITH ID
    const dbItemWithId = {
        id: uuid(),
        invoice_id: invoiceId,
        item_name: 'Test Item With ID',
        quantity: 1,
        rate: 100,
        amount: 100
    };
    console.log('Inserting Item WITH ID:', dbItemWithId);
    const { error: itemError1 } = await supabase.from('invoice_items').insert(dbItemWithId);
    if (itemError1) console.error('Item With ID Insert Failed:', itemError1);
    else console.log('Item With ID Insert Success');

    // 3. Insert Item WITHOUT ID (undefined)
    const dbItemNoId = {
        id: undefined,
        invoice_id: invoiceId,
        item_name: 'Test Item No ID',
        quantity: 1,
        rate: 100,
        amount: 100
    };
    console.log('Inserting Item WITHOUT ID:', dbItemNoId);
    const { error: itemError2 } = await supabase.from('invoice_items').insert(dbItemNoId);
    if (itemError2) console.error('Item No ID Insert Failed:', itemError2);
    else console.log('Item No ID Insert Success');

    // Cleanup
    console.log('Cleaning up...');
    await supabase.from('invoices').delete().eq('id', invoiceId);
}

testInsert();
