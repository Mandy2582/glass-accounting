import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db, designsDb } from '@/lib/storage';
import {
    getWhatsAppOrderTotals,
    parsedLineToInvoiceItem,
    parseWhatsAppOrderText,
    summarizeParsedWhatsAppLines,
} from '@/lib/whatsappOrders';
import { analyzeWhatsAppImage, buildDesignDataFromImageAnalysis, WhatsAppImageAnalysis } from '@/lib/whatsappVision';
import { generateUUID } from '@/lib/utils';
import { hasSufficientAvailableStock, withAvailableStock } from '@/lib/stockReservations';
import { resolveImageOrderIntent, resolveOrderIntent } from '@/lib/orderIntent';
import { withNeedsApproval, withOrderSource } from '@/lib/orderNotes';
import type { CustomDesign, Order, Party } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IncomingEmailAttachment = {
    filename?: string;
    mimeType: string;
    base64: string;
};

type IncomingEmail = {
    messageId: string;
    fromAddress: string;
    fromName?: string;
    subject?: string;
    text: string;
    attachments: IncomingEmailAttachment[];
};

export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let email: IncomingEmail;
    try {
        email = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    if (!email.messageId || !email.fromAddress) {
        return NextResponse.json({ error: 'messageId and fromAddress are required.' }, { status: 400 });
    }

    try {
        const result = await createOrderFromEmail(email);
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error('Email order intake failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

function isAuthorized(request: NextRequest): boolean {
    const expected = process.env.EMAIL_INTAKE_SECRET;
    if (!expected) return false;

    const provided = request.headers.get('x-email-intake-secret') || '';
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);

    return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

async function createOrderFromEmail(email: IncomingEmail) {
    const duplicate = await findExistingEmailOrder(email.messageId);
    if (duplicate) {
        return { status: 'duplicate', orderId: duplicate.id, orderNumber: duplicate.number };
    }

    const body = email.text.trim();
    const firstImage = email.attachments.find(attachment => attachment.mimeType.startsWith('image/'));

    if (firstImage) {
        return await createDraftFromEmailImage(email, firstImage, body);
    }

    const items = await withAvailableStock(await db.items.getAll());
    const parsedLines = parseWhatsAppOrderText(body, items);
    const matchedLines = parsedLines.filter(line => line.item);

    // No catalogue line matched at all -- before creating a customer + blank
    // review order for what might just be ordinary business mail, check
    // whether this even looks like an order.
    if (!matchedLines.length) {
        const intent = await resolveOrderIntent(body, email.subject);
        if (!intent.isOrderRelated) {
            console.log(`[email-intake] Ignoring non-order email from ${email.fromAddress}: ${intent.reason}`);
            return { status: 'ignored_not_order', reason: intent.reason };
        }
    }

    const parties = await db.parties.getAll();
    const customer = await getOrCreateCustomer(email, parties);
    const stockShortLines = matchedLines.filter(line => !hasSufficientAvailableStock(line.item!, line.quantity, line.unit));

    if (!matchedLines.length || stockShortLines.length > 0) {
        const order = await createReviewOrderForEmailText(email, customer, body, parsedLines, stockShortLines);
        return {
            status: stockShortLines.length > 0 ? 'stock_review_created' : 'text_review_created',
            orderId: order.id,
            orderNumber: order.number,
            customerId: customer.id,
            customerName: customer.name,
            matchedRows: 0,
        };
    }

    const order = await saveEmailOrder({
        customer,
        email,
        originalMessage: body,
        parsedLines,
        matchedLines,
        source: 'Email intake',
    });

    return {
        status: 'order_created',
        orderId: order.id,
        orderNumber: order.number,
        customerId: customer.id,
        customerName: customer.name,
        matchedRows: matchedLines.length,
        total: order.total,
    };
}

async function createDraftFromEmailImage(
    email: IncomingEmail,
    image: IncomingEmailAttachment,
    caption: string
) {
    const analysis = await analyzeWhatsAppImage({
        imageDataUrl: `data:${image.mimeType};base64,${image.base64}`,
        caption,
        fromPhone: email.fromAddress,
    });

    if (analysis.classification === 'text_order' || (analysis.classification === 'mixed' && analysis.orderLines.length > 0)) {
        const orderText = [
            caption,
            analysis.extractedText,
            ...analysis.orderLines.map(line => `${line.quantity || 1} ${line.unit || ''} ${line.description}`.trim()),
        ].filter(Boolean).join('\n');
        const items = await withAvailableStock(await db.items.getAll());
        const parsedLines = parseWhatsAppOrderText(orderText, items);
        const matchedLines = parsedLines.filter(line => line.item);
        const stockShortLines = matchedLines.filter(line => !hasSufficientAvailableStock(line.item!, line.quantity, line.unit));

        if (matchedLines.length && stockShortLines.length === 0) {
            const parties = await db.parties.getAll();
            const customer = await getOrCreateCustomer(email, parties);
            const order = await saveEmailOrder({
                customer,
                email,
                originalMessage: orderText,
                parsedLines,
                matchedLines,
                source: 'Email image order',
            });

            return {
                status: 'image_order_created',
                orderId: order.id,
                orderNumber: order.number,
                customerId: customer.id,
                matchedRows: matchedLines.length,
                total: order.total,
                confidence: analysis.confidence,
            };
        }

        if (matchedLines.length && stockShortLines.length > 0) {
            const parties = await db.parties.getAll();
            const customer = await getOrCreateCustomer(email, parties);
            const order = await createReviewOrderForEmailText(email, customer, orderText, parsedLines, stockShortLines);
            return {
                status: 'stock_review_created',
                orderId: order.id,
                orderNumber: order.number,
                customerId: customer.id,
                matchedRows: 0,
                confidence: analysis.confidence,
            };
        }
    }

    const intent = resolveImageOrderIntent({
        classification: analysis.classification,
        confidence: analysis.confidence,
        caption,
        extractedText: analysis.extractedText,
        analysisFailed: analysis.analysisFailed,
    });

    if (!intent.isOrderRelated) {
        console.log(`[email-intake] Ignoring non-order image email from ${email.fromAddress}: ${intent.reason}`);
        return { status: 'ignored_not_order', reason: intent.reason };
    }

    const parties = await db.parties.getAll();
    const customer = await getOrCreateCustomer(email, parties);
    const order = await createReviewOrderForEmailImage(email, customer, analysis, caption);
    const design = await createDesignDraftForEmailImage(order, customer, analysis, email.messageId, caption);

    return {
        status: 'drawing_review_created',
        orderId: order.id,
        orderNumber: order.number,
        designId: design.id,
        customerId: customer.id,
        confidence: analysis.confidence,
    };
}

async function saveEmailOrder(input: {
    customer: Party;
    email: IncomingEmail;
    originalMessage: string;
    parsedLines: ReturnType<typeof parseWhatsAppOrderText>;
    matchedLines: ReturnType<typeof parseWhatsAppOrderText>;
    source: string;
}): Promise<Order> {
    const orderItems = input.matchedLines.map(parsedLineToInvoiceItem);
    const totals = getWhatsAppOrderTotals(input.matchedLines);
    const orderNumber = await db.orders.generateNextOrderNumber('sale_order');
    const generalNumber = await db.orders.generateNextGeneralNumber();
    const order: Order = {
        id: generateUUID(),
        type: 'sale_order',
        number: orderNumber,
        generalNumber,
        soNumber: orderNumber,
        date: new Date().toISOString().slice(0, 10),
        partyId: input.customer.id,
        partyName: input.customer.name,
        items: orderItems,
        subtotal: totals.subtotal,
        taxRate: 18,
        taxAmount: totals.taxAmount,
        total: totals.total,
        status: 'pending',
        notes: withNeedsApproval(withOrderSource([
            `Created automatically from ${input.source}.`,
            `Email Message ID: ${input.email.messageId}`,
            `Email From: ${input.email.fromName ? `${input.email.fromName} <${input.email.fromAddress}>` : input.email.fromAddress}`,
            input.email.subject ? `Subject: ${input.email.subject}` : '',
            '',
            'Original message:',
            input.originalMessage,
            '',
            'Parsed rows:',
            summarizeParsedWhatsAppLines(input.parsedLines),
        ].filter(Boolean).join('\n'), 'email')),
        paidAmount: 0,
        paymentStatus: 'unpaid',
    };

    await db.orders.add(order);
    return order;
}

async function createReviewOrderForEmailText(
    email: IncomingEmail,
    customer: Party,
    originalMessage: string,
    parsedLines: ReturnType<typeof parseWhatsAppOrderText>,
    stockShortLines: ReturnType<typeof parseWhatsAppOrderText> = []
): Promise<Order> {
    const orderNumber = await db.orders.generateNextOrderNumber('sale_order');
    const generalNumber = await db.orders.generateNextGeneralNumber();
    const stockNote = stockShortLines.length
        ? [
            '',
            'Stock issue -- requested quantity exceeds what is currently available (accounting for other open orders):',
            ...stockShortLines.map(line => `- ${line.item?.name || line.raw}: requested ${line.quantity} ${line.unit}, available ${line.item?.stock ?? 0} ${line.item?.unit || line.unit}`),
        ].join('\n')
        : '';
    const order: Order = {
        id: generateUUID(),
        type: 'sale_order',
        number: orderNumber,
        generalNumber,
        soNumber: orderNumber,
        date: new Date().toISOString().slice(0, 10),
        partyId: customer.id,
        partyName: customer.name,
        items: [],
        subtotal: 0,
        taxRate: 18,
        taxAmount: 0,
        total: 0,
        status: 'pending',
        notes: withNeedsApproval(withOrderSource([
            'Created from emailed order text for staff review.',
            `Email Message ID: ${email.messageId}`,
            `Email From: ${email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}`,
            email.subject ? `Subject: ${email.subject}` : '',
            '',
            'Original message:',
            originalMessage,
            '',
            'Parsed rows:',
            summarizeParsedWhatsAppLines(parsedLines),
            stockNote,
        ].filter(Boolean).join('\n'), 'email')),
        paidAmount: 0,
        paymentStatus: 'unpaid',
    };

    await db.orders.add(order);
    return order;
}

async function createReviewOrderForEmailImage(
    email: IncomingEmail,
    customer: Party,
    analysis: WhatsAppImageAnalysis,
    caption: string
): Promise<Order> {
    const orderNumber = await db.orders.generateNextOrderNumber('sale_order');
    const generalNumber = await db.orders.generateNextGeneralNumber();
    const order: Order = {
        id: generateUUID(),
        type: 'sale_order',
        number: orderNumber,
        generalNumber,
        soNumber: orderNumber,
        requiresDesign: true,
        date: new Date().toISOString().slice(0, 10),
        partyId: customer.id,
        partyName: customer.name,
        items: [],
        subtotal: 0,
        taxRate: 18,
        taxAmount: 0,
        total: 0,
        status: 'pending',
        notes: withNeedsApproval(withOrderSource([
            'Created from emailed image/drawing for manual design review.',
            `Email Message ID: ${email.messageId}`,
            `Email From: ${email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}`,
            email.subject ? `Subject: ${email.subject}` : '',
            `Vision Classification: ${analysis.classification}`,
            `Vision Confidence: ${analysis.confidence}`,
            caption ? `Caption:\n${caption}` : '',
            analysis.extractedText ? `Extracted text:\n${analysis.extractedText}` : '',
            analysis.drawing.notes ? `Drawing notes:\n${analysis.drawing.notes}` : '',
        ].filter(Boolean).join('\n\n'), 'email')),
        paidAmount: 0,
        paymentStatus: 'unpaid',
    };

    await db.orders.add(order);
    return order;
}

async function createDesignDraftForEmailImage(
    order: Order,
    customer: Party,
    analysis: WhatsAppImageAnalysis,
    messageId: string,
    caption: string
): Promise<CustomDesign> {
    const designData = buildDesignDataFromImageAnalysis(analysis);
    const design: CustomDesign = {
        id: generateUUID(),
        name: `Email Drawing - ${order.number}`,
        customerId: customer.id,
        customerName: customer.name,
        drawingData: designData.drawingData,
        baseShape: 'email-image',
        totalArea: designData.totalArea,
        grossArea: designData.grossArea,
        holes: designData.holes,
        cuts: designData.cuts,
        complexityLevel: 'medium',
        baseRate: 0,
        complexityCharge: 0,
        edgeFinishingCharge: 0,
        estimatedCost: 0,
        status: 'draft',
        createdDate: new Date().toISOString().slice(0, 10),
        notes: [
            'Imported from emailed image/drawing.',
            `Email Message ID: ${messageId}`,
            caption ? `Caption: ${caption}` : '',
            'Review dimensions and redraw/adjust on canvas before approval.',
        ].filter(Boolean).join('\n'),
        orderId: order.id,
    };

    await designsDb.add(design);
    return design;
}

async function findExistingEmailOrder(messageId: string): Promise<Order | null> {
    const marker = `Email Message ID: ${messageId}`;
    const orders = await db.orders.getAll();
    return orders.find(order => order.notes?.includes(marker)) || null;
}

async function getOrCreateCustomer(email: IncomingEmail, parties: Party[]): Promise<Party> {
    const address = email.fromAddress.toLowerCase().trim();
    const existing = parties.find(party => party.type === 'customer' && (party.email || '').toLowerCase().trim() === address);

    if (existing) return existing;

    const newParty: Party = {
        id: generateUUID(),
        name: email.fromName?.trim() || address,
        type: 'customer',
        phone: '',
        email: address,
        address: '',
        balance: 0,
    };

    await db.parties.add(newParty);
    return newParty;
}
