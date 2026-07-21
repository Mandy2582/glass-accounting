import { db, designsDb } from '@/lib/storage';
import { getOrderSource, withApprovalCleared } from '@/lib/orderNotes';
import { sendPlainEmail, sendWhatsAppDocument, sendWhatsAppText } from '@/lib/outboundMessaging';
import { buildQuotationPdfBase64 } from '@/lib/serverQuotationPdf';
import type { AutomationConfig, CustomDesign, Order, Party } from '@/types';

// Automatic review: quote an incoming WhatsApp/email order without waiting
// for a staff member, then book it when the customer says OK. Everything
// here is server-side (it runs inside the intake webhooks) and is gated on
// the Settings toggle, which is off by default.
//
// The eligibility rules are deliberately conservative -- an automated
// quotation is a real price going to a real customer with nobody checking
// it, so anything we are not confident about falls back to the existing
// manual flow rather than guessing.

export type AutoReviewDecision =
    | { eligible: true }
    | { eligible: false; reason: string };

const countFlaggedPositions = (design: CustomDesign): number =>
    (design.drawingData?.pieces || []).reduce((sum: number, piece: any) =>
        sum + (piece.shapes || []).filter((shape: any) => shape.positionSource === 'estimated-fallback').length, 0);

export function evaluateAutoReview(
    order: Order,
    designs: CustomDesign[],
    config: AutomationConfig
): AutoReviewDecision {
    if (!config.autoReviewEnabled) {
        return { eligible: false, reason: 'Automatic review is turned off in Settings.' };
    }

    if (!order.items || order.items.length === 0) {
        return { eligible: false, reason: 'Order has no priced items.' };
    }

    if (!(Number(order.total) > 0)) {
        return { eligible: false, reason: 'Order total is zero -- nothing to quote.' };
    }

    const cap = Number(config.autoReviewMaxOrderValue) || 0;
    if (cap > 0 && Number(order.total) > cap) {
        return { eligible: false, reason: `Order total ₹${Number(order.total).toFixed(2)} is above the ₹${cap.toFixed(2)} automatic-review limit.` };
    }

    // A drawing order is only as trustworthy as the geometry we read off the
    // photo. Any hole/cut we could not place (the amber flags shown in the
    // designer) means the area -- and therefore the price -- may be wrong,
    // so those always go to a human.
    if (order.requiresDesign || designs.length > 0) {
        if (designs.length === 0) {
            return { eligible: false, reason: 'Order needs a design but none is attached yet.' };
        }
        if (!designs.some(design => Number(design.estimatedCost) > 0)) {
            return { eligible: false, reason: 'Design has no price yet.' };
        }
        if (config.autoReviewRequireCleanDrawing) {
            const flagged = designs.reduce((sum, design) => sum + countFlaggedPositions(design), 0);
            if (flagged > 0) {
                return { eligible: false, reason: `${flagged} hole/cut position${flagged === 1 ? '' : 's'} could not be read from the drawing.` };
            }
        }
    }

    return { eligible: true };
}

const money = (value: number | undefined) => `₹${(Number(value) || 0).toFixed(2)}`;

export function buildQuotationMessage(order: Order, businessName: string): string {
    const lines = (order.items || []).map(item => {
        const qty = Number(item.quantity) || 0;
        const unit = item.unit || '';
        return `• ${item.itemName} -- ${qty} ${unit} @ ${money(item.rate)} = ${money(item.lineTotal ?? item.amount)}`;
    });

    return [
        `${businessName}`,
        `Estimate for order ${order.number}`,
        '',
        ...lines,
        '',
        `Subtotal: ${money(order.subtotal)}`,
        `GST (${order.taxRate || 0}%): ${money(order.taxAmount)}`,
        `Total: ${money(order.total)}`,
        '',
        'Reply "OK" to confirm and we will start production.',
    ].join('\n');
}

export function buildOrderConfirmationMessage(order: Order, businessName: string): string {
    const lines = (order.items || []).map(item => {
        const qty = Number(item.quantity) || 0;
        return `• ${item.itemName} -- ${qty} ${item.unit || ''}`;
    });

    return [
        `${businessName}`,
        `Thank you -- your order ${order.number} is confirmed and booked.`,
        '',
        ...lines,
        '',
        `Total: ${money(order.total)}`,
        order.date ? `Order date: ${order.date}` : '',
        '',
        'We will contact you when it is ready. Reply here if anything needs changing.',
    ].filter(Boolean).join('\n');
}

async function sendThroughOrderChannel(
    order: Order,
    party: Party | undefined,
    subject: string,
    body: string,
    pdf?: { base64: string; filename: string }
) {
    const source = getOrderSource(order.notes);
    if (source === 'email') {
        return sendPlainEmail(
            (party?.email || '').trim(),
            subject,
            body,
            pdf ? { filename: pdf.filename, base64: pdf.base64 } : undefined
        );
    }
    if (pdf) {
        const sent = await sendWhatsAppDocument(party?.phone || '', pdf.base64, pdf.filename, body);
        // The document upload can fail for reasons the text send won't hit
        // (media store rejection, size limits). The customer still needs the
        // numbers, so fall back to the plain itemised text rather than
        // silently sending nothing.
        if (sent.ok) return sent;
        console.error(`[auto-review] PDF send failed (${sent.reason}); falling back to text quotation.`);
    }
    return sendWhatsAppText(party?.phone || '', body);
}

/**
 * Quotes an eligible order automatically and marks the estimate as sent, so
 * the existing "customer replies OK" path books it exactly as it would for a
 * staff-sent quotation. Returns the decision so callers can log why an order
 * was left for manual review.
 */
export async function runAutoReview(order: Order): Promise<AutoReviewDecision> {
    try {
        const config = await db.settings.getAutomation();
        const designs = (order.requiresDesign
            ? (await designsDb.getAll()).filter(design => design.orderId === order.id)
            : []);

        const decision = evaluateAutoReview(order, designs, config);
        if (!decision.eligible) {
            console.log(`[auto-review] ${order.number} left for manual review: ${decision.reason}`);
            return decision;
        }

        const [parties, businessConfig, pricing] = await Promise.all([
            db.parties.getAll(),
            db.businessConfig.get(),
            db.settings.getPricing().catch(() => null),
        ]);
        const party = parties.find(p => p.id === order.partyId);
        const body = buildQuotationMessage(order, businessConfig.businessName);

        // Attach the same quotation as a PDF. If it can't be built for any
        // reason the itemised text still goes out on its own.
        let pdf: { base64: string; filename: string } | undefined;
        try {
            pdf = { base64: buildQuotationPdfBase64(order, businessConfig, pricing?.termsAndConditions), filename: `quotation_${order.number}.pdf` };
        } catch (error) {
            console.error('[auto-review] quotation PDF build failed, sending text only:', error);
        }

        const sent = await sendThroughOrderChannel(order, party, `Estimate - Order ${order.number}`, body, pdf);
        if (!sent.ok) {
            console.error(`[auto-review] ${order.number} quotation send failed: ${sent.reason}`);
            return { eligible: false, reason: sent.reason };
        }

        // Same marker the manual flow sets, so the reply-"OK" handler and the
        // order detail banner both behave identically from here on.
        const notes = order.notes || '';
        const updatedNotes = notes.includes('[ESTIMATE_SENT:true]')
            ? notes
            : [notes, '[ESTIMATE_SENT:true]', '[AUTO_REVIEWED:true]'].filter(Boolean).join('\n');
        await db.orders.update({ ...order, notes: updatedNotes });

        console.log(`[auto-review] ${order.number} quoted automatically (${money(order.total)}).`);
        return { eligible: true };
    } catch (error) {
        console.error('[auto-review] failed, leaving order for manual review:', error);
        return { eligible: false, reason: error instanceof Error ? error.message : 'Automatic review failed.' };
    }
}

/**
 * Sent after a customer's "OK" books the order, so they get a written record
 * of what was confirmed rather than silence.
 */
export async function sendOrderBookedConfirmation(order: Order): Promise<void> {
    try {
        const config = await db.settings.getAutomation();
        if (!config.autoReviewEnabled) return;

        const [parties, businessConfig] = await Promise.all([
            db.parties.getAll(),
            db.businessConfig.get(),
        ]);
        const party = parties.find(p => p.id === order.partyId);
        const body = buildOrderConfirmationMessage(order, businessConfig.businessName);

        const sent = await sendThroughOrderChannel(order, party, `Order Confirmed - ${order.number}`, body);
        if (!sent.ok) console.error(`[auto-review] booking confirmation for ${order.number} failed: ${sent.reason}`);
    } catch (error) {
        console.error('[auto-review] booking confirmation failed:', error);
    }
}
