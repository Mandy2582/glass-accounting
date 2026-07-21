'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/storage';
import { Order, Party, GlassItem, InvoiceItem } from '@/types';
import Link from 'next/link';
import FractionInput from '@/components/FractionInput';
import NumericInput from '@/components/NumericInput';
import PartyModal from '@/components/parties/PartyModal';
import ItemModal from '@/components/inventory/ItemModal';
import { generateUUID, roundCurrency } from '@/lib/utils';
import { calculateLineAmounts, convertRateForItemUnit, defaultUnitsForItem, UNIT_OPTIONS_BY_GROUP } from '@/lib/units';
import { splitInternalNotes } from '@/lib/orderNotes';
import { normalizeDesignItemBillingFields } from '@/lib/orderDesignItems';

export default function EditOrderPage() {
    const router = useRouter();
    const params = useParams();
    const orderId = params.id as string;

    const [order, setOrder] = useState<Order | null>(null);
    const [customers, setCustomers] = useState<Party[]>([]);
    const [items, setItems] = useState<GlassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [purchaseOrderRequired, setPurchaseOrderRequired] = useState(false);
    const [preservedMarkers, setPreservedMarkers] = useState('');
    const [showNewPartyModal, setShowNewPartyModal] = useState(false);
    const [showNewItemModal, setShowNewItemModal] = useState(false);
    const [pendingItemRowIndex, setPendingItemRowIndex] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        partyId: '',
        date: '',
        deliveryDate: '',
        taxRate: 18,
        notes: ''
    });

    const [orderItems, setOrderItems] = useState<InvoiceItem[]>([]);

    useEffect(() => {
        loadData();
    }, [orderId]);

    useEffect(() => {
        setOrderItems(prev => prev.map(item => {
            const normalized = normalizeDesignItemBillingFields(item);
            const catalogItem = items.find(i => i.id === normalized.itemId);
            const calculated = calculateLineAmounts({
                width: normalized.width,
                height: normalized.height,
                quantity: normalized.quantity,
                unit: normalized.unit,
                rate: normalized.rate,
                rateUnit: normalized.rateUnit,
                taxRate: formData.taxRate,
                conversionFactor: catalogItem?.conversionFactor,
            });
            return {
                ...normalized,
                sqft: calculated.sqft,
                amount: calculated.amount,
                lineTotal: calculated.lineTotal
            };
        }));
    }, [formData.taxRate, items]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [ordersData, partiesData, itemsData] = await Promise.all([
                db.orders.getAll(),
                db.parties.getAll(),
                db.items.getAll()
            ]);

            const currentOrder = ordersData.find(o => o.id === orderId);
            if (!currentOrder) {
                alert('Order not found');
                router.push('/orders');
                return;
            }

            setOrder(currentOrder);
            setCustomers(partiesData.filter(p => p.type === 'customer' || p.type === 'supplier')); // Allow editing both customer & supplier orders
            setItems(itemsData);

            const rawNotes = currentOrder.notes || '';
            const { visible, internalBlock } = splitInternalNotes(rawNotes);
            const poRequired = internalBlock.includes('[PO_REQUIRED:true]');
            // Everything except PO_REQUIRED is preserved verbatim on save since it's
            // not editable from this form (estimate/approval flags, work assignments,
            // customer attachments, etc.) -- only the PO_REQUIRED line gets regenerated
            // from the checkbox below.
            const otherMarkers = internalBlock.replace(/\[PO_REQUIRED:(true|false)\]/g, '').trim();

            setFormData({
                partyId: currentOrder.partyId,
                date: currentOrder.date,
                deliveryDate: currentOrder.deliveryDate || '',
                taxRate: currentOrder.taxRate,
                notes: visible
            });
            setPurchaseOrderRequired(poRequired);
            setPreservedMarkers(otherMarkers);

            // Map order items to editable structure, preserving empty string values if they were deleted/cleared
            setOrderItems(currentOrder.items.map(item => normalizeDesignItemBillingFields({
                id: item.id || crypto.randomUUID(),
                itemId: item.itemId || '',
                itemName: item.itemName || '',
                description: item.description || '',
                make: item.make,
                model: item.model,
                type: item.type,
                warehouse: item.warehouse,
                width: item.width || 0,
                height: item.height || 0,
                quantity: item.quantity,
                unit: item.unit || 'sqft',
                sqft: item.sqft || 0,
                rate: item.rate,
                rateUnit: item.rateUnit || item.unit || 'sqft',
                amount: item.amount,
                lineTotal: item.lineTotal,
                sourceType: item.sourceType,
                designId: item.designId,
                designPieceId: item.designPieceId
            })));
        } catch (error) {
            console.error('Error loading order data:', error);
            alert('Failed to load order data.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveNewParty = async (partyData: Omit<Party, 'id'>) => {
        const partyType = order?.type === 'purchase_order' ? 'supplier' : 'customer';
        const newParty: Party = {
            ...partyData,
            id: generateUUID(),
            type: partyType,
        };

        await db.parties.add(newParty);
        const partiesData = await db.parties.getAll();
        setCustomers(partiesData.filter(p => p.type === 'customer' || p.type === 'supplier'));
        setFormData(prev => ({ ...prev, partyId: newParty.id }));
        setShowNewPartyModal(false);
    };

    const handleSaveNewItem = async (itemData: Omit<GlassItem, 'id'>) => {
        const newItem: GlassItem = {
            ...itemData,
            id: generateUUID(),
        };

        await db.items.add(newItem);
        const itemsData = await db.items.getAll();
        setItems(itemsData);

        if (pendingItemRowIndex !== null) {
            setOrderItems(prev => prev.map((row, index) => {
                if (index !== pendingItemRowIndex) return row;

                const width = newItem.width || 0;
                const height = newItem.height || 0;
                const qty = Number(row.quantity) || 1;
                const { unit, rateUnit } = defaultUnitsForItem(newItem);
                const rate = Number(newItem.rate) || 0;
                const calculated = calculateLineAmounts({
                    width,
                    height,
                    quantity: qty,
                    unit,
                    rate,
                    rateUnit,
                    taxRate: formData.taxRate,
                    conversionFactor: newItem.conversionFactor,
                });

                return {
                    ...row,
                    itemId: newItem.id,
                    itemName: newItem.name,
                    description: row.description || newItem.name,
                    make: newItem.make,
                    model: newItem.model,
                    type: newItem.category === 'hardware' ? 'Hardware' : newItem.type,
                    warehouse: row.warehouse || 'Warehouse A',
                    width,
                    height,
                    quantity: qty,
                    unit,
                    sqft: calculated.sqft,
                    rate,
                    rateUnit,
                    amount: calculated.amount,
                    lineTotal: calculated.lineTotal,
                };
            }));
        }

        setPendingItemRowIndex(null);
        setShowNewItemModal(false);
    };

    const addItem = () => {
        setOrderItems([...orderItems, {
            id: crypto.randomUUID(),
            itemId: '',
            itemName: '',
            description: '',
            width: 0,
            height: 0,
            quantity: 1,
            unit: 'sqft',
            sqft: 0,
            rate: 0,
            rateUnit: 'sqft',
            amount: 0
        }]);
    };

    const removeItem = (index: number) => {
        if (orderItems.length > 1) {
            setOrderItems(orderItems.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: string, value: any) => {
        const updated = [...orderItems];
        const previousRateUnit = updated[index].rateUnit || updated[index].unit || 'nos';
        const item = { ...updated[index], [field]: value };

        // If selecting from catalog
        if (field === 'itemId' && value) {
            const catalogItem = items.find(i => i.id === value);
            if (catalogItem) {
                const defaults = defaultUnitsForItem(catalogItem);
                item.itemName = catalogItem.name;
                item.rate = catalogItem.rate;
                item.unit = defaults.unit;
                item.rateUnit = defaults.rateUnit;
                item.width = catalogItem.width || 0;
                item.height = catalogItem.height || 0;
            }
        }

        // Rate is tracked in its own unit (rateUnit), independent of the
        // billing/quantity unit -- so changing the billing unit no longer
        // needs to touch the rate at all (previously it did, on the
        // assumption rate was always expressed in whatever unit quantity
        // was billed in, which silently misread a rate typed in as, say,
        // "per sqft" as "per sheet" whenever the line happened to bill in
        // sheets). Only changing rateUnit itself converts the rate value,
        // to preserve its real-world price when switching how it's quoted.
        if (field === 'rateUnit') {
            const catalogItem = items.find(i => i.id === item.itemId);
            item.rate = convertRateForItemUnit({
                rate: Number(item.rate) || 0,
                fromUnit: previousRateUnit,
                toUnit: value,
                width: item.width || catalogItem?.width,
                height: item.height || catalogItem?.height,
                conversionFactor: catalogItem?.conversionFactor,
            });
        }

        // Recalculate
        if (['width', 'height', 'quantity', 'rate', 'rateUnit', 'itemId', 'unit'].includes(field)) {
            const rawWidth = field === 'width' ? value : item.width;
            const rawHeight = field === 'height' ? value : item.height;
            const rawQty = field === 'quantity' ? value : item.quantity;
            const rawRate = field === 'rate' ? value : item.rate;
            const unit = field === 'unit' ? value : (item.unit || 'sqft');
            const rateUnit = item.rateUnit || unit;

            const width = rawWidth === '' ? 0 : Number(rawWidth);
            const height = rawHeight === '' ? 0 : Number(rawHeight);
            const qty = rawQty === '' ? 0 : Number(rawQty);
            const rate = rawRate === '' ? 0 : Number(rawRate);

            const catalogItem = items.find(i => i.id === item.itemId);
            const normalized = normalizeDesignItemBillingFields(item);
            const calculated = calculateLineAmounts({
                width: normalized.sourceType === 'design' ? normalized.width : width,
                height: normalized.sourceType === 'design' ? normalized.height : height,
                quantity: normalized.sourceType === 'design' && field !== 'quantity' ? normalized.quantity : qty,
                unit: normalized.sourceType === 'design' && field !== 'unit' ? normalized.unit : unit,
                rate,
                rateUnit,
                taxRate: formData.taxRate,
                conversionFactor: (catalogItem as any)?.conversionFactor,
            });
            if (normalized.sourceType === 'design') {
                item.quantity = field === 'quantity' ? qty : normalized.quantity;
                item.unit = field === 'unit' ? unit : normalized.unit;
                item.rateUnit = rateUnit;
            }
            item.sqft = calculated.sqft;
            item.amount = calculated.amount;
            item.lineTotal = calculated.lineTotal;
        }

        updated[index] = item;
        setOrderItems(updated);
    };

    const calculateTotals = () => {
        const subtotal = roundCurrency(orderItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
        const total = roundCurrency(orderItems.reduce((sum, item) => {
            if (item.lineTotal !== undefined) return sum + (Number(item.lineTotal) || 0);
            const normalized = normalizeDesignItemBillingFields(item);
            const catalogItem = items.find(i => i.id === normalized.itemId);
            const calculated = calculateLineAmounts({
                width: normalized.width,
                height: normalized.height,
                quantity: normalized.quantity,
                unit: normalized.unit,
                rate: normalized.rate,
                rateUnit: normalized.rateUnit,
                taxRate: formData.taxRate,
                conversionFactor: catalogItem?.conversionFactor,
            });
            return sum + calculated.lineTotal;
        }, 0));
        const taxAmount = roundCurrency(total - subtotal);
        return { subtotal, taxAmount, total };
    };

    const getBillingLabel = (item: InvoiceItem) => {
        const normalized = normalizeDesignItemBillingFields(item);
        const catalogItem = items.find(i => i.id === normalized.itemId);
        return calculateLineAmounts({
            width: normalized.width,
            height: normalized.height,
            quantity: normalized.quantity,
            unit: normalized.unit,
            rate: normalized.rate,
            rateUnit: normalized.rateUnit,
            taxRate: formData.taxRate,
            conversionFactor: catalogItem?.conversionFactor,
        }).billingLabel;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!order) return;

        if (!formData.partyId) {
            alert('Please select a customer/supplier');
            return;
        }

        if (orderItems.some(item => (!item.itemName && !item.description) || !item.quantity)) {
            alert('Please fill in description and quantity for all items.');
            return;
        }

        setSaving(true);

        try {
            const { subtotal, taxAmount, total } = calculateTotals();
            const party = customers.find(c => c.id === formData.partyId);

            // Sanitize item properties before saving (ensure numbers and strings aren't empty)
            const sanitizedItems = orderItems.map(item => {
                const normalized = normalizeDesignItemBillingFields(item);
                return {
                    ...normalized,
                    width: Number(normalized.width) || 0,
                    height: Number(normalized.height) || 0,
                    quantity: Number(normalized.quantity) || 0,
                    sqft: Number(normalized.sqft) || 0,
                    rate: Number(normalized.rate) || 0,
                    amount: Number(normalized.amount) || 0,
                    lineTotal: normalized.lineTotal === undefined ? undefined : Number(normalized.lineTotal) || 0
                };
            });

            const updatedOrder: Order = {
                ...order,
                date: formData.date,
                deliveryDate: formData.deliveryDate || undefined,
                partyId: formData.partyId,
                partyName: party?.name || '',
                items: sanitizedItems,
                subtotal,
                taxRate: formData.taxRate,
                taxAmount,
                total,
                notes: [formData.notes, preservedMarkers, `[PO_REQUIRED:${purchaseOrderRequired}]`].filter(Boolean).join('\n').trim()
            };

            await db.orders.update(updatedOrder);
            alert('Order updated successfully!');
            router.push(`/orders/${orderId}`);
        } catch (error) {
            console.error('Error updating order:', error);
            alert('Failed to update order. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>Loading order data...</div>;
    }

    if (!order) {
        return <div className="container">Order not found</div>;
    }

    const { subtotal, taxAmount, total } = calculateTotals();

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href={`/orders/${orderId}`} style={{ color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Edit Order {order.number}</h1>
                </div>
                <p style={{ color: 'var(--color-text-muted)', marginLeft: '2.5rem' }}>
                    Update details for this {order.type === 'sale_order' ? 'sale' : 'purchase'} order
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Order Details</h2>
                    </div>
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    {order.type === 'sale_order' ? 'Customer' : 'Supplier'} *
                                </label>
                                <div className="quick-add-field">
                                    <select
                                        className="input"
                                        required
                                        value={formData.partyId}
                                        onChange={(e) => {
                                            if (e.target.value === '__add_party__') {
                                                setShowNewPartyModal(true);
                                            } else {
                                                setFormData({ ...formData, partyId: e.target.value });
                                            }
                                        }}
                                    >
                                        <option value="">Select Party</option>
                                        <option value="__add_party__">+ Add New {order.type === 'sale_order' ? 'Customer' : 'Supplier'}</option>
                                        {customers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="quick-add-button"
                                        onClick={() => setShowNewPartyModal(true)}
                                        title={`Add New ${order.type === 'sale_order' ? 'Customer' : 'Supplier'}`}
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Order Date *
                                </label>
                                <input
                                    type="date"
                                    className="input"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Expected Delivery Date
                                </label>
                                <input
                                    type="date"
                                    className="input"
                                    value={formData.deliveryDate}
                                    onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Tax Rate (%)
                                </label>
                                <input
                                    type="number"
                                    className="input"
                                    value={formData.taxRate}
                                    onChange={(e) => setFormData({ ...formData, taxRate: Number(e.target.value) })}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={purchaseOrderRequired}
                                        onChange={(e) => setPurchaseOrderRequired(e.target.checked)}
                                        style={{ width: 'auto', margin: 0 }}
                                    />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Purchase Order Required?</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Order Items</h2>
                        <button type="button" onClick={addItem} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                            <Plus size={16} style={{ marginRight: '0.5rem' }} />
                            Add Item
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ width: '100%', tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '17%' }}>Item / Description</th>
                                    <th style={{ width: '10%' }}>From Catalog</th>
                                    <th style={{ width: '6%' }}>W (in)</th>
                                    <th style={{ width: '6%' }}>H (in)</th>
                                    <th style={{ width: '8%' }}>Qty</th>
                                    <th style={{ width: '8%' }}>Qty Unit</th>
                                    <th style={{ width: '9%' }}>Billing</th>
                                    <th style={{ width: '8%' }}>Rate</th>
                                    <th style={{ width: '8%' }}>Rate Unit</th>
                                    <th style={{ width: '10%' }}>Amount</th>
                                    <th style={{ width: '4%' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderItems.map((item, index) => (
                                    <tr key={item.id}>
                                        <td>
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="e.g., Glass Door, Window"
                                                value={item.description || item.itemName}
                                                onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                style={{ fontSize: '0.875rem', width: '100%' }}
                                            />
                                        </td>
                                        <td>
                                            <div className="quick-add-field">
                                                <select
                                                    className="input"
                                                    value={item.itemId}
                                                    onChange={(e) => {
                                                        if (e.target.value === '__add_item__') {
                                                            setPendingItemRowIndex(index);
                                                            setShowNewItemModal(true);
                                                        } else {
                                                            updateItem(index, 'itemId', e.target.value);
                                                        }
                                                    }}
                                                    style={{ fontSize: '0.875rem', width: '100%' }}
                                                >
                                                    <option value="">Custom Item</option>
                                                    <option value="__add_item__">+ Add New Item</option>
                                                    {items.map(i => (
                                                        <option key={i.id} value={i.id}>{i.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    className="quick-add-button quick-add-button-compact"
                                                    onClick={() => {
                                                        setPendingItemRowIndex(index);
                                                        setShowNewItemModal(true);
                                                    }}
                                                    title="Add New Item"
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <FractionInput
                                                className="input"
                                                value={Number(item.width) || 0}
                                                onChange={val => updateItem(index, 'width', val)}
                                                style={{ fontSize: '0.875rem', width: '100%' }}
                                            />
                                        </td>
                                        <td>
                                            <FractionInput
                                                className="input"
                                                value={Number(item.height) || 0}
                                                onChange={val => updateItem(index, 'height', val)}
                                                style={{ fontSize: '0.875rem', width: '100%' }}
                                            />
                                        </td>
                                        <td>
                                            <NumericInput
                                                className="input"
                                                value={item.quantity}
                                                onChange={val => updateItem(index, 'quantity', val)}
                                                min={1}
                                                style={{ fontSize: '0.875rem', width: '100%' }}
                                            />
                                        </td>
                                        <td>
                                            <select
                                                className="input"
                                                value={item.unit || 'sqft'}
                                                onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                                style={{ fontSize: '0.875rem', width: '100%' }}
                                            >
                                                {UNIT_OPTIONS_BY_GROUP.map(group => (
                                                    <optgroup key={group.label} label={group.label}>
                                                        {group.units.map(unit => (
                                                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                            {getBillingLabel(item)}
                                        </td>
                                        <td>
                                            <NumericInput
                                                className="input money-input"
                                                value={item.rate}
                                                onChange={val => updateItem(index, 'rate', val)}
                                                min={0}
                                                step={0.01}
                                                precision={2}
                                                style={{ fontSize: '0.875rem', width: '100%' }}
                                            />
                                        </td>
                                        <td>
                                            <select
                                                className="input"
                                                value={item.rateUnit || item.unit || 'sqft'}
                                                onChange={(e) => updateItem(index, 'rateUnit', e.target.value)}
                                                title="The unit this rate is priced per -- can differ from the billing unit (e.g. rate per sqft while billing in sheets)"
                                                style={{ fontSize: '0.875rem', width: '100%' }}
                                            >
                                                {UNIT_OPTIONS_BY_GROUP.map(group => (
                                                    <optgroup key={group.label} label={group.label}>
                                                        {group.units.map(unit => (
                                                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            ₹{(Number(item.amount) || 0).toFixed(2)}
                                        </td>
                                        <td>
                                            {orderItems.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Totals */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{ maxWidth: '400px', marginLeft: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <span>Subtotal:</span>
                                <span style={{ fontWeight: 600 }}>₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <span>Tax ({formData.taxRate}%):</span>
                                <span style={{ fontWeight: 600 }}>₹{taxAmount.toFixed(2)}</span>
                            </div>
                            <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem' }}>
                                <span style={{ fontWeight: 700 }}>Total:</span>
                                <span style={{ fontWeight: 700 }}>₹{total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notes */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                            Notes
                        </label>
                        <textarea
                            className="input"
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Additional notes or instructions..."
                        />
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <Link href={`/orders/${orderId}`} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        Cancel
                    </Link>
                    <button type="submit" disabled={saving} className="btn btn-primary">
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
            <PartyModal
                isOpen={showNewPartyModal}
                onClose={() => setShowNewPartyModal(false)}
                onSave={handleSaveNewParty}
                initialData={{ type: order.type === 'purchase_order' ? 'supplier' : 'customer' } as Party}
            />
            <ItemModal
                isOpen={showNewItemModal}
                onClose={() => {
                    setPendingItemRowIndex(null);
                    setShowNewItemModal(false);
                }}
                onSave={handleSaveNewItem}
            />
        </div>
    );
}
