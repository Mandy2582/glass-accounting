import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/serverAuth';
import { isEwbConfigured, testEwbConnection } from '@/lib/ewayBill';

// Authenticate-only check, used by the Settings page "Test Connection"
// button -- confirms EWB_* env vars + NIC reachability without generating a
// real e-way bill.
export async function GET(request: NextRequest) {
    const authError = await requireAdminRequest(request);
    if (authError) return authError;

    if (!isEwbConfigured()) {
        return NextResponse.json({ ok: false, reason: 'E-Way Bill API credentials are not configured (EWB_BASE_URL/EWB_GSTIN/EWB_USERNAME/EWB_PASSWORD/EWB_CLIENT_ID).' }, { status: 200 });
    }

    const result = await testEwbConnection();
    return NextResponse.json(result);
}
