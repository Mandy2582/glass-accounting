import { NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { requireAuthenticatedRequest } from '@/lib/serverAuth';

export async function GET(request: Request) {
    const authError = await requireAuthenticatedRequest(request);
    if (authError) return authError;

    try {
        const items = await db.items.getAll();
        const parties = await db.parties.getAll();
        
        let supplier = parties.find(p => p.type === 'supplier');
        if (!supplier) {
            supplier = {
                id: crypto.randomUUID(),
                name: 'Dummy Supplier',
                type: 'supplier',
                phone: '1234567890',
                address: 'Dummy Address',
                balance: 0
            };
            await db.parties.add(supplier);
        }

        if (items.length === 0) {
            return NextResponse.json({ error: 'No items found to purchase. Please add some inventory items first.' });
        }

        let count = 0;
        for (let i = 0; i < 100; i++) {
            const item = items[Math.floor(Math.random() * items.length)];
            const quantity = Math.floor(Math.random() * 50) + 10;
            const rate = Math.floor(Math.random() * 100) + 50;
            const subtotal = quantity * rate;
            const taxRate = 18;
            const taxAmount = subtotal * 0.18;
            const total = subtotal + taxAmount;

            const invoice = {
                id: crypto.randomUUID(),
                type: 'purchase' as const,
                number: `PUR-DUMMY-${Date.now()}-${i}`,
                date: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
                partyId: supplier.id,
                partyName: supplier.name,
                items: [{
                    id: crypto.randomUUID(),
                    itemId: item.id,
                    itemName: item.name,
                    width: item.width || 0,
                    height: item.height || 0,
                    quantity: quantity,
                    unit: item.unit,
                    sqft: quantity * (item.conversionFactor || 1),
                    rate: rate,
                    amount: subtotal
                }],
                subtotal: subtotal,
                taxRate: taxRate,
                taxAmount: taxAmount,
                total: total,
                status: 'paid' as const,
                paidAmount: total
            };

            await db.invoices.add(invoice);
            count++;
        }
        
        return NextResponse.json({ success: true, message: `Added ${count} dummy purchases` });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
