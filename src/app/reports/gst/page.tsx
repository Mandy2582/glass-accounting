'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Invoice, Party, BusinessConfig } from '@/types';
import { ArrowLeft, Download, FileText, Code } from 'lucide-react';
import Link from 'next/link';
import { jsPDF } from 'jspdf';

export default function GstReportPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [businessConfig, setBusinessConfig] = useState<BusinessConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [activeTab, setActiveTab] = useState<'gstr1' | 'gstr3b'>('gstr1');

    useEffect(() => {
        loadData();
    }, [month]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [allInvoices, allParties, config] = await Promise.all([
                db.invoices.getAll(),
                db.parties.getAll(),
                db.businessConfig.get()
            ]);
            
            // Filter invoices for the selected month
            const filteredInvoices = allInvoices.filter(i => i.date.startsWith(month));
            setInvoices(filteredInvoices);
            setParties(allParties);
            setBusinessConfig(config);
        } catch (error) {
            console.error('Error loading GST report data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Helper to get party details
    const getPartyGstin = (partyId: string) => {
        const party = parties.find(p => p.id === partyId);
        return party?.gstin || '';
    };

    const getPartyStateCode = (gstin: string) => {
        return gstin ? gstin.slice(0, 2) : '';
    };

    // Categorise GSTR-1 Invoices
    const salesInvoices = invoices.filter(i => i.type === 'sale');
    const purchaseInvoices = invoices.filter(i => i.type === 'purchase');

    // B2B Sales (Party has GSTIN)
    const b2bSales = salesInvoices.filter(i => {
        const gstin = getPartyGstin(i.partyId);
        return gstin.trim().length > 0;
    });

    // B2C Sales (Party has no GSTIN)
    const b2cSales = salesInvoices.filter(i => {
        const gstin = getPartyGstin(i.partyId);
        return gstin.trim().length === 0;
    });

    // Tax rates mapping
    const getGstTaxComponents = (inv: Invoice) => {
        const subtotal = inv.subtotal || 0;
        const taxRate = inv.taxRate || 0;
        const totalTax = inv.taxAmount || 0;

        const businessStateCode = businessConfig?.stateCode || '03'; // Punjab default
        const customerGstin = getPartyGstin(inv.partyId);
        const customerStateCode = getPartyStateCode(customerGstin);

        // If interstate, it's IGST. If intra-state or unregistered/empty state-code, it's CGST + SGST
        const isInterstate = customerStateCode && customerStateCode !== businessStateCode;

        if (isInterstate) {
            return {
                cgstRate: 0,
                cgstAmount: 0,
                sgstRate: 0,
                sgstAmount: 0,
                igstRate: taxRate,
                igstAmount: totalTax
            };
        } else {
            return {
                cgstRate: taxRate / 2,
                cgstAmount: totalTax / 2,
                sgstRate: taxRate / 2,
                sgstAmount: totalTax / 2,
                igstRate: 0,
                igstAmount: 0
            };
        }
    };

    // Aggregate values for GSTR-1 (Outward Supplies)
    const gstr1Summary = salesInvoices.reduce((acc, inv) => {
        const { cgstAmount, sgstAmount, igstAmount } = getGstTaxComponents(inv);
        acc.taxable += inv.subtotal;
        acc.cgst += cgstAmount;
        acc.sgst += sgstAmount;
        acc.igst += igstAmount;
        acc.total += inv.total;
        return acc;
    }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

    // Aggregate values for Inward Supplies (eligible for ITC)
    const itcSummary = purchaseInvoices.reduce((acc, inv) => {
        const { cgstAmount, sgstAmount, igstAmount } = getGstTaxComponents(inv);
        acc.taxable += inv.subtotal;
        acc.cgst += cgstAmount;
        acc.sgst += sgstAmount;
        acc.igst += igstAmount;
        acc.total += inv.total;
        return acc;
    }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

    // HSN-wise Summary aggregation
    const hsnSummary: Record<string, { hsn: string; description: string; qty: number; value: number; taxable: number; cgst: number; sgst: number; igst: number }> = {};
    salesInvoices.forEach(inv => {
        inv.items.forEach(item => {
            const hsn = item.itemId ? (item.itemId.includes('hardware') ? '83024110' : '70071900') : '70071900'; // Default fallback
            const desc = item.itemId ? (item.itemId.includes('hardware') ? 'Glass Hardware' : 'Toughened Glass') : 'Toughened Glass';
            
            if (!hsnSummary[hsn]) {
                hsnSummary[hsn] = { hsn, description: desc, qty: 0, value: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
            }
            
            const gstRate = inv.taxRate || 0;
            const itemTax = item.amount * (gstRate / 100);
            
            const businessStateCode = businessConfig?.stateCode || ' Punjab default 03';
            const customerGstin = getPartyGstin(inv.partyId);
            const customerStateCode = getPartyStateCode(customerGstin);
            const isInterstate = customerStateCode && customerStateCode !== businessStateCode;

            hsnSummary[hsn].qty += item.quantity;
            hsnSummary[hsn].value += item.amount + itemTax;
            hsnSummary[hsn].taxable += item.amount;
            if (isInterstate) {
                hsnSummary[hsn].igst += itemTax;
            } else {
                hsnSummary[hsn].cgst += itemTax / 2;
                hsnSummary[hsn].sgst += itemTax / 2;
            }
        });
    });

    // ----------------------------------------------------
    // PDF Export Generators
    // ----------------------------------------------------
    const exportPDF = (type: 'gstr1' | 'gstr3b') => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let y = 20;

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(businessConfig?.businessName || 'Arjun Glass House', margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`GSTIN: ${businessConfig?.gstin || 'N/A'}`, margin, y);
        doc.text(`Period: ${month}`, pageWidth - margin - 35, y);
        y += 10;

        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        if (type === 'gstr1') {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('GSTR-1 Tax Return Summary', margin, y);
            y += 10;

            // Summary Table
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('1. Outward Supplies Summary:', margin, y);
            y += 6;

            const summaryData = [
                ['Total Taxable Value', `INR ${gstr1Summary.taxable.toFixed(2)}`],
                ['CGST Collected', `INR ${gstr1Summary.cgst.toFixed(2)}`],
                ['SGST Collected', `INR ${gstr1Summary.sgst.toFixed(2)}`],
                ['IGST Collected', `INR ${gstr1Summary.igst.toFixed(2)}`],
                ['Total Gross Sales', `INR ${gstr1Summary.total.toFixed(2)}`]
            ];

            summaryData.forEach(row => {
                doc.text(row[0], margin + 5, y);
                doc.text(row[1], pageWidth - margin - 50, y);
                y += 6;
            });
            y += 5;

            // B2B Sales
            doc.setFont('helvetica', 'bold');
            doc.text('2. B2B Sales Summary (Taxable Outward Supplies):', margin, y);
            y += 6;
            doc.setFont('helvetica', 'normal');

            b2bSales.forEach((inv, index) => {
                const gstin = getPartyGstin(inv.partyId);
                doc.text(`${index + 1}. ${inv.number} - ${inv.partyName} (GSTIN: ${gstin})`, margin + 5, y);
                doc.text(`Taxable: INR ${inv.subtotal.toFixed(2)} | GST: INR ${inv.taxAmount.toFixed(2)}`, margin + 10, y + 5);
                y += 12;

                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
            });
        } else {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('GSTR-3B Summary Report (Tax Liability & ITC)', margin, y);
            y += 10;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');

            // Sections
            const sec1 = [
                ['Outward Taxable Supplies (Sales)', gstr1Summary.taxable, gstr1Summary.cgst, gstr1Summary.sgst, gstr1Summary.igst],
                ['Inward Eligible ITC (Purchases)', itcSummary.taxable, itcSummary.cgst, itcSummary.sgst, itcSummary.igst],
                ['Net Tax Payable / (Refund)', gstr1Summary.taxable - itcSummary.taxable, gstr1Summary.cgst - itcSummary.cgst, gstr1Summary.sgst - itcSummary.sgst, gstr1Summary.igst - itcSummary.igst]
            ];

            sec1.forEach(row => {
                doc.setFont('helvetica', 'bold');
                doc.text(row[0] as string, margin, y);
                y += 6;
                doc.setFont('helvetica', 'normal');
                doc.text(`Taxable Value: INR ${Number(row[1]).toFixed(2)}`, margin + 5, y);
                y += 5;
                doc.text(`CGST: INR ${Number(row[2]).toFixed(2)} | SGST: INR ${Number(row[3]).toFixed(2)} | IGST: INR ${Number(row[4]).toFixed(2)}`, margin + 5, y);
                y += 10;
            });
        }

        doc.save(`${type}_report_${month}.pdf`);
    };

    // ----------------------------------------------------
    // XML Export Generator
    // ----------------------------------------------------
    const exportXML = (type: 'gstr1' | 'gstr3b') => {
        let xmlString = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        if (type === 'gstr1') {
            xmlString += `<GSTR1>\n`;
            xmlString += `  <Header>\n`;
            xmlString += `    <GSTIN>${businessConfig?.gstin || ''}</GSTIN>\n`;
            xmlString += `    <ReturnPeriod>${month.replace('-', '')}</ReturnPeriod>\n`;
            xmlString += `  </Header>\n`;
            
            // B2B Section
            xmlString += `  <B2B>\n`;
            b2bSales.forEach(inv => {
                const { cgstAmount, sgstAmount, igstAmount } = getGstTaxComponents(inv);
                xmlString += `    <Invoice>\n`;
                xmlString += `      <CustomerGSTIN>${getPartyGstin(inv.partyId)}</CustomerGSTIN>\n`;
                xmlString += `      <InvoiceNo>${inv.number}</InvoiceNo>\n`;
                xmlString += `      <InvoiceDate>${inv.date}</InvoiceDate>\n`;
                xmlString += `      <InvoiceValue>${inv.total.toFixed(2)}</InvoiceValue>\n`;
                xmlString += `      <TaxableValue>${inv.subtotal.toFixed(2)}</TaxableValue>\n`;
                xmlString += `      <CGST>${cgstAmount.toFixed(2)}</CGST>\n`;
                xmlString += `      <SGST>${sgstAmount.toFixed(2)}</SGST>\n`;
                xmlString += `      <IGST>${igstAmount.toFixed(2)}</IGST>\n`;
                xmlString += `    </Invoice>\n`;
            });
            xmlString += `  </B2B>\n`;

            // B2C Section
            xmlString += `  <B2CS>\n`;
            b2cSales.forEach(inv => {
                const { cgstAmount, sgstAmount, igstAmount } = getGstTaxComponents(inv);
                xmlString += `    <Invoice>\n`;
                xmlString += `      <InvoiceNo>${inv.number}</InvoiceNo>\n`;
                xmlString += `      <InvoiceDate>${inv.date}</InvoiceDate>\n`;
                xmlString += `      <InvoiceValue>${inv.total.toFixed(2)}</InvoiceValue>\n`;
                xmlString += `      <TaxableValue>${inv.subtotal.toFixed(2)}</TaxableValue>\n`;
                xmlString += `      <CGST>${cgstAmount.toFixed(2)}</CGST>\n`;
                xmlString += `      <SGST>${sgstAmount.toFixed(2)}</SGST>\n`;
                xmlString += `      <IGST>${igstAmount.toFixed(2)}</IGST>\n`;
                xmlString += `    </Invoice>\n`;
            });
            xmlString += `  </B2CS>\n`;
            xmlString += `</GSTR1>`;
        } else {
            xmlString += `<GSTR3B>\n`;
            xmlString += `  <Header>\n`;
            xmlString += `    <GSTIN>${businessConfig?.gstin || ''}</GSTIN>\n`;
            xmlString += `    <ReturnPeriod>${month.replace('-', '')}</ReturnPeriod>\n`;
            xmlString += `  </Header>\n`;
            xmlString += `  <OutwardSupplies>\n`;
            xmlString += `    <TaxableValue>${gstr1Summary.taxable.toFixed(2)}</TaxableValue>\n`;
            xmlString += `    <CGST>${gstr1Summary.cgst.toFixed(2)}</CGST>\n`;
            xmlString += `    <SGST>${gstr1Summary.sgst.toFixed(2)}</SGST>\n`;
            xmlString += `    <IGST>${gstr1Summary.igst.toFixed(2)}</IGST>\n`;
            xmlString += `  </OutwardSupplies>\n`;
            xmlString += `  <EligibleITC>\n`;
            xmlString += `    <TaxableValue>${itcSummary.taxable.toFixed(2)}</TaxableValue>\n`;
            xmlString += `    <CGST>${itcSummary.cgst.toFixed(2)}</CGST>\n`;
            xmlString += `    <SGST>${itcSummary.sgst.toFixed(2)}</SGST>\n`;
            xmlString += `    <IGST>${itcSummary.igst.toFixed(2)}</IGST>\n`;
            xmlString += `  </EligibleITC>\n`;
            xmlString += `</GSTR3B>`;
        }

        const blob = new Blob([xmlString], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${type}_report_${month}.xml`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="container">
            {/* Header Actions */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/reports" style={{ color: 'inherit' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>GST Filing Hub</h1>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input
                        type="month"
                        className="input"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        style={{ width: 'auto', padding: '0.35rem 0.5rem', height: '36px' }}
                    />
                    <button onClick={() => exportPDF(activeTab)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '36px', fontSize: '0.85rem' }}>
                        <Download size={16} /> Export PDF
                    </button>
                    <button onClick={() => exportXML(activeTab)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '36px', fontSize: '0.85rem' }}>
                        <Code size={16} /> Export XML
                    </button>
                </div>
            </div>

            {/* Tab Selectors */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                <button
                    className={`btn ${activeTab === 'gstr1' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                    onClick={() => setActiveTab('gstr1')}
                >
                    GSTR-1 (Outward Sales Summary)
                </button>
                <button
                    className={`btn ${activeTab === 'gstr3b' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                    onClick={() => setActiveTab('gstr3b')}
                >
                    GSTR-3B (Tax Liability & ITC Summary)
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading reports...</div>
            ) : (
                <>
                    {activeTab === 'gstr1' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Summary Metrics */}
                            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', textAlign: 'center' }}>
                                <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.25rem 0' }}>Taxable Sales</p>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>₹{gstr1Summary.taxable.toFixed(2)}</h3>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.25rem 0' }}>CGST (Intra-state)</p>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f59e0b' }}>₹{gstr1Summary.cgst.toFixed(2)}</h3>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.25rem 0' }}>SGST (Intra-state)</p>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f59e0b' }}>₹{gstr1Summary.sgst.toFixed(2)}</h3>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.25rem 0' }}>IGST (Inter-state)</p>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#3b82f6' }}>₹{gstr1Summary.igst.toFixed(2)}</h3>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.25rem 0' }}>Gross Invoiced</p>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#10b981' }}>₹{gstr1Summary.total.toFixed(2)}</h3>
                                </div>
                            </div>

                            {/* B2B Supplies Table */}
                            <div className="card">
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>B2B Supplies (Sales to Registered Parties)</h3>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Invoice Date</th>
                                            <th>Invoice No</th>
                                            <th>Recipient Name</th>
                                            <th>Recipient GSTIN</th>
                                            <th style={{ textAlign: 'right' }}>Taxable Amt</th>
                                            <th style={{ textAlign: 'right' }}>CGST</th>
                                            <th style={{ textAlign: 'right' }}>SGST</th>
                                            <th style={{ textAlign: 'right' }}>IGST</th>
                                            <th style={{ textAlign: 'right' }}>Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b2bSales.map(inv => {
                                            const { cgstAmount, sgstAmount, igstAmount } = getGstTaxComponents(inv);
                                            return (
                                                <tr key={inv.id}>
                                                    <td>{new Date(inv.date).toLocaleDateString()}</td>
                                                    <td>{inv.number}</td>
                                                    <td style={{ fontWeight: 500 }}>{inv.partyName}</td>
                                                    <td><code>{getPartyGstin(inv.partyId)}</code></td>
                                                    <td style={{ textAlign: 'right' }}>₹{inv.subtotal.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#f59e0b' }}>₹{cgstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#f59e0b' }}>₹{sgstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#3b82f6' }}>₹{igstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                        {b2bSales.length === 0 && (
                                            <tr>
                                                <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>No B2B sales invoices matching filters.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* B2C Supplies Table */}
                            <div className="card">
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>B2C Supplies (Sales to Unregistered Parties)</h3>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Invoice Date</th>
                                            <th>Invoice No</th>
                                            <th>Recipient Name</th>
                                            <th style={{ textAlign: 'right' }}>Taxable Amt</th>
                                            <th style={{ textAlign: 'right' }}>CGST</th>
                                            <th style={{ textAlign: 'right' }}>SGST</th>
                                            <th style={{ textAlign: 'right' }}>IGST</th>
                                            <th style={{ textAlign: 'right' }}>Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b2cSales.map(inv => {
                                            const { cgstAmount, sgstAmount, igstAmount } = getGstTaxComponents(inv);
                                            return (
                                                <tr key={inv.id}>
                                                    <td>{new Date(inv.date).toLocaleDateString()}</td>
                                                    <td>{inv.number}</td>
                                                    <td style={{ fontWeight: 500 }}>{inv.partyName}</td>
                                                    <td style={{ textAlign: 'right' }}>₹{inv.subtotal.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#f59e0b' }}>₹{cgstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#f59e0b' }}>₹{sgstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#3b82f6' }}>₹{igstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                        {b2cSales.length === 0 && (
                                            <tr>
                                                <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>No B2C sales invoices matching filters.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* HSN-wise Sales Summary */}
                            <div className="card">
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>HSN Summary (Outward Supplies)</h3>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>HSN Code</th>
                                            <th>Description</th>
                                            <th style={{ textAlign: 'center' }}>Total Qty</th>
                                            <th style={{ textAlign: 'right' }}>Taxable Value</th>
                                            <th style={{ textAlign: 'right' }}>CGST</th>
                                            <th style={{ textAlign: 'right' }}>SGST</th>
                                            <th style={{ textAlign: 'right' }}>IGST</th>
                                            <th style={{ textAlign: 'right' }}>Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.values(hsnSummary).map(sum => (
                                            <tr key={sum.hsn}>
                                                <td><code>{sum.hsn}</code></td>
                                                <td>{sum.description}</td>
                                                <td style={{ textAlign: 'center' }}>{sum.qty}</td>
                                                <td style={{ textAlign: 'right' }}>₹{sum.taxable.toFixed(2)}</td>
                                                <td style={{ textAlign: 'right' }}>₹{sum.cgst.toFixed(2)}</td>
                                                <td style={{ textAlign: 'right' }}>₹{sum.sgst.toFixed(2)}</td>
                                                <td style={{ textAlign: 'right' }}>₹{sum.igst.toFixed(2)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{sum.value.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                        {Object.keys(hsnSummary).length === 0 && (
                                            <tr>
                                                <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>No HSN details to summarise.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* GSTR-3B Tax Comparison Table */}
                            <div className="card">
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Calculation of Tax Liability & Eligible Input Tax Credit (ITC)</h3>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Tax Category</th>
                                            <th style={{ textAlign: 'right' }}>Taxable Amt</th>
                                            <th style={{ textAlign: 'right' }}>CGST Amount</th>
                                            <th style={{ textAlign: 'right' }}>SGST Amount</th>
                                            <th style={{ textAlign: 'right' }}>IGST Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ background: '#ecfdf5' }}>
                                            <td style={{ fontWeight: 600 }}>1. Outward Taxable Supplies (Tax Collected on Sales)</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{gstr1Summary.taxable.toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>₹{gstr1Summary.cgst.toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>₹{gstr1Summary.sgst.toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>₹{gstr1Summary.igst.toFixed(2)}</td>
                                        </tr>
                                        <tr style={{ background: '#eff6ff' }}>
                                            <td style={{ fontWeight: 600 }}>2. Inward Eligible ITC (Tax Paid on Purchases)</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{itcSummary.taxable.toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>₹{itcSummary.cgst.toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>₹{itcSummary.sgst.toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>₹{itcSummary.igst.toFixed(2)}</td>
                                        </tr>
                                        <tr style={{ borderTop: '2.5px solid var(--color-border)', background: '#fffbeb' }}>
                                            <td style={{ fontWeight: 700 }}>3. Net GST Payable / Refund Liability</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{(gstr1Summary.taxable - itcSummary.taxable).toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: (gstr1Summary.cgst - itcSummary.cgst) >= 0 ? '#b45309' : '#047857' }}>
                                                ₹{(gstr1Summary.cgst - itcSummary.cgst).toFixed(2)}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: (gstr1Summary.sgst - itcSummary.sgst) >= 0 ? '#b45309' : '#047857' }}>
                                                ₹{(gstr1Summary.sgst - itcSummary.sgst).toFixed(2)}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: (gstr1Summary.igst - itcSummary.igst) >= 0 ? '#1d4ed8' : '#047857' }}>
                                                ₹{(gstr1Summary.igst - itcSummary.igst).toFixed(2)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Detailed Purchase ITC Table */}
                            <div className="card">
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Eligible Inward Purchases (ITC Invoices)</h3>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Purchase Date</th>
                                            <th>Invoice No</th>
                                            <th>Supplier Name</th>
                                            <th>Supplier GSTIN</th>
                                            <th style={{ textAlign: 'right' }}>Taxable Amt</th>
                                            <th style={{ textAlign: 'right' }}>CGST</th>
                                            <th style={{ textAlign: 'right' }}>SGST</th>
                                            <th style={{ textAlign: 'right' }}>IGST</th>
                                            <th style={{ textAlign: 'right' }}>Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchaseInvoices.map(inv => {
                                            const { cgstAmount, sgstAmount, igstAmount } = getGstTaxComponents(inv);
                                            return (
                                                <tr key={inv.id}>
                                                    <td>{new Date(inv.date).toLocaleDateString()}</td>
                                                    <td>{inv.supplierInvoiceNumber || inv.number}</td>
                                                    <td style={{ fontWeight: 500 }}>{inv.partyName}</td>
                                                    <td><code>{getPartyGstin(inv.partyId)}</code></td>
                                                    <td style={{ textAlign: 'right' }}>₹{inv.subtotal.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#f59e0b' }}>₹{cgstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#f59e0b' }}>₹{sgstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', color: '#3b82f6' }}>₹{igstAmount.toFixed(2)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                        {purchaseInvoices.length === 0 && (
                                            <tr>
                                                <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>No inward purchase invoices matching filters.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
