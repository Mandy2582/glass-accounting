import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/serverAuth';
import { db } from '@/lib/storage';
import { generateEwayBill, isEwbConfigured, type EwbGenerateInput, type EwbItem, type EwbPartyDetails } from '@/lib/ewayBill';

// Maps this app's internal unit strings to ClearTax's 3-char UQC unit
// codes. VERIFY against ClearTax's unit code list if an order uses a unit
// not covered here -- OTH is the safe "Others" fallback.
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
        return NextResponse.json({ error: 'ClearTax e-Way Bill credentials are not configured on the server (CLEARTAX_BASE_URL/CLEARTAX_AUTH_TOKEN/EWB_GSTIN).' }, { status: 501 });
    }

    try {
        const body = await request.json();
        const {
            orderId,
            distance,
            transMode, // 'ROAD' | 'RAIL' | 'AIR' | 'SHIP'
            transporterId,
            transporterName,
            vehicleNo,
            vehicleType, // 'REGULAR' | 'ODC'
            subSupplyType,
            toPincode,
            toStateCode,
            toPlace,
        } = body;

        if (!orderId || !distance || !transMode || !toPincode || !toStateCode || !toPlace) {
            return NextResponse.json({ error: 'Missing required fields (orderId, distance, transMode, toPincode, toStateCode, toPlace).' }, { status: 400 });
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

        const isIntraState = businessConfig.defaultGstType === 'intra_state';

        const itemList: EwbItem[] = order.items.map(item => {
            const catalogItem = catalogItems.find(i => i.id === item.itemId);
            const hsnCode = item.hsnCode || catalogItem?.hsnCode || businessConfig.defaultGlassHsnCode;
            if (!hsnCode) {
                throw new Error(`"${item.description || item.itemName}" has no HSN code -- set Settings > Company Details > Default Glass HSN Code, or add one to the catalogue item.`);
            }
            return {
                productName: item.itemName || item.description || 'Glass item',
                productDesc: item.description,
                hsnCode,
                quantity: Number(item.pieceCount ?? item.quantity) || 1,
                unit: UNIT_TO_UQC[item.unit] || 'OTH',
                taxableAmount: Number(item.amount) || 0,
                cgstRate: isIntraState ? (order.taxRate || 0) / 2 : 0,
                sgstRate: isIntraState ? (order.taxRate || 0) / 2 : 0,
                igstRate: isIntraState ? 0 : (order.taxRate || 0),
            };
        });

        const ourDetails: EwbPartyDetails = {
            gstin: businessConfig.gstin,
            legalName: businessConfig.businessName,
            addr1: businessConfig.address,
            place: businessConfig.city,
            pincode: Number(businessConfig.pincode),
            stateCode: businessConfig.stateCode,
        };
        const partyDetails: EwbPartyDetails = {
            gstin: party.gstin,
            legalName: party.name,
            addr1: party.address,
            place: String(toPlace),
            pincode: Number(toPincode),
            stateCode: String(toStateCode),
        };

        // Goods flow outward from us on a sale order, inward to us on a
        // purchase order -- SellerDtls/BuyerDtls (and supplyType) flip
        // accordingly rather than always assuming "we are the seller".
        const isSaleOrder = order.type === 'sale_order';

        const input: EwbGenerateInput = {
            documentNumber: invoice.number,
            documentType: 'INV',
            documentDate: toDdMmYyyy(invoice.date),
            supplyType: isSaleOrder ? 'OUTWARD' : 'INWARD',
            subSupplyType: subSupplyType || 'SUPPLY',
            transactionType: 'Regular',
            seller: isSaleOrder ? ourDetails : partyDetails,
            buyer: isSaleOrder ? partyDetails : ourDetails,
            totalInvoiceAmount: invoice.total,
            totalCgstAmount: isIntraState ? invoice.taxAmount / 2 : 0,
            totalSgstAmount: isIntraState ? invoice.taxAmount / 2 : 0,
            totalIgstAmount: isIntraState ? 0 : invoice.taxAmount,
            totalAssessableAmount: invoice.subtotal,
            transporterId,
            transporterName,
            transMode,
            distance: Number(distance),
            vehicleNo,
            vehicleType: vehicleType || 'REGULAR',
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
