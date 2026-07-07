import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    const startedAt = Date.now();

    try {
        const { count, error } = await supabase
            .from('items')
            .select('id', { count: 'exact', head: true });

        if (error) {
            return NextResponse.json({
                ok: false,
                app: 'online',
                database: 'error',
                message: error.message,
                checkedAt: new Date().toISOString(),
                latencyMs: Date.now() - startedAt,
            }, { status: 503 });
        }

        return NextResponse.json({
            ok: true,
            app: 'online',
            database: 'online',
            inventoryItems: count || 0,
            checkedAt: new Date().toISOString(),
            latencyMs: Date.now() - startedAt,
        }, {
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            },
        });
    } catch (error: any) {
        return NextResponse.json({
            ok: false,
            app: 'online',
            database: 'error',
            message: error?.message || 'Health check failed',
            checkedAt: new Date().toISOString(),
            latencyMs: Date.now() - startedAt,
        }, { status: 503 });
    }
}
