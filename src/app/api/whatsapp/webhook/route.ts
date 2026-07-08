import { createHmac, timingSafeEqual } from 'crypto';
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
import type { CustomDesign, Order, Party } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WhatsAppMessage = {
    id: string;
    from: string;
    timestamp?: string;
    type: 'text' | 'image' | string;
    text?: { body?: string };
    image?: {
        id?: string;
        mime_type?: string;
        sha256?: string;
        caption?: string;
    };
};

type WhatsAppContact = {
    wa_id?: string;
    profile?: { name?: string };
};

type WhatsAppMessageEvent = {
    message: WhatsAppMessage;
    contact?: WhatsAppContact;
};

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
        return NextResponse.json(
            { error: 'WHATSAPP_VERIFY_TOKEN is not configured.' },
            { status: 500 }
        );
    }

    if (mode === 'subscribe' && token === verifyToken && challenge) {
        return new NextResponse(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
        });
    }

    return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 });
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    if (!isValidSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
        return NextResponse.json({ error: 'Invalid WhatsApp webhook signature.' }, { status: 401 });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const events = extractMessageEvents(payload);
    const results = [];

    for (const event of events) {
        try {
            results.push(await createOrderFromWhatsAppEvent(event));
        } catch (error) {
            console.error('WhatsApp order creation failed:', error);
            results.push({
                messageId: event.message.id,
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return NextResponse.json({
        success: true,
        processed: results.length,
        results,
    });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) return true;
    if (!signatureHeader?.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signatureHeader.replace('sha256=', '');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');

    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function extractMessageEvents(payload: any): WhatsAppMessageEvent[] {
    const events: WhatsAppMessageEvent[] = [];

    for (const entry of payload?.entry || []) {
        for (const change of entry?.changes || []) {
            const value = change?.value;
            const contacts: WhatsAppContact[] = value?.contacts || [];

            for (const message of value?.messages || []) {
                if (message?.type === 'text' && !message?.text?.body) continue;
                if (message?.type === 'image' && !message?.image?.id) continue;
                if (!['text', 'image'].includes(message?.type)) continue;
                const contact = contacts.find(candidate => candidate.wa_id === message.from);
                events.push({ message, contact });
            }
        }
    }

    return events;
}

async function createOrderFromWhatsAppEvent(event: WhatsAppMessageEvent) {
    const messageId = event.message.id;
    const body = event.message.text?.body?.trim() || event.message.image?.caption?.trim() || '';
    const duplicate = await findExistingWhatsAppOrder(messageId);

    if (duplicate) {
        return {
            messageId,
            status: 'duplicate',
            orderId: duplicate.id,
            orderNumber: duplicate.number,
        };
    }

    const parties = await db.parties.getAll();
    const customer = await getOrCreateCustomer(event, parties);

    if (event.message.type === 'image') {
        return await createDraftFromWhatsAppImage(event, customer, body);
    }

    const items = await db.items.getAll();
    const parsedLines = parseWhatsAppOrderText(body, items);
    const matchedLines = parsedLines.filter(line => line.item);

    if (!matchedLines.length) {
        return {
            messageId,
            status: 'needs_review',
            customerId: customer.id,
            customerName: customer.name,
            matchedRows: 0,
        };
    }

    const order = await saveWhatsAppOrder({
        customer,
        messageId,
        from: event.message.from,
        originalMessage: body,
        parsedLines,
        matchedLines,
        source: 'WhatsApp Business webhook',
    });

    return {
        messageId,
        status: 'order_created',
        orderId: order.id,
        orderNumber: order.number,
        customerId: customer.id,
        customerName: customer.name,
        matchedRows: matchedLines.length,
        total: order.total,
    };
}

async function createDraftFromWhatsAppImage(event: WhatsAppMessageEvent, customer: Party, caption: string) {
    const media = await downloadWhatsAppMedia(event.message.image?.id || '');
    const analysis = media
        ? await analyzeWhatsAppImage({
            imageDataUrl: `data:${media.mimeType};base64,${media.base64}`,
            caption,
            fromPhone: event.message.from,
        })
        : imageFallbackAnalysis(caption);

    if (analysis.classification === 'text_order' || (analysis.classification === 'mixed' && analysis.orderLines.length > 0)) {
        const orderText = [
            caption,
            analysis.extractedText,
            ...analysis.orderLines.map(line => `${line.quantity || 1} ${line.unit || ''} ${line.description}`.trim()),
        ].filter(Boolean).join('\n');
        const items = await db.items.getAll();
        const parsedLines = parseWhatsAppOrderText(orderText, items);
        const matchedLines = parsedLines.filter(line => line.item);

        if (matchedLines.length) {
            const order = await saveWhatsAppOrder({
                customer,
                messageId: event.message.id,
                from: event.message.from,
                originalMessage: orderText,
                parsedLines,
                matchedLines,
                source: 'WhatsApp image order',
            });

            return {
                messageId: event.message.id,
                status: 'image_order_created',
                orderId: order.id,
                orderNumber: order.number,
                customerId: customer.id,
                matchedRows: matchedLines.length,
                total: order.total,
                confidence: analysis.confidence,
            };
        }
    }

    const order = await createReviewOrderForImage(event, customer, analysis, caption);
    const design = await createDesignDraftForImage(order, customer, analysis, event.message.id, caption);

    return {
        messageId: event.message.id,
        status: 'drawing_review_created',
        orderId: order.id,
        orderNumber: order.number,
        designId: design.id,
        customerId: customer.id,
        confidence: analysis.confidence,
    };
}

async function saveWhatsAppOrder(input: {
    customer: Party;
    messageId: string;
    from: string;
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
        notes: [
            `Created automatically from ${input.source}.`,
            `WhatsApp Message ID: ${input.messageId}`,
            `WhatsApp From: ${input.from}`,
            '',
            'Original message:',
            input.originalMessage,
            '',
            'Parsed rows:',
            summarizeParsedWhatsAppLines(input.parsedLines),
        ].join('\n'),
        paidAmount: 0,
        paymentStatus: 'unpaid',
    };

    await db.orders.add(order);
    return order;
}

async function createReviewOrderForImage(
    event: WhatsAppMessageEvent,
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
        notes: [
            'Created from WhatsApp image/drawing for manual design review.',
            `WhatsApp Message ID: ${event.message.id}`,
            `WhatsApp From: ${event.message.from}`,
            `Image Type: ${event.message.image?.mime_type || 'unknown'}`,
            `Vision Classification: ${analysis.classification}`,
            `Vision Confidence: ${analysis.confidence}`,
            caption ? `Caption:\n${caption}` : '',
            analysis.extractedText ? `Extracted text:\n${analysis.extractedText}` : '',
            analysis.drawing.notes ? `Drawing notes:\n${analysis.drawing.notes}` : '',
        ].filter(Boolean).join('\n\n'),
        paidAmount: 0,
        paymentStatus: 'unpaid',
    };

    await db.orders.add(order);
    return order;
}

async function createDesignDraftForImage(
    order: Order,
    customer: Party,
    analysis: WhatsAppImageAnalysis,
    messageId: string,
    caption: string
): Promise<CustomDesign> {
    const designData = buildDesignDataFromImageAnalysis(analysis);
    const design: CustomDesign = {
        id: generateUUID(),
        name: `WhatsApp Drawing - ${order.number}`,
        customerId: customer.id,
        customerName: customer.name,
        drawingData: designData.drawingData,
        baseShape: 'whatsapp-image',
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
            'Imported from WhatsApp image/drawing.',
            `WhatsApp Message ID: ${messageId}`,
            caption ? `Caption: ${caption}` : '',
            'Review dimensions and redraw/adjust on canvas before approval.',
        ].filter(Boolean).join('\n'),
        orderId: order.id,
    };

    await designsDb.add(design);
    return design;
}

async function findExistingWhatsAppOrder(messageId: string): Promise<Order | null> {
    const marker = `WhatsApp Message ID: ${messageId}`;
    const orders = await db.orders.getAll();
    return orders.find(order => order.notes?.includes(marker)) || null;
}

async function getOrCreateCustomer(event: WhatsAppMessageEvent, parties: Party[]): Promise<Party> {
    const phone = normalizePhone(event.message.from || event.contact?.wa_id || '');
    const existing = parties.find(party => {
        const partyPhone = normalizePhone(party.phone || '');
        return party.type === 'customer' && Boolean(partyPhone) && (partyPhone.endsWith(phone) || phone.endsWith(partyPhone));
    });

    if (existing) return existing;

    const profileName = event.contact?.profile?.name?.trim();
    const newParty: Party = {
        id: generateUUID(),
        name: profileName || `WhatsApp Customer ${phone.slice(-4)}`,
        type: 'customer',
        phone,
        address: '',
        balance: 0,
    };

    await db.parties.add(newParty);
    return newParty;
}

async function downloadWhatsAppMedia(mediaId: string): Promise<{ base64: string; mimeType: string } | null> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';
    if (!mediaId || !accessToken) return null;

    const metadataResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metadataResponse.ok) {
        console.error('Failed to fetch WhatsApp media metadata:', await metadataResponse.text());
        return null;
    }

    const metadata = await metadataResponse.json();
    if (!metadata.url) return null;

    const mediaResponse = await fetch(metadata.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mediaResponse.ok) {
        console.error('Failed to download WhatsApp media:', await mediaResponse.text());
        return null;
    }

    const arrayBuffer = await mediaResponse.arrayBuffer();
    return {
        base64: Buffer.from(arrayBuffer).toString('base64'),
        mimeType: metadata.mime_type || mediaResponse.headers.get('content-type') || 'image/jpeg',
    };
}

function imageFallbackAnalysis(caption: string): WhatsAppImageAnalysis {
    return {
        classification: 'unknown',
        extractedText: caption || '',
        confidence: 0,
        orderLines: caption ? [{ description: caption }] : [],
        drawing: {
            notes: 'Image was received, but automatic media download or vision analysis was not available. Please review manually.',
            pieces: [],
        },
    };
}

function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
}
