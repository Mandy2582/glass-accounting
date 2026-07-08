'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem, Party, Order, InvoiceItem, OrderType } from '@/types';
import FractionInput from '@/components/FractionInput';
import PartyModal from '@/components/parties/PartyModal';
import ItemModal from '@/components/inventory/ItemModal';
import { generateUUID, roundCurrency } from '@/lib/utils';
import { calculateLineAmounts, convertRateForItemUnit, UNIT_OPTIONS_BY_GROUP } from '@/lib/units';

interface OrderFormProps {
    onSave: () => void;
    onCancel: () => void;
}

export default function OrderForm({ onSave, onCancel }: OrderFormProps) {
    const [orderType, setOrderType] = useState<OrderType>('sale_order');
    const [parties, setParties] = useState<Party[]>([]);
    const [items, setItems] = useState<GlassItem[]>([]);
    const [selectedPartyId, setSelectedPartyId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [deliveryDate, setDeliveryDate] = useState('');

    const [orderItems, setOrderItems] = useState<InvoiceItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showNewPartyModal, setShowNewPartyModal] = useState(false);
    const [showNewItemModal, setShowNewItemModal] = useState(false);
    const [pendingItemRowIndex, setPendingItemRowIndex] = useState<number | null>(null);

    useEffect(() => {
        loadData();
    }, [orderType]);

    const loadData = async () => {
        const [partiesData, itemsData] = await Promise.all([
            db.parties.getAll(),
            db.items.getAll()
        ]);

        // Filter parties based on order type
        const partyType = orderType === 'sale_order' ? 'customer' : 'supplier';
        setParties(partiesData.filter(p => p.type === partyType));
        setItems(itemsData);
    };

    const handleSaveNewParty = async (partyData: Omit<Party, 'id'>) => {
        const partyType = orderType === 'sale_order' ? 'customer' : 'supplier';
        const newParty: Party = {
            ...partyData,
            id: generateUUID(),
            type: partyType,
        };

        await db.parties.add(newParty);
        const partiesData = await db.parties.getAll();
        setParties(partiesData.filter(p => p.type === partyType));
        setSelectedPartyId(newParty.id);
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
                const unit = newItem.rateUnit || newItem.unit || (newItem.category === 'hardware' ? 'nos' : 'sqft');
                const rate = Number(newItem.rate) || 0;
                const calculated = calculateLineAmounts({
                    width,
                    height,
                    quantity: qty,
                    unit,
                    rate,
                    taxRate: 18,
                    conversionFactor: newItem.conversionFactor,
                });

                return {
                    ...row,
                    itemId: newItem.id,
                    itemName: newItem.name,
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
            itemId: '',
            itemName: '',
            width: 0,
            height: 0,
            quantity: 1,
            unit: 'sqft',
            sqft: 0,
            rate: 0,
            amount: 0
        }]);
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const newItems = [...orderItems];
        const previousUnit = newItems[index].unit || 'nos';
        const item = { ...newItems[index], [field]: value };

        if (field === 'itemId') {
            const selectedItem = items.find(i => i.id === value);
            if (selectedItem) {
                item.itemName = selectedItem.name;
                item.make = selectedItem.make;
                item.model = selectedItem.model;
                item.type = selectedItem.type;
                item.warehouse = 'Warehouse A'; // Default
                item.width = selectedItem.width || 0;
                item.height = selectedItem.height || 0;
                item.rate = selectedItem.rate;
                item.unit = selectedItem.rateUnit || selectedItem.unit;
            }
        }

        if (field === 'unit') {
            const catalogItem = items.find(i => i.id === item.itemId);
            item.rate = convertRateForItemUnit({
                rate: Number(item.rate) || 0,
                fromUnit: previousUnit,
                toUnit: String(value),
                width: item.width || catalogItem?.width,
                height: item.height || catalogItem?.height,
                conversionFactor: catalogItem?.conversionFactor,
            });
        }

        // Calculate Sqft and Amount
        if (['width', 'height', 'quantity', 'rate', 'itemId', 'unit'].includes(field)) {
            const width = field === 'width' ? Number(value) : item.width;
            const height = field === 'height' ? Number(value) : item.height;
            const qty = field === 'quantity' ? Number(value) : item.quantity;
            const rate = field === 'rate' ? Number(value) : item.rate;
            const unit = field === 'unit' ? value : item.unit;

            const catalogItem = items.find(i => i.id === item.itemId);
            const calculated = calculateLineAmounts({
                width,
                height,
                quantity: qty,
                unit,
                rate,
                taxRate: 18,
                conversionFactor: catalogItem?.conversionFactor,
            });
            item.sqft = calculated.sqft;
            item.amount = calculated.amount;
            item.lineTotal = calculated.lineTotal;
        }

        newItems[index] = item;
        setOrderItems(newItems);
    };

    const removeItem = (index: number) => {
        setOrderItems(orderItems.filter((_, i) => i !== index));
    };

    const calculateTotal = () => {
        return roundCurrency(orderItems.reduce((sum, item) => sum + (item.amount || 0), 0));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPartyId || orderItems.length === 0) return;

        // Validate Warehouse
        if (orderItems.some(i => !i.warehouse)) {
            alert('Please select a warehouse for all items.');
            return;
        }

        setLoading(true);
        try {
            const party = parties.find(p => p.id === selectedPartyId);
            const subtotal = calculateTotal();
            const taxRate = 18;
            const taxAmount = roundCurrency(subtotal * (taxRate / 100));
            const total = roundCurrency(subtotal + taxAmount);

            const orderNumber = await db.orders.generateNextOrderNumber(orderType);

            const order: Order = {
                id: crypto.randomUUID(),
                type: orderType,
                number: orderNumber,
                date: orderDate,
                deliveryDate,
                partyId: selectedPartyId,
                partyName: party?.name || 'Unknown',
                items: orderItems,
                subtotal,
                taxRate,
                taxAmount,
                total,
                status: 'pending'
            };

            await db.orders.add(order);
            onSave();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                New {orderType === 'sale_order' ? 'Sales Order' : 'Purchase Order'}
            </h2>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button
                            type="button"
                            className={`btn ${orderType === 'sale_order' ? 'btn-primary' : ''}`}
                            onClick={() => setOrderType('sale_order')}
                            style={{ flex: 1, background: orderType !== 'sale_order' ? 'var(--color-bg)' : undefined, border: orderType !== 'sale_order' ? '1px solid var(--color-border)' : undefined }}
                        >
                            Sales Order
                        </button>
                        <button
                            type="button"
                            className={`btn ${orderType === 'purchase_order' ? 'btn-primary' : ''}`}
                            onClick={() => setOrderType('purchase_order')}
                            style={{ flex: 1, background: orderType !== 'purchase_order' ? 'var(--color-bg)' : undefined, border: orderType !== 'purchase_order' ? '1px solid var(--color-border)' : undefined }}
                        >
                            Purchase Order
                        </button>
                    </div>
                </div>

                <div className="form-grid form-grid-3" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                            {orderType === 'sale_order' ? 'Customer' : 'Supplier'}
                        </label>
                        <div className="quick-add-field">
                            <select
                                className="input"
                                required
                                value={selectedPartyId}
                                onChange={e => {
                                    if (e.target.value === '__add_party__') {
                                        setShowNewPartyModal(true);
                                    } else {
                                        setSelectedPartyId(e.target.value);
                                    }
                                }}
                            >
                                <option value="">Select Party</option>
                                <option value="__add_party__">+ Add New {orderType === 'sale_order' ? 'Customer' : 'Supplier'}</option>
                                {parties.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="quick-add-button"
                                onClick={() => setShowNewPartyModal(true)}
                                title={`Add New ${orderType === 'sale_order' ? 'Customer' : 'Supplier'}`}
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Order Date</label>
                        <input
                            type="date"
                            required
                            className="input"
                            value={orderDate}
                            onChange={e => setOrderDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Delivery Date</label>
                        <input
                            type="date"
                            className="input"
                            value={deliveryDate}
                            onChange={e => setDeliveryDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="table-responsive" style={{ marginBottom: '1.5rem' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '25%' }}>Item</th>
                                <th style={{ width: '10%' }}>Make</th>
                                <th style={{ width: '10%' }}>Type/Model</th>
                                <th style={{ width: '10%' }}>Warehouse</th>
                                <th style={{ width: '8%' }}>W (in)</th>
                                <th style={{ width: '8%' }}>H (in)</th>
                                <th style={{ width: '8%' }}>Qty</th>
                                <th style={{ width: '8%' }}>Unit</th>
                                <th style={{ width: '8%' }}>Sq.ft</th>
                                <th style={{ width: '10%' }}>Rate</th>
                                <th style={{ width: '10%' }}>Amount</th>
                                <th style={{ width: '5%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderItems.map((item, index) => (
                                <tr key={index}>
                                    <td>
                                        <div className="quick-add-field">
                                            <select
                                                className="input"
                                                value={item.itemId}
                                                onChange={e => {
                                                    if (e.target.value === '__add_item__') {
                                                        setPendingItemRowIndex(index);
                                                        setShowNewItemModal(true);
                                                    } else {
                                                        updateItem(index, 'itemId', e.target.value);
                                                    }
                                                }}
                                                style={{ padding: '0.25rem' }}
                                            >
                                                <option value="">Select Item</option>
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
                                    <td>{item.make || '-'}</td>
                                    <td>{item.model || item.type || '-'}</td>
                                    <td>
                                        <select
                                            className="input"
                                            value={item.warehouse || ''}
                                            onChange={e => updateItem(index, 'warehouse', e.target.value)}
                                            style={{ padding: '0.25rem' }}
                                        >
                                            <option value="">Select</option>
                                            <option value="Warehouse A">Warehouse A</option>
                                            <option value="Warehouse B">Warehouse B</option>
                                        </select>
                                    </td>
                                    <td>
                                        <FractionInput
                                            className="input"
                                            value={item.width || 0}
                                            onChange={val => updateItem(index, 'width', val)}
                                            style={{ padding: '0.25rem' }}
                                        />
                                    </td>
                                    <td>
                                        <FractionInput
                                            className="input"
                                            value={item.height || 0}
                                            onChange={val => updateItem(index, 'height', val)}
                                            style={{ padding: '0.25rem' }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input"
                                            value={item.quantity}
                                            onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                                            style={{ padding: '0.25rem' }}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="input"
                                            value={item.unit || 'sqft'}
                                            onChange={e => updateItem(index, 'unit', e.target.value)}
                                            style={{ padding: '0.25rem', width: '100%', fontSize: '0.875rem' }}
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
                                    <td>{item.sqft}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="input money-input"
                                            min="0"
                                            step="0.01"
                                            value={item.rate}
                                            onChange={e => updateItem(index, 'rate', Number(e.target.value))}
                                            style={{ padding: '0.25rem' }}
                                        />
                                    </td>
                                    <td>{item.amount}</td>
                                    <td>
                                        <button type="button" onClick={() => removeItem(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button type="button" onClick={addItem} className="btn" style={{ marginTop: '1rem', background: '#f3f4f6', color: '#374151', border: '1px dashed #d1d5db' }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add Item
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Subtotal: ₹{calculateTotal().toFixed(2)}</p>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>GST (18%): ₹{(calculateTotal() * 0.18).toFixed(2)}</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>Total: ₹{(calculateTotal() * 1.18).toFixed(2)}</p>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                    <button type="button" onClick={onCancel} className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Save Order' : 'Save Order'}
                    </button>
                </div>
            </form>
            <PartyModal
                isOpen={showNewPartyModal}
                onClose={() => setShowNewPartyModal(false)}
                onSave={handleSaveNewParty}
                initialData={{ type: orderType === 'sale_order' ? 'customer' : 'supplier' } as Party}
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
