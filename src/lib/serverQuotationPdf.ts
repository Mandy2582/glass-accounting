import { jsPDF } from 'jspdf';
import type { BusinessConfig, Order } from '@/types';

// A quotation PDF that can be produced on the server.
//
// The main pdfGenerator.ts cannot run here: it pulls in html2canvas and
// touches document/window, which don't exist inside an API route. Rather
// than refactor that whole module (it also renders design canvases, invoice
// layouts and more), this builds just the one document automatic review
// needs, using jsPDF's drawing primitives only -- no DOM, no html2canvas,
// no autotable dependency.

const money = (value: number | undefined) => `Rs. ${(Number(value) || 0).toFixed(2)}`;

// jsPDF's default fonts are Latin-1 only, so the rupee sign renders as
// garbage; "Rs." is used throughout instead.
const sanitize = (text: string) => (text || '').replace(/₹/g, 'Rs. ').replace(/[^\x20-\x7E]/g, '');

export function buildQuotationPdfBase64(order: Order, business: BusinessConfig, terms?: string): string {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 15;
    const right = pageWidth - 15;
    let y = 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(sanitize(business.businessName || 'Quotation'), left, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const addressLines = [
        [business.address, business.city].filter(Boolean).join(', '),
        [business.state, business.pincode].filter(Boolean).join(' - '),
        [business.phone ? `Phone: ${business.phone}` : '', business.email || ''].filter(Boolean).join('  '),
        business.gstin ? `GSTIN: ${business.gstin}` : '',
    ].filter(Boolean);
    addressLines.forEach(line => { y += 4.5; doc.text(sanitize(line), left, y); });

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('QUOTATION', left, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(sanitize(`Order: ${order.number}`), right, y, { align: 'right' });
    y += 5;
    doc.setFontSize(9);
    doc.text(sanitize(`Date: ${order.date || new Date().toISOString().slice(0, 10)}`), right, y, { align: 'right' });
    doc.text(sanitize(`To: ${order.partyName || ''}`), left, y);

    // Table header
    y += 8;
    const cols = { desc: left, qty: left + 95, rate: left + 125, amount: right };
    doc.setFillColor(240, 244, 248);
    doc.rect(left, y - 5, right - left, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Description', cols.desc + 1, y);
    doc.text('Qty', cols.qty, y, { align: 'right' });
    doc.text('Rate', cols.rate, y, { align: 'right' });
    doc.text('Amount', cols.amount - 1, y, { align: 'right' });
    y += 4;

    doc.setFont('helvetica', 'normal');
    (order.items || []).forEach(item => {
        // Start a new page before the row would run off the bottom.
        if (y > pageHeight - 45) {
            doc.addPage();
            y = 20;
        }
        y += 5;
        const name = sanitize(item.itemName || '');
        const wrapped = doc.splitTextToSize(name, 92) as string[];
        doc.text(wrapped[0] || '', cols.desc + 1, y);
        doc.text(`${Number(item.quantity) || 0} ${sanitize(item.unit || '')}`.trim(), cols.qty, y, { align: 'right' });
        doc.text(money(item.rate).replace('Rs. ', ''), cols.rate, y, { align: 'right' });
        doc.text(money(item.lineTotal ?? item.amount).replace('Rs. ', ''), cols.amount - 1, y, { align: 'right' });

        // Any wrapped remainder of a long item name, plus its description.
        wrapped.slice(1).forEach(line => { y += 4; doc.text(line, cols.desc + 1, y); });
        if (item.description) {
            doc.setFontSize(7.5);
            doc.setTextColor(110);
            (doc.splitTextToSize(sanitize(item.description), 92) as string[]).slice(0, 2).forEach(line => {
                y += 3.6;
                doc.text(line, cols.desc + 1, y);
            });
            doc.setTextColor(0);
            doc.setFontSize(9);
        }
    });

    y += 4;
    doc.setDrawColor(200);
    doc.line(left, y, right, y);

    const totalRow = (label: string, value: string, bold = false) => {
        y += 5.5;
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.text(label, cols.rate, y, { align: 'right' });
        doc.text(value, cols.amount - 1, y, { align: 'right' });
    };
    totalRow('Subtotal', money(order.subtotal).replace('Rs. ', ''));
    totalRow(`GST (${order.taxRate || 0}%)`, money(order.taxAmount).replace('Rs. ', ''));
    totalRow('Total', money(order.total).replace('Rs. ', ''), true);

    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Reply "OK" to confirm this quotation and we will start production.', left, y);

    if (terms) {
        y += 8;
        doc.setFontSize(7.5);
        doc.setTextColor(110);
        (doc.splitTextToSize(sanitize(terms), right - left) as string[])
            .slice(0, 6)
            .forEach(line => { y += 3.4; doc.text(line, left, y); });
        doc.setTextColor(0);
    }

    // 'datauristring' would need splitting again on the way out; the raw
    // base64 body is what both the WhatsApp media upload and the nodemailer
    // attachment want.
    return doc.output('datauristring').split(';base64,').pop() || '';
}
