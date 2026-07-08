'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, PenTool } from 'lucide-react';
import { db, designsDb } from '@/lib/storage';
import { Order, Party, GlassItem, InvoiceItem, CustomDesign, DesignData, PricingConfig, BankAccount, Voucher } from '@/types';
import Link from 'next/link';
import FractionInput from '@/components/FractionInput';
import NumericInput from '@/components/NumericInput';
import PartyModal from '@/components/parties/PartyModal';
import ItemModal from '@/components/inventory/ItemModal';
import ItemSearchSelect from '@/components/ItemSearchSelect';
import { calculateDesignEstimate } from '@/lib/designCalculations';
import dynamic from 'next/dynamic';
const GlassDesigner = dynamic(() => import('@/components/GlassDesigner'), { ssr: false });
import { calculateComplexity } from '@/lib/designCalculations';
import { generateUUID, roundCurrency } from '@/lib/utils';
import { createOrderItemsFromDesign } from '@/lib/orderDesignItems';
import { calculateLineAmounts, convertRateForItemUnit, getUnitOptionsForItem } from '@/lib/units';

export default function NewOrderPage() {
    const router = useRouter();
    const [customers, setCustomers] = useState<Party[]>([]);
    const [suppliers, setSuppliers] = useState<Party[]>([]);
    const [items, setItems] = useState<GlassItem[]>([]);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        partyId: '',
        date: new Date().toISOString().split('T')[0],
        deliveryDate: '',
        taxRate: 18,
        notes: '',
        advancePaid: 0,
        advanceMode: 'cash' as 'cash' | 'bank',
        advanceBankAccountId: ''
    });
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [recordAdvance, setRecordAdvance] = useState(false);
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
    const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
    const [showNewItemModal, setShowNewItemModal] = useState(false);
    const [pendingItemRowIndex, setPendingItemRowIndex] = useState<number | null>(null);
    const [quickItemCategory, setQuickItemCategory] = useState<'glass' | 'hardware'>('glass');

    // State for inline drawing modal
    const [activeDesignIndex, setActiveDesignIndex] = useState<number | null>(null);
    const [pendingDesigns, setPendingDesigns] = useState<Record<string, Partial<CustomDesign>>>({});
    const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);

    // Modal states for designer
    const [modalDesignName, setModalDesignName] = useState('');
    const [modalGrossArea, setModalGrossArea] = useState(0);
    const [modalNetArea, setModalNetArea] = useState(0);
    const [modalHoleCount, setModalHoleCount] = useState(0);
    const [modalCutCount, setModalCutCount] = useState(0);
    const [modalItems, setModalItems] = useState<any[]>([]);
    const modalDesignDataRef = useRef<any>(null);
    const modalCanvasRef = useRef<any>(null);

    const [orderItems, setOrderItems] = useState<(InvoiceItem & { sourceType?: 'catalog' | 'text' | 'design' })[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        setOrderItems(prev => prev.map(item => {
            const catalogItem = items.find(i => i.id === item.itemId);
            const calculated = calculateLineAmounts({
                width: item.width,
                height: item.height,
                quantity: item.quantity,
                unit: item.unit,
                rate: item.rate,
                taxRate: formData.taxRate,
                conversionFactor: catalogItem?.conversionFactor,
            });
            return {
                ...item,
                sqft: calculated.sqft,
                amount: calculated.amount,
                lineTotal: calculated.lineTotal
            };
        }));
    }, [formData.taxRate, items]);

    const loadData = async () => {
        const [partiesData, itemsData, config, thicknessPricing, bankAccountsData] = await Promise.all([
            db.parties.getAll(),
            db.items.getAll(),
            db.settings.getPricing(),
            db.settings.getThicknessPricing(),
            db.bankAccounts.getAll()
        ]);
        setCustomers(partiesData.filter(p => p.type === 'customer'));
        setSuppliers(partiesData.filter(p => p.type === 'supplier'));
        setItems(itemsData);
        setPricingConfig({ ...config, thicknessPricing });
        setBankAccounts(bankAccountsData);
        if (bankAccountsData.length > 0) {
            setFormData(prev => ({ ...prev, advanceBankAccountId: bankAccountsData[0].id }));
        }
    };

    const handleSaveNewParty = async (partyData: Omit<Party, 'id'>, forcedType: 'customer' | 'supplier') => {
        const newParty: Party = {
            ...partyData,
            id: generateUUID(),
            type: forcedType,
        };

        await db.parties.add(newParty);
        const partiesData = await db.parties.getAll();
        setCustomers(partiesData.filter(p => p.type === 'customer'));
        setSuppliers(partiesData.filter(p => p.type === 'supplier'));

        if (forcedType === 'customer') {
            setFormData(prev => ({ ...prev, partyId: newParty.id }));
            setShowNewCustomerModal(false);
        } else {
            setSelectedSupplierId(newParty.id);
            setShowNewSupplierModal(false);
        }
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
                    taxRate: formData.taxRate,
                    conversionFactor: newItem.conversionFactor,
                });
                const keepDesignSource = row.sourceType === 'design' || !!row.designId || !!row.designPieceId;

                return {
                    ...row,
                    itemId: newItem.id,
                    itemName: newItem.name,
                    description: row.description || [newItem.make, newItem.model].filter(Boolean).join(' '),
                    make: newItem.make,
                    model: newItem.model,
                    type: newItem.category === 'hardware' ? 'Hardware' : (newItem.type || 'Glass'),
                    warehouse: row.warehouse || 'Warehouse A',
                    width,
                    height,
                    quantity: qty,
                    unit,
                    sqft: calculated.sqft,
                    rate,
                    amount: calculated.amount,
                    lineTotal: calculated.lineTotal,
                    sourceType: keepDesignSource ? 'design' : 'catalog',
                };
            }));
        }

        setPendingItemRowIndex(null);
        setShowNewItemModal(false);
    };

    const addItem = (itemKind: 'manual' | 'glass' | 'hardware' = 'manual') => {
        const isHardware = itemKind === 'hardware';
        const isManual = itemKind === 'manual';
        setOrderItems([...orderItems, {
            id: crypto.randomUUID(),
            itemId: '',
            itemName: '',
            description: '',
            width: 0,
            height: 0,
            quantity: 1,
            unit: isHardware || isManual ? 'nos' as const : 'sqft' as const,
            sqft: 0,
            rate: 0,
            amount: 0,
            type: isHardware ? 'Hardware' : (isManual ? 'Manual' : 'Glass'),
            sourceType: 'text'
        }]);
    };

    const addDesignItem = () => {
        const newIndex = orderItems.length;
        const newItem: InvoiceItem & { sourceType?: 'catalog' | 'text' | 'design' } = {
            id: crypto.randomUUID(),
            itemId: '',
            itemName: '',
            description: '',
            width: 0,
            height: 0,
            quantity: 1,
            unit: 'sqft' as InvoiceItem['unit'],
            sqft: 0,
            rate: 0,
            amount: 0,
            sourceType: 'design' as const
        };

        setOrderItems([...orderItems, newItem]);
        setModalDesignName(`Custom Design for Item ${newIndex + 1}`);
        setModalGrossArea(0);
        setModalNetArea(0);
        setModalHoleCount(0);
        setModalCutCount(0);
        setModalItems([]);
        modalDesignDataRef.current = null;
        modalCanvasRef.current = null;
        setActiveDesignIndex(newIndex);
    };

    const removeItem = (index: number) => {
        if (orderItems.length > 0) {
            const item = orderItems[index];
            const newPending = { ...pendingDesigns };
            const designKey = item.designId || item.id || '';
            if (designKey && !orderItems.some((row, rowIndex) => rowIndex !== index && row.designId === designKey)) {
                delete newPending[designKey];
            }
            setPendingDesigns(newPending);
            setOrderItems(orderItems.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: string, value: any) => {
        const updated = [...orderItems];
        const previousUnit = updated[index].unit || 'nos';
        const item = { ...updated[index], [field]: value };

        // Handle sourceType change
        if (field === 'sourceType') {
            item.itemId = '';
            item.itemName = '';
            item.description = '';
            item.width = 0;
            item.height = 0;
            item.quantity = 1;
            item.sqft = 0;
            item.rate = 0;
            item.amount = 0;
            item.lineTotal = 0;
            item.type = value === 'text' ? (item.type || 'Glass') : item.type;

            // Clean up any pending designs associated with this row if switching away from design
            if (value !== 'design') {
                const newPending = { ...pendingDesigns };
                delete newPending[item.designId || item.id || ''];
                item.designId = undefined;
                item.designPieceId = undefined;
                setPendingDesigns(newPending);
            }
        }

        // If selecting from catalog
        if (field === 'itemId' && value) {
            const catalogItem = items.find(i => i.id === value);
            if (catalogItem) {
                const keepDesignSource = item.sourceType === 'design' || !!item.designId || !!item.designPieceId;
                item.sourceType = keepDesignSource ? 'design' : 'catalog';
                item.itemName = catalogItem.name;
                item.rate = catalogItem.rate;
                item.unit = catalogItem.rateUnit || catalogItem.unit;
                item.width = catalogItem.width || 0;
                item.height = catalogItem.height || 0;
                item.type = catalogItem.category === 'hardware' ? 'Hardware' : (catalogItem.type || 'Glass');
            }
        }

        if (field === 'type') {
            item.itemId = '';
            item.sourceType = 'text';
            if (value === 'Hardware') {
                item.unit = 'nos';
                item.width = 0;
                item.height = 0;
                item.sqft = 0;
            } else if (value === 'Manual' || value === 'Service' || value === 'Other') {
                item.unit = 'nos';
                item.width = 0;
                item.height = 0;
                item.sqft = 0;
            } else if (item.unit === 'nos') {
                item.unit = 'sqft';
            }
        }

        if (field === 'unit') {
            const catalogItem = items.find(i => i.id === item.itemId);
            item.rate = convertRateForItemUnit({
                rate: Number(item.rate) || 0,
                fromUnit: previousUnit,
                toUnit: value,
                width: item.width || catalogItem?.width,
                height: item.height || catalogItem?.height,
                conversionFactor: catalogItem?.conversionFactor,
            });
        }

        // Recalculate
        if (['width', 'height', 'quantity', 'rate', 'itemId', 'unit', 'type'].includes(field)) {
            const rawWidth = field === 'width' ? value : item.width;
            const rawHeight = field === 'height' ? value : item.height;
            const rawQty = field === 'quantity' ? value : item.quantity;
            const rawRate = field === 'rate' ? value : item.rate;
            const unit = field === 'unit' ? value : (item.unit || 'sqft');

            const width = rawWidth === '' ? 0 : Number(rawWidth);
            const height = rawHeight === '' ? 0 : Number(rawHeight);
            const qty = rawQty === '' ? 0 : Number(rawQty);
            const rate = rawRate === '' ? 0 : Number(rawRate);

            const catalogItem = items.find(i => i.id === item.itemId);
            const calculated = calculateLineAmounts({
                width,
                height,
                quantity: qty,
                unit,
                rate,
                taxRate: formData.taxRate,
                conversionFactor: (catalogItem as any)?.conversionFactor,
            });
            item.sqft = calculated.sqft;
            item.amount = calculated.amount;
            item.lineTotal = calculated.lineTotal;
        }

        updated[index] = item;
        setOrderItems(updated);
    };

    const openDesignModal = (index: number) => {
        const item = orderItems[index];
        const existing = pendingDesigns[item.designId || item.id || ''];

        if (existing) {
            setModalDesignName(existing.name || '');
            setModalGrossArea(existing.grossArea || 0);
            setModalNetArea(existing.totalArea || 0);
            setModalHoleCount(existing.holes || 0);
            setModalCutCount(existing.cuts || 0);
            setModalItems(existing.drawingData?.items || []);
        } else {
            setModalDesignName(`Custom Design for Item ${index + 1}`);
            setModalGrossArea(0);
            setModalNetArea(0);
            setModalHoleCount(0);
            setModalCutCount(0);
            setModalItems([]);
        }

        modalDesignDataRef.current = null;
        modalCanvasRef.current = null;
        setActiveDesignIndex(index);
    };

    const handleSaveModalDesign = () => {
        if (activeDesignIndex === null) return;
        if (!modalDesignName.trim()) {
            alert('Please enter a name for the design');
            return;
        }

        const item = orderItems[activeDesignIndex];
        const complexity = calculateComplexity(1, modalHoleCount, modalCutCount, false);

        if (!pricingConfig || (modalNetArea <= 0 && modalItems.length === 0)) {
            alert('Please add at least one glass piece before saving the design.');
            return;
        }

        const breakdown = calculateDesignEstimate({
            grossArea: modalGrossArea,
            holeCount: modalHoleCount,
            cutCount: modalCutCount,
            complexity,
            items: modalItems,
            pricingConfig
        });
        const totalCost = breakdown?.total || 0;

        let drawingData: DesignData = {
            shapes: [],
            dimensions: { width: 800, height: 600, unit: 'inch' as const },
            holes: [],
            cuts: [],
            notes: '',
            items: []
        };

        if (modalDesignDataRef.current && (modalDesignDataRef.current as any).pieces) {
            drawingData.pieces = (modalDesignDataRef.current as any).pieces;
            drawingData.items = modalItems;
        } else if (modalCanvasRef.current && modalCanvasRef.current.getObjects) {
            // Fallback default structure
            drawingData.pieces = modalCanvasRef.current.getObjects().map((obj: any) => ({
                id: obj.data?.id || crypto.randomUUID(),
                type: obj.data?.type || 'rectangle',
                width: obj.width || 0,
                height: obj.height || 0,
                x: obj.left || 0,
                y: obj.top || 0,
                points: obj.data?.points || []
            }));
            drawingData.items = modalItems;
        }

        // Store in pendingDesigns mapped by order item ID
        const targetDesignId = item.designId || item.id || '';
        const designId = pendingDesigns[targetDesignId]?.id || crypto.randomUUID();
        const pendingDesign: Partial<CustomDesign> = {
            id: designId,
            name: modalDesignName,
            drawingData: drawingData,
            baseShape: 'custom',
            totalArea: modalNetArea,
            grossArea: modalGrossArea,
            holes: modalHoleCount,
            cuts: modalCutCount,
            complexityLevel: complexity,
            baseRate: 0,
            complexityCharge: breakdown?.complexityCharge || 0,
            edgeFinishingCharge: 0,
            estimatedCost: totalCost,
            status: 'approved',
            createdDate: new Date().toISOString().split('T')[0]
        };

        setPendingDesigns(prev => ({
            ...prev,
            [designId]: pendingDesign
        }));

        const designRows = createOrderItemsFromDesign({
            id: designId,
            name: modalDesignName,
            customerId: formData.partyId,
            customerName: customers.find(c => c.id === formData.partyId)?.name || '',
            drawingData,
            baseShape: 'custom',
            totalArea: modalNetArea,
            grossArea: modalGrossArea,
            holes: modalHoleCount,
            cuts: modalCutCount,
            complexityLevel: complexity,
            baseRate: 0,
            complexityCharge: breakdown?.complexityCharge || 0,
            edgeFinishingCharge: 0,
            estimatedCost: totalCost,
            status: 'approved',
            createdDate: new Date().toISOString().split('T')[0]
        }, pricingConfig, formData.taxRate);

        const currentDesignId = item.designId || designId;
        const firstIndex = orderItems.findIndex((row, rowIndex) => row.designId === currentDesignId || rowIndex === activeDesignIndex);
        const withoutOldDesignRows = orderItems.filter((row, rowIndex) => row.designId !== currentDesignId && rowIndex !== activeDesignIndex);
        const insertAt = firstIndex >= 0 ? firstIndex : activeDesignIndex;
        setOrderItems([
            ...withoutOldDesignRows.slice(0, insertAt),
            ...designRows,
            ...withoutOldDesignRows.slice(insertAt)
        ]);
        setActiveDesignIndex(null);
    };

    const calculateTotals = () => {
        const subtotal = roundCurrency(orderItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
        const total = roundCurrency(orderItems.reduce((sum, item) => {
            if (item.lineTotal !== undefined) return sum + (Number(item.lineTotal) || 0);
            const catalogItem = items.find(i => i.id === item.itemId);
            return sum + calculateLineAmounts({
                width: item.width,
                height: item.height,
                quantity: item.quantity,
                unit: item.unit,
                rate: item.rate,
                taxRate: formData.taxRate,
                conversionFactor: catalogItem?.conversionFactor,
            }).lineTotal;
        }, 0));
        const taxAmount = roundCurrency(total - subtotal);
        return { subtotal, taxAmount, total };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.partyId) {
            alert('Please select a customer');
            return;
        }

        if (recordAdvance && (formData.advancePaid <= 0 || isNaN(formData.advancePaid))) {
            alert('Please enter a valid advance amount greater than 0');
            return;
        }

        if (recordAdvance && formData.advanceMode === 'bank' && !formData.advanceBankAccountId) {
            alert('Please select a bank account for the bank transfer');
            return;
        }

        if (orderItems.length === 0) {
            alert('Please add at least one order item.');
            return;
        }

        const finalRequiresDesign = orderItems.some(item => item.sourceType === 'design');

        if (finalRequiresDesign && !selectedSupplierId) {
            alert('Please select a supplier for the custom design order.');
            return;
        }

        if (orderItems.some(item => (!item.itemName && !item.description) || !item.quantity)) {
            alert('Please fill in description and quantity for all items.');
            return;
        }

        setLoading(true);

        try {
            const { subtotal, taxAmount, total } = calculateTotals();
            const customer = customers.find(c => c.id === formData.partyId);
            const supplier = finalRequiresDesign ? suppliers.find(s => s.id === selectedSupplierId) : null;

            // Sanitize item properties before saving (ensure numbers and strings aren't empty)
            const sanitizedItems = orderItems.map(item => ({
                ...item,
                width: Number(item.width) || 0,
                height: Number(item.height) || 0,
                quantity: Number(item.quantity) || 0,
                sqft: Number(item.sqft) || 0,
                rate: Number(item.rate) || 0,
                amount: Number(item.amount) || 0,
                lineTotal: item.lineTotal === undefined ? undefined : Number(item.lineTotal) || 0
            }));

            // Generate numbers
            const generalNumber = await db.orders.generateNextGeneralNumber();
            const soNumber = await db.orders.generateNextOrderNumber('sale_order');
            const saleOrderId = crypto.randomUUID();

            let notesWithSupplier = formData.notes.trim();
            if (finalRequiresDesign && selectedSupplierId) {
                notesWithSupplier += `\n[PREFERRED_SUPPLIER_ID:${selectedSupplierId}]`;
            }

            const advancePaidAmount = recordAdvance ? roundCurrency(Number(formData.advancePaid) || 0) : 0;
            const paymentStatus = advancePaidAmount >= total ? 'paid' : (advancePaidAmount > 0 ? 'partially_paid' : 'unpaid');

            const saleOrder: Order = {
                id: saleOrderId,
                type: 'sale_order',
                number: soNumber,
                generalNumber,
                soNumber,
                poNumber: undefined,
                requiresDesign: finalRequiresDesign,
                date: formData.date,
                deliveryDate: formData.deliveryDate || undefined,
                partyId: formData.partyId,
                partyName: customer?.name || '',
                items: sanitizedItems,
                subtotal,
                taxRate: formData.taxRate,
                taxAmount,
                total,
                status: 'pending',
                notes: notesWithSupplier,
                linkedOrderId: undefined,
                deliveredToUs: 0,
                deliveredToCustomer: 0,
                paidAmount: advancePaidAmount,
                paymentStatus: paymentStatus
            };

            await db.orders.add(saleOrder);

            if (advancePaidAmount > 0) {
                const voucher: Voucher = {
                    id: crypto.randomUUID(),
                    number: `RCP-${Date.now().toString().substr(-6)}`,
                    date: formData.date,
                    type: 'receipt',
                    partyId: formData.partyId,
                    partyName: customer?.name || '',
                    amount: advancePaidAmount,
                    description: `Advance Payment for Order #${soNumber}.`,
                    mode: formData.advanceMode,
                    bankAccountId: formData.advanceMode === 'bank' ? formData.advanceBankAccountId : undefined
                };
                await db.vouchers.add(voucher);
            }

            // Save pending designs to Supabase
            for (const designId of Object.keys(pendingDesigns)) {
                const design = pendingDesigns[designId];
                if (design && design.id) {
                    const fullDesign: CustomDesign = {
                        id: design.id,
                        name: design.name || 'Untitled Custom Design',
                        customerId: formData.partyId,
                        customerName: customer?.name || '',
                        drawingData: design.drawingData || { shapes: [], dimensions: { width: 800, height: 600, unit: 'inch' }, holes: [], cuts: [], notes: '', items: [] },
                        baseShape: design.baseShape || 'custom',
                        totalArea: design.totalArea || 0,
                        grossArea: design.grossArea || 0,
                        holes: design.holes || 0,
                        cuts: design.cuts || 0,
                        complexityLevel: design.complexityLevel || 'simple',
                        baseRate: 0,
                        complexityCharge: design.complexityCharge || 0,
                        edgeFinishingCharge: 0,
                        estimatedCost: design.estimatedCost || 0,
                        status: 'approved',
                        createdDate: design.createdDate || new Date().toISOString().split('T')[0],
                        notes: '',
                        orderId: saleOrderId
                    };
                    await designsDb.add(fullDesign);
                }
            }

            alert('Order created successfully!');
            router.push('/orders');
        } catch (error) {
            console.error('Error creating order:', error);
            alert('Failed to create order. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const { subtotal, taxAmount, total } = calculateTotals();

    const actualRequiresDesign = orderItems.some(item => item.sourceType === 'design');
    const designKeys = Array.from(new Set(orderItems.filter(item => item.sourceType === 'design').map(item => item.designId || item.id || '')));
    const designedItemsCount = designKeys.filter(key => key && pendingDesigns[key]).length;
    const designItemsCount = designKeys.length;
    const modalComplexity = calculateComplexity(1, modalHoleCount, modalCutCount, false);
    const modalEstimate = pricingConfig && (modalNetArea > 0 || modalItems.length > 0)
        ? calculateDesignEstimate({
            grossArea: modalGrossArea,
            holeCount: modalHoleCount,
            cutCount: modalCutCount,
            complexity: modalComplexity,
            items: modalItems,
            pricingConfig
        })
        : null;

    const getCatalogItem = (item: InvoiceItem) => items.find(i => i.id === item.itemId);

    const getOrderItemKind = (item: InvoiceItem & { sourceType?: 'catalog' | 'text' | 'design' }) => {
        const catalogItem = getCatalogItem(item);
        const isHardware = catalogItem?.category === 'hardware'
            || item.designPieceId?.includes('-hardware-')
            || item.type?.toLowerCase().includes('hardware')
            || (item.unit === 'nos' && item.sqft === 0 && !!item.itemId);

        if (isHardware) return { label: 'Hardware', className: 'badge-warning' };
        if (item.sourceType === 'design') return { label: 'Design Glass', className: 'badge-success' };
        if (catalogItem) return { label: 'Glass', className: 'badge-success' };
        return { label: item.type || 'Manual', className: 'badge-info' };
    };

    const getBillingLabel = (item: InvoiceItem) => {
        const catalogItem = getCatalogItem(item);
        return calculateLineAmounts({
            width: item.width,
            height: item.height,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            taxRate: formData.taxRate,
            conversionFactor: catalogItem?.conversionFactor,
        }).billingLabel;
    };

    const getUnitGroups = (item: InvoiceItem & { sourceType?: 'catalog' | 'text' | 'design' }) => {
        const catalogItem = getCatalogItem(item);
        const fallbackCategory = item.type?.toLowerCase().includes('hardware') ? 'hardware' : 'glass';
        return getUnitOptionsForItem(catalogItem || { category: fallbackCategory, type: item.type, unit: item.unit });
    };

    const getValidUnit = (item: InvoiceItem & { sourceType?: 'catalog' | 'text' | 'design' }) => {
        const groups = getUnitGroups(item);
        const allowed = groups.flatMap(group => group.units.map(unit => unit.value));
        return allowed.includes(item.unit) ? item.unit : allowed[0] || item.unit || 'nos';
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <Link href="/orders" style={{ color: 'var(--color-text-muted)' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>New Customer Order</h1>
                </div>
            </div>

            <div className="order-workflow-card">
                <div className="order-workflow-steps">
                    <div className={formData.partyId ? 'complete' : ''}>
                        <strong>1</strong>
                        <span>Customer</span>
                    </div>
                    <div className={orderItems.length > 0 ? 'complete' : ''}>
                        <strong>2</strong>
                        <span>Items</span>
                    </div>
                    <div className={designItemsCount === 0 || designedItemsCount === designItemsCount ? 'complete' : ''}>
                        <strong>3</strong>
                        <span>Drawings</span>
                    </div>
                    <div>
                        <strong>4</strong>
                        <span>Create order</span>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="card" style={{ marginBottom: '1rem', padding: 0 }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Order Details</h2>
                    </div>
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Customer *
                                </label>
                                <div className="quick-add-field">
                                    <select
                                        className="input"
                                        required
                                        value={formData.partyId}
                                        onChange={(e) => {
                                            if (e.target.value === '__add_customer__') {
                                                setShowNewCustomerModal(true);
                                            } else {
                                                setFormData({ ...formData, partyId: e.target.value });
                                            }
                                        }}
                                    >
                                        <option value="">Select Customer</option>
                                        <option value="__add_customer__">+ Add New Customer</option>
                                        {customers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="quick-add-button"
                                        onClick={() => setShowNewCustomerModal(true)}
                                        title="Add New Customer"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </div>
                            {actualRequiresDesign && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                        Supplier *
                                    </label>
                                    <div className="quick-add-field">
                                        <select
                                            className="input"
                                            required
                                            value={selectedSupplierId}
                                            onChange={(e) => {
                                                if (e.target.value === '__add_supplier__') {
                                                    setShowNewSupplierModal(true);
                                                } else {
                                                    setSelectedSupplierId(e.target.value);
                                                }
                                            }}
                                        >
                                            <option value="">Select Supplier</option>
                                            <option value="__add_supplier__">+ Add New Supplier</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="quick-add-button"
                                            onClick={() => setShowNewSupplierModal(true)}
                                            title="Add New Supplier"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>
                            )}
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
                        </div>
                    </div>
                </div>

                {/* Advance Payment Option */}
                <div className="card" style={{ marginBottom: '1rem', padding: 0 }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <input
                            type="checkbox"
                            id="recordAdvanceCheckbox"
                            checked={recordAdvance}
                            onChange={(e) => setRecordAdvance(e.target.checked)}
                            style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                        />
                        <label htmlFor="recordAdvanceCheckbox" style={{ fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                            Record Advance Payment
                        </label>
                    </div>
                    {recordAdvance && (
                        <div style={{ padding: '1.5rem', background: 'rgba(139, 92, 246, 0.03)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                        Advance Amount (₹) *
                                    </label>
                                    <input
                                        type="number"
                                        className="input"
                                        min="0"
                                        step="0.01"
                                        required={recordAdvance}
                                        value={formData.advancePaid || ''}
                                        onChange={(e) => setFormData({ ...formData, advancePaid: Number(e.target.value) })}
                                        placeholder="Enter advance amount"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                        Payment Mode *
                                    </label>
                                    <select
                                        className="input"
                                        required={recordAdvance}
                                        value={formData.advanceMode}
                                        onChange={(e) => setFormData({ ...formData, advanceMode: e.target.value as 'cash' | 'bank' })}
                                    >
                                        <option value="cash">Cash</option>
                                        <option value="bank">Bank Transfer</option>
                                    </select>
                                </div>
                                {formData.advanceMode === 'bank' && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                            Bank Account *
                                        </label>
                                        <select
                                            className="input"
                                            required={recordAdvance && formData.advanceMode === 'bank'}
                                            value={formData.advanceBankAccountId}
                                            onChange={(e) => setFormData({ ...formData, advanceBankAccountId: e.target.value })}
                                        >
                                            <option value="">Select Bank Account</option>
                                            {bankAccounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.name} - {acc.accountNumber}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Items */}
                <div className="card order-items-card" style={{ marginBottom: '1rem' }}>
                    <div className="order-items-header">
                        <div>
                            <h2>Order Items</h2>
                        </div>
                        <div className="order-items-actions">
                            <button type="button" onClick={addDesignItem} className="btn btn-primary">
                                <PenTool size={16} style={{ marginRight: '0.5rem' }} />
                                Add Custom Design
                            </button>
                            <button type="button" onClick={() => addItem('manual')} className="btn btn-primary">
                                <Plus size={16} style={{ marginRight: '0.5rem' }} />
                                Add Manual Item
                            </button>
                            <button type="button" onClick={() => addItem('glass')} className="btn btn-primary">
                                <Plus size={16} style={{ marginRight: '0.5rem' }} />
                                Add Glass Item
                            </button>
                            <button type="button" onClick={() => addItem('hardware')} className="btn btn-primary">
                                <Plus size={16} style={{ marginRight: '0.5rem' }} />
                                Add Hardware
                            </button>
                        </div>
                    </div>

                    <div className="order-item-list">
                        {orderItems.length === 0 && (
                            <div className="order-empty-state">
                                <strong>No items added yet.</strong>
                                <span>Use the buttons above to add catalogue glass, hardware, manual charges, or a custom design.</span>
                            </div>
                        )}
                        {orderItems.map((item, index) => {
                            const designDraft = pendingDesigns[item.designId || item.id || ''];
                            const kind = getOrderItemKind(item);
                            const catalogItem = getCatalogItem(item);
                            const isDesignRow = item.sourceType === 'design';
                            const isGeneratedDesignRow = isDesignRow && !!item.designId;
                            const rowItemKind = (kind.label === 'Hardware' || item.type === 'Hardware') ? 'hardware' : 'glass';
                            const isHardwareRow = rowItemKind === 'hardware';
                            const isDesignHardwareRow = isDesignRow && isHardwareRow;
                            const isManualRow = item.type === 'Manual' || item.type === 'Service' || item.type === 'Other';
                            const canSelectCatalog = (!isDesignRow && !isManualRow) || isDesignHardwareRow;
                            const canEditText = !isDesignRow || isDesignHardwareRow;
                            const canEditCommercials = !isDesignRow || isDesignHardwareRow;
                            const catalogChoices = items.filter(i => rowItemKind === 'hardware' ? i.category === 'hardware' : i.category !== 'hardware');

                            return (
                                <div key={item.id} className={`order-item-card ${isDesignRow ? 'order-item-card-design' : ''}`}>
                                    <div className="order-item-card-top">
                                        <div className="order-item-title-block">
                                            <span className={`badge ${kind.className}`}>{kind.label}</span>
                                            <div>
                                                <h3>{item.itemName || (isDesignRow ? 'Custom glass design' : 'New order item')}</h3>
                                                <p>
                                                    {isDesignHardwareRow
                                                        ? 'Hardware from custom design - quantity and rate can be edited'
                                                        : isGeneratedDesignRow
                                                        ? 'Generated from custom design'
                                                        : catalogItem
                                                            ? `${catalogItem.category === 'hardware' ? 'Inventory hardware' : 'Inventory glass'} item`
                                                            : 'Manual item'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="order-item-row-actions">
                                            {isDesignRow && (
                                                <button
                                                    type="button"
                                                    onClick={() => openDesignModal(index)}
                                                    className="btn"
                                                >
                                                    <PenTool size={14} style={{ marginRight: '0.4rem' }} />
                                                    {designDraft || isGeneratedDesignRow ? 'Edit Drawing' : 'Draw Glass'}
                                                </button>
                                            )}
                                            {orderItems.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    className="order-item-delete"
                                                    aria-label="Remove item"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {isDesignRow && !isGeneratedDesignRow && (
                                        <div className="order-design-callout">
                                            <strong>{designDraft ? 'Drawing ready' : 'Drawing needed'}</strong>
                                            <span>
                                                {designDraft
                                                    ? `${(designDraft.totalArea || 0).toFixed(2)} sqft, estimate ₹${(designDraft.estimatedCost || 0).toFixed(2)}`
                                                    : 'Click Draw Glass to create pieces. The order list will expand into glass and hardware rows automatically.'}
                                            </span>
                                        </div>
                                    )}

                                    <div className="order-item-fields">
                                        {canSelectCatalog && (
                                            <div className="order-field order-field-wide">
                                                <label>{rowItemKind === 'hardware' ? 'Hardware Catalog' : 'Glass Catalog'}</label>
                                                <div className="quick-add-field">
                                                    <ItemSearchSelect
                                                        items={catalogChoices}
                                                        value={item.itemId || ''}
                                                        onChange={itemId => updateItem(index, 'itemId', itemId)}
                                                        onAddNew={() => {
                                                            setPendingItemRowIndex(index);
                                                            setQuickItemCategory(rowItemKind === 'hardware' ? 'hardware' : 'glass');
                                                            setShowNewItemModal(true);
                                                        }}
                                                        addLabel={`Add New ${rowItemKind === 'hardware' ? 'Hardware' : 'Glass Item'}`}
                                                        placeholder={`Search ${rowItemKind === 'hardware' ? 'hardware' : 'glass'} item...`}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="quick-add-button"
                                                        onClick={() => {
                                                            setPendingItemRowIndex(index);
                                                            setQuickItemCategory(rowItemKind === 'hardware' ? 'hardware' : 'glass');
                                                            setShowNewItemModal(true);
                                                        }}
                                                        title={`Add New ${rowItemKind === 'hardware' ? 'Hardware' : 'Glass Item'}`}
                                                    >
                                                        <Plus size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="order-field order-field-wide">
                                            <label>Item Name</label>
                                            <input
                                                type="text"
                                                required
                                                className="input"
                                                placeholder="e.g., 12mm Toughened Glass, Patch Fitting"
                                                value={item.itemName || ''}
                                                onChange={(e) => updateItem(index, 'itemName', e.target.value)}
                                                disabled={!canEditText}
                                            />
                                        </div>

                                        <div className="order-field order-field-wide">
                                            <label>Description</label>
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="Size, make, model or fitting notes"
                                                value={item.description || ''}
                                                onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                disabled={!canEditText}
                                            />
                                        </div>

                                        {!isDesignRow && (
                                            <div className="order-field">
                                                <label>Type</label>
                                                <select
                                                    className="input"
                                                    value={item.type || (kind.label.includes('Hardware') ? 'Hardware' : 'Glass')}
                                                    onChange={(e) => updateItem(index, 'type', e.target.value)}
                                                    disabled={!!catalogItem}
                                                >
                                                    <option value="Glass">Glass</option>
                                                    <option value="Hardware">Hardware</option>
                                                    <option value="Manual">Manual</option>
                                                    <option value="Service">Service</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>
                                        )}

                                        {!isHardwareRow && (
                                            <div className="order-field">
                                                <label>Width</label>
                                                <FractionInput
                                                    className="input"
                                                    value={Number(item.width) || 0}
                                                    onChange={val => updateItem(index, 'width', val)}
                                                    disabled={isDesignRow}
                                                />
                                            </div>
                                        )}

                                        {!isHardwareRow && (
                                            <div className="order-field">
                                                <label>Height</label>
                                                <FractionInput
                                                    className="input"
                                                    value={Number(item.height) || 0}
                                                    onChange={val => updateItem(index, 'height', val)}
                                                    disabled={isDesignRow}
                                                />
                                            </div>
                                        )}

                                        <div className="order-field">
                                            <label>Qty</label>
                                            <NumericInput
                                                className="input"
                                                value={item.quantity}
                                                onChange={val => updateItem(index, 'quantity', val)}
                                                min={1}
                                                disabled={!canEditCommercials}
                                            />
                                        </div>

                                        {!isDesignRow && (
                                            <div className="order-field">
                                                <label>Unit</label>
                                                <select
                                                    className="input"
                                                    value={getValidUnit(item)}
                                                    onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                                >
                                                    {getUnitGroups(item).map(group => (
                                                        <optgroup key={group.label} label={group.label}>
                                                            {group.units.map(unit => (
                                                                <option key={unit.value} value={unit.value}>{unit.label}</option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="order-field">
                                            <label>Billing</label>
                                            <div className="order-readonly-value">{getBillingLabel(item)}</div>
                                        </div>

                                        <div className="order-field">
                                            <label>Rate</label>
                                            <NumericInput
                                                className="input money-input"
                                                value={item.rate}
                                                onChange={val => updateItem(index, 'rate', val)}
                                                min={0}
                                                step={0.01}
                                                precision={2}
                                                disabled={!canEditCommercials}
                                            />
                                        </div>

                                        <div className="order-field">
                                            <label>Line Total</label>
                                            <div className="order-line-total">₹{(Number(item.lineTotal ?? item.amount) || 0).toFixed(2)}</div>
                                            <small>Base: ₹{(Number(item.amount) || 0).toFixed(2)}</small>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Totals */}
                <div className="card" style={{ marginBottom: '1rem', padding: 0 }}>
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
                <div className="card" style={{ marginBottom: '1rem', padding: 0 }}>
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
                    <Link href="/orders" className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        Cancel
                    </Link>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Creating...' : 'Create Order'}
                    </button>
                </div>
            </form>

            {/* Design Modal Overlay */}
            {activeDesignIndex !== null && (
                <div className="design-modal-overlay">
                    <div className="card design-modal-card">
                        <div className="design-modal-header">
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Draw Custom Glass Design</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveDesignIndex(null)}
                                className="btn"
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="design-modal-body">
                            <div className="design-modal-workbench">
                                <div className="design-modal-designer-pane">
                                    <GlassDesigner
                                        onAreaChange={(gross, net) => {
                                            setModalGrossArea(gross);
                                            setModalNetArea(net);
                                        }}
                                        onDesignChange={(data) => {
                                            modalDesignDataRef.current = data;
                                            if (data.holes !== undefined) {
                                                setModalHoleCount(data.holes);
                                            } else if (data.holes && Array.isArray(data.holes)) {
                                                setModalHoleCount(data.holes.length);
                                            }
                                            if (data.cuts !== undefined) {
                                                setModalCutCount(data.cuts);
                                            } else if (data.cuts && Array.isArray(data.cuts)) {
                                                setModalCutCount(data.cuts.length);
                                            }
                                        }}
                                        onCanvasReady={(fabricCanvas) => {
                                            modalCanvasRef.current = fabricCanvas;
                                        }}
                                        onItemsChange={(newItems) => setModalItems(newItems)}
                                        initialData={
                                            orderItems[activeDesignIndex]?.id && pendingDesigns[orderItems[activeDesignIndex].id]?.drawingData
                                                ? pendingDesigns[orderItems[activeDesignIndex].id].drawingData
                                                : undefined
                                        }
                                    />
                                </div>

                                <aside className="design-live-estimate">
                                    <h3>Live Estimate</h3>
                                    <div className="design-live-total">
                                        ₹{modalEstimate?.total.toFixed(2) || '0.00'}
                                    </div>
                                    <div className="design-live-grid">
                                        <div>
                                            <span>Area</span>
                                            <strong>{modalNetArea.toFixed(2)} sqft</strong>
                                        </div>
                                        <div>
                                            <span>Gross</span>
                                            <strong>{modalGrossArea.toFixed(2)} sqft</strong>
                                        </div>
                                        <div>
                                            <span>Holes</span>
                                            <strong>{modalHoleCount}</strong>
                                        </div>
                                        <div>
                                            <span>Cuts</span>
                                            <strong>{modalCutCount}</strong>
                                        </div>
                                    </div>
                                    <div className="design-live-breakdown">
                                        <div>
                                            <span>Glass pieces</span>
                                            <strong>{modalItems.filter(item => item.type !== 'Hardware').length}</strong>
                                        </div>
                                        <div>
                                            <span>Hardware rows</span>
                                            <strong>{modalItems.filter(item => item.type === 'Hardware').length}</strong>
                                        </div>
                                    </div>
                                </aside>
                            </div>
                        </div>

                        <div className="design-modal-footer">
                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }} />
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setActiveDesignIndex(null)}
                                    className="btn"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveModalDesign}
                                    className="btn btn-primary"
                                    disabled={!modalEstimate}
                                >
                                    Save Design to Item
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <PartyModal
                isOpen={showNewCustomerModal}
                onClose={() => setShowNewCustomerModal(false)}
                onSave={(party) => handleSaveNewParty(party, 'customer')}
                initialData={{ type: 'customer' } as Party}
            />
            <PartyModal
                isOpen={showNewSupplierModal}
                onClose={() => setShowNewSupplierModal(false)}
                onSave={(party) => handleSaveNewParty(party, 'supplier')}
                initialData={{ type: 'supplier' } as Party}
            />
            <ItemModal
                isOpen={showNewItemModal}
                onClose={() => {
                    setPendingItemRowIndex(null);
                    setShowNewItemModal(false);
                }}
                onSave={handleSaveNewItem}
                initialData={{
                    id: undefined as unknown as string,
                    name: '',
                    category: quickItemCategory,
                    type: quickItemCategory === 'hardware' ? 'Hardware' : 'Toughened',
                    make: '',
                    model: '',
                    thickness: 0,
                    width: 0,
                    height: 0,
                    unit: quickItemCategory === 'hardware' ? 'nos' : 'sqft',
                    stock: 0,
                    warehouseStock: { 'Warehouse A': 0, 'Warehouse B': 0 },
                    rate: 0,
                    hsnCode: '',
                    conversionFactor: quickItemCategory === 'hardware' ? 1 : 0,
                } as GlassItem}
            />
        </div>
    );
}
