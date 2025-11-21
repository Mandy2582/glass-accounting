'use client';

import { Invoice } from '@/types';
import { Printer, X } from 'lucide-react';

interface InvoicePrintProps {
    invoice: Invoice;
    onClose: () => void;
}

export default function InvoicePrint({ invoice, onClose }: InvoicePrintProps) {
    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '2rem',
            overflowY: 'auto'
        }}>
            <div className="no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                <button onClick={handlePrint} className="btn btn-primary">
                    <Printer size={18} style={{ marginRight: '0.5rem' }} />
                    Print Invoice
                </button>
                <button onClick={onClose} className="btn" style={{ background: 'white' }}>
                    <X size={18} style={{ marginRight: '0.5rem' }} />
                    Close
                </button>
            </div>

            <div className="invoice-paper" style={{
                background: 'white',
                width: '210mm',
                minHeight: '297mm',
                padding: '20mm',
                boxShadow: '0 0 10px rgba(0,0,0,0.1)',
                color: 'black'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>INVOICE</h1>
                        <p style={{ color: '#64748b' }}>#{invoice.number}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Glass Wholesale Co.</h2>
                        <p>123 Business Road</p>
                        <p>City, State 12345</p>
                        <p>Phone: +91 98765 43210</p>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem' }}>
                    <div>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Bill To:</p>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{invoice.partyName}</h3>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Date:</p>
                        <p style={{ fontWeight: 500 }}>{new Date(invoice.date).toLocaleDateString()}</p>
                    </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ textAlign: 'left', padding: '0.75rem 0' }}>Item Description</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0' }}>Size</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0' }}>Qty</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0' }}>Unit</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0' }}>Sq.ft</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0' }}>Rate</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '0.75rem 0' }}>{item.itemName}</td>
                                <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>{item.width}" x {item.height}"</td>
                                <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right', padding: '0.75rem 0', textTransform: 'capitalize' }}>{item.unit}</td>
                                <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>{item.sqft}</td>
                                <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>{item.rate}</td>
                                <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>{item.amount.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '250px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Subtotal:</span>
                            <span>{invoice.subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Tax ({invoice.taxRate}%):</span>
                            <span>{invoice.taxAmount.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #e2e8f0', paddingTop: '0.5rem', fontWeight: 700, fontSize: '1.125rem' }}>
                            <span>Total:</span>
                            <span>{invoice.total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '4rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
                    <p>Thank you for your business!</p>
                </div>
            </div>

            <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .sidebar, header { display: none !important; }
          body { background: white; }
          .invoice-paper { box-shadow: none !important; margin: 0 !important; width: 100% !important; }
          .layout { display: block; }
          .mainContent { margin: 0; }
          .pageContent { padding: 0; }
        }
      `}</style>
        </div>
    );
}
