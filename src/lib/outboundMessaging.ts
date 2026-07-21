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

export async function sendPlainEmail(to: string, subject: string, body: string): Promise<SendResult> {
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
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Email send failed.' };
    }
}
