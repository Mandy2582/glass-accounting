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
import { generateUUID, roundCurrency } from '@/lib/utils';
import { withAvailableStock } from '@/lib/stockReservations';
import { isAffirmativeReply, resolveImageOrderIntent, resolveOrderIntent } from '@/lib/orderIntent';
import { findPendingConfirmationOrder, withNeedsApproval, withOrderSource } from '@/lib/orderNotes';
import { approveAndInvoiceOrder } from '@/lib/orderQuotation';
import { runAutoReview, sendOrderBookedConfirmation } from '@/lib/autoReview';
import { sendWhatsAppText } from '@/lib/outboundMessaging';
import { formatRateUpdateReply, parseAndApplyRateUpdate } from '@/lib/rateUpdateMessage';
import { formatStockUpdateReply, parseAndApplyStockUpdate } from '@/lib/stockUpdateMessage';
import { parsePurchaseMessage, type ParsedPurchaseLine } from '@/lib/purchaseMessage';
import { calculateLineAmounts, defaultUnitsForItem } from '@/lib/units';
import { upsertDesignItemsInOrder } from '@/lib/orderDesignItems';
import { normalizeIntakeImage, type NormalizedIntakeImage } from '@/lib/intakeImage';
import type { CustomDesign, Invoice, InvoiceItem, Order, Party, PricingConfig } from '@/types';

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

    // WhatsApp redelivers the same webhook message if this endpoint doesn't
    // ack within its own timeout -- a real risk here since a drawing photo
    // goes through a vision API call that can take 15-30+ seconds. Without
    // this guard, several retries all arrive while the first delivery is
    // still mid-flight (before any order/design row exists yet for
    // findExistingWhatsAppOrder below to find), and each one independently
    // creates its own duplicate order. This check-and-set is synchronous
    // (no `await` in between), so it's race-free across concurrent requests
    // on this single Node process -- see claimMessageId's own comment for
    // why an in-memory guard is enough here instead of a DB-level one.
    if (!claimMessageId(messageId)) {
        return { messageId, status: 'duplicate_delivery' };
    }

    const body = event.message.text?.body?.trim() || event.message.image?.caption?.trim() || '';

    // Catalogue-command numbers are staff/owner phones the shop explicitly
    // authorized in Settings -- never a customer. A message from one that
    // starts with the configured RATE/STOCK/PURCHASE keyword is treated as
    // that command and never falls through to order processing, so a
    // parse failure still needs its own clear reply rather than silently
    // becoming (or being ignored as) a customer order. A message from an
    // authorized number that matches none of the three keywords falls
    // through normally (e.g. the owner placing an ordinary order).
    if (event.message.type === 'text' && body) {
        const commandResult = await tryApplyCatalogueCommand(event.message.from, body);
        if (commandResult) return { messageId, ...commandResult };
    }

    const duplicate = await findExistingWhatsAppOrder(messageId);

    if (duplicate) {
        return {
            messageId,
            status: 'duplicate',
            orderId: duplicate.id,
            orderNumber: duplicate.number,
        };
    }

    // A quotation was already sent for a pending order from this number --
    // if this message is just a short go-ahead, approve and invoice that
    // order now instead of treating this reply as a new/separate order.
    if (isAffirmativeReply(body)) {
        const orders = await db.orders.getAll();
        const pendingOrder = findPendingConfirmationOrder(orders, 'whatsapp', event.message.from);
        if (pendingOrder) {
            const { invoiceId } = await approveAndInvoiceOrder(pendingOrder);
            // Written confirmation of what was just booked (no-op unless
            // automatic review is switched on in Settings).
            await sendOrderBookedConfirmation(pendingOrder);
            return {
                messageId,
                status: 'auto_approved_from_reply',
                orderId: pendingOrder.id,
                orderNumber: pendingOrder.number,
                invoiceId,
            };
        }
    }

    if (event.message.type === 'image') {
        return await createDraftFromWhatsAppImage(event, body);
    }

    const items = await withAvailableStock(await db.items.getAll());
    const parsedLines = parseWhatsAppOrderText(body, items);
    // A resolved line has a catalogue item attached, whether the stock for
    // it was actually available ('matched') or not ('out_of_stock' -- still
    // priced and named so it can go out on a quotation). Only a line with no
    // catalogue match at all falls back to unresolved review.
    const resolvedLines = parsedLines.filter(line => line.item);

    // No catalogue line matched at all -- before creating a customer + blank
    // review order for what might just be a "hi"/"are you open" message,
    // check whether this even looks like an order.
    if (!resolvedLines.length) {
        const intent = await resolveOrderIntent(body);
        if (!intent.isOrderRelated) {
            console.log(`[whatsapp] Ignoring non-order message from ${event.message.from}: ${intent.reason}`);
            return { messageId, status: 'ignored_not_order', reason: intent.reason };
        }

        const parties = await db.parties.getAll();
        const customer = await getOrCreateCustomer(event, parties);
        const order = await createReviewOrderForWhatsAppText(event, customer, body, parsedLines);
        return {
            messageId,
            status: 'text_review_created',
            orderId: order.id,
            orderNumber: order.number,
            customerId: customer.id,
            customerName: customer.name,
            matchedRows: 0,
        };
    }

    const parties = await db.parties.getAll();
    const customer = await getOrCreateCustomer(event, parties);
    const order = await saveWhatsAppOrder({
        customer,
        messageId,
        from: event.message.from,
        originalMessage: body,
        parsedLines,
        matchedLines: resolvedLines,
        source: 'WhatsApp Business webhook',
    });
    await runAutoReview(order);

    return {
        messageId,
        status: resolvedLines.some(line => line.confidence === 'out_of_stock') ? 'order_created_with_shortage' : 'order_created',
        orderId: order.id,
        orderNumber: order.number,
        customerId: customer.id,
        customerName: customer.name,
        matchedRows: resolvedLines.length,
        total: order.total,
    };
}

async function createDraftFromWhatsAppImage(event: WhatsAppMessageEvent, caption: string) {
    const media = await downloadWhatsAppMedia(event.message.image?.id || '');
    // Bake EXIF orientation into the pixels before the model ever sees the
    // photo -- a sideways image makes every edge-relative hole/cut position
    // wrong in a way that looks like the model guessing (see intakeImage.ts).
    const normalized = media ? await normalizeIntakeImage(media.base64, media.mimeType) : null;
    if (normalized?.wasRotated) {
        console.log(`[whatsapp] Corrected EXIF orientation on drawing photo from ${event.message.from}`);
    }
    const analysis = normalized
        ? await analyzeWhatsAppImage({
            imageDataUrl: normalized.vision.dataUrl,
            caption,
            fromPhone: event.message.from,
        })
        : imageFallbackAnalysis(caption);

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
            const customer = await getOrCreateCustomer(event, parties);
            const order = await saveWhatsAppOrder({
                customer,
                messageId: event.message.id,
                from: event.message.from,
                originalMessage: orderText,
                parsedLines,
                matchedLines: resolvedLines,
                source: 'WhatsApp image order',
            });
            await runAutoReview(order);

            return {
                messageId: event.message.id,
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
        console.log(`[whatsapp] Ignoring non-order image from ${event.message.from}: ${intent.reason}`);
        return { messageId: event.message.id, status: 'ignored_not_order', reason: intent.reason };
    }

    const parties = await db.parties.getAll();
    const customer = await getOrCreateCustomer(event, parties);
    const order = await createReviewOrderForImage(event, customer, analysis, caption);
    const design = await createDesignDraftForImage(order, customer, analysis, event.message.id, caption, normalized?.stored);
    const pricedOrder = await priceIntakeDesignOrder(order, design);
    await runAutoReview(pricedOrder);

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
        notes: withNeedsApproval(withOrderSource([
            `Created automatically from ${input.source}.`,
            `WhatsApp Message ID: ${input.messageId}`,
            `WhatsApp From: ${input.from}`,
            '',
            'Original message:',
            input.originalMessage,
            '',
            'Parsed rows:',
            summarizeParsedWhatsAppLines(input.parsedLines),
        ].join('\n'), 'whatsapp')),
        paidAmount: 0,
        paymentStatus: 'unpaid',
    };

    await db.orders.add(order);
    return order;
}

async function createReviewOrderForWhatsAppText(
    event: WhatsAppMessageEvent,
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
            'Created from WhatsApp order text for staff review.',
            `WhatsApp Message ID: ${event.message.id}`,
            `WhatsApp From: ${event.message.from}`,
            '',
            'Original message:',
            originalMessage,
            '',
            'Parsed rows:',
            summarizeParsedWhatsAppLines(parsedLines),
        ].filter(Boolean).join('\n'), 'whatsapp')),
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
        notes: withNeedsApproval(withOrderSource([
            'Created from WhatsApp image/drawing for manual design review.',
            `WhatsApp Message ID: ${event.message.id}`,
            `WhatsApp From: ${event.message.from}`,
            `Image Type: ${event.message.image?.mime_type || 'unknown'}`,
            `Vision Classification: ${analysis.classification}`,
            `Vision Confidence: ${analysis.confidence}`,
            caption ? `Caption:\n${caption}` : '',
            analysis.extractedText ? `Extracted text:\n${analysis.extractedText}` : '',
            analysis.drawing.notes ? `Drawing notes:\n${analysis.drawing.notes}` : '',
        ].filter(Boolean).join('\n\n'), 'whatsapp')),
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
    caption: string,
    sourceImage?: NormalizedIntakeImage
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
        // Kept so the order review page can show the customer's original
        // drawing beside the extracted version. Purged after 90 days by the
        // nightly maintenance job.
        sourceImageBase64: sourceImage?.base64,
        sourceImageMimeType: sourceImage?.mimeType,
    };

    await designsDb.add(design);
    return design;
}

// A freshly-intaken drawing order used to sit at zero items / zero totals
// until staff opened and saved the design in the editor -- so the order page
// showed an empty Items table (and a misleading zero-total payment state),
// and the design card showed a Rs.0 estimate even though the extracted
// pieces carry real area/hole/cut counts. Price the pieces immediately with
// the same pricing config + row-building helpers the design editor uses on
// save, so the review order is quotable the moment it arrives. Intake never
// fails on this: any pricing problem just leaves the order in the old
// zero-item state for manual completion.
async function priceIntakeDesignOrder(order: Order, design: CustomDesign): Promise<Order> {
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
        return updatedOrder;
    } catch (error) {
        console.error('Failed to price intake design order:', error);
        return order;
    }
}

// Returns a result object (to short-circuit createOrderFromWhatsAppEvent)
// only when this sender is an authorized rate-update number; returns null
// for everyone else so their message proceeds through normal order
// processing untouched.
// Dispatches an authorized number's message to whichever of RATE/STOCK/
// PURCHASE its first word (the configured keyword) selects. Returns null
// (meaning "not a catalogue command, continue normal processing") when the
// feature is off, the number isn't authorized, or the first word matches
// none of the three keywords.
async function tryApplyCatalogueCommand(fromPhone: string, body: string): Promise<{ status: string; reason?: string; itemsUpdated?: number } | null> {
    const config = await db.settings.getRateUpdateConfig();
    if (!config.enabled) return null;

    const normalizedFrom = normalizePhone(fromPhone);
    const isAuthorized = config.authorizedPhones.some(phone => normalizePhone(phone) === normalizedFrom);
    if (!isAuthorized) return null;

    const trimmed = body.trim();
    const firstWord = trimmed.split(/\s+/)[0] || '';
    const rest = trimmed.slice(firstWord.length).trim();

    if (firstWord.toUpperCase() === config.rateKeyword.trim().toUpperCase()) return applyRateUpdate(fromPhone, rest);
    if (firstWord.toUpperCase() === config.stockKeyword.trim().toUpperCase()) return applyStockUpdate(fromPhone, rest);
    if (firstWord.toUpperCase() === config.purchaseKeyword.trim().toUpperCase()) return applyPurchaseEntry(fromPhone, rest);
    return null;
}

async function applyRateUpdate(fromPhone: string, body: string): Promise<{ status: string; reason?: string; itemsUpdated?: number }> {
    try {
        const catalog = await db.items.getAll();
        const result = parseAndApplyRateUpdate(body, catalog);
        if (result.ok) {
            // Snapshot each item's own prior rate BEFORE applying -- matched
            // items aren't guaranteed to have started at the same rate, so
            // revert must restore each one individually, not a single value.
            const beforeItems = result.matched.map(item => ({ id: item.id, rate: item.rate, rateUnit: item.rateUnit || 'sqft' }));
            await db.items.bulkUpdateRate(result.matched.map(item => item.id), result.rate, result.rateUnit);
            await logCatalogueCommand({
                commandType: 'rate',
                fromPhone,
                rawMessage: body,
                summary: `${result.label} -> Rs ${result.rate}${result.rateUnit === 'nos' ? ' each' : '/sqft'} (${result.matched.length} item${result.matched.length === 1 ? '' : 's'})`,
                beforeState: { items: beforeItems },
                afterState: { rate: result.rate, rateUnit: result.rateUnit },
            });
        }
        await sendWhatsAppText(fromPhone, formatRateUpdateReply(result));
        return result.ok
            ? { status: 'rate_update_applied', itemsUpdated: result.matched.length }
            : { status: 'rate_update_rejected', reason: result.reason };
    } catch (error) {
        console.error('[rate-update] failed:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        await sendWhatsAppText(fromPhone, `Rate update failed: ${message}`).catch(() => {});
        return { status: 'rate_update_error', reason: message };
    }
}

async function applyStockUpdate(fromPhone: string, body: string): Promise<{ status: string; reason?: string }> {
    try {
        const catalog = await db.items.getAll();
        const result = parseAndApplyStockUpdate(body, catalog);
        if (result.ok) {
            const before = { itemId: result.item.id, stock: result.item.stock, warehouseStock: result.item.warehouseStock || {} };
            await db.items.bulkUpdateStock(result.item.id, result.stock);
            await logCatalogueCommand({
                commandType: 'stock',
                fromPhone,
                rawMessage: body,
                summary: `${result.label} -> ${result.inputQuantity} ${result.inputUnit}`,
                beforeState: before,
                afterState: { stock: result.stock },
            });
        }
        await sendWhatsAppText(fromPhone, formatStockUpdateReply(result));
        return result.ok ? { status: 'stock_update_applied' } : { status: 'stock_update_rejected', reason: result.reason };
    } catch (error) {
        console.error('[stock-update] failed:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        await sendWhatsAppText(fromPhone, `Stock update failed: ${message}`).catch(() => {});
        return { status: 'stock_update_error', reason: message };
    }
}

// A logging failure must never block the actual command from applying and
// replying -- this is a secondary audit trail, not the source of truth.
async function logCatalogueCommand(entry: {
    commandType: 'rate' | 'stock' | 'purchase';
    fromPhone: string;
    rawMessage: string;
    summary: string;
    beforeState?: unknown;
    afterState?: unknown;
    invoiceId?: string;
}): Promise<void> {
    try {
        await db.catalogueLog.add(entry);
    } catch (error) {
        console.error('[catalogue-log] failed to record entry:', error);
    }
}

function isSuccessfulPurchaseLine(line: ParsedPurchaseLine): line is Extract<ParsedPurchaseLine, { ok: true }> {
    return line.ok;
}

async function applyPurchaseEntry(fromPhone: string, body: string): Promise<{ status: string; reason?: string }> {
    try {
        const catalog = await db.items.getAll();
        const parsed = parsePurchaseMessage(body, catalog);
        if (!parsed.ok) {
            await sendWhatsAppText(fromPhone, `Purchase not recorded.\n${parsed.reason}`);
            return { status: 'purchase_rejected', reason: parsed.reason };
        }

        const failedLines = parsed.lines.filter(line => !line.ok);
        if (failedLines.length > 0) {
            const reasons = failedLines.map(line => `- "${line.raw}": ${!line.ok ? line.reason : ''}`).join('\n');
            await sendWhatsAppText(fromPhone, `Purchase not recorded -- fix these lines and resend:\n${reasons}`);
            return { status: 'purchase_rejected', reason: reasons };
        }

        const okLines = parsed.lines.filter(isSuccessfulPurchaseLine);

        const parties = await db.parties.getAll();
        const supplier = await getOrCreateSupplier(parsed.supplierName, parties);

        const items: InvoiceItem[] = okLines.map(line => {
            const { unit, rateUnit } = defaultUnitsForItem({ ...line.item, rateUnit: line.unit });
            const calculated = calculateLineAmounts({
                width: line.item.width,
                height: line.item.height,
                quantity: line.quantity,
                unit,
                rate: line.rate,
                rateUnit,
                taxRate: 18,
                conversionFactor: line.item.conversionFactor,
            });
            return {
                id: generateUUID(),
                itemId: line.item.id,
                itemName: line.item.name,
                make: line.item.make,
                model: line.item.model,
                type: line.item.type,
                warehouse: 'Warehouse A',
                width: line.item.width || 0,
                height: line.item.height || 0,
                quantity: line.quantity,
                unit,
                sqft: calculated.sqft,
                rate: line.rate,
                rateUnit,
                amount: calculated.amount,
                lineTotal: calculated.lineTotal,
                sourceType: 'text',
            };
        });

        const subtotal = roundCurrency(items.reduce((sum, item) => sum + item.amount, 0));
        const total = roundCurrency(items.reduce((sum, item) => sum + (item.lineTotal ?? item.amount), 0));
        const taxAmount = roundCurrency(total - subtotal);

        const invoice: Invoice = {
            id: generateUUID(),
            type: 'purchase',
            number: `PUR-${Date.now().toString().slice(-6)}`,
            date: new Date().toISOString().slice(0, 10),
            partyId: supplier.id,
            partyName: supplier.name,
            items,
            subtotal,
            taxRate: 18,
            taxAmount,
            total,
            status: 'unpaid',
        };

        await db.invoices.add(invoice);

        // No before_state needed -- reverting a purchase means deleting the
        // whole invoice (db.invoices.delete already correctly reverses
        // stock_batches/warehouse_stock/avg cost/party balance), not
        // restoring individual item fields.
        await logCatalogueCommand({
            commandType: 'purchase',
            fromPhone,
            rawMessage: body,
            summary: `${invoice.number} from ${supplier.name}: ${okLines.length} item${okLines.length === 1 ? '' : 's'}, Rs ${invoice.total}`,
            afterState: { supplier: supplier.name, items: okLines.map(line => ({ item: line.item.name, quantity: line.quantity, unit: line.unit, rate: line.rate })) },
            invoiceId: invoice.id,
        });

        const lineSummary = okLines.map(line => `- ${line.item.name}: ${line.quantity} ${line.unit} @${line.rate}`).join('\n');
        await sendWhatsAppText(fromPhone, `Purchase recorded: ${invoice.number} from ${supplier.name}\n${lineSummary}\nTotal: Rs ${invoice.total}`);
        return { status: 'purchase_recorded' };
    } catch (error) {
        console.error('[purchase-entry] failed:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        await sendWhatsAppText(fromPhone, `Purchase entry failed: ${message}`).catch(() => {});
        return { status: 'purchase_entry_error', reason: message };
    }
}

// Purchase-entry senders are authorized staff/owner numbers naming the
// supplier in the text (same trust model as rate/stock updates) -- there's
// no mechanism to recognize a supplier's own phone number. An unmatched
// supplier name auto-creates a new supplier party, same as how a new
// customer is created from an ordinary WhatsApp order (getOrCreateCustomer
// below).
async function getOrCreateSupplier(name: string, parties: Party[]): Promise<Party> {
    const normalizeName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalized = normalizeName(name);
    const existing = parties.find(party => party.type === 'supplier' && normalizeName(party.name) === normalized);
    if (existing) return existing;

    const newParty: Party = {
        id: generateUUID(),
        name: name.trim(),
        type: 'supplier',
        phone: '',
        address: '',
        balance: 0,
    };
    await db.parties.add(newParty);
    return newParty;
}

async function findExistingWhatsAppOrder(messageId: string): Promise<Order | null> {
    const marker = `WhatsApp Message ID: ${messageId}`;
    const orders = await db.orders.getAll();
    return orders.find(order => order.notes?.includes(marker)) || null;
}

// In-memory idempotency guard against WhatsApp's own webhook retries. This
// app runs as a single Node process (PM2 fork mode, not clustered), so a
// module-level Map is enough -- no DB table or cross-process coordination
// needed. The check-and-set in claimMessageId is synchronous (no `await`
// in between reading and writing the Map), so two retries landing on the
// same event-loop process can never both pass the check, unlike
// findExistingWhatsAppOrder above (which only starts finding a match once
// an order has actually been saved, several seconds into processing).
// Entries expire after MESSAGE_ID_TTL_MS purely to bound memory -- WhatsApp
// retries stop well before that.
const recentlyClaimedMessageIds = new Map<string, number>();
const MESSAGE_ID_TTL_MS = 10 * 60 * 1000;

function claimMessageId(messageId: string): boolean {
    const now = Date.now();
    for (const [id, claimedAt] of recentlyClaimedMessageIds) {
        if (now - claimedAt > MESSAGE_ID_TTL_MS) recentlyClaimedMessageIds.delete(id);
    }
    if (recentlyClaimedMessageIds.has(messageId)) return false;
    recentlyClaimedMessageIds.set(messageId, now);
    return true;
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
