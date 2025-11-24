import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware disabled - using client-side auth checks instead
export async function middleware(req: NextRequest) {
    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
