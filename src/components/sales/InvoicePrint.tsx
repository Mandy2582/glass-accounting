'use client';

import { useState, useEffect, useRef } from 'react';
import { Invoice, BusinessConfig } from '@/types';
import { Printer, X, Share2, MessageCircle, Download } from 'lucide-react';
import { db } from '@/lib/storage';
import { formatInchesToFraction } from '@/lib/utils';

interface InvoicePrintProps {
    invoice: Invoice;
    onClose: () => void;
}

// Number to words converter for Indian currency
function numberToWords(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';

    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const hundred = Math.floor((num % 1000) / 100);
    const remainder = Math.floor(num % 100);

    let words = '';
    if (crore > 0) words += numberToWords(crore) + ' Crore ';
    if (lakh > 0) words += numberToWords(lakh) + ' Lakh ';
    if (thousand > 0) words += numberToWords(thousand) + ' Thousand ';
    if (hundred > 0) words += ones[hundred] + ' Hundred ';
    if (remainder > 0) {
        if (words) words += 'and ';
        if (remainder < 20) {
            words += ones[remainder];
        } else {
            words += tens[Math.floor(remainder / 10)];
            if (remainder % 10 > 0) words += ' ' + ones[remainder % 10];
        }
    }

    return words.trim();
}

function amountToWords(amount: number): string {
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);

    let result = 'Rupees ' + numberToWords(rupees);
    if (paise > 0) {
        result += ' and ' + numberToWords(paise) + ' Paise';
    }
    result += ' Only';
    return result;
}

export default function InvoicePrint({ invoice, onClose }: InvoicePrintProps) {
    const [config, setConfig] = useState<BusinessConfig | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        db.businessConfig.get().then(setConfig);
    }, []);

    const handlePrint = () => {
        window.print();
    };

    const handleWhatsAppShare = () => {
        const party = invoice.partyName;
        const total = (Number(invoice.total) || 0).toFixed(2);
        const gstRate = invoice.taxRate || 0;
        const halfGst = gstRate / 2;

        let taxLine = '';
        if (gstRate > 0) {
            taxLine = `\nGST (${gstRate}%): ₹${(Number(invoice.taxAmount) || 0).toFixed(2)}`;
        }

        const itemLines = invoice.items.map((item, i) =>
            `${i + 1}. ${item.itemName} - ${item.sqft} sqft × ₹${item.rate} = ₹${(Number(item.amount) || 0).toFixed(2)}`
        ).join('\n');

        const message = encodeURIComponent(
            `📋 *INVOICE #${invoice.number}*\n` +
            `📅 Date: ${new Date(invoice.date).toLocaleDateString('en-IN')}\n` +
            `👤 Customer: ${party}\n` +
            `\n📦 *Items:*\n${itemLines}\n` +
            `\n💰 Subtotal: ₹${(Number(invoice.subtotal) || 0).toFixed(2)}` +
            taxLine +
            `\n\n🏷️ *Total: ₹${total}*\n` +
            `\n_From ${config?.businessName || 'Arjun Glass House'}_` +
            (config?.phone ? `\n📞 ${config.phone}` : '')
        );

        window.open(`https://wa.me/?text=${message}`, '_blank');
    };

    const gstRate = invoice.taxRate || 0;
    const halfGst = gstRate / 2;
    const cgst = invoice.taxAmount / 2;
    const sgst = invoice.taxAmount / 2;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '1.5rem',
            overflowY: 'auto',
            backdropFilter: 'blur(4px)'
        }}>
            {/* Action Buttons */}
            <div className="no-print" style={{
                marginBottom: '1rem',
                display: 'flex',
                gap: '0.75rem',
                background: 'white',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
                <button onClick={handlePrint} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Printer size={18} />
                    Print
                </button>
                <button onClick={handleWhatsAppShare} className="btn" style={{
                    background: '#25D366',
                    color: 'white',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <MessageCircle size={18} />
                    WhatsApp
                </button>
                <button onClick={onClose} className="btn" style={{ background: 'white', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <X size={18} />
                    Close
                </button>
            </div>

            {/* Invoice Paper */}
            <div ref={printRef} className="invoice-paper" style={{
                background: 'white',
                width: '210mm',
                minHeight: '297mm',
                padding: '15mm 20mm',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                color: '#1a1a1a',
                fontSize: '10pt',
                lineHeight: 1.4,
                borderRadius: '4px'
            }}>
                {/* Header with business info */}
                <div style={{ borderBottom: '3px solid #4f46e5', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontSize: '20pt', fontWeight: 800, color: '#4f46e5', marginBottom: '2px', letterSpacing: '-0.5px' }}>
                                {config?.businessName || 'Arjun Glass House'}
                            </h1>
                            {config?.tagline && (
                                <p style={{ fontSize: '9pt', color: '#6366f1', fontStyle: 'italic', marginBottom: '6px' }}>{config.tagline}</p>
                            )}
                            <div style={{ fontSize: '8.5pt', color: '#64748b', lineHeight: 1.6 }}>
                                {config?.address && <p>{config.address}</p>}
                                {(config?.city || config?.state) && (
                                    <p>{[config?.city, config?.state, config?.pincode].filter(Boolean).join(', ')}</p>
                                )}
                                {config?.phone && <p>📞 {config.phone}{config?.email ? ` | ✉️ ${config.email}` : ''}</p>}
                                {config?.gstin && <p style={{ fontWeight: 600, color: '#1e293b' }}>GSTIN: {config.gstin}</p>}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h2 style={{
                                fontSize: '16pt',
                                fontWeight: 700,
                                color: '#1e293b',
                                textTransform: 'uppercase',
                                letterSpacing: '2px'
                            }}>
                                {invoice.type === 'purchase' ? 'Purchase' : 'Tax Invoice'}
                            </h2>
                            <p style={{ fontSize: '11pt', fontWeight: 600, color: '#4f46e5', marginTop: '4px' }}>#{invoice.number}</p>
                        </div>
                    </div>
                </div>

                {/* Bill To + Invoice Details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{
                        background: '#f8fafc',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        minWidth: '45%'
                    }}>
                        <p style={{ fontSize: '8pt', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Bill To</p>
                        <h3 style={{ fontSize: '12pt', fontWeight: 700, color: '#0f172a' }}>{invoice.partyName}</h3>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <table style={{ marginLeft: 'auto', fontSize: '9pt' }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '3px 12px 3px 0', color: '#64748b', fontWeight: 500 }}>Invoice Date:</td>
                                    <td style={{ padding: '3px 0', fontWeight: 600 }}>{new Date(invoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '3px 12px 3px 0', color: '#64748b', fontWeight: 500 }}>Status:</td>
                                    <td style={{ padding: '3px 0' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '999px',
                                            fontSize: '8pt',
                                            fontWeight: 700,
                                            background: invoice.status === 'paid' ? '#dcfce7' : invoice.status === 'partially_paid' ? '#fef9c3' : '#fee2e2',
                                            color: invoice.status === 'paid' ? '#166534' : invoice.status === 'partially_paid' ? '#854d0e' : '#dc2626'
                                        }}>
                                            {invoice.status.toUpperCase().replace('_', ' ')}
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Items Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
                    <thead>
                        <tr style={{ background: '#4f46e5', color: 'white' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '8.5pt', fontWeight: 600 }}>#</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '8.5pt', fontWeight: 600 }}>Item Description</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '8.5pt', fontWeight: 600 }}>Size</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '8.5pt', fontWeight: 600 }}>Qty</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '8.5pt', fontWeight: 600 }}>Unit</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '8.5pt', fontWeight: 600 }}>Sq.ft</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '8.5pt', fontWeight: 600 }}>Rate (₹)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '8.5pt', fontWeight: 600 }}>Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                <td style={{ padding: '8px 10px', fontSize: '9pt' }}>{i + 1}</td>
                                <td style={{ padding: '8px 10px', fontSize: '9pt', fontWeight: 500 }}>{item.itemName}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: '9pt' }}>
                                    {item.width && item.height ? `${formatInchesToFraction(item.width)}" × ${formatInchesToFraction(item.height)}"` : '-'}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: '9pt' }}>{item.quantity}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: '9pt', textTransform: 'capitalize' }}>{item.unit}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '9pt' }}>{item.sqft}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '9pt' }}>{(Number(item.rate) || 0).toFixed(2)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '9pt', fontWeight: 600 }}>{(Number(item.amount) || 0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals + Amount in Words */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
                    {/* Amount in Words */}
                    <div style={{ flex: 1 }}>
                        <div style={{
                            background: '#f8fafc',
                            padding: '0.75rem 1rem',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            marginBottom: '1rem'
                        }}>
                            <p style={{ fontSize: '8pt', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>Amount in Words:</p>
                            <p style={{ fontSize: '9pt', fontWeight: 600, color: '#1e293b', fontStyle: 'italic' }}>
                                {amountToWords(invoice.total)}
                            </p>
                        </div>

                        {/* Bank Details */}
                        {config?.bankName && (
                            <div style={{
                                background: '#eff6ff',
                                padding: '0.75rem 1rem',
                                borderRadius: '6px',
                                border: '1px solid #bfdbfe'
                            }}>
                                <p style={{ fontSize: '8pt', fontWeight: 600, color: '#1d4ed8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bank Details</p>
                                <div style={{ fontSize: '8.5pt', color: '#1e3a5f', lineHeight: 1.6 }}>
                                    <p><strong>Bank:</strong> {config.bankName}</p>
                                    {config.bankAccountNumber && <p><strong>A/C No:</strong> {config.bankAccountNumber}</p>}
                                    {config.bankIfsc && <p><strong>IFSC:</strong> {config.bankIfsc}</p>}
                                    {config.bankBranch && <p><strong>Branch:</strong> {config.bankBranch}</p>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Totals */}
                    <div style={{ width: '280px' }}>
                        <table style={{ width: '100%', fontSize: '9.5pt' }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '4px 0', color: '#64748b' }}>Subtotal:</td>
                                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500 }}>{(Number(invoice.subtotal) || 0).toFixed(2)}</td>
                                </tr>
                                {gstRate > 0 && (
                                    <>
                                        <tr>
                                            <td style={{ padding: '4px 0', color: '#64748b' }}>CGST ({halfGst}%):</td>
                                            <td style={{ padding: '4px 0', textAlign: 'right' }}>{(Number(cgst) || 0).toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '4px 0', color: '#64748b' }}>SGST ({halfGst}%):</td>
                                            <td style={{ padding: '4px 0', textAlign: 'right' }}>{(Number(sgst) || 0).toFixed(2)}</td>
                                        </tr>
                                    </>
                                )}
                                <tr style={{ borderTop: '2px solid #4f46e5' }}>
                                    <td style={{ padding: '8px 0', fontWeight: 700, fontSize: '11pt', color: '#4f46e5' }}>Total:</td>
                                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, fontSize: '11pt', color: '#4f46e5' }}>₹{(Number(invoice.total) || 0).toFixed(2)}</td>
                                </tr>
                                {(invoice.paidAmount || 0) > 0 && (
                                    <>
                                        <tr>
                                            <td style={{ padding: '4px 0', color: '#166534' }}>Paid:</td>
                                            <td style={{ padding: '4px 0', textAlign: 'right', color: '#166534', fontWeight: 600 }}>₹{(Number(invoice.paidAmount) || 0).toFixed(2)}</td>
                                        </tr>
                                        <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '4px 0', color: '#dc2626', fontWeight: 600 }}>Balance Due:</td>
                                            <td style={{ padding: '4px 0', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>
                                                ₹{(Number(invoice.total) - Number(invoice.paidAmount || 0)).toFixed(2)}
                                            </td>
                                        </tr>
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Signature Area */}
                <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #cbd5e1', width: '180px', paddingTop: '6px' }}>
                            <p style={{ fontSize: '8pt', color: '#64748b' }}>Receiver&apos;s Signature</p>
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '9pt', fontWeight: 600, marginBottom: '2rem', color: '#1e293b' }}>
                            For {config?.businessName || 'Arjun Glass House'}
                        </p>
                        <div style={{ borderTop: '1px solid #cbd5e1', width: '180px', paddingTop: '6px' }}>
                            <p style={{ fontSize: '8pt', color: '#64748b' }}>Authorized Signatory</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ marginTop: '2rem', textAlign: 'center', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '8pt', color: '#94a3b8' }}>
                        This is a computer generated invoice. Thank you for your business!
                    </p>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    .no-print { display: none !important; }
                    .sidebar, header, aside { display: none !important; }
                    body { background: white !important; }
                    .invoice-paper { box-shadow: none !important; margin: 0 !important; width: 100% !important; border-radius: 0 !important; }
                    .layout { display: block !important; }
                    .mainContent { margin: 0 !important; }
                    .pageContent { padding: 0 !important; }
                }
            `}} />
        </div>
    );
}
