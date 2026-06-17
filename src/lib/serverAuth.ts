import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function requireAuthenticatedRequest(request: Request): Promise<NextResponse | null> {
    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!token) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    return null;
}
