import { CustomDesign, InvoiceItem, Order, PricingConfig } from '@/types';
import { roundCurrency } from '@/lib/utils';
import { calculateLineMeasurement } from '@/lib/units';
import { resolveThicknessRate } from '@/lib/catalogMatch';

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

const getPieceThicknessRate = (piece: DesignPiece, pricingConfig: PricingConfig): number => {
    const thickness = Number(piece.thickness) || 6;
    // Prefers a rate row matching this piece's own type/colour (e.g. a
    // Toughened Brown sketch picks the Brown-specific rate over a generic
    // thickness-only one) -- resolveThicknessRate falls back to a generic
    // thickness row when no type-specific one exists, so this is a no-op
    // for every existing (non-toughened) piece/rate row.
    const rate = resolveThicknessRate(pricingConfig.thicknessPricing, thickness, piece.type);
    return roundCurrency(Number(rate ?? pricingConfig.baseRatePerSqft ?? 0) || 0);
};

const isDesignOrderItem = (item: InvoiceItem): boolean => (
    item.sourceType === 'design' || !!item.designId || !!item.designPieceId
);

export const normalizeDesignItemBillingFields = (item: InvoiceItem): InvoiceItem => {
    if (!isDesignOrderItem(item)) return item;

    const sqft = roundCurrency(Number(item.sqft) || 0);
    const quantity = roundCurrency(Number(item.quantity) || 0);
    const billableArea = item.unit === 'sqft' && sqft > 0 ? sqft : quantity;

    return {
        ...item,
        quantity: billableArea,
        unit: item.unit || 'sqft',
        sqft: item.unit === 'sqft' ? billableArea : sqft,
        rateUnit: item.rateUnit || item.unit || 'sqft',
        sourceType: 'design'
    };
};

const getBillingQuantity = (item: InvoiceItem): number => {
    const normalized = normalizeDesignItemBillingFields(item);
    return calculateLineMeasurement({
        width: normalized.width,
        height: normalized.height,
        quantity: normalized.quantity,
        unit: normalized.unit,
    }).billingQuantity || Number(normalized.sqft) || Number(normalized.quantity) || 0;
};

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
    // thicknessRate/holeCharge/cutCharge/hardware.rate are all GST-inclusive
    // (confirmed by the business owner 2026-07-21) -- each lineTotal below is
    // computed directly from qty*rate, and amount (pre-tax) is backed out via
    // taxMultiplier, matching calculateLineAmounts() in units.ts.

    const rows: InvoiceItem[] = pieces.map((piece, index) => {
        const pieceCount = Math.max(1, Number(piece.quantity) || 1);
        // netArea/holes/cuts on a design piece are already totals across the
        // piece's own quantity -- both producers multiply by it before
        // storing (whatsappVision's calculateDimensionAreaSqft(w, h, qty),
        // and GlassDesigner's `(grossSqIn / 144) * qty` with
        // `holes: holeCount * qty`). Multiplying by pieceCount again here
        // would square the quantity and overbill any piece with qty > 1.
        const billableArea = roundCurrency(Number(piece.netArea ?? piece.area ?? 0) || 0);
        const areaPerPiece = roundCurrency(billableArea / pieceCount);
        const thicknessRate = getPieceThicknessRate(piece, pricingConfig);
        const lineTotal = roundCurrency(billableArea * thicknessRate);
        const amount = roundCurrency(lineTotal / taxMultiplier);
        inclusiveTotals.push(lineTotal);
        const pieceType = piece.type || 'Custom Glass';
        const thicknessText = piece.thickness ? `${piece.thickness}mm` : 'custom thickness';
        const featureText = [
            `${pieceCount} ${pieceCount === 1 ? 'piece' : 'pieces'}`,
            pieceCount > 1 ? `${areaPerPiece.toFixed(2)} sqft each` : `${areaPerPiece.toFixed(2)} sqft`,
            pieceCount > 1 ? `${billableArea.toFixed(2)} sqft total` : '',
            `${Number(piece.holes) || 0} holes`,
            `${Number(piece.cuts) || 0} cuts`,
            `glass @ ₹${thicknessRate.toFixed(2)}/sqft`
        ].filter(Boolean).join(', ');

        return {
            id: crypto.randomUUID(),
            itemId: '',
            itemName: piece.name || `${design.name} - Piece ${index + 1}`,
            description: `${pieceType}, ${thicknessText}, ${featureText}`,
            type: pieceType,
            width: Number(piece.width) || 0,
            height: Number(piece.height) || 0,
            quantity: billableArea,
            unit: 'sqft' as const,
            sqft: billableArea,
            rate: thicknessRate,
            rateUnit: 'sqft' as const,
            amount,
            lineTotal,
            sourceType: 'design' as const,
            designId: design.id,
            designPieceId: piece.id || `${design.id}-piece-${index + 1}`
        };
    });

    pieces.forEach((piece, index) => {
        // As above: piece.holes/piece.cuts already count every hole across
        // the piece's quantity, so these charges must not scale by
        // pieceCount again.
        const pieceName = piece.name || `${design.name} - Piece ${index + 1}`;
        const holes = Number(piece.holes) || 0;
        const cuts = Number(piece.cuts) || 0;
        const holeCharge = Number(pricingConfig.holeCharge) || 0;
        const cutCharge = Number(pricingConfig.cutCharge) || 0;
        const pieceId = piece.id || `${design.id}-piece-${index + 1}`;

        if (holes > 0 && holeCharge > 0) {
            const quantity = holes;
            const lineTotal = roundCurrency(quantity * holeCharge);
            const amount = roundCurrency(lineTotal / taxMultiplier);
            inclusiveTotals.push(lineTotal);
            rows.push({
                id: crypto.randomUUID(),
                itemId: '',
                itemName: `${pieceName} - Hole Charges`,
                description: `${quantity} design holes @ ₹${holeCharge.toFixed(2)} each`,
                type: 'Design Charge',
                width: 0,
                height: 0,
                quantity,
                unit: 'nos',
                sqft: 0,
                rate: roundCurrency(holeCharge),
                rateUnit: 'nos',
                amount,
                lineTotal,
                sourceType: 'design',
                designId: design.id,
                designPieceId: `${pieceId}-holes`
            });
        }

        if (cuts > 0 && cutCharge > 0) {
            const quantity = cuts;
            const lineTotal = roundCurrency(quantity * cutCharge);
            const amount = roundCurrency(lineTotal / taxMultiplier);
            inclusiveTotals.push(lineTotal);
            rows.push({
                id: crypto.randomUUID(),
                itemId: '',
                itemName: `${pieceName} - Cut Charges`,
                description: `${quantity} design cuts @ ₹${cutCharge.toFixed(2)} each`,
                type: 'Design Charge',
                width: 0,
                height: 0,
                quantity,
                unit: 'nos',
                sqft: 0,
                rate: roundCurrency(cutCharge),
                rateUnit: 'nos',
                amount,
                lineTotal,
                sourceType: 'design',
                designId: design.id,
                designPieceId: `${pieceId}-cuts`
            });
        }
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
        const amount = roundCurrency(lineTotal / taxMultiplier);
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
            rateUnit: 'nos',
            amount,
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
