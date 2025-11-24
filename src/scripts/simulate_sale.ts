import { db } from '../lib/storage';
import { generateUUID } from '../lib/utils';
import { Invoice } from '../types/index';

async function simulate() {
    console.log('Simulating Sale...');

    const invoice: Invoice = {
        id: generateUUID(),
        type: 'sale',
        number: 'TEST-001',
        date: new Date().toISOString().split('T')[0],
        partyId: 'party-123', // Dummy
        partyName: 'Test Customer',
        subtotal: 1000,
        taxRate: 0,
        taxAmount: 0,
        total: 1000,
        paidAmount: 0,
        status: 'unpaid',
        items: [
            {
                id: generateUUID(),
                itemId: 'adc2ab03-4eda-4f85-80b4-c400b7f449c6', // Plain Glass 8 * 6 from previous inspect
                itemName: 'Plain Glass 8 * 6',
                quantity: 1,
                rate: 1000,
                amount: 1000,
                unit: 'sqft',
                sqft: 1,
                warehouse: 'Warehouse A'
            } as any
        ]
    };

    try {
        await db.invoices.add(invoice);
        console.log('Sale simulated successfully.');
    } catch (e) {
        console.error('Simulation failed:', e);
    }
}

simulate();
