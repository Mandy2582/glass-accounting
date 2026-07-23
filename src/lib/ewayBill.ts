import crypto from 'crypto';

// GST e-Way Bill (NIC "Direct API" for taxpayers, not via a GSP) client.
//
// IMPORTANT -- this has never been run against the real NIC API. NIC issues
// a specific integration document (PDF + Postman collection) once "Direct
// API" access is registered on the e-Way Bill portal (Registration > For
// GSP), and the exact endpoint paths / field names below are written from
// the commonly-published spec (v1.03) but MUST be checked against that
// document before relying on this in production. Everything wire-format
// related is kept in this one file so a mismatch is a small, isolated fix
// here rather than something scattered across the app.
//
// Flow: authenticate() gets a short-lived authToken + session encryption
// key (sek); generateEwayBill() encrypts the request payload with that sek
// and decrypts the response the same way. Both steps use AES-256-ECB with
// the registered app_key as the key -- NIC's spec calls this out explicitly
// (no IV, since ECB doesn't use one; PKCS5/7 padding).

const BASE_URL = process.env.EWB_BASE_URL || '';
const GSTIN = process.env.EWB_GSTIN || '';
const USERNAME = process.env.EWB_USERNAME || '';
const PASSWORD = process.env.EWB_PASSWORD || '';
const APP_KEY = process.env.EWB_CLIENT_ID || ''; // a.k.a. client_id / app key issued at registration

export function isEwbConfigured(): boolean {
    return Boolean(BASE_URL && GSTIN && USERNAME && PASSWORD && APP_KEY);
}

function aesKeyFromAppKey(appKey: string): Buffer {
    // NIC's app_key is issued as a base64 string that decodes to 32 raw
    // bytes (AES-256). If your registration document specifies a different
    // encoding (e.g. hex, or the key used directly as UTF-8 bytes), this is
    // the one line to change.
    return Buffer.from(appKey, 'base64');
}

function aesEncrypt(plainText: string, appKey: string): string {
    const key = aesKeyFromAppKey(appKey);
    const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]).toString('base64');
}

function aesDecrypt(cipherTextBase64: string, appKey: string): string {
    const key = aesKeyFromAppKey(appKey);
    const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(Buffer.from(cipherTextBase64, 'base64')), decipher.final()]).toString('utf8');
}

type EwbSession = { authToken: string; sek: string; expiresAt: number };
let cachedSession: EwbSession | null = null;

async function authenticate(): Promise<EwbSession> {
    if (!isEwbConfigured()) {
        throw new Error('E-Way Bill API is not configured (EWB_BASE_URL/EWB_GSTIN/EWB_USERNAME/EWB_PASSWORD/EWB_CLIENT_ID).');
    }
    if (cachedSession && cachedSession.expiresAt > Date.now()) {
        return cachedSession;
    }

    const encryptedPassword = aesEncrypt(PASSWORD, APP_KEY);

    // VERIFY: exact path/field names against your NIC API document.
    const res = await fetch(`${BASE_URL}/ewaybillapi/v1.03/auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            gstin: GSTIN,
            username: USERNAME,
            'client-id': APP_KEY,
        },
        body: JSON.stringify({
            action: 'ACCESSTOKEN',
            username: USERNAME,
            password: encryptedPassword,
            app_key: APP_KEY,
        }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== '1' || !data.authtoken) {
        throw new Error(data?.message || data?.error || 'E-Way Bill authentication failed.');
    }

    const sek = aesDecrypt(data.sek, APP_KEY);
    // NIC's authtoken is typically valid ~6 hours; refresh a little early.
    const expiresAt = Date.now() + 5 * 60 * 60 * 1000;
    cachedSession = { authToken: data.authtoken, sek, expiresAt };
    return cachedSession;
}

export interface EwbItem {
    productName: string;
    productDesc?: string;
    hsnCode: string;
    quantity: number;
    qtyUnit: string; // NIC unit code, e.g. "SQF", "NOS", "PCS"
    taxableAmount: number;
    cgstRate?: number;
    sgstRate?: number;
    igstRate?: number;
    cessRate?: number;
}

export interface EwbGenerateInput {
    supplyType: 'O' | 'I'; // Outward / Inward
    subSupplyType: string; // "1" = Supply, "3" = Job Work, etc. -- see NIC's code list
    docType: 'INV' | 'BIL' | 'CHL';
    docNo: string;
    docDate: string; // dd/mm/yyyy

    fromGstin: string;
    fromTrdName: string;
    fromAddr1: string;
    fromPlace: string;
    fromPincode: string;
    fromStateCode: number;

    toGstin: string;
    toTrdName: string;
    toAddr1: string;
    toPlace: string;
    toPincode: string;
    toStateCode: number;

    totalValue: number;
    cgstValue?: number;
    sgstValue?: number;
    igstValue?: number;
    cessValue?: number;

    transMode: '1' | '2' | '3' | '4'; // Road / Rail / Air / Ship
    transDistance: number;
    transporterId?: string;
    transporterName?: string;
    transDocNo?: string;
    transDocDate?: string;
    vehicleNo?: string;
    vehicleType?: 'R' | 'O'; // Regular / Over dimensional cargo

    itemList: EwbItem[];
}

export interface EwbGenerateResult {
    ewbNo: string;
    ewbDate: string;
    validUpto: string;
}

export async function generateEwayBill(input: EwbGenerateInput): Promise<EwbGenerateResult> {
    const session = await authenticate();

    // VERIFY: exact field names/shape against your NIC API document -- this
    // maps 1:1 to the commonly-published EWB "GENEWAYBILL" request schema.
    const payload = {
        supplyType: input.supplyType,
        subSupplyType: input.subSupplyType,
        docType: input.docType,
        docNo: input.docNo,
        docDate: input.docDate,
        fromGstin: input.fromGstin,
        fromTrdName: input.fromTrdName,
        fromAddr1: input.fromAddr1,
        fromPlace: input.fromPlace,
        fromPincode: Number(input.fromPincode),
        fromStateCode: input.fromStateCode,
        actFromStateCode: input.fromStateCode,
        toGstin: input.toGstin,
        toTrdName: input.toTrdName,
        toAddr1: input.toAddr1,
        toPlace: input.toPlace,
        toPincode: Number(input.toPincode),
        toStateCode: input.toStateCode,
        actToStateCode: input.toStateCode,
        totalValue: input.totalValue,
        cgstValue: input.cgstValue || 0,
        sgstValue: input.sgstValue || 0,
        igstValue: input.igstValue || 0,
        cessValue: input.cessValue || 0,
        totInvValue: input.totalValue,
        transMode: input.transMode,
        transDistance: String(input.transDistance),
        transporterId: input.transporterId || '',
        transporterName: input.transporterName || '',
        transDocNo: input.transDocNo || '',
        transDocDate: input.transDocDate || '',
        vehicleNo: input.vehicleNo || '',
        vehicleType: input.vehicleType || 'R',
        itemList: input.itemList.map((item, index) => ({
            itemNo: index + 1,
            productName: item.productName,
            productDesc: item.productDesc || item.productName,
            hsnCode: item.hsnCode,
            quantity: item.quantity,
            qtyUnit: item.qtyUnit,
            taxableAmount: item.taxableAmount,
            cgstRate: item.cgstRate || 0,
            sgstRate: item.sgstRate || 0,
            igstRate: item.igstRate || 0,
            cessRate: item.cessRate || 0,
        })),
    };

    const encryptedData = aesEncrypt(JSON.stringify(payload), session.sek);

    const res = await fetch(`${BASE_URL}/ewaybillapi/v1.03/ewayapi`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            gstin: GSTIN,
            authtoken: session.authToken,
        },
        body: JSON.stringify({ action: 'GENEWAYBILL', data: encryptedData }),
    });

    const responseBody = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(responseBody?.message || responseBody?.error || 'E-Way Bill generation request failed.');
    }

    const decrypted = responseBody.data ? JSON.parse(aesDecrypt(responseBody.data, session.sek)) : responseBody;
    if (decrypted.status !== '1' && decrypted.success !== true) {
        const errorMessage = decrypted.error?.message || decrypted.message || 'E-Way Bill generation failed.';
        throw new Error(errorMessage);
    }

    return {
        ewbNo: String(decrypted.ewayBillNo ?? decrypted.ewbNo),
        ewbDate: String(decrypted.ewayBillDate ?? decrypted.ewbDate),
        validUpto: String(decrypted.validUpto),
    };
}

// Authenticate-only check for a "Test Connection" button in Settings --
// confirms credentials + reachability without generating a real e-way bill.
export async function testEwbConnection(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
        await authenticate();
        return { ok: true };
    } catch (error: any) {
        return { ok: false, reason: error?.message || 'Connection test failed.' };
    }
}
