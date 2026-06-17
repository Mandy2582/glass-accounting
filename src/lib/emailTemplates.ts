import { CustomDesign } from '@/types';

/**
 * Generate HTML email template for estimate
 */
export function generateEstimateEmailHTML(
    design: CustomDesign,
    recipientName: string,
    customMessage?: string,
    companyInfo?: {
        name: string;
        address: string;
        phone: string;
        email: string;
    }
): string {
    const company = companyInfo || {
        name: 'Arjun Glass',
        address: 'Your Address Here',
        phone: 'Your Phone',
        email: 'your@email.com'
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Glass Estimate</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 20px auto;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
        }
        .content {
            padding: 30px 20px;
        }
        .greeting {
            font-size: 16px;
            margin-bottom: 20px;
        }
        .message {
            background: #f0f9ff;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .details {
            background: #f9fafb;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }
        .details h2 {
            margin: 0 0 15px 0;
            font-size: 20px;
            color: #1e40af;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #6b7280;
        }
        .detail-value {
            color: #111827;
        }
        .cost {
            font-size: 24px;
            font-weight: 700;
            color: #10b981;
        }
        .attachment-note {
            background: #fef3c7;
            border: 1px solid #fbbf24;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
        }
        .footer {
            background: #f9fafb;
            padding: 20px;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
            border-top: 1px solid #e5e7eb;
        }
        .footer-company {
            font-weight: 600;
            color: #111827;
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 Glass Estimate</h1>
        </div>
        
        <div class="content">
            <div class="greeting">
                <p>Dear ${recipientName},</p>
            </div>
            
            ${customMessage ? `
            <div class="message">
                <p style="margin: 0;">${customMessage.replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
            
            <p>Thank you for your interest in our custom glass services. Please find below the estimate for your custom glass design.</p>
            
            <div class="details">
                <h2>${design.name}</h2>
                
                <div class="detail-row">
                    <span class="detail-label">Total Area:</span>
                    <span class="detail-value">${design.totalArea.toFixed(2)} sqft</span>
                </div>
                
                <div class="detail-row">
                    <span class="detail-label">Gross Area:</span>
                    <span class="detail-value">${design.grossArea.toFixed(2)} sqft</span>
                </div>
                
                ${design.holes > 0 ? `
                <div class="detail-row">
                    <span class="detail-label">Holes:</span>
                    <span class="detail-value">${design.holes}</span>
                </div>
                ` : ''}
                
                ${design.cuts > 0 ? `
                <div class="detail-row">
                    <span class="detail-label">Cuts:</span>
                    <span class="detail-value">${design.cuts}</span>
                </div>
                ` : ''}
                
                <div class="detail-row" style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #e5e7eb;">
                    <span class="detail-label" style="font-size: 18px;">Estimated Cost:</span>
                    <span class="cost">₹${design.estimatedCost.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="attachment-note">
                <p style="margin: 0;"><strong>📎 Attachment:</strong> A detailed PDF estimate with design specifications is attached to this email.</p>
            </div>
            
            <p>Please review the attached estimate and let us know if you have any questions or would like to proceed with the order.</p>
            
            <p>We look forward to working with you!</p>
            
            <p style="margin-top: 30px;">
                Best regards,<br>
                <strong>${company.name}</strong>
            </p>
        </div>
        
        <div class="footer">
            <div class="footer-company">${company.name}</div>
            <div>${company.address}</div>
            <div>Phone: ${company.phone} | Email: ${company.email}</div>
        </div>
    </div>
</body>
</html>
    `.trim();
}
