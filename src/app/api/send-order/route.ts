import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedRequest } from '@/lib/serverAuth';
import { createMailTransport, getMailCredentials, getFromAddress } from '@/lib/mailer';

export async function POST(request: NextRequest) {
    const authError = await requireAuthenticatedRequest(request);
    if (authError) return authError;

    try {
        const { to, subject, body, pdfBase64, filename } = await request.json();

        if (!to || !subject || !body || !pdfBase64) {
            return NextResponse.json(
                { error: 'Missing required fields (to, subject, body, pdfBase64)' },
                { status: 400 }
            );
        }

        // Validate SMTP Credentials exist
        const { user, pass } = getMailCredentials();

        if (!user || !pass) {
            return NextResponse.json(
                { error: 'SMTP credentials are not configured. Set EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD (or GMAIL_USER/GMAIL_APP_PASSWORD) in environment variables.' },
                { status: 501 }
            );
        }

        // Create transporter
        const transporter = createMailTransport();

        // Convert base64 PDF data URL into a buffer for Nodemailer
        // Format: data:application/pdf;base64,JVBERi0xLjMK...
        const base64Data = pdfBase64.split(';base64,').pop();
        if (!base64Data) {
            return NextResponse.json({ error: 'Invalid PDF base64 format' }, { status: 400 });
        }
        const pdfBuffer = Buffer.from(base64Data, 'base64');

        // Send email
        const info = await transporter.sendMail({
            from: getFromAddress(),
            to,
            subject,
            text: body,
            html: body.replace(/\n/g, '<br/>'),
            attachments: [
                {
                    filename: filename || 'Order_Attachment.pdf',
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        console.log('Direct SMTP email sent successfully:', info.messageId);

        return NextResponse.json({
            success: true,
            messageId: info.messageId
        });

    } catch (error: any) {
        console.error('SMTP send-order API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send email via SMTP' },
            { status: 500 }
        );
    }
}
