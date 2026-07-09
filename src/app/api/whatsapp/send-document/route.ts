import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedRequest } from '@/lib/serverAuth';

export async function POST(request: NextRequest) {
    const authError = await requireAuthenticatedRequest(request);
    if (authError) return authError;

    try {
        const { to, pdfBase64, filename, caption } = await request.json();

        if (!to || !pdfBase64) {
            return NextResponse.json(
                { error: 'Missing required fields (to, pdfBase64)' },
                { status: 400 }
            );
        }

        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';

        if (!accessToken || !phoneNumberId) {
            return NextResponse.json(
                { error: 'WhatsApp API credentials are not configured (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID).' },
                { status: 501 }
            );
        }

        const base64Data = pdfBase64.split(';base64,').pop();
        if (!base64Data) {
            return NextResponse.json({ error: 'Invalid PDF base64 format' }, { status: 400 });
        }
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        const normalizedTo = String(to).replace(/\D/g, '');
        const docFilename = filename || 'estimate.pdf';

        // Meta requires the document be uploaded to their media store first,
        // then referenced by id in the actual message -- there is no
        // single-call "send this file" endpoint.
        const mediaForm = new FormData();
        mediaForm.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), docFilename);
        mediaForm.append('messaging_product', 'whatsapp');
        mediaForm.append('type', 'application/pdf');

        const uploadRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: mediaForm,
        });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !uploadData.id) {
            console.error('WhatsApp media upload failed:', uploadData);
            return NextResponse.json(
                { error: uploadData?.error?.message || 'Failed to upload the PDF to WhatsApp.' },
                { status: 502 }
            );
        }

        const sendRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedTo,
                type: 'document',
                document: { id: uploadData.id, filename: docFilename, caption: caption || undefined },
            }),
        });
        const sendData = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
            console.error('WhatsApp send-document message failed:', sendData);
            // Code 131047 is Meta's "outside the 24-hour customer service
            // window" rejection -- the most common failure mode here, since
            // free-form messages (including documents) can only be sent
            // within 24h of the customer's last inbound message.
            const isWindowExpired = sendData?.error?.code === 131047 || sendData?.error?.error_data?.details?.includes('re-engagement');
            const reason = isWindowExpired
                ? 'It has been more than 24 hours since the customer last messaged us on WhatsApp, so Meta will not deliver a free-form message. Ask the customer to send any message on WhatsApp, then try sending the quotation again.'
                : (sendData?.error?.message || 'Failed to send the quotation via WhatsApp.');
            return NextResponse.json({ error: reason }, { status: 502 });
        }

        return NextResponse.json({ success: true, messageId: sendData.messages?.[0]?.id });
    } catch (error: any) {
        console.error('WhatsApp send-document API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send WhatsApp document' },
            { status: 500 }
        );
    }
}
