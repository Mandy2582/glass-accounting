import { db, designsDb } from '@/lib/storage';
import { getAuthHeaders } from '@/lib/auth';
import { getOrderSource, withApprovalCleared, withEstimateApproved } from '@/lib/orderNotes';
import type { Order } from '@/types';

export type SendQuotationResult = { ok: true } | { ok: false; reason: string };

// Shared by the Notifications page and the order detail page's approval
// banner -- both need the exact same "generate the right PDF, send it
// through the order's own channel, mark it sent" behavior for WhatsApp/
// email intake orders, which now require a quotation before they can be
// approved and invoiced.
export async function sendQuotationForOrder(order: Order): Promise<SendQuotationResult> {
    if (!order.items || order.items.length === 0) {
        return { ok: false, reason: 'This order has no items yet. Open "Review & Edit First" and fill it in before sending a quotation.' };
    }

    const designs = order.requiresDesign
        ? (await designsDb.getAll()).filter(design => design.orderId === order.id)
        : [];

    if (order.requiresDesign && !designs.some(design => design.estimatedCost > 0)) {
        return { ok: false, reason: 'This order needs a priced design before a quotation can be sent. Finish the drawing in the design editor first.' };
    }

    const parties = await db.parties.getAll();
    const party = parties.find(p => p.id === order.partyId);
    const source = getOrderSource(order.notes);

    const { generateOrderPDF, generateEstimatePDF } = await import('@/lib/pdfGenerator');
    const pricedDesign = designs.find(design => design.estimatedCost > 0);

    if (source === 'email') {
        const email = party?.email?.trim();
        if (!email) {
            return { ok: false, reason: 'No email address on file for this customer -- add one to their party record first.' };
        }

        const subject = `Glass Estimate - Order ${order.number}`;
        const body = `Dear Customer,\n\nPlease find attached the estimate for your order ${order.number}. Reply "OK" to confirm and we will proceed.\n\nBest regards.`;

        let dataUri: string;
        let filename: string;
        if (pricedDesign) {
            dataUri = await generateEstimatePDF(pricedDesign, null, { outputType: 'datauristring' }) as string;
            filename = `estimate_${order.number}.pdf`;
        } else {
            dataUri = await generateOrderPDF(order, { excludePricing: false, designs: [], outputType: 'datauristring' }) as string;
            filename = `${order.number}_estimate.pdf`;
        }

        const authHeaders = await getAuthHeaders();
        const res = await fetch('/api/send-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ to: email, subject, body, pdfBase64: dataUri, filename }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            return { ok: false, reason: data.error || 'Failed to send the quotation email. Please try again.' };
        }
    } else {
        // WhatsApp has no outbound-sending API wired up (Meta requires a
        // pre-approved message template plus business verification, which
        // isn't set up) -- this downloads the PDF and opens a pre-filled
        // WhatsApp chat, matching the existing "Share WhatsApp" pattern used
        // elsewhere in the app. Staff attaches the just-downloaded PDF and
        // sends it themselves; this is not fully automatic for this channel.
        if (pricedDesign) {
            await generateEstimatePDF(pricedDesign, null, {});
        } else {
            await generateOrderPDF(order, { excludePricing: false, designs: [] });
        }

        const messageText = `Dear Customer, please find attached the estimate for your order ${order.number}. Reply "OK" to confirm and we will proceed.`;
        const phone = (party?.phone || '').replace(/[^0-9]/g, '');
        const waUrl = phone
            ? `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`
            : `https://wa.me/?text=${encodeURIComponent(messageText)}`;
        window.open(waUrl, '_blank');
    }

    const order2 = await db.orders.getAll().then(all => all.find(o => o.id === order.id));
    if (!order2) return { ok: false, reason: 'Order not found when saving quotation-sent status.' };

    const notes = order2.notes || '';
    const updatedNotes = notes.includes('[ESTIMATE_SENT:true]') ? notes : [notes, '[ESTIMATE_SENT:true]'].filter(Boolean).join('\n');
    await db.orders.update({ ...order2, notes: updatedNotes });

    return { ok: true };
}

// Called both when staff click "Approve Now" and when a customer's reply is
// auto-detected as a go-ahead. Clears the approval gate, marks the estimate
// approved, and immediately converts the order to an invoice -- per the
// business decision that invoicing (and the stock deduction that comes with
// it under the soft-reserve model) happens at approval, not at delivery.
export async function approveAndInvoiceOrder(order: Order): Promise<{ invoiceId?: string }> {
    const updatedNotes = withEstimateApproved(withApprovalCleared(order.notes));
    // Matches what the manual "Approve Order (Stock)" wizard step already
    // does elsewhere -- keeps order.status consistent with the rest of the
    // app (Operations, dashboards, the wizard's own step logic) instead of
    // leaving it at 'pending' while the order is actually approved+invoiced.
    const updatedStatus = order.status === 'pending' ? 'approved' : order.status;
    await db.orders.update({ ...order, notes: updatedNotes, status: updatedStatus });

    if (order.invoiceId || !order.items || order.items.length === 0) {
        return { invoiceId: order.invoiceId };
    }

    const invoiceId = await db.orders.convertToInvoice(order.id);
    return { invoiceId };
}
