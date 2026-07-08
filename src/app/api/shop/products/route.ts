import { NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { withAvailableStock } from '@/lib/stockReservations';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const items = await db.items.getShopProducts(300);
        const reservedItems = await withAvailableStock(items);

        return NextResponse.json({ items: reservedItems }, {
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            },
        });
    } catch (error) {
        console.error('Could not load shop products:', error);
        return NextResponse.json(
            { items: [], error: 'Could not load shop products' },
            { status: 500 },
        );
    }
}
