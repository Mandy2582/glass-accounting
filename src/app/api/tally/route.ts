import { NextResponse } from 'next/server';
import { requireAuthenticatedRequest } from '@/lib/serverAuth';

function isPrivateTallyUrl(value: string): boolean {
    try {
        const url = new URL(value);
        const hostname = url.hostname;

        if (url.protocol !== 'http:') return false;

        return hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname.startsWith('10.')
            || hostname.startsWith('192.168.')
            || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    const authError = await requireAuthenticatedRequest(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { tallyUrl, xmlRequest } = body;

        if (!tallyUrl || !xmlRequest) {
            return NextResponse.json({ error: 'tallyUrl and xmlRequest are required' }, { status: 400 });
        }

        if (!isPrivateTallyUrl(tallyUrl)) {
            return NextResponse.json({ error: 'Tally URL must use a private local network address' }, { status: 400 });
        }

        // Send the XML request to Tally Prime
        const response = await fetch(tallyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml;charset=utf-8',
            },
            body: xmlRequest,
        });

        if (!response.ok) {
            throw new Error(`Tally Server responded with status: ${response.status}`);
        }

        const xmlResponse = await response.text();
        
        return new NextResponse(xmlResponse, {
            headers: { 
                'Content-Type': 'text/xml',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error: any) {
        console.error('Tally API Proxy Error:', error);
        return NextResponse.json(
            { error: 'Failed to connect to Tally', details: error.message },
            { status: 500 }
        );
    }
}
