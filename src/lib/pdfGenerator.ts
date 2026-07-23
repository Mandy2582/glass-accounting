import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { CustomDesign, Order } from '@/types';
import { formatInchesToFraction } from '@/lib/utils';
import { getVisibleNotes } from '@/lib/orderNotes';

interface PDFOptions {
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyEmail?: string;
    termsAndConditions?: string;
    itemImages?: Array<{ itemName: string; itemType: string; imageData: string; width?: number; height?: number; }>;
    costBreakdown?: Array<{
        name: string;
        details: string;
        amount: number;
        subItems?: Array<{ name: string; amount: number }>;
    }>;
    excludePricing?: boolean;
    designs?: CustomDesign[];
    outputType?: 'save' | 'datauristring';
    totalOverride?: number;
}

/**
 * Generate a PDF estimate from a custom design
 */
export async function generateEstimatePDF(
    design: CustomDesign,
    canvasElement: HTMLCanvasElement | null,
    options: PDFOptions = {}
): Promise<string | void> {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const displayTotal = options.totalOverride ?? design.estimatedCost;
    let yPos = margin;

    // Company Header
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(options.companyName || 'Arjun Glass', margin, yPos);
    yPos += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    if (options.companyAddress) {
        pdf.text(options.companyAddress, margin, yPos);
        yPos += 5;
    }
    if (options.companyPhone) {
        pdf.text(`Phone: ${options.companyPhone}`, margin, yPos);
        yPos += 5;
    }
    if (options.companyEmail) {
        pdf.text(`Email: ${options.companyEmail}`, margin, yPos);
        yPos += 5;
    }

    // Title
    yPos += 5;
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CUSTOM GLASS ESTIMATE', margin, yPos);
    yPos += 10;

    // Design Info
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Design Details:', margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Design Name: ${design.name}`, margin + 5, yPos);
    yPos += 5;

    if (design.customerName) {
        pdf.text(`Customer: ${design.customerName}`, margin + 5, yPos);
        yPos += 5;
    }

    pdf.text(`Date: ${new Date(design.createdDate).toLocaleDateString()}`, margin + 5, yPos);
    yPos += 5;

    yPos += 5;

    // Drawing Images - Multiple items or single canvas
    if (options.itemImages && options.itemImages.length > 0) {
        // Multi-item design: show each item's canvas
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Item Drawings:', margin, yPos);
        yPos += 8;

        for (const item of options.itemImages) {
            // Check if we need a new page
            if (yPos > pageHeight - 100) {
                pdf.addPage();
                yPos = margin;
            }

            // Item label
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${item.itemName} (${item.itemType})`, margin + 5, yPos);
            yPos += 6;

            try {
                const imgWidth = pageWidth - (2 * margin);
                // Estimate height based on typical canvas aspect ratio
                const imgHeight = (item.width && item.height) ? imgWidth * (item.height / item.width) : imgWidth * 0.6; // Adjust as needed

                pdf.addImage(item.imageData, 'PNG', margin, yPos, imgWidth, imgHeight);
                yPos += imgHeight + 10;
            } catch (error) {
                console.error(`Error adding image for ${item.itemName}:`, error);
                pdf.setFont('helvetica', 'italic');
                pdf.setTextColor(150);
                pdf.text('(Image not available)', margin + 5, yPos);
                yPos += 10;
                pdf.setTextColor(0);
            }
        }
    } else if (canvasElement) {
        // Single canvas image (legacy or single-item design)
        try {
            // Add note for multi-item designs
            const items = design.drawingData?.items || [];
            if (items.length > 1) {
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'italic');
                pdf.setTextColor(100);
                pdf.text(`Design Preview (showing currently active item)`, margin, yPos);
                yPos += 6;
                pdf.setTextColor(0);
            }

            const canvasImage = canvasElement.toDataURL('image/png');
            const imgWidth = pageWidth - (2 * margin);
            const imgHeight = (canvasElement.height / canvasElement.width) * imgWidth;

            // Check if image fits on current page
            if (yPos + imgHeight > pageHeight - margin) {
                pdf.addPage();
                yPos = margin;
            }

            pdf.addImage(canvasImage, 'PNG', margin, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 10;
        } catch (error) {
            console.error('Error adding canvas image to PDF:', error);
        }
    } else {
        // Fallback: Render vector outlines if canvas is not present (e.g. from Order details page)
        yPos = drawDesignVectorOutlines(pdf, design, yPos + 10);
    }

    // Items Section (if multi-item design)
    const items = design.drawingData?.items || [];
    if (items.length > 1) {
        if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Items:', margin, yPos);
        yPos += 8;

        // Table header
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        const colX = [margin + 5, margin + 50, margin + 85, margin + 115, margin + 140];
        pdf.text('Name', colX[0], yPos);
        pdf.text('Type', colX[1], yPos);
        pdf.text('Thickness', colX[2], yPos);
        pdf.text('Area (sqft)', colX[3], yPos);
        yPos += 5;
        pdf.setDrawColor(200);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;

        // Table rows
        pdf.setFont('helvetica', 'normal');
        items.forEach((item: any) => {
            if (yPos > pageHeight - margin - 10) {
                pdf.addPage();
                yPos = margin;
            }
            pdf.text(item.name || 'Unnamed', colX[0], yPos);
            pdf.text(item.type || 'N/A', colX[1], yPos);
            pdf.text(`${item.thickness || 6}mm`, colX[2], yPos);
            pdf.text((item.netArea || item.area || 0).toFixed(2), colX[3], yPos);
            yPos += 5;
        });

        yPos += 5;
    }

    // Measurements
    if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
    }

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Total Measurements:', margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Gross Area: ${design.grossArea.toFixed(2)} sq ft`, margin + 5, yPos);
    yPos += 5;
    pdf.text(`Net Area: ${design.totalArea.toFixed(2)} sq ft`, margin + 5, yPos);
    yPos += 5;

    if (design.holes > 0) {
        pdf.text(`Total Holes: ${design.holes}`, margin + 5, yPos);
        yPos += 5;
    }

    if (design.cuts > 0) {
        pdf.text(`Total Cuts: ${design.cuts}`, margin + 5, yPos);
        yPos += 5;
    }

    yPos += 5;

    // Cost Breakdown
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Cost Breakdown:', margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);

    if (options.costBreakdown && options.costBreakdown.length > 0) {
        options.costBreakdown.forEach(item => {
            if (yPos > pageHeight - margin - 20) {
                pdf.addPage();
                yPos = margin;
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.text(item.name, margin + 5, yPos);
            pdf.text(`₹${item.amount.toFixed(2)}`, pageWidth - margin - 30, yPos);
            yPos += 5;
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(100);
            pdf.text(item.details, margin + 10, yPos);
            pdf.setTextColor(0);
            yPos += 5;
            
            if (item.subItems) {
                item.subItems.forEach(subItem => {
                    pdf.text(`+ ${subItem.name}`, margin + 15, yPos);
                    pdf.text(`₹${subItem.amount.toFixed(2)}`, pageWidth - margin - 30, yPos);
                    yPos += 4;
                });
            }
            yPos += 2;
            pdf.setFontSize(10);
        });
    } else {
        if (design.holes > 0) {
            pdf.text(`Hole Charges (${design.holes} holes)`, margin + 5, yPos);
            yPos += 5;
        }
        if (design.cuts > 0) {
            pdf.text(`Cut Charges (${design.cuts} cuts)`, margin + 5, yPos);
            yPos += 5;
        }
    }

    // Total
    yPos += 3;
    pdf.setDrawColor(0);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('TOTAL ESTIMATED COST:', margin + 5, yPos);
    pdf.text(`₹${displayTotal.toFixed(2)}`, pageWidth - margin - 35, yPos);
    yPos += 10;

    // Notes
    if (design.notes) {
        if (yPos > pageHeight - 40) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Notes:', margin, yPos);
        yPos += 6;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        const splitNotes = pdf.splitTextToSize(design.notes, pageWidth - (2 * margin) - 10);
        pdf.text(splitNotes, margin + 5, yPos);
        yPos += (splitNotes.length * 5) + 5;
    }

    // Terms & Conditions
    if (options.termsAndConditions) {
        if (yPos > pageHeight - 60) {
            pdf.addPage();
            yPos = margin;
        }

        yPos += 5;
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Terms & Conditions:', margin, yPos);
        yPos += 6;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        const splitTerms = pdf.splitTextToSize(options.termsAndConditions, pageWidth - (2 * margin) - 10);
        pdf.text(splitTerms, margin + 5, yPos);
        yPos += (splitTerms.length * 4) + 5;
    }


    // Footer
    const footerY = pageHeight - 20;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100);
    pdf.text('This is an estimate only. Final pricing may vary based on actual specifications.', margin, footerY);
    pdf.text(`Generated on ${new Date().toLocaleDateString()}`, margin, footerY + 4);

    // Save or return PDF
    const fileName = `estimate_${design.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    if (options.outputType === 'datauristring') {
        return pdf.output('datauristring');
    }
    pdf.save(fileName);
}

/**
 * Generate a simple estimate preview (for display in modal)
 */
export function generateEstimatePreview(design: CustomDesign): string {
    return `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px;">
            <h2 style="color: #1f2937; margin-bottom: 10px;">Custom Glass Estimate</h2>
            <div style="margin-bottom: 20px;">
                <p><strong>Design:</strong> ${design.name}</p>
                ${design.customerName ? `<p><strong>Customer:</strong> ${design.customerName}</p>` : ''}
                <p><strong>Date:</strong> ${new Date(design.createdDate).toLocaleDateString()}</p>
            </div>
            
            <h3 style="color: #374151; margin-top: 20px;">Measurements</h3>
            <p>Gross Area: ${design.grossArea.toFixed(2)} sq ft</p>
            <p>Net Area: ${design.totalArea.toFixed(2)} sq ft</p>
            ${design.holes > 0 ? `<p>Holes: ${design.holes}</p>` : ''}
            ${design.cuts > 0 ? `<p>Cuts: ${design.cuts}</p>` : ''}
            
            <h3 style="color: #374151; margin-top: 20px;">Cost Breakdown</h3>
            <table style="width: 100%; border-collapse: collapse;">
                ${design.holes > 0 ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Holes</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${design.holes}</td></tr>` : ''}
                ${design.cuts > 0 ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Cuts</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${design.cuts}</td></tr>` : ''}
                <tr style="font-weight: bold; background: #f9fafb;">
                    <td style="padding: 12px;">Total</td>
                    <td style="padding: 12px; text-align: right;">₹${design.estimatedCost.toFixed(2)}</td>
                </tr>
            </table>
        </div>
    `;
}

/**
 * Generate PDF as buffer for email attachment
 * This version doesn't require canvas element since it's called server-side
 */
export function generateEstimatePDFBuffer(
    design: CustomDesign,
    options: PDFOptions = {}
): Buffer {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const displayTotal = options.totalOverride ?? design.estimatedCost;
    let yPos = margin;

    // Company Header
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(options.companyName || 'Arjun Glass', margin, yPos);
    yPos += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    if (options.companyAddress) {
        pdf.text(options.companyAddress, margin, yPos);
        yPos += 5;
    }
    if (options.companyPhone) {
        pdf.text(`Phone: ${options.companyPhone}`, margin, yPos);
        yPos += 5;
    }
    if (options.companyEmail) {
        pdf.text(`Email: ${options.companyEmail}`, margin, yPos);
        yPos += 5;
    }

    // Title
    yPos += 5;
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CUSTOM GLASS ESTIMATE', margin, yPos);
    yPos += 10;

    // Design Info
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Design Details:', margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Design Name: ${design.name}`, margin + 5, yPos);
    yPos += 5;

    if (design.customerName) {
        pdf.text(`Customer: ${design.customerName}`, margin + 5, yPos);
        yPos += 5;
    }

    pdf.text(`Date: ${new Date(design.createdDate).toLocaleDateString()}`, margin + 5, yPos);
    yPos += 5;

    yPos += 5;

    // Drawing Images - Vector outlines (no canvas available in buffer mode)
    yPos = drawDesignVectorOutlines(pdf, design, yPos);

    // Items Section (if multi-item design)
    const items = design.drawingData?.items || [];
    if (items.length > 1) {
        if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Items:', margin, yPos);
        yPos += 8;

        // Table header
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        const colX = [margin + 5, margin + 50, margin + 85, margin + 115, margin + 140];
        pdf.text('Name', colX[0], yPos);
        pdf.text('Type', colX[1], yPos);
        pdf.text('Thickness', colX[2], yPos);
        pdf.text('Area (sqft)', colX[3], yPos);
        yPos += 5;
        pdf.setDrawColor(200);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;

        // Table rows
        pdf.setFont('helvetica', 'normal');
        items.forEach((item: any) => {
            if (yPos > pageHeight - margin - 10) {
                pdf.addPage();
                yPos = margin;
            }
            pdf.text(item.name || 'Unnamed', colX[0], yPos);
            pdf.text(item.type || 'N/A', colX[1], yPos);
            pdf.text(`${item.thickness || 6}mm`, colX[2], yPos);
            pdf.text((item.netArea || item.area || 0).toFixed(2), colX[3], yPos);
            yPos += 5;
        });

        yPos += 5;
    }

    // Measurements
    if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
    }

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Total Measurements:', margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Gross Area: ${design.grossArea.toFixed(2)} sq ft`, margin + 5, yPos);
    yPos += 5;
    pdf.text(`Net Area: ${design.totalArea.toFixed(2)} sq ft`, margin + 5, yPos);
    yPos += 5;

    if (design.holes > 0) {
        pdf.text(`Total Holes: ${design.holes}`, margin + 5, yPos);
        yPos += 5;
    }

    if (design.cuts > 0) {
        pdf.text(`Total Cuts: ${design.cuts}`, margin + 5, yPos);
        yPos += 5;
    }

    yPos += 5;

    // Cost Breakdown
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Cost Breakdown:', margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);

    if (options.costBreakdown && options.costBreakdown.length > 0) {
        options.costBreakdown.forEach(item => {
            if (yPos > pageHeight - margin - 20) {
                pdf.addPage();
                yPos = margin;
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.text(item.name, margin + 5, yPos);
            pdf.text(`₹${item.amount.toFixed(2)}`, pageWidth - margin - 30, yPos);
            yPos += 5;
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(100);
            pdf.text(item.details, margin + 10, yPos);
            pdf.setTextColor(0);
            yPos += 5;
            
            if (item.subItems) {
                item.subItems.forEach(subItem => {
                    pdf.text(`+ ${subItem.name}`, margin + 15, yPos);
                    pdf.text(`₹${subItem.amount.toFixed(2)}`, pageWidth - margin - 30, yPos);
                    yPos += 4;
                });
            }
            yPos += 2;
            pdf.setFontSize(10);
        });
    } else {
        if (design.holes > 0) {
            pdf.text(`Hole Charges (${design.holes} holes)`, margin + 5, yPos);
            yPos += 5;
        }
        if (design.cuts > 0) {
            pdf.text(`Cut Charges (${design.cuts} cuts)`, margin + 5, yPos);
            yPos += 5;
        }
    }

    // Total
    yPos += 3;
    pdf.setDrawColor(0);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('TOTAL ESTIMATED COST:', margin + 5, yPos);
    pdf.text(`₹${displayTotal.toFixed(2)}`, pageWidth - margin - 35, yPos);
    yPos += 10;

    // Notes
    if (design.notes) {
        if (yPos > pageHeight - 40) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Notes:', margin, yPos);
        yPos += 6;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        const splitNotes = pdf.splitTextToSize(design.notes, pageWidth - (2 * margin) - 10);
        pdf.text(splitNotes, margin + 5, yPos);
        yPos += (splitNotes.length * 5) + 5;
    }

    // Terms & Conditions
    if (options.termsAndConditions) {
        if (yPos > pageHeight - 60) {
            pdf.addPage();
            yPos = margin;
        }

        yPos += 5;
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Terms & Conditions:', margin, yPos);
        yPos += 6;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        const splitTerms = pdf.splitTextToSize(options.termsAndConditions, pageWidth - (2 * margin) - 10);
        pdf.text(splitTerms, margin + 5, yPos);
        yPos += (splitTerms.length * 4) + 5;
    }

    // Footer
    const footerY = pageHeight - 20;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100);
    pdf.text('This is an estimate only. Final pricing may vary based on actual specifications.', margin, footerY);
    pdf.text(`Generated on ${new Date().toLocaleDateString()}`, margin, footerY + 4);

    // Return as buffer
    const pdfOutput = pdf.output('arraybuffer');
    return Buffer.from(pdfOutput);
}


/**
 * Generate a PDF for a customer or purchase order
 */
const getParallelogramPdfPoints = (w: number, h: number, skewX?: number): Array<{ x: number; y: number }> => {
    const skewFactor = 0.7;
    const wr = w * skewFactor;
    const sk = skewX !== undefined ? skewX : Math.round(h * 0.35);
    return [
        { x: 0, y: sk },
        { x: wr, y: 0 },
        { x: wr, y: h },
        { x: 0, y: h + sk }
    ];
};

const getShapeBounds = (shape: any): { minX: number; maxX: number; minY: number; maxY: number } => {
    if (shape.type === 'glass_circle' || shape.type === 'hole') {
        const r = shape.radius || 0;
        return {
            minX: shape.x - r,
            maxX: shape.x + r,
            minY: shape.y - r,
            maxY: shape.y + r
        };
    }

    if (shape.type === 'glass_polygon' && shape.points?.length) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < shape.points.length; i += 2) {
            xs.push(shape.x + shape.points[i]);
            ys.push(shape.y + shape.points[i + 1]);
        }
        return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys)
        };
    }

    if (shape.type === 'glass_parallelogram') {
        const pts = getParallelogramPdfPoints(shape.width || 0, shape.height || 0, shape.skewX);
        return {
            minX: shape.x + Math.min(...pts.map(p => p.x)),
            maxX: shape.x + Math.max(...pts.map(p => p.x)),
            minY: shape.y + Math.min(...pts.map(p => p.y)),
            maxY: shape.y + Math.max(...pts.map(p => p.y))
        };
    }

    return {
        minX: shape.x || 0,
        maxX: (shape.x || 0) + (shape.width || 0),
        minY: shape.y || 0,
        maxY: (shape.y || 0) + (shape.height || 0)
    };
};

const drawPdfPolygon = (
    pdf: jsPDF,
    points: Array<{ x: number; y: number }>,
    close: boolean = true
) => {
    if (points.length < 2) return;
    for (let i = 0; i < points.length; i++) {
        const next = points[(i + 1) % points.length];
        if (!close && i === points.length - 1) break;
        pdf.line(points[i].x, points[i].y, next.x, next.y);
    }
};

const getGlassShapeBillingAreaSqFt = (shape: any): number => {
    if (shape.type === 'glass_circle') {
        const dIn = ((shape.radius || 0) * 2) / 10;
        return (dIn * dIn) / 144;
    }

    if (shape.type === 'glass_polygon' && shape.points?.length) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < shape.points.length; i += 2) {
            minX = Math.min(minX, shape.points[i]);
            maxX = Math.max(maxX, shape.points[i]);
            minY = Math.min(minY, shape.points[i + 1]);
            maxY = Math.max(maxY, shape.points[i + 1]);
        }
        return (((maxX - minX) / 10) * ((maxY - minY) / 10)) / 144;
    }

    return (((shape.width || 0) / 10) * ((shape.height || 0) / 10)) / 144;
};

export function drawDesignVectorOutlines(pdf: jsPDF, design: CustomDesign, startY: number): number {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = startY;

    // Use pieces if available, otherwise fall back to items
    let drawPieces: any[] = design.drawingData?.pieces || [];
    if (drawPieces.length === 0 && design.drawingData?.items) {
        // Convert items to a pieces-like structure for rendering
        drawPieces = design.drawingData.items.map((item: any) => ({
            name: item.name || 'Unnamed',
            type: item.type || 'Glass',
            thickness: item.thickness || 6,
            quantity: item.quantity,
            shapes: item.shapes || [],
            netArea: item.netArea || item.area || 0,
            holes: item.holes || 0,
            cuts: item.cuts || 0,
        }));
    }

    if (drawPieces.length === 0) return yPos;

    if (yPos > pageHeight - 30) {
        pdf.addPage();
        yPos = margin;
    }

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Design Drawings — ${design.name}`, margin, yPos);
    yPos += 10;

    drawPieces.forEach((piece: any, idx: number) => {
        // Each piece gets a generous drawing area
        const drawWidth = 120;
        const drawHeight = 75;
        const neededSpace = drawHeight + 30; // label + drawing + gap

        if (yPos + neededSpace > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
        }

        // Piece label
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        const label = `${idx + 1}. ${piece.name || 'Unnamed'} (${piece.type || 'Glass'}) — ${piece.thickness || 6}mm`;
        pdf.text(label, margin + 2, yPos);
        yPos += 7;

        const boxX = margin + 2;
        const boxY = yPos;

        // Light background box
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(200, 210, 220);
        pdf.setLineWidth(0.3);
        pdf.rect(boxX, boxY, drawWidth, drawHeight, 'FD');

        const shapes = piece.shapes || [];
        const holeShapes = shapes.filter((s: any) => s.type === 'hole');
        const cutShapes = shapes.filter((s: any) => s.type === 'cut');
        const accessoryShapes = shapes.filter((s: any) => s.type === 'accessory');
        const glassShapes = shapes.filter((s: any) =>
            s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon' || s.type === 'glass_parallelogram'
        );
        const computedAreaSqFt = glassShapes.reduce((sum: number, shape: any) => sum + getGlassShapeBillingAreaSqFt(shape), 0);
        const displayAreaSqFt = piece.netArea || piece.grossArea || piece.area || computedAreaSqFt;

        // Compute bounding box from all shapes
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        shapes.forEach((shape: any) => {
            const bounds = getShapeBounds(shape);
            minX = Math.min(minX, bounds.minX);
            maxX = Math.max(maxX, bounds.maxX);
            minY = Math.min(minY, bounds.minY);
            maxY = Math.max(maxY, bounds.maxY);
        });

        if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
            minX = 0;
            minY = 0;
            maxX = 100;
            maxY = 100;
        }

        const shapesWidth = (maxX > minX) ? (maxX - minX) : 0;
        const shapesHeight = (maxY > minY) ? (maxY - minY) : 0;
        const computedWidthInch = shapesWidth / 10;  // 10px = 1 inch
        const computedHeightInch = shapesHeight / 10;

        // Draw shapes scaled to fit the box with padding
        const padX = 12, padY = 10;
        const availW = drawWidth - 2 * padX;
        const availH = drawHeight - 2 * padY;
        const scaleX = shapesWidth > 0 ? availW / shapesWidth : 1;
        const scaleY = shapesHeight > 0 ? availH / shapesHeight : 1;
        const scale = Math.min(scaleX, scaleY, 1);

        const drawnW = shapesWidth * scale;
        const drawnH = shapesHeight * scale;
        const offsetX = boxX + padX + (availW - drawnW) / 2;
        const offsetY = boxY + padY + (availH - drawnH) / 2;
        const mapPoint = (x: number, y: number) => ({
            x: offsetX + (x - minX) * scale,
            y: offsetY + (y - minY) * scale
        });

        // Render glass shapes
        pdf.setDrawColor(37, 99, 235);
        pdf.setLineWidth(0.6);
        glassShapes.forEach((shape: any) => {
            const topLeft = getShapeBounds(shape);
            const mappedTopLeft = mapPoint(topLeft.minX, topLeft.minY);
            const sx = mappedTopLeft.x;
            const sy = mappedTopLeft.y;
            const sw = (shape.width || 0) * scale;
            const sh = (shape.height || 0) * scale;

            if (shape.type === 'glass_rect') {
                pdf.setFillColor(219, 234, 254);
                pdf.rect(sx, sy, sw, sh, 'FD');

                // External dimension lines
                if (sw > 8 && sh > 8) {
                    const shapeWInch = (shape.width || 0) / 10;
                    const shapeHInch = (shape.height || 0) / 10;
                    
                    pdf.setDrawColor(100, 116, 139); // Slate gray for dimension lines
                    pdf.setLineWidth(0.2);
                    
                    // Top Width Dimension (pushed further out to 6)
                    const dimY = sy - 6;
                    pdf.line(sx, dimY, sx + sw, dimY); // main line
                    pdf.line(sx, dimY - 1.5, sx, dimY + 1.5); // left tick
                    pdf.line(sx + sw, dimY - 1.5, sx + sw, dimY + 1.5); // right tick
                    
                    // Right Height Dimension (pushed further out to 6)
                    const dimX = sx + sw + 6;
                    pdf.line(dimX, sy, dimX, sy + sh); // main line
                    pdf.line(dimX - 1.5, sy, dimX + 1.5, sy); // top tick
                    pdf.line(dimX - 1.5, sy + sh, dimX + 1.5, sy + sh); // bottom tick
                    
                    pdf.setFontSize(6);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(71, 85, 105);
                    
                    // Width text
                    const wText = `${formatInchesToFraction(shapeWInch)}"`;
                    const wTextWidth = pdf.getTextWidth(wText);
                    pdf.text(wText, sx + (sw - wTextWidth) / 2, dimY - 1.5);
                    
                    // Height text
                    const hText = `${formatInchesToFraction(shapeHInch)}"`;
                    pdf.text(hText, dimX + 2, sy + sh / 2 + 2);
                    
                    // Reset colors
                    pdf.setDrawColor(37, 99, 235);
                    pdf.setTextColor(0);
                }
            } else if (shape.type === 'glass_parallelogram') {
                pdf.setFillColor(219, 234, 254);
                const pts = getParallelogramPdfPoints(shape.width || 0, shape.height || 0, shape.skewX)
                    .map(p => mapPoint(shape.x + p.x, shape.y + p.y));
                drawPdfPolygon(pdf, pts);

                const bounds = getShapeBounds(shape);
                const bw = (bounds.maxX - bounds.minX) * scale;
                const bh = (bounds.maxY - bounds.minY) * scale;
                if (bw > 8 && bh > 8) {
                    pdf.setDrawColor(100, 116, 139);
                    pdf.setLineWidth(0.2);
                    const dimY = sy - 6;
                    pdf.line(sx, dimY, sx + bw, dimY);
                    pdf.line(sx, dimY - 1.5, sx, dimY + 1.5);
                    pdf.line(sx + bw, dimY - 1.5, sx + bw, dimY + 1.5);
                    const dimX = sx + bw + 6;
                    pdf.line(dimX, sy, dimX, sy + bh);
                    pdf.line(dimX - 1.5, sy, dimX + 1.5, sy);
                    pdf.line(dimX - 1.5, sy + bh, dimX + 1.5, sy + bh);
                    pdf.setFontSize(6);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(71, 85, 105);
                    const wText = `${formatInchesToFraction((shape.width || 0) / 10)}"`;
                    pdf.text(wText, sx + (bw - pdf.getTextWidth(wText)) / 2, dimY - 1.5);
                    const hText = `${formatInchesToFraction((shape.height || 0) / 10)}"`;
                    pdf.text(hText, dimX + 2, sy + bh / 2 + 2);
                    pdf.setDrawColor(37, 99, 235);
                    pdf.setTextColor(0);
                }
            } else if (shape.type === 'glass_circle') {
                const r = (shape.radius || 0) * scale;
                pdf.setFillColor(219, 234, 254);
                const center = mapPoint(shape.x, shape.y);
                pdf.circle(center.x, center.y, r, 'FD');
                
                // Diameter dimension
                if (r > 4) {
                    const diamInch = ((shape.radius || 0) * 2) / 10;
                    pdf.setDrawColor(100, 116, 139);
                    pdf.setLineWidth(0.2);
                    
                    const dimY = center.y - r - 6;
                    pdf.line(center.x - r, dimY, center.x + r, dimY);
                    pdf.line(center.x - r, dimY - 1.5, center.x - r, dimY + 1.5);
                    pdf.line(center.x + r, dimY - 1.5, center.x + r, dimY + 1.5);
                    
                    pdf.setFontSize(6);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(71, 85, 105);
                    
                    const dText = `Ø ${formatInchesToFraction(diamInch)}"`;
                    const dTextWidth = pdf.getTextWidth(dText);
                    pdf.text(dText, center.x - dTextWidth / 2, dimY - 1.5);
                    
                    pdf.setDrawColor(37, 99, 235);
                    pdf.setTextColor(0);
                }
            } else if (shape.type === 'glass_polygon' && shape.points) {
                pdf.setFillColor(219, 234, 254);
                const pts = [];
                for (let i = 0; i < shape.points.length; i += 2) {
                    pts.push(mapPoint(shape.x + shape.points[i], shape.y + shape.points[i + 1]));
                }
                drawPdfPolygon(pdf, pts);
            }
        });

        // Render holes
        holeShapes.forEach((shape: any) => {
            const center = mapPoint(shape.x, shape.y);
            const radius = Math.max(1, Math.min(4, (shape.radius || 10) * scale));
            pdf.setDrawColor(239, 68, 68);
            pdf.setFillColor(254, 226, 226);
            pdf.circle(center.x, center.y, radius, 'FD');
            pdf.setFontSize(5);
            pdf.setTextColor(185, 28, 28);
            pdf.text('H', center.x - 1.2, center.y + 1.6);
            pdf.setTextColor(0);
        });

        // Render cuts
        cutShapes.forEach((shape: any) => {
            const mapped = mapPoint(shape.x, shape.y);
            const sx = mapped.x;
            const sy = mapped.y;
            const sw = (shape.width || 0) * scale;
            const sh = (shape.height || 0) * scale;
            pdf.setDrawColor(16, 185, 129);
            pdf.setLineWidth(0.8);
            (pdf as any).setLineDashPattern?.([1.5, 1.5], 0);
            pdf.rect(sx, sy, Math.max(sw, 1), Math.max(sh, 1));
            (pdf as any).setLineDashPattern?.([], 0);
            pdf.setFontSize(5);
            pdf.setTextColor(4, 120, 87);
            pdf.text('C', sx + Math.max(sw, 1) / 2 - 1.2, sy + Math.max(sh, 1) / 2 + 1.6);
            pdf.setTextColor(0);
        });

        // Render accessories/hardware markers
        accessoryShapes.forEach((shape: any) => {
            const mapped = mapPoint(shape.x, shape.y);
            const sx = mapped.x;
            const sy = mapped.y;
            const sw = Math.max((shape.width || 20) * scale, 2.5);
            const sh = Math.max((shape.height || 20) * scale, 2.5);
            pdf.setDrawColor(245, 158, 11);
            pdf.setFillColor(254, 243, 199);
            pdf.setLineWidth(0.5);

            if (shape.accessoryType === 'hinge') {
                pdf.rect(sx, sy, sw, sh, 'FD');
                pdf.line(sx + sw / 2, sy, sx + sw / 2, sy + sh);
            } else if (shape.accessoryType === 'lock') {
                pdf.roundedRect(sx, sy, sw, sh, 1, 1, 'FD');
                pdf.circle(sx + sw / 2, sy + sh / 2, Math.min(sw, sh) * 0.18, 'S');
            } else if (shape.accessoryType === 'connector') {
                pdf.rect(sx, sy, sw, Math.max(sh * 0.45, 1), 'FD');
                pdf.rect(sx, sy, Math.max(sw * 0.45, 1), sh, 'FD');
            } else if (shape.accessoryType === 'profile') {
                pdf.rect(sx, sy, sw, Math.max(sh, 1.2), 'FD');
            } else {
                drawPdfPolygon(pdf, [
                    { x: sx + sw / 2, y: sy },
                    { x: sx + sw, y: sy + sh / 2 },
                    { x: sx + sw / 2, y: sy + sh },
                    { x: sx, y: sy + sh / 2 }
                ]);
            }
        });

        // Right-side info panel
        const infoX = boxX + drawWidth + 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(60);
        let infoY = boxY + 8;
        pdf.text(`Width: ${formatInchesToFraction(computedWidthInch)}"`, infoX, infoY); infoY += 5;
        pdf.text(`Height: ${formatInchesToFraction(computedHeightInch)}"`, infoX, infoY); infoY += 5;
        pdf.text(`Area: ${displayAreaSqFt.toFixed(2)} sqft`, infoX, infoY); infoY += 5;
        if (holeShapes.length > 0) { pdf.text(`Holes: ${holeShapes.length}`, infoX, infoY); infoY += 5; }
        if (cutShapes.length > 0) { pdf.text(`Cuts: ${cutShapes.length}`, infoX, infoY); infoY += 5; }
        if (accessoryShapes.length > 0) {
            pdf.text(`Hardware: ${accessoryShapes.length}`, infoX, infoY); infoY += 5;
            const hardwareNames = Array.from(new Set(accessoryShapes.map((shape: any) => shape.accessoryName || shape.accessoryType || 'Hardware')));
            hardwareNames.slice(0, 4).forEach((name: any) => {
                const lines = pdf.splitTextToSize(`- ${name}`, 48);
                pdf.text(lines, infoX, infoY);
                infoY += lines.length * 4;
            });
            if (hardwareNames.length > 4) {
                pdf.text(`+ ${hardwareNames.length - 4} more`, infoX, infoY);
                infoY += 4;
            }
        }
        if (piece.quantity && piece.quantity > 1) { pdf.text(`Qty: ${piece.quantity} pcs`, infoX, infoY); infoY += 5; }
        pdf.setTextColor(0);

        // Reset draw state
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.3);

        yPos += drawHeight + 10;
    });

    return yPos;
}

export async function generateOrderPDF(
    order: Order,
    options: PDFOptions = {}
): Promise<string | void> {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    // Company Header
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(options.companyName || 'Arjun Glass', margin, yPos);
    yPos += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    if (options.companyAddress) {
        pdf.text(options.companyAddress, margin, yPos);
        yPos += 5;
    }
    if (options.companyPhone) {
        pdf.text(`Phone: ${options.companyPhone}`, margin, yPos);
        yPos += 5;
    }
    if (options.companyEmail) {
        pdf.text(`Email: ${options.companyEmail}`, margin, yPos);
        yPos += 5;
    }

    // Title
    yPos += 5;
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    const titleText = order.type === 'sale_order' ? 'CUSTOMER SALES ORDER' : (options.excludePricing ? 'PURCHASE ORDER DRAWINGS' : 'SUPPLIER PURCHASE ORDER');
    pdf.text(titleText, margin, yPos);
    yPos += 10;

    // Order Info
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Order Details:', margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Order Number: ${order.number}`, margin + 5, yPos);
    yPos += 5;
    pdf.text(`Date: ${new Date(order.date).toLocaleDateString()}`, margin + 5, yPos);
    yPos += 5;
    if (order.deliveryDate) {
        pdf.text(`Expected Delivery: ${new Date(order.deliveryDate).toLocaleDateString()}`, margin + 5, yPos);
        yPos += 5;
    }
    pdf.text(`Status: ${order.status.replace(/_/g, ' ').toUpperCase()}`, margin + 5, yPos);
    yPos += 5;
    pdf.text(`${order.type === 'sale_order' ? 'Customer' : 'Supplier'}: ${order.partyName}`, margin + 5, yPos);
    yPos += 10;

    // Table Header
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    
    const colX = options.excludePricing 
        ? [margin, margin + 70, margin + 110, margin + 130, margin + 155]
        : [margin, margin + 55, margin + 85, margin + 100, margin + 115, margin + 135, margin + 155];

    pdf.text('Description', colX[0], yPos);
    pdf.text('Size (in)', colX[1], yPos);
    pdf.text('Qty', colX[2], yPos);
    pdf.text('Unit', colX[3], yPos);
    pdf.text('Sqft', colX[4], yPos);
    
    if (!options.excludePricing) {
        pdf.text('Rate', colX[5], yPos);
        pdf.text('Amount', colX[6], yPos);
    }
    yPos += 5;
    pdf.setDrawColor(200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // Table Rows
    pdf.setFont('helvetica', 'normal');
    order.items.forEach((item) => {
        if (yPos > pageHeight - margin - 15) {
            pdf.addPage();
            yPos = margin;
        }

        const desc = item.description || item.itemName || 'N/A';
        const sizeStr = (item.width && item.height) ? `${formatInchesToFraction(item.width)}" x ${formatInchesToFraction(item.height)}"` : '-';
        // pieceCount (when set) is the real piece count for an sqft-billed
        // line whose quantity must stay numerically equal to sqft -- show
        // that instead of the sqft-duplicate quantity, with "pcs" rather
        // than the billing unit so it doesn't read as "49.79 sqft" pieces.
        const qtyStr = String(item.pieceCount ?? item.quantity);
        const unitStr = item.pieceCount != null ? 'pcs' : (item.unit || 'sqft');
        const sqftStr = (Number(item.sqft) || 0).toFixed(2);

        pdf.text(desc, colX[0], yPos);
        pdf.text(sizeStr, colX[1], yPos);
        pdf.text(qtyStr, colX[2], yPos);
        pdf.text(unitStr, colX[3], yPos);
        pdf.text(sqftStr, colX[4], yPos);

        if (!options.excludePricing) {
            const rateStr = `₹${(Number(item.rate) || 0).toFixed(2)}`;
            const amtStr = `₹${(Number(item.amount) || 0).toFixed(2)}`;
            pdf.text(rateStr, colX[5], yPos);
            pdf.text(amtStr, colX[6], yPos);
        }
        yPos += 6;
    });

    yPos += 5;
    pdf.setDrawColor(200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // Totals (Omitted if excludePricing is true)
    if (!options.excludePricing) {
        if (yPos > pageHeight - margin - 40) {
            pdf.addPage();
            yPos = margin;
        }
        const rightAlignX = pageWidth - margin;
        pdf.setFont('helvetica', 'bold');
        pdf.text('Subtotal:', rightAlignX - 60, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`₹${(Number(order.subtotal) || 0).toFixed(2)}`, rightAlignX - 25, yPos);
        yPos += 5;

        pdf.setFont('helvetica', 'bold');
        pdf.text(`Tax (${order.taxRate}%):`, rightAlignX - 60, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`₹${(Number(order.taxAmount) || 0).toFixed(2)}`, rightAlignX - 25, yPos);
        yPos += 5;

        pdf.setFont('helvetica', 'bold');
        pdf.text('Total:', rightAlignX - 60, yPos);
        pdf.text(`₹${(Number(order.total) || 0).toFixed(2)}`, rightAlignX - 25, yPos);
        yPos += 10;
    } else {
        yPos += 5;
    }

    // Notes
    const cleanNotes = getVisibleNotes(order.notes);
    if (cleanNotes) {
        if (yPos > pageHeight - margin - 30) {
            pdf.addPage();
            yPos = margin;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text('Notes:', margin, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'normal');
        const splitNotes = pdf.splitTextToSize(cleanNotes, pageWidth - (2 * margin));
        pdf.text(splitNotes, margin, yPos);
        yPos += (splitNotes.length * 5) + 5;
    }

    // Terms & Conditions (Only if not excluding pricing)
    if (!options.excludePricing && options.termsAndConditions) {
        if (yPos > pageHeight - margin - 40) {
            pdf.addPage();
            yPos = margin;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text('Terms & Conditions:', margin, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'normal');
        const splitTerms = pdf.splitTextToSize(options.termsAndConditions, pageWidth - (2 * margin));
        pdf.text(splitTerms, margin, yPos);
        yPos += (splitTerms.length * 5) + 5;
    }

    // Render linked designs
    if (options.designs && options.designs.length > 0) {
        for (const design of options.designs) {
            yPos = drawDesignVectorOutlines(pdf, design, yPos + 10);
        }
    }

    // Save or return PDF
    const fileName = `${order.number.replace(/\s+/g, '_')}_${options.excludePricing ? 'drawings_' : ''}${new Date().toISOString().split('T')[0]}.pdf`;
    if (options.outputType === 'datauristring') {
        return pdf.output('datauristring');
    }
    pdf.save(fileName);
}
