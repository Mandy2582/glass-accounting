import { CustomDesign, InvoiceItem, Order, PricingConfig } from '@/types';
import { roundCurrency } from '@/lib/utils';
import { calculateLineMeasurement } from '@/lib/units';

type DesignPiece = {
    id?: string;
    name?: string;
    type?: string;
    thickness?: number;
    width?: number;
    height?: number;
    quantity?: number;
    netArea?: number;
    area?: number;
    grossArea?: number;
    holes?: number;
    cuts?: number;
    shapes?: Array<{
        type?: string;
        accessoryName?: string;
        accessoryType?: string;
        hardwareItemId?: string;
        accessoryRate?: number;
        accessoryHoleCount?: number;
        accessoryCutCount?: number;
        accessoryRequirementLabel?: string;
    }>;
};

type HardwareRowInput = {
    key: string;
    itemId: string;
    name: string;
    type: string;
    rate: number;
    quantity: number;
    holes: number;
    cuts: number;
    requirementLabel: string;
};

const getPieceInclusiveTotal = (piece: DesignPiece, pricingConfig: PricingConfig): number => {
    const holeAmount = (Number(piece.holes) || 0) * (pricingConfig.holeCharge || 0);
    const cutAmount = (Number(piece.cuts) || 0) * (pricingConfig.cutCharge || 0);
    return roundCurrency(holeAmount + cutAmount);
};

const getBillingQuantity = (item: InvoiceItem): number => calculateLineMeasurement({
    width: item.width,
    height: item.height,
    quantity: item.quantity,
    unit: item.unit,
}).billingQuantity || Number(item.sqft) || Number(item.quantity) || 0;

const getFallbackPieces = (design: CustomDesign): DesignPiece[] => {
    const pieces = design.drawingData?.items;
    if (pieces && pieces.length > 0) return pieces;

    return [{
        id: design.id,
        name: design.name,
        type: design.baseShape || 'Custom Glass',
        thickness: 6,
        quantity: 1,
        netArea: design.totalArea,
        grossArea: design.grossArea,
        holes: design.holes,
        cuts: design.cuts
    }];
};

export const createOrderItemsFromDesign = (
    design: CustomDesign,
    pricingConfig: PricingConfig,
    taxRate: number
): InvoiceItem[] => {
    const pieces = getFallbackPieces(design);
    const taxMultiplier = 1 + ((Number(taxRate) || 0) / 100);
    const inclusiveTotals: number[] = [];

    const rows: InvoiceItem[] = pieces.map((piece, index) => {
        const inclusiveTotal = getPieceInclusiveTotal(piece, pricingConfig);
        inclusiveTotals.push(inclusiveTotal);
        const area = roundCurrency(Number(piece.netArea ?? piece.area ?? 0) || 0);
        const quantity = Math.max(1, Number(piece.quantity) || 1);
        const rate = area > 0 ? roundCurrency(inclusiveTotal / area) : inclusiveTotal;
        const amount = inclusiveTotal / taxMultiplier;
        const pieceType = piece.type || 'Custom Glass';
        const thicknessText = piece.thickness ? `${piece.thickness}mm` : 'custom thickness';
        const featureText = [
            `${quantity} ${quantity === 1 ? 'piece' : 'pieces'}`,
            `${area.toFixed(2)} sqft`,
            `${Number(piece.holes) || 0} holes`,
            `${Number(piece.cuts) || 0} cuts`
        ].join(', ');

        return {
            id: crypto.randomUUID(),
            itemId: '',
            itemName: piece.name || `${design.name} - Piece ${index + 1}`,
            description: `${pieceType}, ${thicknessText}, ${featureText}`,
            type: pieceType,
            width: Number(piece.width) || 0,
            height: Number(piece.height) || 0,
            quantity,
            unit: 'sqft' as const,
            sqft: area,
            rate,
            amount,
            lineTotal: inclusiveTotal,
            sourceType: 'design' as const,
            designId: design.id,
            designPieceId: piece.id || `${design.id}-piece-${index + 1}`
        };
    });

    const hardwareMap = new Map<string, HardwareRowInput>();
    pieces.forEach(piece => {
        const quantity = Math.max(1, Number(piece.quantity) || 1);
        (piece.shapes || []).forEach(shape => {
            if (shape.type !== 'accessory') return;

            const name = shape.accessoryName || shape.accessoryType || 'Hardware';
            const key = shape.hardwareItemId || `generic-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const current = hardwareMap.get(key);
            const rate = roundCurrency(Number(shape.accessoryRate) || 0);
            const holes = Number(shape.accessoryHoleCount) || 0;
            const cuts = Number(shape.accessoryCutCount) || 0;
            const requirementLabel = shape.accessoryRequirementLabel || [
                holes > 0 ? `${holes} ${holes === 1 ? 'hole' : 'holes'}` : '',
                cuts > 0 ? `${cuts} ${cuts === 1 ? 'cut' : 'cuts'}` : ''
            ].filter(Boolean).join(' + ') || 'no holes/cuts';

            if (current) {
                current.quantity += quantity;
                current.holes += holes * quantity;
                current.cuts += cuts * quantity;
            } else {
                hardwareMap.set(key, {
                    key,
                    itemId: shape.hardwareItemId || '',
                    name,
                    type: 'Hardware',
                    rate,
                    quantity,
                    holes: holes * quantity,
                    cuts: cuts * quantity,
                    requirementLabel
                });
            }
        });
    });

    hardwareMap.forEach(hardware => {
        const lineTotal = roundCurrency(hardware.rate * hardware.quantity);
        inclusiveTotals.push(lineTotal);
        rows.push({
            id: crypto.randomUUID(),
            itemId: hardware.itemId,
            itemName: hardware.name,
            description: `Hardware from design drawing (${hardware.quantity} ${hardware.quantity === 1 ? 'piece' : 'pieces'}; ${hardware.requirementLabel} per fitting; total ${hardware.holes} holes, ${hardware.cuts} cuts)`,
            type: 'Hardware',
            width: 0,
            height: 0,
            quantity: hardware.quantity,
            unit: 'nos',
            sqft: 0,
            rate: hardware.rate,
            amount: lineTotal / taxMultiplier,
            lineTotal,
            sourceType: 'design',
            designId: design.id,
            designPieceId: `${design.id}-hardware-${hardware.key}`
        });
    });

    const subtotalTarget = roundCurrency(inclusiveTotals.reduce((sum, total) => sum + total, 0) / taxMultiplier);
    let runningSubtotal = 0;
    rows.forEach((row, index) => {
        const isLast = index === rows.length - 1;
        const amount = isLast ? subtotalTarget - runningSubtotal : row.amount;
        row.amount = roundCurrency(amount);
        runningSubtotal = roundCurrency(runningSubtotal + row.amount);
    });

    return rows;
};

export const recalculateOrderTotals = (order: Order, items: InvoiceItem[]): Order => {
    const subtotal = roundCurrency(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    const calculatedTotal = roundCurrency(items.reduce((sum, item) => {
        if (item.lineTotal !== undefined) return sum + (Number(item.lineTotal) || 0);
        return sum + (getBillingQuantity(item) * (Number(item.rate) || 0));
    }, 0));
    const taxAmount = roundCurrency(calculatedTotal - subtotal);

    return {
        ...order,
        items,
        subtotal,
        taxAmount,
        total: calculatedTotal,
        requiresDesign: order.requiresDesign || items.some(item => item.sourceType === 'design')
    };
};

export const upsertDesignItemsInOrder = (
    order: Order,
    design: CustomDesign,
    pricingConfig: PricingConfig
): Order => {
    const designRows = createOrderItemsFromDesign(design, pricingConfig, order.taxRate);
    const existingItems = order.items || [];
    const firstExistingIndex = existingItems.findIndex(item => item.designId === design.id);
    const cleanedItems = existingItems.filter(item => item.designId !== design.id);
    const insertAt = firstExistingIndex >= 0 ? firstExistingIndex : cleanedItems.length;
    const mergedItems = [
        ...cleanedItems.slice(0, insertAt),
        ...designRows,
        ...cleanedItems.slice(insertAt)
    ];

    return recalculateOrderTotals(order, mergedItems);
};
