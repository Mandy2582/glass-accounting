import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/storage';
import { generateUUID } from '@/lib/utils';
import { Party } from '@/types';

type CustomerSessionPayload = {
    partyId: string;
    phone: string;
    exp: number;
};

type CustomerSessionBody = {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    pincode?: string;
    deliveryPreference?: string;
    wantsInstallation?: boolean;
    preferredDate?: string;
    deliverySlot?: string;
    paymentPreference?: string;
    paymentMode?: string;
};

const COOKIE_NAME = 'agh_customer_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function clean(value: unknown): string {
    return String(value || '').trim();
}

function phoneDigits(value: string): string {
    return value.replace(/\D/g, '');
}

function getSessionSecret() {
    const secret = process.env.CUSTOMER_SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('CUSTOMER_SESSION_SECRET must be set to at least 32 characters.');
    }
    return secret;
}

function base64url(input: string) {
    return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64url(input: string) {
    return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(value: string) {
    return createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function createSessionToken(payload: CustomerSessionPayload) {
    const encodedPayload = base64url(JSON.stringify(payload));
    return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifySessionToken(token?: string): CustomerSessionPayload | null {
    if (!token) return null;

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) return null;

    const expected = sign(encodedPayload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
        return null;
    }

    const payload = JSON.parse(fromBase64url(encodedPayload)) as CustomerSessionPayload;
    if (!payload.partyId || !payload.phone || payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
    }

    return payload;
}

function toCustomerAccount(party: Party, body?: Partial<CustomerSessionBody>) {
    return {
        id: party.id,
        name: party.name,
        phone: party.phone,
        email: party.email || '',
        address: party.address || '',
        pincode: clean(body?.pincode),
        deliveryPreference: clean(body?.deliveryPreference) || 'Delivery required',
        wantsInstallation: Boolean(body?.wantsInstallation),
        preferredDate: clean(body?.preferredDate),
        deliverySlot: clean(body?.deliverySlot) || 'Any time',
        paymentPreference: clean(body?.paymentPreference) || 'Pay with selected method',
        paymentMode: clean(body?.paymentMode) || 'UPI',
    };
}

async function findCustomer(parties: Party[], phone: string, email: string) {
    const digits = phoneDigits(phone);
    const normalizedEmail = email.toLowerCase();

    return parties.find(party => {
        if (party.type !== 'customer') return false;
        const partyDigits = phoneDigits(party.phone);
        const phoneMatches = digits.length >= 6 && partyDigits.length >= 6 && (
            partyDigits.endsWith(digits) || digits.endsWith(partyDigits.slice(-10))
        );
        const emailMatches = normalizedEmail && (party.email || '').toLowerCase().trim() === normalizedEmail;
        return phoneMatches || emailMatches;
    }) || null;
}

export async function GET(request: Request) {
    try {
        const cookie = request.headers.get('cookie') || '';
        const token = cookie
            .split(';')
            .map(part => part.trim())
            .find(part => part.startsWith(`${COOKIE_NAME}=`))
            ?.slice(COOKIE_NAME.length + 1);
        const payload = verifySessionToken(token);
        if (!payload) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        const party = await db.parties.getById(payload.partyId);
        if (!party || party.type !== 'customer' || phoneDigits(party.phone) !== payload.phone) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        return NextResponse.json({ authenticated: true, customer: toCustomerAccount(party) });
    } catch (error) {
        console.error('Customer session fetch failed:', error);
        return NextResponse.json({ authenticated: false, message: 'Could not load customer session.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as CustomerSessionBody | null;
        const name = clean(body?.name);
        const phone = clean(body?.phone);
        const email = clean(body?.email);
        const address = clean(body?.address);

        if (!name || phoneDigits(phone).length < 10) {
            return NextResponse.json({ message: 'Customer name and valid phone number are required.' }, { status: 400 });
        }

        const parties = await db.parties.getAll();
        const existing = await findCustomer(parties, phone, email);
        const customer: Party = existing
            ? {
                ...existing,
                name,
                phone,
                email: email || existing.email,
                address: address || existing.address,
            }
            : {
                id: generateUUID(),
                name,
                type: 'customer',
                phone,
                email: email || undefined,
                address,
                balance: 0,
            };

        if (existing) await db.parties.update(customer);
        else await db.parties.add(customer);

        const now = Math.floor(Date.now() / 1000);
        const token = createSessionToken({
            partyId: customer.id,
            phone: phoneDigits(customer.phone),
            exp: now + SESSION_MAX_AGE_SECONDS,
        });

        const response = NextResponse.json({
            authenticated: true,
            customer: toCustomerAccount(customer, body || undefined),
        });
        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_MAX_AGE_SECONDS,
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('Customer session create failed:', error);
        return NextResponse.json({ message: 'Could not save customer login.' }, { status: 500 });
    }
}

export async function DELETE() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
        path: '/',
    });
    return response;
}
