// GST e-Way Bill via ClearTax's e-Invoicing/E-Waybill API (acting as GSP,
// using your NIC e-Way Bill portal login stored against your ClearTax
// account -- the same credentials Tally's e-Way Bill feature uses,
// registered separately with ClearTax rather than reused directly).
//
// One-time account setup (done once in ClearTax's dashboard/API, not by
// this app): onboard your GSTIN (POST /einv/v1/gstin) and store your NIC
// portal username/password against it (POST
// /einv/v2/nic_credentials/store_nic_credentials) -- ClearTax then uses
// those to talk to NIC on your behalf. This file only calls the actual
// e-way bill generation endpoint.
//
// Sourced from ClearTax's published docs (docs.cleartax.in) as of this
// writing:
// https://docs.cleartax.in/cleartax-docs/e-invoicing-api/e-invoicing-api-reference/cleartax-e-invoicing-apis-xml-schema/e-waybills-apis/generate-an-e-waybill-for-non-irn-documents
// A few enum strings below (SUPPLY/OUTWARD/ROAD/REGULAR/Combination) are
// confirmed from ClearTax's own request/response examples; anything not
// directly quoted there (e.g. less-common sub-supply types) is marked
// VERIFY and should be checked against the docs (or ClearTax support)
// before relying on it.

const BASE_URL = process.env.CLEARTAX_BASE_URL || 'https://api.clear.in';
const AUTH_TOKEN = process.env.CLEARTAX_AUTH_TOKEN || '';
const GSTIN = process.env.EWB_GSTIN || '';

export function isEwbConfigured(): boolean {
    return Boolean(BASE_URL && AUTH_TOKEN && GSTIN);
}

export interface EwbPartyDetails {
    gstin: string; // or "URP" for an unregistered party
    legalName: string;
    tradeName?: string;
    addr1: string;
    addr2?: string;
    place: string;
    pincode: number;
    stateCode: string; // 2-char GST state code
}

export interface EwbItem {
    productName?: string;
    productDesc?: string;
    hsnCode: string;
    quantity: number;
    unit: string; // 3-char ClearTax unit code, e.g. "SQF", "NOS", "BAG"
    taxableAmount: number;
    cgstRate?: number;
    sgstRate?: number;
    igstRate?: number;
}

export interface EwbGenerateInput {
    documentNumber: string;
    documentType: 'INV' | 'BOS' | 'BOE' | 'CHL' | 'OTH';
    documentDate: string; // dd/mm/yyyy
    supplyType: 'OUTWARD' | 'INWARD';
    // VERIFY: only "SUPPLY" is confirmed directly from ClearTax's own
    // example payload -- other sub-supply types (export/job work/etc)
    // should be checked against their docs/support before use.
    subSupplyType: string;
    transactionType: 'Regular' | 'Combination';

    seller: EwbPartyDetails;
    buyer: EwbPartyDetails;

    totalInvoiceAmount: number;
    totalCgstAmount: number;
    totalSgstAmount: number;
    totalIgstAmount: number;
    totalAssessableAmount: number;

    transporterId?: string;
    transporterName?: string;
    transMode: 'ROAD' | 'RAIL' | 'AIR' | 'SHIP';
    distance: number;
    transDocNo?: string;
    transDocDate?: string;
    vehicleNo?: string;
    vehicleType?: 'REGULAR' | 'ODC';

    itemList: EwbItem[];
}

export interface EwbGenerateResult {
    ewbNo: string;
    ewbDate: string;
    validUpto: string;
}

function partyPayload(p: EwbPartyDetails) {
    return {
        Gstin: p.gstin,
        LglNm: p.legalName,
        TrdNm: p.tradeName,
        Addr1: p.addr1,
        Addr2: p.addr2 || null,
        Loc: p.place,
        Pin: p.pincode,
        Stcd: p.stateCode,
    };
}

export async function generateEwayBill(input: EwbGenerateInput): Promise<EwbGenerateResult> {
    if (!isEwbConfigured()) {
        throw new Error('ClearTax e-Way Bill API is not configured (CLEARTAX_BASE_URL/CLEARTAX_AUTH_TOKEN/EWB_GSTIN).');
    }

    const payload = {
        DocumentNumber: input.documentNumber,
        DocumentType: input.documentType,
        DocumentDate: input.documentDate,
        SupplyType: input.supplyType,
        SubSupplyType: input.subSupplyType,
        TransactionType: input.transactionType,
        SellerDtls: partyPayload(input.seller),
        BuyerDtls: partyPayload(input.buyer),
        ItemList: input.itemList.map(item => ({
            ProdName: item.productName,
            ProdDesc: item.productDesc,
            HsnCd: item.hsnCode,
            Qty: item.quantity,
            Unit: item.unit,
            AssAmt: item.taxableAmount,
            CgstRt: item.cgstRate || 0,
            CgstAmt: item.cgstRate ? Math.round(item.taxableAmount * (item.cgstRate / 100) * 100) / 100 : 0,
            SgstRt: item.sgstRate || 0,
            SgstAmt: item.sgstRate ? Math.round(item.taxableAmount * (item.sgstRate / 100) * 100) / 100 : 0,
            IgstRt: item.igstRate || 0,
            IgstAmt: item.igstRate ? Math.round(item.taxableAmount * (item.igstRate / 100) * 100) / 100 : 0,
            CesRt: 0,
            CesAmt: 0,
            CesNonAdvAmt: 0,
            OthChrg: 0,
        })),
        TotalInvoiceAmount: input.totalInvoiceAmount,
        TotalCgstAmount: input.totalCgstAmount,
        TotalSgstAmount: input.totalSgstAmount,
        TotalIgstAmount: input.totalIgstAmount,
        TotalCessAmount: 0,
        TotalCessNonAdvolAmount: 0,
        TotalAssessableAmount: input.totalAssessableAmount,
        OtherAmount: 0,
        OtherTcsAmount: 0,
        TransId: input.transporterId || undefined,
        TransName: input.transporterName || undefined,
        TransMode: input.transMode,
        Distance: input.distance,
        TransDocNo: input.transDocNo || undefined,
        TransDocDt: input.transDocDate || undefined,
        VehNo: input.vehicleNo || undefined,
        VehType: input.vehicleType || 'REGULAR',
    };

    const res = await fetch(`${BASE_URL}/einv/v3/ewaybill/generate`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Cleartax-Auth-Token': AUTH_TOKEN,
            gstin: GSTIN,
        },
        body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || `ClearTax API request failed (HTTP ${res.status}).`);
    }

    const govtResponse = data.govt_response || {};
    if (govtResponse.Success !== 'Y') {
        const firstError = govtResponse.ErrorDetails?.[0];
        throw new Error(firstError?.error_message || data?.ewb_status || 'E-Way Bill generation failed.');
    }

    return {
        ewbNo: String(govtResponse.EwbNo),
        ewbDate: String(govtResponse.EwbDt),
        validUpto: String(govtResponse.EwbValidTill),
    };
}

// Lightweight reachability/credentials check for a "Test Connection"
// button -- ClearTax has no dedicated ping endpoint documented, so this
// calls the real generate endpoint with a request built to fail GST
// validation (an all-zero taxable amount) rather than actually create a
// bill; a 401/403 means bad credentials, anything else (even a validation
// error from NIC) means the connection itself is working.
export async function testEwbConnection(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!isEwbConfigured()) {
        return { ok: false, reason: 'CLEARTAX_BASE_URL/CLEARTAX_AUTH_TOKEN/EWB_GSTIN are not set.' };
    }
    try {
        const res = await fetch(`${BASE_URL}/einv/v1/gstin`, {
            method: 'GET',
            headers: { 'X-Cleartax-Auth-Token': AUTH_TOKEN, gstin: GSTIN },
        });
        if (res.status === 401 || res.status === 403) {
            return { ok: false, reason: 'Authentication failed -- check CLEARTAX_AUTH_TOKEN and that this GSTIN is onboarded with ClearTax.' };
        }
        return { ok: true };
    } catch (error: any) {
        return { ok: false, reason: error?.message || 'Could not reach ClearTax.' };
    }
}
