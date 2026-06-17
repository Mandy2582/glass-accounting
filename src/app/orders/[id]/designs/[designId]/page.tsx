'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Download, Trash2, Mail, MessageCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
const GlassDesigner = dynamic(() => import('@/components/GlassDesigner'), { ssr: false });
import SendEstimateModal from '@/components/SendEstimateModal';
import { calculateComplexity, calculateDesignEstimate, calculateCost } from '@/lib/designCalculations';
import { designsDb, db } from '@/lib/storage';
import { CustomDesign, DesignData, Party, PricingConfig } from '@/types';
import { generateEstimatePDF } from '@/lib/pdfGenerator';
import { generateWhatsAppLink } from '@/lib/utils';
import { recalculateOrderTotals, upsertDesignItemsInOrder } from '@/lib/orderDesignItems';

export default function NestedDesignDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;
    const designId = params.designId as string;

    const [design, setDesign] = useState<CustomDesign | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [designName, setDesignName] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customers, setCustomers] = useState<Party[]>([]);
    const [grossArea, setGrossArea] = useState(0);
    const [netArea, setNetArea] = useState(0);
    const [holeCount, setHoleCount] = useState(0);
    const [cutCount, setCutCount] = useState(0);
    const [notes, setNotes] = useState('');
    const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
    const [showSendModal, setShowSendModal] = useState(false);
    const designDataRef = useRef<DesignData | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const [items, setItems] = useState<any[]>([]);
    const captureAllItemsRef = useRef<(() => Promise<Array<{ itemName: string; itemType: string; imageData: string; width?: number; height?: number; }>>) | null>(null);

    useEffect(() => {
        loadCustomers();
        loadDesign();
        loadPricing();
    }, [designId]);

    const loadPricing = async () => {
        const config = await db.settings.getPricing();
        const thicknessPricing = await db.settings.getThicknessPricing();
        setPricingConfig({ ...config, thicknessPricing });
    };

    const loadCustomers = async () => {
        const parties = await db.parties.getAll();
        setCustomers(parties);
    };

    const loadDesign = async () => {
        setLoading(true);
        try {
            const data = await designsDb.getById(designId);
            if (data) {
                setDesign(data);
                setDesignName(data.name);
                setCustomerId(data.customerId || '');
                setCustomerName(data.customerName || '');
                setGrossArea(data.grossArea);
                setNetArea(data.totalArea);
                setHoleCount(data.holes);
                setCutCount(data.cuts);
                setNotes(data.notes || '');
                designDataRef.current = data.drawingData;

                if (data.drawingData.items) {
                    setItems(data.drawingData.items);
                }
            } else {
                alert('Design not found');
                router.push(`/orders/${orderId}`);
            }
        } catch (error) {
            console.error('Error loading design:', error);
            alert('Failed to load design');
        } finally {
            setLoading(false);
        }
    };

    const handleAreaChange = useCallback((gross: number, net: number) => {
        setGrossArea(gross);
        setNetArea(net);
    }, []);

    const handleDesignChange = useCallback((data: any) => {
        designDataRef.current = data;
        if (data.holes !== undefined) {
            setHoleCount(data.holes);
        } else if (data.holes && Array.isArray(data.holes)) {
            setHoleCount(data.holes.length);
        }
        if (data.cuts !== undefined) {
            setCutCount(data.cuts);
        } else if (data.cuts && Array.isArray(data.cuts)) {
            setCutCount(data.cuts.length);
        }
    }, []);

    const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
        canvasRef.current = canvas;
    }, []);

    const handleItemsChange = useCallback((newItems: any[]) => {
        setItems(newItems);
    }, []);

    const complexity = calculateComplexity(1, holeCount, cutCount, false);

    let thickness = 6;
    if (canvasRef.current && (canvasRef.current as any).getObjects) {
        const objects = (canvasRef.current as any).getObjects();
        const shapesWithThickness = objects.filter((obj: any) => obj.data?.thickness);
        if (shapesWithThickness.length > 0) {
            thickness = shapesWithThickness[0].data.thickness;
        }
    }

    const costBreakdown = pricingConfig
        ? calculateDesignEstimate({
            grossArea,
            holeCount,
            cutCount,
            complexity,
            thickness,
            items,
            pricingConfig
        })
        : null;

    const generateHighFidelityPDFString = async (designToRender: CustomDesign, specificCostBreakdown: any = costBreakdown): Promise<string> => {
        const { generateEstimatePDF } = await import('@/lib/pdfGenerator');
        
        let itemImages: Array<{ itemName: string; itemType: string; imageData: string }> | undefined;
        if (items.length > 1 && captureAllItemsRef.current) {
            try {
                itemImages = await captureAllItemsRef.current();
            } catch (error) {
                console.error('[Email PDF] Error capturing item images:', error);
            }
        }

        const pdfCostBreakdown = items.map(item => {
             const itemCost = calculateCost(item.netArea || item.area || 0, item.holes || 0, item.cuts || 0, 'simple', item.thickness || 6, pricingConfig!, false);
             
             const subItems = [];
             if (itemCost.baseAmount > 0) subItems.push({ name: `${(item.netArea || item.area || 0).toFixed(2)} sq ft Glass (@ ₹${itemCost.thicknessRate}/sq ft)`, amount: itemCost.baseAmount });
             if (itemCost.holeCharges > 0) subItems.push({ name: `${item.holes} Holes (@ ₹${pricingConfig?.holeCharge}/ea)`, amount: itemCost.holeCharges });
             if (itemCost.cutCharges > 0) subItems.push({ name: `${item.cuts} Cuts (@ ₹${pricingConfig?.cutCharge}/ea)`, amount: itemCost.cutCharges });
             
             return {
                 name: `${item.name} (${item.type}) - ${item.thickness}mm` + (item.quantity && item.quantity > 1 ? ` (${item.quantity} pcs)` : ''),
                 details: `${(item.netArea || item.area || 0).toFixed(2)} sq ft @ ${item.thickness || 6}mm`,
                 amount: itemCost.total,
                 subItems
             };
         });

        const base64Str = await generateEstimatePDF(designToRender, canvasRef.current, {
            companyName: 'Arjun Glass House',
            companyAddress: 'Your Address Here',
            companyPhone: 'Your Phone',
            companyEmail: 'your@email.com',
            termsAndConditions: pricingConfig?.termsAndConditions,
            itemImages,
            costBreakdown: pdfCostBreakdown,
            outputType: 'datauristring'
        });
        
        return base64Str as string;
    };

    const handleSave = async () => {
        if (!design || !designName.trim()) {
            alert('Please enter a design name');
            return;
        }

        setSaving(true);
        try {
            const updatedDrawingData = { ...design.drawingData };

            if (designDataRef.current && (designDataRef.current as any).pieces) {
                updatedDrawingData.pieces = (designDataRef.current as any).pieces;
                updatedDrawingData.items = items;
            }

            const finalCostBreakdown = pricingConfig
                ? calculateDesignEstimate({
                    grossArea,
                    holeCount,
                    cutCount,
                    complexity,
                    thickness,
                    items,
                    pricingConfig
                })
                : null;

            const tempDesign: CustomDesign = {
                ...design,
                name: designName,
                drawingData: updatedDrawingData,
                totalArea: netArea,
                grossArea: grossArea,
                holes: holeCount,
                cuts: cutCount,
                complexityLevel: complexity,
                baseRate: 0,
                complexityCharge: finalCostBreakdown?.complexityCharge || 0,
                estimatedCost: finalCostBreakdown?.total || 0,
                notes: notes,
            };

            const pdfBase64 = await generateHighFidelityPDFString(tempDesign, finalCostBreakdown);

            const updatedDesign: CustomDesign = {
                ...tempDesign,
                drawingData: {
                    ...tempDesign.drawingData,
                    pdfBase64
                }
            };

            await designsDb.update(updatedDesign);
            if (pricingConfig) {
                const orders = await db.orders.getAll();
                const linkedOrder = orders.find(o => o.id === orderId);
                if (linkedOrder) {
                    await db.orders.update(upsertDesignItemsInOrder(linkedOrder, updatedDesign, pricingConfig));
                }
            }
            setDesign(updatedDesign);
            alert('Design updated successfully!');
        } catch (error: any) {
            console.error('Error saving design:', error);
            alert(`Failed to save design: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleExportPDF = async () => {
        if (!design) return;

        const updatedDesign: CustomDesign = {
            ...design,
            totalArea: netArea,
            grossArea: grossArea,
            holes: holeCount,
            cuts: cutCount,
            complexityLevel: complexity,
            baseRate: 0,
            complexityCharge: costBreakdown?.complexityCharge || 0,
            estimatedCost: costBreakdown?.total || 0,
        };

        // Generate and save base64 secretly
        const pdfBase64 = await generateHighFidelityPDFString(updatedDesign);
        const savedDesign = {
            ...updatedDesign,
            drawingData: {
                ...updatedDesign.drawingData,
                pdfBase64
            }
        };
        await designsDb.update(savedDesign);
        setDesign(savedDesign);

        // Also trigger the actual download using standard pdfGenerator
        const { generateEstimatePDF } = await import('@/lib/pdfGenerator');
        
        let itemImages: Array<{ itemName: string; itemType: string; imageData: string }> | undefined;
        if (items.length > 1 && captureAllItemsRef.current) {
            try {
                itemImages = await captureAllItemsRef.current();
            } catch (error) {
                console.error('[PDF Export] Error capturing item images:', error);
            }
        }

        const pdfCostBreakdown = items.map(item => {
            const itemCost = calculateCost(item.netArea || item.area || 0, item.holes || 0, item.cuts || 0, 'simple', item.thickness || 6, pricingConfig!, false);
            
            const subItems = [];
            if (itemCost.baseAmount > 0) subItems.push({ name: `${(item.netArea || item.area || 0).toFixed(2)} sq ft Glass (@ ₹${itemCost.thicknessRate}/sq ft)`, amount: itemCost.baseAmount });
            if (itemCost.holeCharges > 0) subItems.push({ name: `${item.holes} Holes (@ ₹${pricingConfig?.holeCharge}/ea)`, amount: itemCost.holeCharges });
            if (itemCost.cutCharges > 0) subItems.push({ name: `${item.cuts} Cuts (@ ₹${pricingConfig?.cutCharge}/ea)`, amount: itemCost.cutCharges });
            
            return {
                name: `${item.name} (${item.type}) - ${item.thickness}mm` + (item.quantity && item.quantity > 1 ? ` (${item.quantity} pcs)` : ''),
                details: `${(item.netArea || item.area || 0).toFixed(2)} sq ft @ ${item.thickness || 6}mm`,
                amount: itemCost.total,
                subItems
            };
        });

        await generateEstimatePDF(updatedDesign, canvasRef.current, {
            companyName: 'Arjun Glass House',
            companyAddress: 'Your Address Here',
            companyPhone: 'Your Phone',
            companyEmail: 'your@email.com',
            termsAndConditions: pricingConfig?.termsAndConditions,
            itemImages,
            costBreakdown: pdfCostBreakdown,
            outputType: 'save'
        });
    };

    const handleDelete = async () => {
        if (!design) return;

        if (!confirm(`Are you sure you want to delete "${design.name}"?`)) {
            return;
        }

        try {
            await designsDb.delete(design.id);
            const orders = await db.orders.getAll();
            const linkedOrder = orders.find(o => o.id === orderId);
            if (linkedOrder) {
                const remainingItems = (linkedOrder.items || []).filter(item => item.designId !== design.id);
                await db.orders.update(recalculateOrderTotals(linkedOrder, remainingItems));
            }
            alert('Design deleted successfully');
            router.push(`/orders/${orderId}`);
        } catch (error: any) {
            console.error('Error deleting design:', error);
            alert(`Failed to delete design: ${error.message}`);
        }
    };

    if (loading) {
        return (
            <div className="container">
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <p>Loading design...</p>
                </div>
            </div>
        );
    }

    if (!design) {
        return null;
    }

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href={`/orders/${orderId}`} style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                        <ArrowLeft size={20} />
                    </Link>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Edit Design</h1>
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginLeft: '2rem' }}>
                    View and edit custom glass design for Order <strong>#{orderId}</strong>
                </p>
            </div>

            {/* Design Info */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Design Information</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                            Design Name *
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={designName}
                            onChange={(e) => setDesignName(e.target.value)}
                            placeholder="e.g., Living Room Window"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                            Customer
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={customerName || ''}
                            disabled
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                            Created Date
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={new Date(design.createdDate).toLocaleDateString()}
                            disabled
                        />
                    </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                        Notes
                    </label>
                    <textarea
                        className="input"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any special instructions or notes..."
                        rows={3}
                        style={{ resize: 'vertical' }}
                    />
                </div>
            </div>

            {/* Drawing Canvas */}
            <GlassDesigner
                onAreaChange={handleAreaChange}
                onDesignChange={handleDesignChange}
                onCanvasReady={handleCanvasReady}
                onItemsChange={handleItemsChange}
                onCaptureAllItems={(callback) => { captureAllItemsRef.current = callback; }}
                initialData={design.drawingData}
            />

            {/* Cost Estimate */}
            <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                    Cost Estimate
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Gross Area</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{grossArea.toFixed(2)} sqft</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Net Area</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{netArea.toFixed(2)} sqft</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Estimated Cost</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>₹{costBreakdown?.total.toFixed(2) || '0.00'}</div>
                    </div>
                </div>

                {/* Per-Item Breakdown */}
                {items.length > 0 && pricingConfig && (
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Piece-wise Breakdown:</div>
                        {items.map((item, index) => {
                            const itemCost = calculateCost(item.netArea || item.area || 0, item.holes || 0, item.cuts || 0, 'simple', item.thickness || 6, pricingConfig!, false);

                            return (
                                <div
                                    key={item.id}
                                    style={{
                                        padding: '1rem',
                                        background: '#f9fafb',
                                        borderRadius: '0.375rem',
                                        marginBottom: '0.75rem',
                                        borderLeft: `4px solid #3b82f6`
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div style={{ fontWeight: 600 }}>
                                            {item.name} {item.quantity && item.quantity > 1 ? `(${item.quantity} pcs)` : ''}
                                        </div>
                                        <div style={{ fontWeight: 700, color: '#10b981' }}>₹{itemCost.total.toFixed(2)}</div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div>{(item.netArea || item.area || 0).toFixed(2)} sqft @ {item.thickness}mm × ₹{itemCost.thicknessRate}/sq ft</div>
                                        {(item.holes || 0) > 0 && <div>Holes: {item.holes} × ₹{pricingConfig.holeCharge || 0}</div>}
                                        {(item.cuts || 0) > 0 && <div>Cuts: {item.cuts} × ₹{pricingConfig.cutCharge || 0}</div>}
                                    </div>
                                </div>
                            );
                        })}

                        <div style={{
                            borderTop: '2px solid var(--color-border)',
                            paddingTop: '1rem',
                            marginTop: '1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '1.25rem',
                            fontWeight: 700
                        }}>
                            <span>Grand Total</span>
                            <span style={{ color: '#10b981' }}>
                                ₹{costBreakdown?.total.toFixed(2) || '0.00'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <button className="btn" style={{ background: '#ef4444', color: 'white' }} onClick={handleDelete}>
                    <Trash2 size={18} style={{ marginRight: '0.5rem' }} />
                    Delete
                </button>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link href={`/orders/${orderId}`} className="btn">
                        Cancel
                    </Link>
                    <button className="btn btn-secondary" onClick={handleExportPDF}>
                        <Download size={18} style={{ marginRight: '0.5rem' }} />
                        Export PDF
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowSendModal(true)}
                        disabled={!customerId}
                        title={!customerId ? "Link a customer to send estimate" : "Send estimate via email"}
                    >
                        <Mail size={18} style={{ marginRight: '0.5rem' }} />
                        Email
                    </button>
                    <button
                        className="btn"
                        style={{ background: '#25D366', color: 'white', border: 'none' }}
                        onClick={async () => {
                            const customer = customers.find(c => c.id === customerId);
                            if (!customer?.phone) {
                                alert('Customer phone number not found');
                                  return;
                            }

                            try {
                                const updatedDesign: CustomDesign = {
                                    ...design,
                                    totalArea: netArea,
                                    grossArea: grossArea,
                                    holes: holeCount,
                                    cuts: cutCount,
                                    complexityLevel: complexity,
                                    baseRate: 0,
                                    complexityCharge: costBreakdown?.complexityCharge || 0,
                                    estimatedCost: costBreakdown?.total || 0,
                                };

                                let itemImages: Array<{ itemName: string; itemType: string; imageData: string }> | undefined;
                                if (items.length > 1 && captureAllItemsRef.current) {
                                    try {
                                        itemImages = await captureAllItemsRef.current();
                                    } catch (error) {
                                        console.error('[WhatsApp PDF] Error capturing item images:', error);
                                    }
                                }

                                const pdfCostBreakdown = items.map(item => {
                                     const itemCost = calculateCost(item.netArea || item.area || 0, item.holes || 0, item.cuts || 0, 'simple', item.thickness || 6, pricingConfig!, false);
                                     
                                     const subItems = [];
                                     if (itemCost.baseAmount > 0) subItems.push({ name: `${(item.netArea || item.area || 0).toFixed(2)} sq ft Glass (@ ₹${itemCost.thicknessRate}/sq ft)`, amount: itemCost.baseAmount });
                                     if (itemCost.holeCharges > 0) subItems.push({ name: `${item.holes} Holes (@ ₹${pricingConfig?.holeCharge}/ea)`, amount: itemCost.holeCharges });
                                     if (itemCost.cutCharges > 0) subItems.push({ name: `${item.cuts} Cuts (@ ₹${pricingConfig?.cutCharge}/ea)`, amount: itemCost.cutCharges });
                                     
                                     return {
                                         name: `${item.name} (${item.type}) - ${item.thickness}mm` + (item.quantity && item.quantity > 1 ? ` (${item.quantity} pcs)` : ''),
                                         details: `${(item.netArea || item.area || 0).toFixed(2)} sq ft @ ${item.thickness || 6}mm`,
                                         amount: itemCost.total,
                                         subItems
                                     };
                                 });

                                await generateEstimatePDF(updatedDesign, canvasRef.current, {
                                    companyName: 'Arjun Glass House',
                                    companyAddress: 'Your Address Here',
                                    companyPhone: 'Your Phone',
                                    companyEmail: 'your@email.com',
                                    termsAndConditions: pricingConfig?.termsAndConditions,
                                    itemImages,
                                    costBreakdown: pdfCostBreakdown
                                });

                                const totalCost = costBreakdown?.total || 0;
                                const message = `Hello ${customer.name}, here is the estimate for your glass design "${designName}".\n\nTotal Amount: ₹${totalCost.toFixed(0)}\n\nI've also sent you a detailed PDF estimate. Please let us know if you'd like to proceed.`;
                                window.open(generateWhatsAppLink(customer.phone, message), '_blank');

                                alert('PDF downloaded! Please attach it manually to your WhatsApp message.');
                            } catch (error) {
                                console.error('Error generating PDF:', error);
                                alert('Failed to generate PDF. Please try again.');
                            }
                        }}
                        disabled={!customerId}
                        title={!customerId ? "Link a customer to send WhatsApp" : "Send via WhatsApp (downloads PDF)"}
                    >
                        <MessageCircle size={18} style={{ marginRight: '0.5rem' }} />
                        WhatsApp
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        <Save size={18} style={{ marginRight: '0.5rem' }} />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Send Estimate Modal */}
            {showSendModal && design && (
                <SendEstimateModal
                    design={design}
                    onClose={() => setShowSendModal(false)}
                    generatePdfBase64={async () => {
                        const updatedDesign: CustomDesign = {
                            ...design,
                            totalArea: netArea,
                            grossArea: grossArea,
                            holes: holeCount,
                            cuts: cutCount,
                            complexityLevel: complexity,
                            baseRate: 0,
                            complexityCharge: costBreakdown?.complexityCharge || 0,
                            estimatedCost: costBreakdown?.total || 0,
                        };
                        
                        const base64Str = await generateHighFidelityPDFString(updatedDesign);
                        
                        // Optimistically cache it
                        const savedDesign = {
                            ...updatedDesign,
                            drawingData: {
                                ...updatedDesign.drawingData,
                                pdfBase64: base64Str
                            }
                        };
                        await designsDb.update(savedDesign);
                        setDesign(savedDesign);

                        return base64Str;
                    }}
                />
            )}
        </div>
    );
}
