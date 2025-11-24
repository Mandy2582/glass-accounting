'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, Truck, CheckCircle, Plus, IndianRupee, CreditCard } from 'lucide-react';
import { db } from '@/lib/storage';
import { Order, Party, InvoiceItem, OrderDelivery, BankAccount } from '@/types';
import Link from 'next/link';

export default function OrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [order, setOrder] = useState<Order | null>(null);
    const [linkedOrder, setLinkedOrder] = useState<Order | null>(null);
    const [suppliers, setSuppliers] = useState<Party[]>([]);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
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
        const [orders, parties, accounts] = await Promise.all([
            db.orders.getAll(),
            db.parties.getAll(),
            db.bankAccounts.getAll()
        ]);

        const currentOrder = orders.find(o => o.id === orderId);
        setOrder(currentOrder || null);

        if (currentOrder?.linkedOrderId) {
            const linked = orders.find(o => o.id === currentOrder.linkedOrderId);
            setLinkedOrder(linked || null);
        }

        setSuppliers(parties.filter(p => p.type === 'supplier'));
        setBankAccounts(accounts);
        setLoading(false);
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: '#fbbf24',
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
        let currentStageIndex = 0;
        if (order.type === 'purchase_order') {
            if (order.status === 'completed') currentStageIndex = 2;
            else if (order.status === 'supplier_delivered') currentStageIndex = 1;
            else currentStageIndex = 0;
        } else {
            currentStageIndex = stages.findIndex(s => s.key === order.status);
            if (currentStageIndex === -1) currentStageIndex = 0;
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
        const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
        const taxAmount = subtotal * (order.taxRate / 100);
        const total = subtotal + taxAmount;

        const purchaseOrder: Order = {
            id: crypto.randomUUID(),
            type: 'purchase_order',
            number: `PO-${Date.now().toString().substr(-6)}`,
            date: new Date().toISOString().split('T')[0],
            deliveryDate: order.deliveryDate,
            partyId: supplierId,
            partyName: supplier.name,
            items: items,
            subtotal: subtotal,
            taxRate: order.taxRate,
            taxAmount: taxAmount,
            total: total,
            status: 'pending',
            linkedOrderId: order.id,
            parentOrderId: order.id,
            deliveredToUs: 0,
            deliveredToCustomer: 0
        };

        await db.orders.add(purchaseOrder);
        await db.orders.linkOrders(order.id, purchaseOrder.id);
        await db.orders.updateStatus(order.id, 'supplier_ordered');

        setShowPOModal(false);
        loadOrder();
        alert('Purchase order created successfully!');
    };

    const handleMarkDelivery = async (type: 'supplier' | 'customer', items: { itemId: string; quantity: number; sqft: number }[], warehouse?: string) => {
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
            updatedOrder.status = 'supplier_delivered';
            updatedOrder.supplierDeliveryDate = delivery.date;
        } else {
            updatedOrder.deliveredToCustomer = (updatedOrder.deliveredToCustomer || 0) + totalSqft;
            updatedOrder.status = 'customer_delivered';
            updatedOrder.customerDeliveryDate = delivery.date;
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

        await db.orders.updateStatus(order.id, 'completed');
        loadOrder();
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

    if (loading) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>Loading order...</div>;
    }

    if (!order) {
        return <div className="container">Order not found</div>;
    }

    const totalSqft = order.items.reduce((sum, item) => sum + item.sqft, 0);
    const balanceDue = order.total - (order.paidAmount || 0);

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href="/orders" style={{ color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{order.number}</h1>
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
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
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

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {order.type === 'sale_order' && order.status === 'pending' && !linkedOrder && (
                    <button onClick={() => setShowPOModal(true)} className="btn btn-primary">
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Create Purchase Order
                    </button>
                )}

                {/* Supplier Delivery: Only on Purchase Orders */}
                {order.type === 'purchase_order' && (order.status === 'pending' || order.status === 'supplier_ordered') && (
                    <button onClick={() => { setDeliveryType('supplier'); setShowDeliveryModal(true); }} className="btn btn-primary">
                        <Truck size={18} style={{ marginRight: '0.5rem' }} />
                        Mark Order Received
                    </button>
                )}

                {/* Customer Delivery: Only on Sale Orders */}
                {order.type === 'sale_order' && (order.status === 'supplier_delivered' || order.status === 'supplier_ordered') && (
                    <button onClick={() => { setDeliveryType('customer'); setShowDeliveryModal(true); }} className="btn btn-primary">
                        <Truck size={18} style={{ marginRight: '0.5rem' }} />
                        Mark Customer Delivered
                    </button>
                )}

                {/* Record Payment Button */}
                {balanceDue > 0 && (
                    <button onClick={() => setShowPaymentModal(true)} className="btn" style={{ background: '#8b5cf6', color: 'white', border: 'none' }}>
                        <IndianRupee size={18} style={{ marginRight: '0.5rem' }} />
                        Record {order.type === 'purchase_order' ? 'Payment' : 'Receipt'}
                    </button>
                )}

                {/* Complete Order Button */}
                {order.type === 'sale_order' && order.status === 'customer_delivered' && (
                    <button onClick={handleCompleteOrder} className="btn" style={{ background: '#10b981', color: 'white' }}>
                        <CheckCircle size={18} style={{ marginRight: '0.5rem' }} />
                        Complete Order
                    </button>
                )}
                {order.type === 'purchase_order' && order.status === 'supplier_delivered' && (
                    <button onClick={handleCompleteOrder} className="btn" style={{ background: '#10b981', color: 'white' }}>
                        <CheckCircle size={18} style={{ marginRight: '0.5rem' }} />
                        Complete Order
                    </button>
                )}

                {/* Convert to Invoice Button */}
                {order.status === 'completed' && !order.invoiceId && (
                    <button
                        onClick={async () => {
                            if (confirm('Create an invoice from this order? This will update inventory and ledgers.')) {
                                try {
                                    const invoiceId = await db.orders.convertToInvoice(order.id);
                                    alert('Invoice created successfully!');
                                    // Optionally redirect to invoice
                                    // router.push(`/invoices/${invoiceId}`); // Assuming invoice page exists or we just reload
                                    loadOrder();
                                } catch (e) {
                                    console.error(e);
                                    alert('Failed to create invoice');
                                }
                            }
                        }}
                        className="btn"
                        style={{ background: '#3b82f6', color: 'white' }}
                    >
                        <CreditCard size={18} style={{ marginRight: '0.5rem' }} />
                        Convert to Invoice
                    </button>
                )}

                {/* View Invoice Button */}
                {order.invoiceId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#eff6ff', borderRadius: '0.5rem', color: '#1d4ed8', fontSize: '0.875rem', fontWeight: 500 }}>
                        <CheckCircle size={16} />
                        Invoice Created
                    </div>
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
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item, index) => (
                                <tr key={index}>
                                    <td>{item.description || item.itemName}</td>
                                    <td>{item.width}" × {item.height}"</td>
                                    <td>{item.quantity}</td>
                                    <td>{item.sqft.toFixed(2)}</td>
                                    <td>₹{item.rate.toFixed(2)}</td>
                                    <td style={{ fontWeight: 600 }}>₹{item.amount.toFixed(2)}</td>
                                </tr>
                            ))}
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
    onSubmit: (type: 'supplier' | 'customer', items: { itemId: string; quantity: number; sqft: number }[], warehouse?: string) => void;
}) {
    const [selectedItems, setSelectedItems] = useState(
        order.items.map(item => ({
            itemId: item.itemId,
            itemName: item.description || item.itemName,
            totalQty: item.quantity,
            totalSqft: item.sqft,
            deliveredQty: item.quantity,
            deliveredSqft: item.sqft
        }))
    );
    const [warehouse, setWarehouse] = useState('Warehouse A');

    const handleSubmit = () => {
        const items = selectedItems
            .filter(item => item.deliveredQty > 0)
            .map(item => ({
                itemId: item.itemId,
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
                                <th>Total Qty</th>
                                <th>Total Sqft</th>
                                <th>Delivered Qty</th>
                                <th>Delivered Sqft</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedItems.map((item, index) => (
                                <tr key={index}>
                                    <td>{item.itemName}</td>
                                    <td>{item.totalQty}</td>
                                    <td>{item.totalSqft.toFixed(2)}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.deliveredQty}
                                            max={item.totalQty}
                                            min={0}
                                            onChange={(e) => {
                                                const updated = [...selectedItems];
                                                const qty = Number(e.target.value);
                                                updated[index].deliveredQty = qty;
                                                updated[index].deliveredSqft = (qty / item.totalQty) * item.totalSqft;
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
    const [amount, setAmount] = useState(order.total - (order.paidAmount || 0));
    const [mode, setMode] = useState<'cash' | 'bank'>('cash');
    const [bankAccountId, setBankAccountId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');

    const handleSubmit = () => {
        if (mode === 'bank' && !bankAccountId) {
            alert('Please select a bank account');
            return;
        }
        onSubmit({ amount, mode, bankAccountId: mode === 'bank' ? bankAccountId : undefined, date, notes });
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
                        <input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
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
    const [supplierId, setSupplierId] = useState('');
    const [items, setItems] = useState<InvoiceItem[]>(
        order.items.map(item => ({ ...item }))
    );

    const handleRateChange = (index: number, newRate: number) => {
        const updated = [...items];
        updated[index].rate = newRate;
        updated[index].amount = updated[index].sqft * newRate;
        setItems(updated);
    };

    const handleSubmit = () => {
        if (!supplierId) {
            alert('Please select a supplier');
            return;
        }
        onSubmit(supplierId, items);
    };

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = subtotal * (order.taxRate / 100);
    const total = subtotal + taxAmount;

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
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Adjust the purchase rates below (these may differ from customer sale rates)</p>
                    </div>

                    <table className="table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Size</th>
                                <th>Qty</th>
                                <th>Sqft</th>
                                <th>Purchase Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => (
                                <tr key={index}>
                                    <td>{item.description || item.itemName}</td>
                                    <td>{item.width}" × {item.height}"</td>
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
                                        />
                                    </td>
                                    <td style={{ fontWeight: 600 }}>₹{item.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

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
                    <button onClick={handleSubmit} className="btn btn-primary">Create Purchase Order</button>
                </div>
            </div>
        </div>
    );
}
