'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, Truck, CheckCircle, Plus, IndianRupee, CreditCard, PenTool } from 'lucide-react';
import { db, designsDb } from '@/lib/storage';
import { Order, Party, InvoiceItem, OrderDelivery, BankAccount, CustomDesign } from '@/types';
import Link from 'next/link';
import { formatInchesToFraction, roundCurrency } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/auth';

const isCustomDesignOrderItem = (item: InvoiceItem): boolean => {
    return item.sourceType === 'design' || !!item.designId || !!item.designPieceId;
};

const getOrderItemTrackingKey = (item: InvoiceItem): string => {
    return item.id || item.designPieceId || item.itemId || item.itemName;
};

const getDeliveredForItem = (order: Order, item: InvoiceItem, type: 'supplier' | 'customer') => {
    const key = getOrderItemTrackingKey(item);
    return (order.deliveries || [])
        .filter(delivery => delivery.type === type)
        .flatMap(delivery => delivery.items || [])
        .filter(deliveredItem => (deliveredItem.orderItemId || deliveredItem.itemId || deliveredItem.itemName) === key)
        .reduce((total, deliveredItem) => ({
            quantity: total.quantity + (Number(deliveredItem.quantity) || 0),
            sqft: total.sqft + (Number(deliveredItem.sqft) || 0)
        }), { quantity: 0, sqft: 0 });
};

const isOrderFullyDelivered = (order: Order, type: 'supplier' | 'customer'): boolean => {
    return (order.items || []).every(item => {
        const delivered = getDeliveredForItem(order, item, type);
        const quantityComplete = delivered.quantity >= (Number(item.quantity) || 0);
        const sqftComplete = (Number(item.sqft) || 0) <= 0 || delivered.sqft >= (Number(item.sqft) || 0);
        return quantityComplete && sqftComplete;
    });
};

export default function OrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [order, setOrder] = useState<Order | null>(null);
    const [linkedOrder, setLinkedOrder] = useState<Order | null>(null);
    const [suppliers, setSuppliers] = useState<Party[]>([]);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [linkedDesigns, setLinkedDesigns] = useState<CustomDesign[]>([]);
    const [orderParty, setOrderParty] = useState<Party | null>(null);
    const [loading, setLoading] = useState(true);

    // Modals
    const [showPOModal, setShowPOModal] = useState(false);
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    const [deliveryType, setDeliveryType] = useState<'supplier' | 'customer'>('supplier');

    useEffect(() => {
        if (orderId) {
            loadOrder();
        }
    }, [orderId]);

    const loadOrder = async () => {
        setLoading(true);
        const [orders, parties, accounts, allDesigns] = await Promise.all([
            db.orders.getAll(),
            db.parties.getAll(),
            db.bankAccounts.getAll(),
            designsDb.getAll()
        ]);

        const currentOrder = orders.find(o => o.id === orderId);
        setOrder(currentOrder || null);

        if (currentOrder?.linkedOrderId) {
            const linked = orders.find(o => o.id === currentOrder.linkedOrderId);
            setLinkedOrder(linked || null);
        }

        if (currentOrder) {
            const party = parties.find(p => p.id === currentOrder.partyId);
            setOrderParty(party || null);

            // Filter strictly by current order id to prevent duplicates in detailed listings
            const designs = allDesigns.filter(d => d.orderId === currentOrder.id);
            setLinkedDesigns(designs);
        }

        setSuppliers(parties.filter(p => p.type === 'supplier'));
        setBankAccounts(accounts);
        setLoading(false);
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: '#fbbf24',
            approved: '#3b82f6',
            supplier_ordered: '#60a5fa',
            supplier_delivered: '#a78bfa',
            customer_delivered: '#34d399',
            completed: '#10b981',
            cancelled: '#ef4444'
        };
        return colors[status] || '#9ca3af';
    };

    const renderTimeline = () => {
        if (!order) return null;

        let stages = [];

        if (order.type === 'purchase_order') {
            // Simplified PO Timeline
            stages = [
                { key: 'pending', label: 'Order Placed', icon: Package },
                { key: 'supplier_delivered', label: 'Order Received', icon: Truck },
                { key: 'completed', label: 'Completed', icon: CheckCircle }
            ];
        } else if (!order.linkedOrderId) {
            // Simplified SO Timeline (Bypass PO)
            stages = [
                { key: 'pending', label: 'Order Received', icon: Package },
                { key: 'approved', label: 'Approved', icon: CheckCircle },
                { key: 'customer_delivered', label: 'Customer Delivered', icon: Truck },
                { key: 'completed', label: 'Completed', icon: CheckCircle }
            ];
        } else {
            // Full SO Timeline
            stages = [
                { key: 'pending', label: 'Order Received', icon: Package },
                { key: 'supplier_ordered', label: 'Supplier Ordered', icon: Package },
                { key: 'supplier_delivered', label: 'Supplier Delivered', icon: Truck },
                { key: 'customer_delivered', label: 'Customer Delivered', icon: Truck },
                { key: 'completed', label: 'Completed', icon: CheckCircle }
            ];
        }

        // Determine current stage index
        let currentStageIndex = stages.findIndex(s => s.key === order.status);
        if (currentStageIndex === -1) {
            currentStageIndex = 0;
        }

        return (
            <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                    {/* Progress line */}
                    <div style={{
                        position: 'absolute',
                        top: '20px',
                        left: '0',
                        right: '0',
                        height: '2px',
                        background: '#e5e7eb',
                        zIndex: 0
                    }}>
                        <div style={{
                            height: '100%',
                            background: getStatusColor(order.status),
                            width: `${(currentStageIndex / (stages.length - 1)) * 100}%`,
                            transition: 'width 0.3s'
                        }} />
                    </div>

                    {stages.map((stage, index) => {
                        const Icon = stage.icon;
                        const isActive = index <= currentStageIndex;
                        const isCurrent = index === currentStageIndex;

                        return (
                            <div key={stage.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    background: isActive ? getStatusColor(order.status) : '#e5e7eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '0.5rem',
                                    border: isCurrent ? `3px solid ${getStatusColor(order.status)}40` : 'none',
                                    boxShadow: isCurrent ? `0 0 0 4px ${getStatusColor(order.status)}20` : 'none'
                                }}>
                                    <Icon size={20} color={isActive ? 'white' : '#9ca3af'} />
                                </div>
                                <div style={{
                                    fontSize: '0.75rem',
                                    textAlign: 'center',
                                    fontWeight: isCurrent ? 600 : 400,
                                    color: isActive ? 'inherit' : 'var(--color-text-muted)'
                                }}>
                                    {stage.label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const handleCreatePO = async (supplierId: string, items: InvoiceItem[]) => {
        if (!order) return;

        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier) return;

        // Calculate totals based on the custom rates
        const subtotal = roundCurrency(items.reduce((sum, item) => sum + item.amount, 0));
        const taxAmount = roundCurrency(subtotal * (order.taxRate / 100));
        const total = roundCurrency(subtotal + taxAmount);

        const poNumber = await db.orders.generateNextOrderNumber('purchase_order', supplier.name);

        const purchaseOrder: Order = {
            id: crypto.randomUUID(),
            type: 'purchase_order',
            number: poNumber,
            date: new Date().toISOString().split('T')[0],
            deliveryDate: order.deliveryDate,
            partyId: supplierId,
            partyName: supplier.name,
            items: items,
            subtotal,
            taxRate: order.taxRate,
            taxAmount,
            total,
            status: 'pending',
            linkedOrderId: order.id,
            parentOrderId: order.id,
            deliveredToUs: 0,
            deliveredToCustomer: 0
        };

        await db.orders.add(purchaseOrder);

        // Carry over linked custom designs from Sales Order to Purchase Order
        for (const design of linkedDesigns) {
            const newDesign: CustomDesign = {
                ...design,
                id: crypto.randomUUID(),
                orderId: purchaseOrder.id,
                customerId: supplierId,
                customerName: supplier.name,
                createdDate: new Date().toISOString().split('T')[0],
            };
            await designsDb.add(newDesign);
        }

        await db.orders.linkOrders(order.id, purchaseOrder.id);
        await db.orders.updateStatus(order.id, 'supplier_ordered');

        setShowPOModal(false);
        loadOrder();
        alert('Purchase order created successfully!');
    };

    const handleMarkDelivery = async (type: 'supplier' | 'customer', items: { orderItemId?: string; itemId: string; itemName?: string; quantity: number; sqft: number }[], warehouse?: string) => {
        if (!order) return;

        // Validation: Cannot mark customer delivered if linked PO is not yet supplier delivered
        if (type === 'customer' && linkedOrder && linkedOrder.type === 'purchase_order') {
            const allowedStatuses = ['supplier_delivered', 'customer_delivered', 'completed'];
            if (!allowedStatuses.includes(linkedOrder.status)) {
                alert('Cannot deliver to customer yet. The linked Purchase Order must be marked as "Order Received" first.');
                return;
            }
        }

        const delivery: OrderDelivery = {
            id: crypto.randomUUID(),
            date: new Date().toISOString().split('T')[0],
            type,
            items,
            notes: warehouse ? `Warehouse: ${warehouse}` : ''
        };

        const totalSqft = items.reduce((sum, item) => sum + item.sqft, 0);
        const updatedOrder = { ...order };
        updatedOrder.deliveries = [...(updatedOrder.deliveries || []), delivery];

        if (type === 'supplier') {
            updatedOrder.deliveredToUs = (updatedOrder.deliveredToUs || 0) + totalSqft;
            updatedOrder.supplierDeliveryDate = delivery.date;
            updatedOrder.status = isOrderFullyDelivered(updatedOrder, 'supplier') ? 'supplier_delivered' : 'supplier_ordered';
        } else {
            updatedOrder.deliveredToCustomer = (updatedOrder.deliveredToCustomer || 0) + totalSqft;
            updatedOrder.customerDeliveryDate = delivery.date;
            updatedOrder.status = isOrderFullyDelivered(updatedOrder, 'customer') ? 'customer_delivered' : updatedOrder.status;
        }

        await db.orders.update(updatedOrder);
        setShowDeliveryModal(false);
        loadOrder();
        alert('Delivery recorded successfully!');
    };

    const handleCompleteOrder = async () => {
        if (!order) return;

        // Validation: Cannot complete SO if linked PO is not strictly completed
        if (order.type === 'sale_order' && linkedOrder && linkedOrder.type === 'purchase_order') {
            if (linkedOrder.status !== 'completed') {
                alert('Cannot complete this Sales Order yet. Please mark the linked Purchase Order as "Completed" first.');
                return;
            }
        }

        if (!confirm('Mark this order as completed?')) return;

        try {
            let invoiceId = order.invoiceId;
            if (order.type === 'purchase_order' && !invoiceId) {
                invoiceId = await db.orders.convertToInvoice(order.id);
            }

            await db.orders.updateStatus(order.id, 'completed');
            loadOrder();
            alert(order.type === 'purchase_order'
                ? 'Purchase order completed and reflected in Purchase Management.'
                : 'Order completed successfully.');
        } catch (error) {
            console.error('Complete order error:', error);
            alert('Failed to complete the order. Please try again.');
        }
    };

    const handleRecordPayment = async (paymentData: { amount: number, mode: 'cash' | 'bank', bankAccountId?: string, date: string, notes?: string }) => {
        if (!order) return;
        try {
            await db.orders.recordPayment(order.id, paymentData);
            setShowPaymentModal(false);
            loadOrder();
            alert('Payment recorded successfully!');
        } catch (error) {
            console.error('Payment error:', error);
            alert('Failed to record payment');
        }
    };

    const isEstimateSent = order?.notes?.includes('[ESTIMATE_SENT:true]') ?? false;
    const isEstimateApproved = order?.notes?.includes('[ESTIMATE_APPROVED:true]') ?? false;
    const isPOPlaced = order?.notes?.includes('[PO_PLACED:true]') ?? false;

    const handleMarkEstimateSent = async () => {
        if (!order) return;
        let notes = order.notes || '';
        if (!notes.includes('[ESTIMATE_SENT:true]')) {
            notes += '\n[ESTIMATE_SENT:true]';
        }
        const updatedOrder = { ...order, notes };
        await db.orders.update(updatedOrder);
        loadOrder();
        alert('Estimate marked as sent to customer.');
    };

    const handleMarkEstimateApproved = async () => {
        if (!order) return;
        let notes = order.notes || '';
        if (!notes.includes('[ESTIMATE_APPROVED:true]')) {
            notes += '\n[ESTIMATE_APPROVED:true]';
        }
        const updatedOrder = { ...order, notes };
        await db.orders.update(updatedOrder);
        loadOrder();
        alert('Estimate marked as approved by customer.');
    };

    const handleMarkPOPlaced = async () => {
        if (!order) return;
        let notes = order.notes || '';
        if (!notes.includes('[PO_PLACED:true]')) {
            notes += '\n[PO_PLACED:true]';
        }
        const updatedOrder = { ...order, notes, status: 'supplier_ordered' as const };
        await db.orders.update(updatedOrder);
        loadOrder();
        alert('Purchase Order marked as placed with supplier.');
    };

    const getEstimatePDFOptions = async (design: CustomDesign, additionalOpts: any = {}) => {
        try {
            const pricing = await db.settings.getPricing();
            const thicknessPricing = await db.settings.getThicknessPricing();
            const pricingConfig = { ...pricing, thicknessPricing };
            const designItems = design.drawingData?.items || [];
            
            const orderRows = order?.items || [];
            const costBreakdown = orderRows.length > 0 ? orderRows.map((item: any) => {
                const billingQuantity = item.unit === 'sqft' ? item.sqft : item.quantity;
                const lineTotal = item.lineTotal ?? ((Number(billingQuantity) || 0) * (Number(item.rate) || 0));
                const sizeText = item.width && item.height ? `${formatInchesToFraction(item.width)}" × ${formatInchesToFraction(item.height)}"` : '';
                const details = [
                    item.description,
                    sizeText,
                    `${Number(item.quantity) || 0} ${item.unit || 'nos'}`,
                    item.unit === 'sqft' ? `${Number(item.sqft || 0).toFixed(2)} sqft` : undefined,
                    `@ ₹${Number(item.rate || 0).toFixed(2)}`
                ].filter(Boolean).join(' | ');

                return {
                    name: item.itemName || item.description || 'Order item',
                    details,
                    amount: lineTotal,
                    subItems: []
                };
            }) : designItems.map((item: any) => {
                const netAreaVal = item.netArea || item.area || 0;
                const holeAmount = (item.holes || 0) * (pricingConfig?.holeCharge || 0);
                const cutAmount = (item.cuts || 0) * (pricingConfig?.cutCharge || 0);
                const itemTotal = holeAmount + cutAmount;
                
                const subItems = [];
                if (holeAmount > 0) subItems.push({ name: `${item.holes} Holes (@ ₹${pricingConfig?.holeCharge}/ea)`, amount: holeAmount });
                if (cutAmount > 0) subItems.push({ name: `${item.cuts} Cuts (@ ₹${pricingConfig?.cutCharge}/ea)`, amount: cutAmount });
                
                return {
                    name: `${item.name} (${item.type}) - ${item.thickness}mm` + (item.quantity && item.quantity > 1 ? ` (${item.quantity} pcs)` : ''),
                    details: `${netAreaVal.toFixed(2)} sq ft; design processing charges only`,
                    amount: itemTotal,
                    subItems
                };
            });

            return {
                companyName: 'Arjun Glass House',
                companyAddress: 'Your Address Here',
                companyPhone: 'Your Phone',
                companyEmail: 'your@email.com',
                termsAndConditions: pricingConfig?.termsAndConditions,
                costBreakdown,
                totalOverride: order?.total,
                ...additionalOpts
            };
        } catch (err) {
            console.error('Error generating cost breakdown for estimate PDF:', err);
            return {
                companyName: 'Arjun Glass House',
                companyAddress: 'Your Address Here',
                companyPhone: 'Your Phone',
                companyEmail: 'your@email.com',
                ...additionalOpts
            };
        }
    };

    const handleWhatsAppShare = async (excludePricing: boolean) => {
        if (!order) return;
        try {
            const { generateOrderPDF, generateEstimatePDF } = await import('@/lib/pdfGenerator');
            
            if (order.type === 'sale_order' && linkedDesigns.length > 0) {
                const pdfOpts = await getEstimatePDFOptions(linkedDesigns[0]);
                await generateEstimatePDF(linkedDesigns[0], null, pdfOpts);
            } else {
                await generateOrderPDF(order, { excludePricing, designs: linkedDesigns });
            }
            
            const messageText = excludePricing
                ? `Hello, please find attached the drawings and purchase order details for Order ${order.number}. (Pricing and costs are excluded)`
                : `Dear Customer, please find attached the estimate for your glass order: ${order.number}.`;
                
            const phone = orderParty?.phone ? orderParty.phone.replace(/[^0-9]/g, '') : '';
            const waUrl = phone 
                ? `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`
                : `https://wa.me/?text=${encodeURIComponent(messageText)}`;
            window.open(waUrl, '_blank');
        } catch (e) {
            console.error(e);
            alert('Failed to generate WhatsApp share link');
        }
    };

    const handleEmailShare = async (excludePricing: boolean) => {
        if (!order) return;
        
        let email = orderParty?.email || '';
        if (!email) {
            const promptedEmail = prompt('No registered email found. Enter recipient email address:', order.type === 'sale_order' ? 'customer@example.com' : 'supplier@example.com');
            if (!promptedEmail) return;
            email = promptedEmail;
        }
        
        try {
            const { generateOrderPDF, generateEstimatePDF } = await import('@/lib/pdfGenerator');
            
            // Generate PDF as datauristring
            let dataUri = '';
            let filename = '';
            
            if (order.type === 'sale_order' && linkedDesigns.length > 0) {
                const pdfOpts = await getEstimatePDFOptions(linkedDesigns[0], { outputType: 'datauristring' });
                dataUri = await generateEstimatePDF(linkedDesigns[0], null, pdfOpts) as string;
                filename = `estimate_${linkedDesigns[0].name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            } else {
                dataUri = await generateOrderPDF(order, { 
                    excludePricing, 
                    designs: linkedDesigns, 
                    outputType: 'datauristring' 
                }) as string;
                filename = `${order.number.replace(/\s+/g, '_')}_${excludePricing ? 'drawings_' : ''}${new Date().toISOString().split('T')[0]}.pdf`;
            }
            
            const subject = excludePricing
                ? `Purchase Order Drawings - Order ${order.number}`
                : `Glass Estimate - Order ${order.number}`;
            const body = excludePricing
                ? `Hello,\n\nPlease find attached the price-free drawings/blueprints for Order ${order.number}.\n\nBest regards.`
                : `Dear Customer,\n\nPlease find attached the estimate details for your glass order ${order.number}.\n\nBest regards.`;
            const authHeaders = await getAuthHeaders();
                
            // Attempt to send email directly via server SMTP
            const res = await fetch('/api/send-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({
                    to: email,
                    subject,
                    body,
                    pdfBase64: dataUri,
                    filename
                })
            });
            
            const data = await res.json();
            if (res.ok && data.success) {
                alert(`Email sent successfully via direct SMTP to ${email}!`);
            } else {
                // Fallback to mailto link if SMTP direct send fails (e.g. no environment config)
                const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.location.href = mailtoUrl;
                
                // Trigger client download of the PDF so they can attach it
                if (order.type === 'sale_order' && linkedDesigns.length > 0) {
                    const pdfOpts = await getEstimatePDFOptions(linkedDesigns[0]);
                    await generateEstimatePDF(linkedDesigns[0], null, pdfOpts);
                } else {
                    await generateOrderPDF(order, { excludePricing, designs: linkedDesigns });
                }
                
                alert(`Direct SMTP Send failed/not set up: ${data.error || 'Server credentials missing'}.\n\nActivated Fallback: Opened your local email app to send to ${email} (pre-filled). Please attach the downloaded PDF file.`);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to send email. Opening local mail app fallback.');
            const { generateOrderPDF, generateEstimatePDF } = await import('@/lib/pdfGenerator');
            if (order.type === 'sale_order' && linkedDesigns.length > 0) {
                const pdfOpts = await getEstimatePDFOptions(linkedDesigns[0]);
                await generateEstimatePDF(linkedDesigns[0], null, pdfOpts);
            } else {
                await generateOrderPDF(order, { excludePricing, designs: linkedDesigns });
            }
        }
    };

    const renderProcessingWizard = () => {
        if (!order) return null;

        const isPO = order.type === 'purchase_order';
        const requiresDesign = order.requiresDesign || (order.items || []).some(isCustomDesignOrderItem);

        let steps: {
            title: string;
            description: string;
            status: 'completed' | 'current' | 'upcoming';
            action?: React.ReactNode;
        }[] = [];

        if (isPO) {
            const isDelivered = order.status === 'supplier_delivered' || order.status === 'completed';
            const isCompleted = order.status === 'completed';
            const isPaid = balanceDue <= 0;

            steps = [
                {
                    title: '1. PO Created',
                    description: `Order has been created with supplier ${order.partyName}.`,
                    status: 'completed'
                },
                {
                    title: '2. Place PO with Supplier',
                    description: isPOPlaced || order.status !== 'pending'
                        ? 'Order placed with supplier.'
                        : 'Send the price-free drawing PDF to the supplier to place the order.',
                    status: isPOPlaced || order.status !== 'pending' ? 'completed' : 'current',
                    action: !(isPOPlaced || order.status !== 'pending') && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button onClick={() => handleWhatsAppShare(true)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#25D366', border: 'none', color: 'white', cursor: 'pointer' }}>
                                Share WhatsApp
                            </button>
                            <button onClick={() => handleEmailShare(true)} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                                Send Email
                            </button>
                            <button onClick={handleMarkPOPlaced} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer' }}>
                                Mark Placed
                            </button>
                        </div>
                    )
                },
                {
                    title: '3. Receive Materials',
                    description: isDelivered 
                        ? `Received materials on ${order.supplierDeliveryDate ? new Date(order.supplierDeliveryDate).toLocaleDateString() : 'N/A'}.`
                        : 'Receive the glass materials from the supplier.',
                    status: isCompleted || isDelivered ? 'completed' : ((isPOPlaced || order.status !== 'pending') ? 'current' : 'upcoming'),
                    action: !isDelivered && (isPOPlaced || order.status !== 'pending') && (
                        <button onClick={() => { setDeliveryType('supplier'); setShowDeliveryModal(true); }} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                            <Truck size={16} style={{ marginRight: '0.25rem' }} />
                            Mark Received
                        </button>
                    )
                },
                {
                    title: '4. Payments & Billing',
                    description: isPaid 
                        ? 'All payments settled with supplier.' 
                        : `Outstanding balance: ₹${balanceDue.toFixed(2)}.`,
                    status: isCompleted ? 'completed' : (isDelivered ? 'current' : 'upcoming'),
                    action: !isPaid && isDelivered && (
                        <button onClick={() => setShowPaymentModal(true)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer' }}>
                            <IndianRupee size={16} style={{ marginRight: '0.25rem' }} />
                            Record Payment
                        </button>
                    )
                },
                {
                    title: '5. Order Completion',
                    description: isCompleted ? 'Order marked completed.' : 'Mark the purchase order as completed.',
                    status: isCompleted ? 'completed' : (isDelivered && isPaid ? 'current' : 'upcoming'),
                    action: !isCompleted && isDelivered && isPaid && (
                        <button onClick={handleCompleteOrder} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer' }}>
                            <CheckCircle size={16} style={{ marginRight: '0.25rem' }} />
                            Complete Order
                        </button>
                    )
                }
            ];
        } else if (requiresDesign) {
            const hasDrawings = linkedDesigns.length > 0;
            const hasPO = !!order.linkedOrderId || !!linkedOrder;
            const isPOReceived = linkedOrder && (linkedOrder.status === 'supplier_delivered' || linkedOrder.status === 'completed');
            const isDelivered = order.status === 'customer_delivered' || order.status === 'completed';
            const isCompleted = order.status === 'completed';
            const isPaid = balanceDue <= 0;
            const hasInvoice = !!order.invoiceId;

            steps = [
                {
                    title: '1. Glass Design Drawing',
                    description: hasDrawings 
                        ? `${linkedDesigns.length} glass design(s) created and saved.` 
                        : 'Create custom glass drawings for this order.',
                    status: hasDrawings ? 'completed' : 'current',
                    action: !hasDrawings && (
                        <Link href={`/orders/${order.id}/designs/new`} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', display: 'inline-flex', alignItems: 'center' }}>
                            <Plus size={16} style={{ marginRight: '0.25rem' }} />
                            Draw Design
                        </Link>
                    )
                },
                {
                    title: '2. Send Estimate to Customer',
                    description: isEstimateSent
                        ? 'Estimate sent to customer.'
                        : 'Provide the estimate to the customer for pricing approval.',
                    status: isEstimateSent ? 'completed' : (hasDrawings ? 'current' : 'upcoming'),
                    action: !isEstimateSent && hasDrawings && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button onClick={() => handleWhatsAppShare(false)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#25D366', border: 'none', color: 'white', cursor: 'pointer' }}>
                                Share WhatsApp
                            </button>
                            <button onClick={() => handleEmailShare(false)} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                                Send Email
                            </button>
                            <button onClick={handleMarkEstimateSent} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer' }}>
                                Mark Sent
                            </button>
                        </div>
                    )
                },
                {
                    title: '3. Estimate Approval',
                    description: isEstimateApproved
                        ? 'Customer approved the estimate.'
                        : 'Approval is required before creating a Purchase Order.',
                    status: isEstimateApproved ? 'completed' : (isEstimateSent ? 'current' : 'upcoming'),
                    action: !isEstimateApproved && isEstimateSent && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={handleMarkEstimateApproved} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                                Approve Estimate
                            </button>
                            {balanceDue > 0 && (
                                <button onClick={() => setShowPaymentModal(true)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                    <IndianRupee size={14} style={{ marginRight: '0.25rem' }} />
                                    Record Advance
                                </button>
                            )}
                        </div>
                    )
                },
                {
                    title: '4. Supplier Purchase Order',
                    description: hasPO 
                        ? `Linked Purchase Order: ${linkedOrder ? linkedOrder.number : 'Created'}.`
                        : 'Supplier PO will be processed for custom materials.',
                    status: hasPO ? 'completed' : (isEstimateApproved ? 'current' : 'upcoming'),
                    action: !hasPO && isEstimateApproved && (
                        <button onClick={() => setShowPOModal(true)} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                            <Plus size={16} style={{ marginRight: '0.25rem' }} />
                            Create PO
                        </button>
                    )
                },
                {
                    title: '5. Supplier Delivery',
                    description: isPOReceived 
                        ? 'Glass materials received from supplier.' 
                        : 'Receive materials from supplier PO.',
                    status: isPOReceived ? 'completed' : (hasPO ? 'current' : 'upcoming'),
                    action: !isPOReceived && linkedOrder && (
                        <Link href={`/orders/${linkedOrder.id}`} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', display: 'inline-flex', alignItems: 'center' }}>
                            <Truck size={16} style={{ marginRight: '0.25rem' }} />
                            Go Receive PO
                        </Link>
                    )
                },
                {
                    title: '6. Customer Delivery',
                    description: isDelivered 
                        ? `Delivered to customer on ${order.customerDeliveryDate ? new Date(order.customerDeliveryDate).toLocaleDateString() : 'N/A'}.`
                        : 'Deliver the custom processed glass to the customer.',
                    status: isDelivered ? 'completed' : (isPOReceived ? 'current' : 'upcoming'),
                    action: !isDelivered && isPOReceived && (
                        <button onClick={() => { setDeliveryType('customer'); setShowDeliveryModal(true); }} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                            <Truck size={16} style={{ marginRight: '0.25rem' }} />
                            Mark Delivered
                        </button>
                    )
                },
                {
                    title: '7. Settle Payments & Billing',
                    description: `Balance Due: ₹${balanceDue.toFixed(2)}. GST Invoice: ${hasInvoice ? 'Generated' : 'Pending'}.`,
                    status: isCompleted ? 'completed' : (isDelivered ? 'current' : 'upcoming'),
                    action: isDelivered && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {!isPaid && (
                                <button onClick={() => setShowPaymentModal(true)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer' }}>
                                    <IndianRupee size={16} style={{ marginRight: '0.25rem' }} />
                                    Record Receipt
                                </button>
                            )}
                            {!hasInvoice && isCompleted && (
                                <button
                                    onClick={async () => {
                                        if (confirm('Create an invoice from this order?')) {
                                            try {
                                                await db.orders.convertToInvoice(order.id);
                                                alert('Invoice created successfully!');
                                                loadOrder();
                                            } catch (e) {
                                                console.error(e);
                                                alert('Failed to create invoice');
                                            }
                                        }
                                    }}
                                    className="btn"
                                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#3b82f6', border: 'none', color: 'white', cursor: 'pointer' }}
                                >
                                    <CreditCard size={16} style={{ marginRight: '0.25rem' }} />
                                    Generate Invoice
                                </button>
                            )}
                        </div>
                    )
                },
                {
                    title: '8. Complete Order',
                    description: isCompleted ? 'Order marked completed.' : 'Finalize the order details and complete.',
                    status: isCompleted ? 'completed' : (isDelivered ? 'current' : 'upcoming'),
                    action: !isCompleted && isDelivered && (
                        <button onClick={handleCompleteOrder} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer' }}>
                            <CheckCircle size={16} style={{ marginRight: '0.25rem' }} />
                            Complete Order
                        </button>
                    )
                }
            ];
        } else {
            const isApproved = order.status === 'approved' || order.status === 'customer_delivered' || order.status === 'completed';
            const isDelivered = order.status === 'customer_delivered' || order.status === 'completed';
            const isCompleted = order.status === 'completed';
            const isPaid = balanceDue <= 0;
            const hasInvoice = !!order.invoiceId;

            steps = [
                {
                    title: '1. Send Quotation to Customer',
                    description: isEstimateSent
                        ? 'Quotation estimate sent to customer.'
                        : 'Provide the quotation/estimate details to the customer for pricing approval.',
                    status: isEstimateSent ? 'completed' : 'current',
                    action: !isEstimateSent && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button onClick={() => handleWhatsAppShare(false)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#25D366', border: 'none', color: 'white', cursor: 'pointer' }}>
                                Share WhatsApp
                            </button>
                            <button onClick={() => handleEmailShare(false)} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                                Send Email
                            </button>
                            <button onClick={handleMarkEstimateSent} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer' }}>
                                Mark Sent
                            </button>
                        </div>
                    )
                },
                {
                    title: '2. Approve Order (Stock)',
                    description: isApproved ? 'Order approved to fulfill from existing inventory.' : 'Approve order details to fulfill from inventory catalog.',
                    status: isApproved ? 'completed' : (isEstimateSent ? 'current' : 'upcoming'),
                    action: !isApproved && isEstimateSent && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={async () => {
                                    if (confirm('Approve this order to fulfill directly from stock?')) {
                                        try {
                                            await db.orders.updateStatus(order.id, 'approved');
                                            loadOrder();
                                            alert('Order approved successfully!');
                                        } catch (error) {
                                            console.error(error);
                                            alert('Failed to approve order');
                                        }
                                    }
                                }}
                                className="btn"
                                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            >
                                <CheckCircle size={16} style={{ marginRight: '0.25rem' }} />
                                Approve Order
                            </button>
                            {balanceDue > 0 && (
                                <button onClick={() => setShowPaymentModal(true)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                    <IndianRupee size={14} style={{ marginRight: '0.25rem' }} />
                                    Record Advance
                                </button>
                            )}
                        </div>
                    )
                },
                {
                    title: '3. Customer Delivery',
                    description: isDelivered 
                        ? `Delivered to customer on ${order.customerDeliveryDate ? new Date(order.customerDeliveryDate).toLocaleDateString() : 'N/A'}.`
                        : 'Deliver items to the customer.',
                    status: isDelivered ? 'completed' : (isApproved ? 'current' : 'upcoming'),
                    action: !isDelivered && isApproved && (
                        <button onClick={() => { setDeliveryType('customer'); setShowDeliveryModal(true); }} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                            <Truck size={16} style={{ marginRight: '0.25rem' }} />
                            Mark Delivered
                        </button>
                    )
                },
                {
                    title: '4. Payments & Billing',
                    description: `Balance Due: ₹${balanceDue.toFixed(2)}. GST Invoice: ${hasInvoice ? 'Generated' : 'Pending'}.`,
                    status: isCompleted ? 'completed' : (isDelivered ? 'current' : 'upcoming'),
                    action: isDelivered && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {!isPaid && (
                                <button onClick={() => setShowPaymentModal(true)} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer' }}>
                                    <IndianRupee size={16} style={{ marginRight: '0.25rem' }} />
                                    Record Receipt
                                </button>
                            )}
                            {!hasInvoice && isCompleted && (
                                <button
                                    onClick={async () => {
                                        if (confirm('Create an invoice from this order?')) {
                                            try {
                                                await db.orders.convertToInvoice(order.id);
                                                alert('Invoice created successfully!');
                                                loadOrder();
                                            } catch (e) {
                                                console.error(e);
                                                alert('Failed to create invoice');
                                            }
                                        }
                                    }}
                                    className="btn"
                                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#3b82f6', border: 'none', color: 'white', cursor: 'pointer' }}
                                >
                                    <CreditCard size={16} style={{ marginRight: '0.25rem' }} />
                                    Generate Invoice
                                </button>
                            )}
                        </div>
                    )
                },
                {
                    title: '5. Order Completion',
                    description: isCompleted ? 'Order marked completed.' : 'Finalize the order details and complete.',
                    status: isCompleted ? 'completed' : (isDelivered ? 'current' : 'upcoming'),
                    action: !isCompleted && isDelivered && (
                        <button onClick={handleCompleteOrder} className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer' }}>
                            <CheckCircle size={16} style={{ marginRight: '0.25rem' }} />
                            Complete Order
                        </button>
                    )
                }
            ];
        }

        return (
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                    Order Processing Guide & Actions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {steps.map((step, idx) => {
                        let bgColor = 'var(--color-bg)';
                        let borderColor = 'var(--color-border)';
                        let textColor = 'inherit';
                        let opacity = 1;

                        if (step.status === 'completed') {
                            bgColor = 'rgba(16, 185, 129, 0.05)';
                            borderColor = '#10b981';
                        } else if (step.status === 'current') {
                            bgColor = 'rgba(59, 130, 246, 0.05)';
                            borderColor = '#3b82f6';
                            textColor = 'var(--color-text-primary)';
                        } else {
                            opacity = 0.6;
                        }

                        return (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                border: `1px solid ${borderColor}`,
                                borderRadius: '8px',
                                padding: '1rem',
                                background: bgColor,
                                opacity: opacity,
                                transition: 'all 0.2s'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: '70%' }}>
                                    <div style={{ fontWeight: 600, color: textColor, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {step.status === 'completed' && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>}
                                        {step.status === 'current' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />}
                                        {step.title}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                        {step.description}
                                    </div>
                                </div>
                                <div>
                                    {step.action}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>Loading order...</div>;
    }

    if (!order) {
        return <div className="container">Order not found</div>;
    }

    const totalSqft = order.items.reduce((sum, item) => sum + item.sqft, 0);
    const balanceDue = Number((order.total - (order.paidAmount || 0)).toFixed(2));
    const poRequired = order.notes?.includes('[PO_REQUIRED:true]') ?? false;

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href="/orders" style={{ color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                {order.generalNumber ? `General Order #${order.generalNumber}` : order.number}
                            </h1>
                            <span style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '999px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: getStatusColor(order.status) + '20',
                                color: getStatusColor(order.status)
                             }}>
                                {order.status.replace(/_/g, ' ').toUpperCase()}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                            {order.soNumber && <div>SO #: <strong style={{ color: 'var(--color-text-primary)' }}>{order.soNumber}</strong></div>}
                            {order.poNumber && <div>PO #: <strong style={{ color: 'var(--color-text-primary)' }}>{order.poNumber}</strong></div>}
                        </div>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            {order.type === 'sale_order' ? 'Customer Order' : 'Supplier Order'} • {order.partyName}
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Payment Status</div>
                        <div style={{ fontWeight: 600, color: balanceDue <= 0 ? '#10b981' : '#ef4444' }}>
                            {balanceDue <= 0 ? 'PAID' : `Due: ₹${balanceDue.toFixed(2)}`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                {renderTimeline()}
            </div>

            {/* Processing Wizard */}
            {renderProcessingWizard()}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {/* Export PDF Button */}
                <button
                    onClick={async () => {
                        try {
                            const { generateOrderPDF, generateEstimatePDF } = await import('@/lib/pdfGenerator');
                            if (order.type === 'sale_order' && linkedDesigns.length > 0) {
                                const pdfOpts = await getEstimatePDFOptions(linkedDesigns[0]);
                                await generateEstimatePDF(linkedDesigns[0], null, pdfOpts);
                            } else {
                                await generateOrderPDF(order, { 
                                    excludePricing: order.type === 'purchase_order', 
                                    designs: linkedDesigns 
                                });
                            }
                        } catch (error) {
                            console.error('Failed to generate PDF:', error);
                            alert('Failed to generate PDF');
                        }
                    }}
                    className="btn"
                    style={{ background: '#4b5563', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                    Export PDF
                </button>

                {/* Edit Order Button */}
                {order.status !== 'completed' && order.status !== 'cancelled' && (
                    <Link href={`/orders/${order.id}/edit`} className="btn" style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        Edit Order
                    </Link>
                )}

                {/* Record Receipt / Payment Button */}
                {balanceDue > 0 && order.status !== 'cancelled' && (
                    <button
                        onClick={() => setShowPaymentModal(true)}
                        className="btn"
                        style={{
                            background: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}
                    >
                        {order.type === 'purchase_order' ? 'Record Payment' : 'Record Receipt'}
                    </button>
                )}

                {/* Delete Order Button */}
                {order.status !== 'completed' && (
                    <button
                        onClick={async () => {
                            if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
                                try {
                                    await db.orders.delete(order.id);
                                    alert('Order deleted successfully!');
                                    router.push('/orders');
                                } catch (error) {
                                    console.error('Delete error:', error);
                                    alert('Failed to delete order');
                                }
                            }
                        }}
                        className="btn"
                        style={{ background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer' }}
                    >
                        Delete Order
                    </button>
                )}
            </div>

            {/* Linked Order */}
            {linkedOrder && (
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'rgba(96, 165, 250, 0.1)' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                        Linked {linkedOrder.type === 'sale_order' ? 'Customer' : 'Supplier'} Order
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{linkedOrder.number}</div>
                            <div style={{ fontSize: '0.875rem' }}>{linkedOrder.partyName}</div>
                        </div>
                        <Link href={`/orders/${linkedOrder.id}`} className="btn" style={{ fontSize: '0.875rem' }}>
                            View Order
                        </Link>
                    </div>
                </div>
            )}

            {/* Custom Glass Drawings & Designs */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <PenTool size={18} />
                            Custom Glass Drawings & Designs
                        </h2>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                            Create and manage bespoke glass drawings for this order
                        </p>
                    </div>
                    {order.type === 'sale_order' && (
                        <Link href={`/orders/${order.id}/designs/new`} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                            <Plus size={16} />
                            Create Glass Design
                        </Link>
                    )}
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {linkedDesigns.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)' }}>
                            No custom glass designs are currently linked to this order.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                            {linkedDesigns.map(design => (
                                <div key={design.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem', background: 'var(--color-background-soft)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span>{design.name}</span>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)' }}>
                                                Custom
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1rem' }}>
                                            <div>Area: <strong>{design.totalArea.toFixed(2)} sqft</strong></div>
                                            <div>Holes: <strong>{design.holes}</strong> | Cuts: <strong>{design.cuts}</strong></div>
                                            <div>Estimated Price: <strong style={{ color: '#10b981' }}>₹{design.estimatedCost.toFixed(2)}</strong></div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <Link href={`/orders/${order.id}/designs/${design.id}`} className="btn" style={{ flex: 1, textAlign: 'center', fontSize: '0.875rem', padding: '0.4rem 0.8rem' }}>
                                            Edit Design
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Order Details */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Order Details</h2>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Order Date</div>
                            <div style={{ fontWeight: 600 }}>{new Date(order.date).toLocaleDateString()}</div>
                        </div>
                        {order.deliveryDate && (
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Expected Delivery</div>
                                <div style={{ fontWeight: 600 }}>{new Date(order.deliveryDate).toLocaleDateString()}</div>
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Total Sqft</div>
                            <div style={{ fontWeight: 600 }}>{totalSqft.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Delivered to Us</div>
                            <div style={{ fontWeight: 600 }}>{(order.deliveredToUs || 0).toFixed(2)} sqft</div>
                        </div>
                        {order.type === 'purchase_order' && (
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Pending from Supplier</div>
                                <div style={{ fontWeight: 600, color: '#b45309' }}>{Math.max(0, totalSqft - (order.deliveredToUs || 0)).toFixed(2)} sqft</div>
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Delivered to Customer</div>
                            <div style={{ fontWeight: 600 }}>{(order.deliveredToCustomer || 0).toFixed(2)} sqft</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Items */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Items</h2>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Size</th>
                                <th>Qty</th>
                                <th>Sqft</th>
                                {order.type === 'purchase_order' && (
                                    <>
                                        <th>Received</th>
                                        <th>Pending</th>
                                    </>
                                )}
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item, index) => {
                                const received = getDeliveredForItem(order, item, 'supplier');
                                const pendingQty = Math.max(0, (Number(item.quantity) || 0) - received.quantity);
                                const pendingSqft = Math.max(0, (Number(item.sqft) || 0) - received.sqft);
                                return (
                                    <tr key={index}>
                                        <td>{item.description || item.itemName}</td>
                                        <td>{item.width && item.height ? `${formatInchesToFraction(item.width)}" × ${formatInchesToFraction(item.height)}"` : '-'}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.sqft.toFixed(2)}</td>
                                        {order.type === 'purchase_order' && (
                                            <>
                                                <td>{received.quantity} pcs<br /><small>{received.sqft.toFixed(2)} sqft</small></td>
                                                <td style={{ fontWeight: 700, color: pendingQty > 0 ? '#b45309' : '#047857' }}>{pendingQty} pcs<br /><small>{pendingSqft.toFixed(2)} sqft</small></td>
                                            </>
                                        )}
                                        <td>₹{item.rate.toFixed(2)}</td>
                                        <td style={{ fontWeight: 600 }}>₹{item.amount.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ maxWidth: '300px', marginLeft: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Subtotal:</span>
                            <span>₹{order.subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Tax ({order.taxRate}%):</span>
                            <span>₹{order.taxAmount.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#10b981' }}>
                            <span>Paid:</span>
                            <span>₹{(order.paidAmount || 0).toFixed(2)}</span>
                        </div>
                        <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem' }}>
                            <span>Total:</span>
                            <span>₹{order.total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create PO Modal */}
            {showPOModal && (
                <CreatePOModal
                    order={order}
                    suppliers={suppliers}
                    onClose={() => setShowPOModal(false)}
                    onSubmit={handleCreatePO}
                />
            )}

            {/* Delivery Modal */}
            {showDeliveryModal && (
                <DeliveryModal
                    order={order}
                    type={deliveryType}
                    onClose={() => setShowDeliveryModal(false)}
                    onSubmit={handleMarkDelivery}
                />
            )}

            {/* Payment Modal */}
            {showPaymentModal && (
                <PaymentModal
                    order={order}
                    bankAccounts={bankAccounts}
                    onClose={() => setShowPaymentModal(false)}
                    onSubmit={handleRecordPayment}
                />
            )}
        </div>
    );
}

// Delivery Modal Component
function DeliveryModal({
    order,
    type,
    onClose,
    onSubmit
}: {
    order: Order;
    type: 'supplier' | 'customer';
    onClose: () => void;
    onSubmit: (type: 'supplier' | 'customer', items: { orderItemId?: string; itemId: string; itemName?: string; quantity: number; sqft: number }[], warehouse?: string) => void;
}) {
    const [selectedItems, setSelectedItems] = useState(
        order.items.map(item => {
            const delivered = getDeliveredForItem(order, item, type);
            const pendingQty = Math.max(0, (Number(item.quantity) || 0) - delivered.quantity);
            const pendingSqft = Math.max(0, (Number(item.sqft) || 0) - delivered.sqft);
            return {
                orderItemId: getOrderItemTrackingKey(item),
                itemId: item.itemId,
                itemName: item.description || item.itemName,
                totalQty: Number(item.quantity) || 0,
                totalSqft: Number(item.sqft) || 0,
                alreadyDeliveredQty: delivered.quantity,
                alreadyDeliveredSqft: delivered.sqft,
                pendingQty,
                pendingSqft,
                deliveredQty: pendingQty,
                deliveredSqft: pendingSqft
            };
        })
    );
    const [warehouse, setWarehouse] = useState('Warehouse A');

    const handleSubmit = () => {
        const items = selectedItems
            .filter(item => item.deliveredQty > 0)
            .map(item => ({
                orderItemId: item.orderItemId,
                itemId: item.itemId,
                itemName: item.itemName,
                quantity: item.deliveredQty,
                sqft: item.deliveredSqft
            }));

        if (items.length === 0) {
            alert('Please select at least one item to deliver');
            return;
        }

        onSubmit(type, items, type === 'supplier' ? warehouse : undefined);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="card" style={{ width: '90%', maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        Record {type === 'supplier' ? 'Order Receipt' : 'Customer Delivery'}
                    </h2>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {type === 'supplier' && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Receiving Warehouse</label>
                            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                                <option value="Warehouse A">Warehouse A</option>
                                <option value="Warehouse B">Warehouse B</option>
                            </select>
                        </div>
                    )}
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Ordered</th>
                                <th>Received</th>
                                <th>Pending</th>
                                <th>{type === 'supplier' ? 'Receive Now' : 'Deliver Now'}</th>
                                <th>Sqft Now</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedItems.map((item, index) => (
                                <tr key={index}>
                                    <td>{item.itemName}</td>
                                    <td>{item.totalQty} pcs<br /><small>{item.totalSqft.toFixed(2)} sqft</small></td>
                                    <td>{item.alreadyDeliveredQty} pcs<br /><small>{item.alreadyDeliveredSqft.toFixed(2)} sqft</small></td>
                                    <td style={{ fontWeight: 700 }}>{item.pendingQty} pcs<br /><small>{item.pendingSqft.toFixed(2)} sqft</small></td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.deliveredQty}
                                            max={item.pendingQty}
                                            min={0}
                                            onChange={(e) => {
                                                const updated = [...selectedItems];
                                                const qty = Math.min(Number(e.target.value), item.pendingQty);
                                                updated[index].deliveredQty = qty;
                                                updated[index].deliveredSqft = item.pendingQty > 0
                                                    ? (qty / item.pendingQty) * item.pendingSqft
                                                    : 0;
                                                setSelectedItems(updated);
                                            }}
                                            style={{ width: '100px' }}
                                        />
                                    </td>
                                    <td>{item.deliveredSqft.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} className="btn">Cancel</button>
                    <button onClick={handleSubmit} className="btn btn-primary">Record {type === 'supplier' ? 'Receipt' : 'Delivery'}</button>
                </div>
            </div>
        </div>
    );
}

// Payment Modal Component
function PaymentModal({
    order,
    bankAccounts,
    onClose,
    onSubmit
}: {
    order: Order;
    bankAccounts: BankAccount[];
    onClose: () => void;
    onSubmit: (data: { amount: number, mode: 'cash' | 'bank', bankAccountId?: string, date: string, notes?: string }) => void;
}) {
    const [amount, setAmount] = useState(Math.round((order.total - (order.paidAmount || 0)) * 100) / 100);
    const [mode, setMode] = useState<'cash' | 'bank'>('cash');
    const [bankAccountId, setBankAccountId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');

    const handleSubmit = () => {
        if (mode === 'bank' && !bankAccountId) {
            alert('Please select a bank account');
            return;
        }
        const balanceDue = roundCurrency(order.total - (order.paidAmount || 0));
        if (amount <= 0 || amount > balanceDue) {
            alert('Please enter an amount greater than zero and not more than the balance due.');
            return;
        }
        onSubmit({ amount: roundCurrency(amount), mode, bankAccountId: mode === 'bank' ? bankAccountId : undefined, date, notes });
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: '90%', maxWidth: '500px', padding: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>
                    Record {order.type === 'purchase_order' ? 'Payment' : 'Receipt'}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Amount</label>
                        <input type="number" min="0.01" step="0.01" className="input money-input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Date</label>
                        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Mode</label>
                        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'cash' | 'bank')}>
                            <option value="cash">Cash</option>
                            <option value="bank">Bank Transfer</option>
                        </select>
                    </div>
                    {mode === 'bank' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Bank Account</label>
                            <select className="input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                                <option value="">Select Account</option>
                                {bankAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.accountNumber}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Notes</label>
                        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button onClick={onClose} className="btn">Cancel</button>
                    <button onClick={handleSubmit} className="btn btn-primary">Save</button>
                </div>
            </div>
        </div>
    );
}

// Create PO Modal Component
function CreatePOModal({
    order,
    suppliers,
    onClose,
    onSubmit
}: {
    order: Order;
    suppliers: Party[];
    onClose: () => void;
    onSubmit: (supplierId: string, items: InvoiceItem[]) => void;
}) {
    // Parse preferred supplier ID from order notes if present
    const preferredSupplierMatch = order.notes?.match(/\[PREFERRED_SUPPLIER_ID:([a-zA-Z0-9-]+)\]/);
    const preferredSupplierId = preferredSupplierMatch ? preferredSupplierMatch[1] : '';
    const designItems = order.items.filter(isCustomDesignOrderItem).map(item => ({
        ...item,
        sourceType: 'design' as const
    }));

    const [supplierId, setSupplierId] = useState(preferredSupplierId);
    const [items, setItems] = useState<InvoiceItem[]>(
        designItems.map(item => ({ ...item }))
    );
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
        designItems.map(item => item.id || '')
    );

    const handleRateChange = (index: number, newRate: number) => {
        const updated = [...items];
        updated[index].rate = newRate;
        const billingQuantity = updated[index].unit === 'sqft'
            ? Number(updated[index].sqft) || 0
            : Number(updated[index].quantity) || 0;
        const lineTotal = roundCurrency(billingQuantity * newRate);
        updated[index].amount = roundCurrency(lineTotal / (1 + ((Number(order.taxRate) || 0) / 100)));
        updated[index].lineTotal = lineTotal;
        setItems(updated);
    };

    const handleToggleItem = (itemId: string) => {
        if (selectedItemIds.includes(itemId)) {
            setSelectedItemIds(selectedItemIds.filter(id => id !== itemId));
        } else {
            setSelectedItemIds([...selectedItemIds, itemId]);
        }
    };

    const handleSubmit = () => {
        if (!supplierId) {
            alert('Please select a supplier');
            return;
        }
        const selectedItems = items.filter(item => selectedItemIds.includes(item.id || ''));
        if (selectedItems.length === 0) {
            alert('Please select at least one item to purchase.');
            return;
        }
        onSubmit(supplierId, selectedItems);
    };

    const selectedItems = items.filter(item => selectedItemIds.includes(item.id || ''));
    const subtotal = roundCurrency(selectedItems.reduce((sum, item) => sum + item.amount, 0));
    const total = roundCurrency(selectedItems.reduce((sum, item) => sum + (Number(item.lineTotal ?? item.amount) || 0), 0));
    const taxAmount = roundCurrency(total - subtotal);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="card" style={{ width: '90%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Create Purchase Order</h2>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Select Supplier</label>
                        <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                            <option value="">Choose supplier...</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Items & Purchase Rates</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                            Only custom design generated rows are included here. Catalogue glass and separately added hardware remain only on the customer order.
                        </p>
                    </div>

                    {items.length === 0 ? (
                        <div className="empty-state" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            No custom design rows are available for purchase order creation.
                        </div>
                    ) : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: '50px' }}>Select</th>
                                    <th>Type</th>
                                    <th>Description</th>
                                    <th>Size</th>
                                    <th>Qty</th>
                                    <th>Sqft</th>
                                    <th>Purchase Rate</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, index) => {
                                    const isChecked = selectedItemIds.includes(item.id || '');
                                    return (
                                        <tr key={index} style={{ opacity: isChecked ? 1 : 0.6 }}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => handleToggleItem(item.id || '')}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            </td>
                                            <td>{item.type || 'Glass'}</td>
                                            <td>{item.description || item.itemName}</td>
                                            <td>{item.width && item.height ? `${formatInchesToFraction(item.width)}" × ${formatInchesToFraction(item.height)}"` : '-'}</td>
                                            <td>{item.quantity}</td>
                                            <td>{item.sqft.toFixed(2)}</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    className="input"
                                                    value={item.rate}
                                                    onChange={(e) => handleRateChange(index, Number(e.target.value))}
                                                    style={{ width: '120px' }}
                                                    step="0.01"
                                                    disabled={!isChecked}
                                                />
                                            </td>
                                            <td style={{ fontWeight: 600 }}>₹{isChecked ? (Number(item.lineTotal ?? item.amount) || 0).toFixed(2) : '0.00'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    <div style={{ maxWidth: '300px', marginLeft: 'auto', marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Subtotal:</span>
                            <span>₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Tax ({order.taxRate}%):</span>
                            <span>₹{taxAmount.toFixed(2)}</span>
                        </div>
                        <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem' }}>
                            <span>Total:</span>
                            <span>₹{total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} className="btn">Cancel</button>
                    <button onClick={handleSubmit} className="btn btn-primary" disabled={items.length === 0}>Create Purchase Order</button>
                </div>
            </div>
        </div>
    );
}
