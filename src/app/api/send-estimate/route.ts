import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { designsDb, db } from '@/lib/storage';
import { generateEstimatePDFBuffer } from '@/lib/pdfGenerator';
import { generateEstimateEmailHTML } from '@/lib/emailTemplates';
import { requireAuthenticatedRequest } from '@/lib/serverAuth';

export async function POST(request: NextRequest) {
    const authError = await requireAuthenticatedRequest(request);
    if (authError) return authError;

    try {
        const { designId, recipientEmail, recipientName, message, pdfBase64 } = await request.json();

        // Validate inputs
        if (!designId || !recipientEmail || !recipientName) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Get design
        const design = await designsDb.getById(designId);
        if (!design) {
            return NextResponse.json(
                { error: 'Design not found' },
                { status: 404 }
            );
        }

        let pdfBuffer: Buffer;

        if (pdfBase64) {
            // Use client-provided base64 PDF (which contains high-fidelity canvas images)
            const base64Data = pdfBase64.replace(/^data:application\/pdf;filename=.*?;base64,/, '')
                                        .replace(/^data:application\/pdf;base64,/, '');
            pdfBuffer = Buffer.from(base64Data, 'base64');
        } else {
            // Fall back to server-side vector generation
            // Get pricing config
            const pricingConfig = await db.settings.getPricing();
            const thicknessPricing = await db.settings.getThicknessPricing();
            const fullPricingConfig = { ...pricingConfig, thicknessPricing };
    
            // Build per-item cost breakdown (same as design page Export PDF)
            const designItems = design.drawingData?.items || [];
            const costBreakdown = designItems.map((item: any) => {
                const netAreaVal = item.netArea || item.area || 0;
                const holeAmount = (item.holes || 0) * (fullPricingConfig?.holeCharge || 0);
                const cutAmount = (item.cuts || 0) * (fullPricingConfig?.cutCharge || 0);
                const itemTotal = holeAmount + cutAmount;
    
                const subItems: Array<{ name: string; amount: number }> = [];
                if (holeAmount > 0) subItems.push({ name: `${item.holes} Holes (@ ₹${fullPricingConfig?.holeCharge}/ea)`, amount: holeAmount });
                if (cutAmount > 0) subItems.push({ name: `${item.cuts} Cuts (@ ₹${fullPricingConfig?.cutCharge}/ea)`, amount: cutAmount });
    
                return {
                    name: `${item.name} (${item.type}) - ${item.thickness}mm` + (item.quantity && item.quantity > 1 ? ` (${item.quantity} pcs)` : ''),
                    details: `${netAreaVal.toFixed(2)} sq ft; design processing charges only`,
                    amount: itemTotal,
                    subItems
                };
            });
    
            // Generate PDF as buffer
            pdfBuffer = generateEstimatePDFBuffer(design, {
                companyName: process.env.COMPANY_NAME || 'Arjun Glass House',
                companyAddress: process.env.COMPANY_ADDRESS || 'Your Address Here',
                companyPhone: process.env.COMPANY_PHONE || 'Your Phone',
                companyEmail: process.env.COMPANY_EMAIL || 'your@email.com',
                termsAndConditions: fullPricingConfig?.termsAndConditions,
                costBreakdown
            });
        }

        // Generate email HTML
        const emailHTML = generateEstimateEmailHTML(
            design,
            recipientName,
            message,
            {
                name: process.env.COMPANY_NAME || 'Arjun Glass House',
                address: process.env.COMPANY_ADDRESS || 'Your Address Here',
                phone: process.env.COMPANY_PHONE || 'Your Phone',
                email: process.env.COMPANY_EMAIL || 'your@email.com'
            }
        );

        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });

        // Send email
        const info = await transporter.sendMail({
            from: `"${process.env.COMPANY_NAME || 'Arjun Glass House'}" <${process.env.GMAIL_USER}>`,
            to: recipientEmail,
            subject: `Glass Estimate - ${design.name}`,
            html: emailHTML,
            attachments: [
                {
                    filename: `estimate_${design.name.replace(/\s+/g, '_')}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        console.log('Email sent:', info.messageId);

        return NextResponse.json({
            success: true,
            messageId: info.messageId
        });

    } catch (error: any) {
        console.error('Error sending email:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send email' },
            { status: 500 }
        );
    }
}
