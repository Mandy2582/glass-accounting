import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
    const res = NextResponse.next();
    const supabase = createMiddlewareClient({ req, res });

    const {
        data: { session },
    } = await supabase.auth.getSession();

    // If no session and not on login page, redirect to login
    if (!session && req.nextUrl.pathname !== '/login') {
        return NextResponse.redirect(new URL('/login', req.url));
    }

    // If session and on login page, redirect to dashboard
    if (session && req.nextUrl.pathname === '/login') {
        return NextResponse.redirect(new URL('/', req.url));
    }

    return res;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
