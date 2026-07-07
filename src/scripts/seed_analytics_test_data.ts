import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oboskguczgqmemycqtoy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ib3NrZ3VjemdxbWVteWNxdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTgyNzIsImV4cCI6MjA3OTI5NDI3Mn0.dqejOQNwAbmVPuhO9arnrYF-GAndRroiJQBwa-ydq0w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const uuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

async function seedData() {
    console.log('Starting seed of Customer Analytics dummy testing data...');

    // 1. Create unique IDs
    const custActiveId = uuid();
    const custUrgeId = uuid();
    const custRiskId = uuid();

    const itemId = uuid(); // Mock item

    // 2. Insert Parties (Customers)
    const parties = [
        {
            id: custActiveId,
            name: 'Test Customer 1 (Active)',
            type: 'customer',
            phone: '9999911111',
            address: '123 active lane, Delhi',
            balance: 0 // Active, no outstanding dues
        },
        {
            id: custUrgeId,
            name: 'Test Customer 2 (Urge check-in)',
            type: 'customer',
            phone: '9999922222',
            address: '456 passive avenue, Mumbai',
            balance: 0 // Bought previously, now silent
        },
        {
            id: custRiskId,
            name: 'Test Customer 3 (Credit Risk)',
            type: 'customer',
            phone: '9999933333',
            address: '789 delay street, Bangalore',
            balance: 135000 // ₹135,000 outstanding dues (receivables)
        }
    ];

    console.log('Inserting Parties...');
    const { error: partyError } = await supabase.from('parties').insert(parties);
    if (partyError) {
        console.error('Failed to insert parties:', partyError);
        return;
    }
    console.log('Parties inserted successfully');

    // 3. Create items
    const testItem = {
        id: itemId,
        name: 'Toughened Clear Glass 12mm',
        type: 'Toughened',
        unit: 'sqft',
        stock: 500,
        rate: 150
    };
    
    // We try inserting just in case, but ignore conflict
    await supabase.from('items').insert(testItem);

    // 4. Insert Invoices representing buying patterns
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const invoices = [
        // A. Active Customer: buys weekly, pays immediately
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-ACT-001',
            date: new Date(now.getTime() - 28 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 10000,
            tax_rate: 18,
            tax_amount: 1800,
            total: 11800,
            paid_amount: 11800,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 5, unit: 'sqft', sqft: 80, rate: 150, amount: 11800 }]
        },
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-ACT-002',
            date: new Date(now.getTime() - 21 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 12000,
            tax_rate: 18,
            tax_amount: 2160,
            total: 14160,
            paid_amount: 14160,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 6, unit: 'sqft', sqft: 96, rate: 150, amount: 14160 }]
        },
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-ACT-003',
            date: new Date(now.getTime() - 14 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 9000,
            tax_rate: 18,
            tax_amount: 1620,
            total: 10620,
            paid_amount: 10620,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 10620 }]
        },
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-ACT-004',
            date: new Date(now.getTime() - 7 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 15000,
            tax_rate: 18,
            tax_amount: 2700,
            total: 17700,
            paid_amount: 17700,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 8, unit: 'sqft', sqft: 128, rate: 150, amount: 17700 }]
        },

        // B. Urge Check-in Customer: bought every 10 days, but last purchase was 45 days ago
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-URG-001',
            date: new Date(now.getTime() - 75 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 8000,
            tax_rate: 18,
            tax_amount: 1440,
            total: 9440,
            paid_amount: 9440,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 9440 }]
        },
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-URG-002',
            date: new Date(now.getTime() - 65 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 8500,
            tax_rate: 18,
            tax_amount: 1530,
            total: 10030,
            paid_amount: 10030,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 10030 }]
        },
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-URG-003',
            date: new Date(now.getTime() - 55 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 9000,
            tax_rate: 18,
            tax_amount: 1620,
            total: 10620,
            paid_amount: 10620,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 10620 }]
        },
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-URG-004',
            date: new Date(now.getTime() - 45 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 7500,
            tax_rate: 18,
            tax_amount: 1350,
            total: 8850,
            paid_amount: 8850,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 3, unit: 'sqft', sqft: 48, rate: 150, amount: 8850 }]
        },

        // C. Credit Risk Customer: has unpaid invoices from 35 days ago & 50 days ago
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-RSK-001',
            date: new Date(now.getTime() - 50 * oneDayMs).toISOString(),
            party_id: custRiskId,
            party_name: 'Test Customer 3 (Credit Risk)',
            subtotal: 50000,
            tax_rate: 18,
            tax_amount: 9000,
            total: 59000,
            paid_amount: 0,
            status: 'unpaid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 20, unit: 'sqft', sqft: 320, rate: 150, amount: 59000 }]
        },
        {
            id: uuid(),
            type: 'sale',
            number: 'INV-RSK-002',
            date: new Date(now.getTime() - 35 * oneDayMs).toISOString(),
            party_id: custRiskId,
            party_name: 'Test Customer 3 (Credit Risk)',
            subtotal: 65000,
            tax_rate: 18,
            tax_amount: 11700,
            total: 76000,
            paid_amount: 0,
            status: 'unpaid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 25, unit: 'sqft', sqft: 400, rate: 150, amount: 76000 }]
        }
    ];

    console.log('Inserting Invoices...');
    const { error: invError } = await supabase.from('invoices').insert(invoices);
    if (invError) {
        console.error('Failed to insert invoices:', invError);
        return;
    }
    console.log('Invoices inserted successfully');

    // 5. Insert Stuck Pending Order (triggers order follow-up alert)
    const stuckOrder = {
        id: uuid(),
        type: 'sale_order',
        number: 'SO-STUCK-101',
        date: new Date(now.getTime() - 8 * oneDayMs).toISOString(),
        party_id: custActiveId,
        party_name: 'Test Customer 1 (Active)',
        subtotal: 15000,
        tax_rate: 18,
        tax_amount: 2700,
        total: 17700,
        status: 'supplier_ordered', // Stuck here for 8 days
        items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 8, unit: 'sqft', sqft: 128, rate: 150, amount: 17700 }]
    };

    console.log('Inserting Stuck Pending Order...');
    const { error: orderError } = await supabase.from('orders').insert(stuckOrder);
    if (orderError) {
        console.error('Failed to insert stuck order:', orderError);
        return;
    }
    console.log('Stuck order inserted successfully');

    console.log('Dummy testing data seeded successfully!');
}

seedData();
