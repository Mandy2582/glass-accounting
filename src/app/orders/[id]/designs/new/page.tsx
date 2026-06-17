'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Download } from 'lucide-react';
import dynamic from 'next/dynamic';
const GlassDesigner = dynamic(() => import('@/components/GlassDesigner'), { ssr: false });
import { calculateComplexity, calculateDesignEstimate, calculateCost } from '@/lib/designCalculations';
import { designsDb, db } from '@/lib/storage';
import { CustomDesign, DesignData, PricingConfig, Order } from '@/types';
import { generateEstimatePDF } from '@/lib/pdfGenerator';
import { upsertDesignItemsInOrder } from '@/lib/orderDesignItems';

export default function NestedNewDesignPage() {
    const router = useRouter();
    const params = useParams();
    const orderId = params.id as string;

    const [order, setOrder] = useState<Order | null>(null);
    const [designName, setDesignName] = useState('');
    const [grossArea, setGrossArea] = useState(0);
    const [netArea, setNetArea] = useState(0);
    const [holeCount, setHoleCount] = useState(0);
    const [cutCount, setCutCount] = useState(0);
    const [saving, setSaving] = useState(false);
    const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
    const [costBreakdown, setCostBreakdown] = useState<any>(null);
    const [selectedThickness, setSelectedThickness] = useState<number>(6);
    const [items, setItems] = useState<any[]>([]);

    const designDataRef = useRef<any>(null);
    const canvasRef = useRef<any>(null);
    const captureAllItemsRef = useRef<(() => Promise<Array<{ itemName: string; itemType: string; imageData: string; width?: number; height?: number; }>>) | null>(null);

    useEffect(() => {
        if (orderId) {
            loadOrder();
        }
        loadPricing();
    }, [orderId]);

    const loadOrder = async () => {
        const orders = await db.orders.getAll();
        const currentOrder = orders.find(o => o.id === orderId);
        if (currentOrder) {
            setOrder(currentOrder);
            setDesignName(`Design for Order ${currentOrder.number}`);
        } else {
            alert('Order not found');
            router.push('/orders');
        }
    };

    const loadPricing = async () => {
        const config = await db.settings.getPricing();
        const thicknessPricing = await db.settings.getThicknessPricing();
        setPricingConfig({ ...config, thicknessPricing });
    };

    const handleAreaChange = (gross: number, net: number) => {
        setGrossArea(gross);
        setNetArea(net);
    };

    const handleDesignChange = (data: any) => {
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
    };

    const handleCanvasReady = (fabricCanvas: any) => {
        canvasRef.current = fabricCanvas;
    };

    const complexity = calculateComplexity(1, holeCount, cutCount, false);

    useEffect(() => {
        if (pricingConfig && (grossArea > 0 || items.length > 0)) {
            const breakdown = calculateDesignEstimate({
                grossArea,
                holeCount,
                cutCount,
                complexity,
                thickness: selectedThickness,
                items,
                pricingConfig
            });
            setCostBreakdown(breakdown);
        } else {
            setCostBreakdown(null);
        }
    }, [grossArea, holeCount, cutCount, complexity, pricingConfig, items]);

    const handleGeneratePDF = async () => {
        if (!costBreakdown || !order) {
            alert('Please create a design first');
            return;
        }

        const drawingData: DesignData = { shapes: [], dimensions: { width: 800, height: 600, unit: 'inch' as const }, holes: [], cuts: [], notes: '', items };
        if (designDataRef.current && (designDataRef.current as any).pieces) {
            drawingData.pieces = (designDataRef.current as any).pieces;
            drawingData.items = items;
        }

        const design: CustomDesign = {
            id: crypto.randomUUID(),
            name: designName || 'Untitled Design',
            customerId: order.partyId,
            customerName: order.partyName,
            drawingData,
            baseShape: 'custom',
            totalArea: netArea,
            grossArea: grossArea,
            holes: holeCount,
            cuts: cutCount,
            complexityLevel: complexity,
            baseRate: 0,
            complexityCharge: costBreakdown?.complexityCharge || 0,
            edgeFinishingCharge: 0,
            estimatedCost: costBreakdown?.total || 0,
            status: 'approved',
            createdDate: new Date().toISOString().split('T')[0],
            notes: '',
            orderId: order.id
        };

        let itemImages: Array<{ itemName: string; itemType: string; imageData: string; width?: number; height?: number; }> | undefined;
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

        await generateEstimatePDF(design, canvasRef.current, {
            companyName: 'Arjun Glass House',
            companyAddress: 'Your Address Here',
            companyPhone: 'Your Phone',
            companyEmail: 'your@email.com',
            termsAndConditions: pricingConfig?.termsAndConditions,
            itemImages,
            costBreakdown: pdfCostBreakdown
        });
    };

    const handleSave = async () => {
        if (!designName.trim()) {
            alert('Please enter a design name');
            return;
        }

        if (netArea === 0) {
            const confirmSave = confirm('The design has no area calculated. Do you want to save it anyway?');
            if (!confirmSave) return;
        }

        if (!order) return;

        setSaving(true);
        try {
            let drawingData: DesignData = {
                shapes: [],
                dimensions: { width: 800, height: 600, unit: 'inch' as const },
                holes: [],
                cuts: [],
                notes: '',
                items: []
            };

            if (designDataRef.current && (designDataRef.current as any).pieces) {
                drawingData.pieces = (designDataRef.current as any).pieces;
                drawingData.items = items;
            }

            const design: CustomDesign = {
                id: crypto.randomUUID(),
                name: designName,
                customerId: order.partyId,
                customerName: order.partyName,
                drawingData: drawingData,
                baseShape: 'custom',
                totalArea: netArea,
                grossArea: grossArea,
                holes: holeCount,
                cuts: cutCount,
                complexityLevel: complexity,
                baseRate: 0,
                complexityCharge: costBreakdown?.complexityCharge || 0,
                edgeFinishingCharge: 0,
                estimatedCost: costBreakdown?.total || 0,
                status: 'approved', // Auto-approved for nested designs
                createdDate: new Date().toISOString().split('T')[0],
                notes: '',
                orderId: order.id
            };

            await designsDb.add(design);
            if (pricingConfig) {
                await db.orders.update(upsertDesignItemsInOrder(order, design, pricingConfig));
            }
            alert('Design saved and linked to order successfully!');
            router.push(`/orders/${orderId}`);
        } catch (error: any) {
            console.error('Error saving design:', error);
            alert(`Failed to save design: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    if (!order) {
        return (
            <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
                Loading order details...
            </div>
        );
    }

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href={`/orders/${orderId}`} style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                        <ArrowLeft size={20} />
                    </Link>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>New Custom Design</h1>
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginLeft: '2rem' }}>
                    Create a custom glass design for Order <strong>#{order.number}</strong> (Customer: {order.partyName})
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
                            value={order.partyName}
                            disabled
                        />
                    </div>
                </div>
            </div>

            {/* Drawing Canvas */}
            <GlassDesigner
                onAreaChange={handleAreaChange}
                onDesignChange={handleDesignChange}
                onCanvasReady={handleCanvasReady}
                onItemsChange={(newItems) => setItems(newItems)}
                onCaptureAllItems={(captureFn) => {
                    captureAllItemsRef.current = captureFn;
                }}
            />

            {/* Cost Estimate */}
            <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                    Cost Estimate
                </h3>

                {items.length > 0 && pricingConfig ? (
                    <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Items:</div>
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
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                        Click "+ Add Item" to start creating items
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                <Link href={`/orders/${orderId}`} className="btn">
                    Cancel
                </Link>
                <button className="btn btn-secondary" onClick={handleGeneratePDF}>
                    <Download size={18} style={{ marginRight: '0.5rem' }} />
                    Export PDF
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    <Save size={18} style={{ marginRight: '0.5rem' }} />
                    {saving ? 'Saving...' : 'Save Design'}
                </button>
            </div>
        </div>
    );
}
