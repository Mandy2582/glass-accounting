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
import { generateUUID, roundCurrency } from '@/lib/utils';
import { withAvailableStock } from '@/lib/stockReservations';
import { isAffirmativeReply, resolveImageOrderIntent, resolveOrderIntent } from '@/lib/orderIntent';
import { findPendingConfirmationOrder, withNeedsApproval, withOrderSource } from '@/lib/orderNotes';
import { approveAndInvoiceOrder } from '@/lib/orderQuotation';
import { upsertDesignItemsInOrder } from '@/lib/orderDesignItems';
import type { CustomDesign, Order, Party, PricingConfig } from '@/types';

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

    // A quotation was already sent for a pending order from this address --
    // if this message is just a short go-ahead, approve and invoice that
    // order now instead of treating this reply as a new/separate order.
    if (isAffirmativeReply(body)) {
        const orders = await db.orders.getAll();
        const pendingOrder = findPendingConfirmationOrder(orders, 'email', email.fromAddress);
        if (pendingOrder) {
            const { invoiceId } = await approveAndInvoiceOrder(pendingOrder);
            return {
                status: 'auto_approved_from_reply',
                orderId: pendingOrder.id,
                orderNumber: pendingOrder.number,
                invoiceId,
            };
        }
    }

    const firstImage = email.attachments.find(attachment => attachment.mimeType.startsWith('image/'));

    if (firstImage) {
        return await createDraftFromEmailImage(email, firstImage, body);
    }

    const items = await withAvailableStock(await db.items.getAll());
    const parsedLines = parseWhatsAppOrderText(body, items);
    // A resolved line has a catalogue item attached, whether the stock for
    // it was actually available ('matched') or not ('out_of_stock' -- still
    // priced and named so it can go out on a quotation). Only a line with no
    // catalogue match at all falls back to unresolved review.
    const resolvedLines = parsedLines.filter(line => line.item);

    // No catalogue line matched at all -- before creating a customer + blank
    // review order for what might just be ordinary business mail, check
    // whether this even looks like an order.
    if (!resolvedLines.length) {
        const intent = await resolveOrderIntent(body, email.subject);
        if (!intent.isOrderRelated) {
            console.log(`[email-intake] Ignoring non-order email from ${email.fromAddress}: ${intent.reason}`);
            return { status: 'ignored_not_order', reason: intent.reason };
        }

        const parties = await db.parties.getAll();
        const customer = await getOrCreateCustomer(email, parties);
        const order = await createReviewOrderForEmailText(email, customer, body, parsedLines);
        return {
            status: 'text_review_created',
            orderId: order.id,
            orderNumber: order.number,
            customerId: customer.id,
            customerName: customer.name,
            matchedRows: 0,
        };
    }

    const parties = await db.parties.getAll();
    const customer = await getOrCreateCustomer(email, parties);
    const order = await saveEmailOrder({
        customer,
        email,
        originalMessage: body,
        parsedLines,
        matchedLines: resolvedLines,
        source: 'Email intake',
    });

    return {
        status: resolvedLines.some(line => line.confidence === 'out_of_stock') ? 'order_created_with_shortage' : 'order_created',
        orderId: order.id,
        orderNumber: order.number,
        customerId: customer.id,
        customerName: customer.name,
        matchedRows: resolvedLines.length,
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

    // Only a clean text_order classification is trusted for catalogue
    // matching. 'mixed' images (a drawing with scattered dimension/hardware
    // annotations) previously matched here too -- but those annotation
    // fragments ("hole for handle", "cut corner for hinge") fuzzy-match
    // against unrelated hardware names and produce a wrong, priced order.
    // Anything with real drawing content always goes to design review instead.
    if (analysis.classification === 'text_order') {
        const orderText = [
            caption,
            analysis.extractedText,
            ...analysis.orderLines.map(line => `${line.quantity || 1} ${line.unit || ''} ${line.description}`.trim()),
        ].filter(Boolean).join('\n');
        const items = await withAvailableStock(await db.items.getAll());
        const parsedLines = parseWhatsAppOrderText(orderText, items);
        const resolvedLines = parsedLines.filter(line => line.item);

        if (resolvedLines.length) {
            const parties = await db.parties.getAll();
            const customer = await getOrCreateCustomer(email, parties);
            const order = await saveEmailOrder({
                customer,
                email,
                originalMessage: orderText,
                parsedLines,
                matchedLines: resolvedLines,
                source: 'Email image order',
            });

            return {
                status: resolvedLines.some(line => line.confidence === 'out_of_stock') ? 'image_order_created_with_shortage' : 'image_order_created',
                orderId: order.id,
                orderNumber: order.number,
                customerId: customer.id,
                matchedRows: resolvedLines.length,
                total: order.total,
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
    await priceIntakeDesignOrder(order, design);

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
    parsedLines: ReturnType<typeof parseWhatsAppOrderText>
): Promise<Order> {
    const orderNumber = await db.orders.generateNextOrderNumber('sale_order');
    const generalNumber = await db.orders.generateNextGeneralNumber();
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

// Same as the WhatsApp webhook's helper: price the extracted pieces
// immediately (items + totals on the order, estimate on the design) instead
// of leaving the review order at zero until staff open and save the design.
// Intake never fails on this -- pricing problems just leave the order in the
// old zero-item state for manual completion.
async function priceIntakeDesignOrder(order: Order, design: CustomDesign): Promise<void> {
    try {
        const pricing = await db.settings.getPricing();
        const thicknessPricing = await db.settings.getThicknessPricing();
        const pricingConfig: PricingConfig = { ...pricing, thicknessPricing };
        const updatedOrder = upsertDesignItemsInOrder(order, design, pricingConfig);
        await db.orders.update(updatedOrder);

        const estimatedCost = roundCurrency((updatedOrder.items || [])
            .filter(item => item.designId === design.id)
            .reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0));
        if (estimatedCost > 0) {
            await designsDb.update({ ...design, estimatedCost });
        }
    } catch (error) {
        console.error('Failed to price intake design order:', error);
    }
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
