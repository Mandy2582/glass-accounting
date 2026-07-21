import { createMailTransport, getMailCredentials, getFromAddress } from '@/lib/mailer';

// Server-side outbound messaging. The existing sendQuotationForOrder() in
// orderQuotation.ts only works in the browser -- it builds PDFs with
// html2canvas and posts to relative /api routes with the signed-in user's
// session. Automatic review runs inside the intake webhooks where there is
// no browser and no user session, so it needs these direct helpers instead.
//
// Automated quotations are therefore plain itemised text rather than the
// PDF a staff member sends by hand. That is a deliberate trade: a
// server-safe PDF pipeline would mean rebuilding pdfGenerator without its
// DOM dependencies, and a text quote is normal practice over WhatsApp
// anyway.

export type SendResult = { ok: true } | { ok: false; reason: string };

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';

    if (!accessToken || !phoneNumberId) {
        return { ok: false, reason: 'WhatsApp API credentials are not configured.' };
    }

    const phone = (to || '').replace(/[^0-9]/g, '');
    if (!phone) return { ok: false, reason: 'No usable phone number for this customer.' };

    try {
        const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phone,
                type: 'text',
                text: { body },
            }),
        });

        if (!response.ok) {
            const detail = await response.text();
            return { ok: false, reason: `WhatsApp send failed: ${detail.slice(0, 300)}` };
        }
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'WhatsApp send failed.' };
    }
}

/**
 * Meta has no single-call "send this file" endpoint -- the document must be
 * uploaded to their media store first and then referenced by id, mirroring
 * what /api/whatsapp/send-document does for staff-sent PDFs.
 */
export async function sendWhatsAppDocument(
    to: string,
    pdfBase64: string,
    filename: string,
    caption: string
): Promise<SendResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';

    if (!accessToken || !phoneNumberId) {
        return { ok: false, reason: 'WhatsApp API credentials are not configured.' };
    }
    const phone = (to || '').replace(/[^0-9]/g, '');
    if (!phone) return { ok: false, reason: 'No usable phone number for this customer.' };

    try {
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const mediaForm = new FormData();
        mediaForm.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
        mediaForm.append('messaging_product', 'whatsapp');
        mediaForm.append('type', 'application/pdf');

        const uploadRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: mediaForm,
        });
        const uploadData = await uploadRes.json().catch(() => ({} as any));
        if (!uploadRes.ok || !uploadData.id) {
            return { ok: false, reason: uploadData?.error?.message || 'Failed to upload the quotation PDF to WhatsApp.' };
        }

        const sendRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phone,
                type: 'document',
                document: { id: uploadData.id, filename, caption: caption || undefined },
            }),
        });
        const sendData = await sendRes.json().catch(() => ({} as any));
        if (!sendRes.ok) {
            // 131047 is Meta's "outside the 24-hour customer service window"
            // rejection -- worth naming because it is the usual failure and
            // is not something retrying will fix.
            const windowExpired = sendData?.error?.code === 131047;
            return {
                ok: false,
                reason: windowExpired
                    ? 'WhatsApp only allows free-form messages within 24 hours of the customer\'s last message.'
                    : sendData?.error?.message || 'Failed to send the quotation document.',
            };
        }
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'WhatsApp document send failed.' };
    }
}

export type EmailAttachment = { filename: string; base64: string };

export async function sendPlainEmail(
    to: string,
    subject: string,
    body: string,
    attachment?: EmailAttachment
): Promise<SendResult> {
    const { user, pass } = getMailCredentials();
    if (!user || !pass) return { ok: false, reason: 'SMTP credentials are not configured.' };
    if (!to?.trim()) return { ok: false, reason: 'No email address on file for this customer.' };

    try {
        const transporter = createMailTransport();
        await transporter.sendMail({
            from: getFromAddress(),
            to,
            subject,
            text: body,
            html: body.replace(/\n/g, '<br/>'),
            attachments: attachment
                ? [{
                    filename: attachment.filename,
                    content: Buffer.from(attachment.base64, 'base64'),
                    contentType: 'application/pdf',
                }]
                : undefined,
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Email send failed.' };
    }
}
