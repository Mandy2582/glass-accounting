import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/serverAuth';
import { db } from '@/lib/storage';
import { generateEwayBill, isEwbConfigured, type EwbGenerateInput, type EwbItem } from '@/lib/ewayBill';

// Maps this app's internal unit strings to the NIC e-Way Bill unit-of-
// measurement codes (a short fixed list, e.g. "NOS", "SQF", "KGS"). VERIFY
// against your NIC API document's UQC code list if an order uses a unit not
// covered here -- OTH is the safe "Others" fallback.
const UNIT_TO_UQC: Record<string, string> = {
    sqft: 'SQF',
    sqm: 'SQM',
    sqin: 'SQF',
    sqyd: 'SQF',
    sheets: 'NOS',
    nos: 'NOS',
    pcs: 'NOS',
    sets: 'SET',
    pair: 'PRS',
    box: 'BOX',
    kg: 'KGS',
    g: 'GMS',
    ltr: 'LTR',
};

function toDdMmYyyy(dateStr: string): string {
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

export async function POST(request: NextRequest) {
    const authError = await requireAdminRequest(request);
    if (authError) return authError;

    if (!isEwbConfigured()) {
        return NextResponse.json({ error: 'E-Way Bill API credentials are not configured on the server (EWB_BASE_URL/EWB_GSTIN/EWB_USERNAME/EWB_PASSWORD/EWB_CLIENT_ID).' }, { status: 501 });
    }

    try {
        const body = await request.json();
        const {
            orderId,
            distance,
            transMode,
            transporterId,
            transporterName,
            vehicleNo,
            vehicleType,
            subSupplyType,
            toPincode,
            toStateCode,
        } = body;

        if (!orderId || !distance || !transMode || !toPincode || !toStateCode) {
            return NextResponse.json({ error: 'Missing required fields (orderId, distance, transMode, toPincode, toStateCode).' }, { status: 400 });
        }

        const [orders, parties, businessConfig, invoices, catalogItems] = await Promise.all([
            db.orders.getAll(),
            db.parties.getAll(),
            db.businessConfig.get(),
            db.invoices.getAll(),
            db.items.getAll(),
        ]);

        const order = orders.find(o => o.id === orderId);
        if (!order) {
            return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
        }
        if (order.ewayBillNumber) {
            return NextResponse.json({ error: `This order already has an e-Way Bill (${order.ewayBillNumber}).` }, { status: 400 });
        }
        if (!order.invoiceId) {
            return NextResponse.json({ error: 'An e-Way Bill needs a tax invoice to reference -- invoice this order first.' }, { status: 400 });
        }
        const invoice = invoices.find(i => i.id === order.invoiceId);
        if (!invoice) {
            return NextResponse.json({ error: 'Linked invoice not found.' }, { status: 404 });
        }

        const party = parties.find(p => p.id === order.partyId);
        if (!party) {
            return NextResponse.json({ error: 'Customer/supplier party not found.' }, { status: 404 });
        }
        if (!party.gstin) {
            return NextResponse.json({ error: `${party.name} has no GSTIN on file -- add one to their party record first.` }, { status: 400 });
        }
        if (!businessConfig.gstin || !businessConfig.stateCode) {
            return NextResponse.json({ error: 'Your own business GSTIN/state code is not set -- fill those in under Settings > Company Details first.' }, { status: 400 });
        }

        const itemList: EwbItem[] = order.items.map(item => {
            const catalogItem = catalogItems.find(i => i.id === item.itemId);
            const hsnCode = item.hsnCode || catalogItem?.hsnCode || businessConfig.defaultGlassHsnCode;
            if (!hsnCode) {
                throw new Error(`"${item.description || item.itemName}" has no HSN code -- set Settings > Pricing > Default HSN Code, or add one to the catalogue item.`);
            }
            const isIntraState = businessConfig.defaultGstType === 'intra_state';
            return {
                productName: item.itemName || item.description || 'Glass item',
                productDesc: item.description,
                hsnCode,
                quantity: Number(item.pieceCount ?? item.quantity) || 1,
                qtyUnit: UNIT_TO_UQC[item.unit] || 'OTH',
                taxableAmount: Number(item.amount) || 0,
                cgstRate: isIntraState ? (order.taxRate || 0) / 2 : 0,
                sgstRate: isIntraState ? (order.taxRate || 0) / 2 : 0,
                igstRate: isIntraState ? 0 : (order.taxRate || 0),
            };
        });

        const isIntraState = businessConfig.defaultGstType === 'intra_state';
        const input: EwbGenerateInput = {
            supplyType: order.type === 'sale_order' ? 'O' : 'I',
            subSupplyType: subSupplyType || '1',
            docType: 'INV',
            docNo: invoice.number,
            docDate: toDdMmYyyy(invoice.date),
            fromGstin: businessConfig.gstin,
            fromTrdName: businessConfig.businessName,
            fromAddr1: businessConfig.address,
            fromPlace: businessConfig.city,
            fromPincode: businessConfig.pincode,
            fromStateCode: Number(businessConfig.stateCode),
            toGstin: party.gstin,
            toTrdName: party.name,
            toAddr1: party.address,
            toPlace: party.address,
            toPincode: String(toPincode),
            toStateCode: Number(toStateCode),
            totalValue: invoice.total,
            cgstValue: isIntraState ? invoice.taxAmount / 2 : 0,
            sgstValue: isIntraState ? invoice.taxAmount / 2 : 0,
            igstValue: isIntraState ? 0 : invoice.taxAmount,
            transMode,
            transDistance: Number(distance),
            transporterId,
            transporterName,
            vehicleNo,
            vehicleType: vehicleType || 'R',
            itemList,
        };

        const result = await generateEwayBill(input);

        const updatedOrder = {
            ...order,
            ewayBillNumber: result.ewbNo,
            ewayBillDate: result.ewbDate,
            ewayBillValidUpto: result.validUpto,
        };
        await db.orders.update(updatedOrder);

        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('E-Way Bill generation error:', error);
        return NextResponse.json({ error: error?.message || 'Failed to generate e-Way Bill.' }, { status: 500 });
    }
}
