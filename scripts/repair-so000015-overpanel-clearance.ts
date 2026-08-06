import fs from 'node:fs/promises';
import path from 'node:path';
import { db, designsDb } from '../src/lib/storage';
import { calculateDesignOrderTotal, upsertDesignItemsInOrder } from '../src/lib/orderDesignItems';
import { roundCurrency } from '../src/lib/utils';
import type { CustomDesign, DesignItem, GlassPiece, KonvaShape, PricingConfig } from '../src/types';

const ORDER_NUMBER = 'SO-000015';
const TARGET_GAP_UNITS = 5; // 10 canvas units = 1 inch, so this is 4/8 inch.
const BACKUP_DIR = '/Users/mandeepsingh/Desktop/arjun_glass_house_backups';

const isGlassOutline = (shape: KonvaShape): boolean => (
    shape.type === 'glass_rect'
    || shape.type === 'glass_circle'
    || shape.type === 'glass_polygon'
    || shape.type === 'glass_parallelogram'
);

const clone = <T>(value: T): T => structuredClone(value);

function findDoorShifts(pieces: GlassPiece[], doorOutlineIds: Set<string>): Map<string, number> {
    const shifts = new Map<string, number>();
    pieces.forEach(piece => {
        const outlines = piece.shapes.filter(isGlassOutline);
        outlines.filter(shape => doorOutlineIds.has(shape.id)).forEach(door => {
            const doorTop = Number(door.y) || 0;
            const overpanel = outlines
                .filter(shape => !doorOutlineIds.has(shape.id))
                .map(shape => ({ shape, bottom: (Number(shape.y) || 0) + (Number(shape.height) || 0) }))
                .filter(candidate => candidate.bottom <= doorTop)
                .sort((a, b) => b.bottom - a.bottom)[0];
            if (!overpanel) throw new Error(`No overpanel was found above door outline ${door.id}.`);

            const currentGap = doorTop - overpanel.bottom;
            const shift = roundCurrency(TARGET_GAP_UNITS - currentGap);
            if (shift < 0 || shift > TARGET_GAP_UNITS) {
                throw new Error(`Unexpected existing overpanel gap ${currentGap} for door outline ${door.id}.`);
            }
            shifts.set(door.id, shift);
        });
    });
    return shifts;
}

function updateShapes(shapes: KonvaShape[], shifts: Map<string, number>): void {
    shapes.forEach(shape => {
        const outlineShift = shifts.get(shape.id);
        if (outlineShift !== undefined) {
            shape.y = (Number(shape.y) || 0) + outlineShift;
            shape.height = Math.max((Number(shape.height) || 0) - outlineShift, 1);
            return;
        }

        const parentShift = shape.parentId ? shifts.get(shape.parentId) : undefined;
        if (parentShift !== undefined && shape.type === 'accessory' && shape.fittingRole === 'top_patch') {
            shape.y = (Number(shape.y) || 0) + parentShift;
        }
    });
}

function updateDoorItemArea(item: DesignItem, doorOutlineIds: Set<string>): void {
    const shapes = (item.shapes || []) as unknown as KonvaShape[];
    const outline = shapes.find(shape => doorOutlineIds.has(shape.id));
    if (!outline || outline.type !== 'glass_rect') return;

    const quantity = Math.max(1, Number((item as DesignItem & { quantity?: number }).quantity) || 1);
    const area = roundCurrency((((Number(outline.width) || 0) / 10) * ((Number(outline.height) || 0) / 10) / 144) * quantity);
    item.area = area;
    (item as DesignItem & { netArea?: number; grossArea?: number }).netArea = area;
    (item as DesignItem & { netArea?: number; grossArea?: number }).grossArea = area;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const [orders, designs, basePricing, thicknessPricing] = await Promise.all([
        db.orders.getAll(),
        designsDb.getAll(),
        db.settings.getPricing(),
        db.settings.getThicknessPricing(),
    ]);
    const originalOrder = orders.find(order => order.number === ORDER_NUMBER);
    if (!originalOrder) throw new Error(`${ORDER_NUMBER} was not found.`);
    const originalDesign = designs.find(design => design.orderId === originalOrder.id);
    if (!originalDesign) throw new Error(`No design is linked to ${ORDER_NUMBER}.`);

    const repairedDesign: CustomDesign = clone(originalDesign);
    const pieces = (repairedDesign.drawingData.pieces || []) as GlassPiece[];
    const items = (repairedDesign.drawingData.items || []) as DesignItem[];
    const doorItems = items.filter(item => /glass door/i.test(item.name || ''));
    const doorOutlineIds = new Set(doorItems.flatMap(item => (
        ((item.shapes || []) as unknown as KonvaShape[]).filter(isGlassOutline).map(shape => shape.id)
    )));
    if (doorOutlineIds.size !== 3) {
        throw new Error(`Expected three saved door outlines in ${ORDER_NUMBER}, found ${doorOutlineIds.size}.`);
    }

    const shifts = findDoorShifts(pieces, doorOutlineIds);
    if (shifts.size !== doorOutlineIds.size) {
        throw new Error(`Only ${shifts.size} of ${doorOutlineIds.size} door clearances could be resolved.`);
    }
    pieces.forEach(piece => updateShapes(piece.shapes, shifts));
    items.forEach(item => {
        updateShapes((item.shapes || []) as unknown as KonvaShape[], shifts);
        updateDoorItemArea(item, doorOutlineIds);
    });

    delete repairedDesign.drawingData.pdfBase64;
    repairedDesign.totalArea = roundCurrency(items.reduce((sum, item) => (
        sum + (Number((item as DesignItem & { netArea?: number }).netArea ?? item.area) || 0)
    ), 0));
    repairedDesign.grossArea = roundCurrency(items.reduce((sum, item) => (
        sum + (Number((item as DesignItem & { grossArea?: number }).grossArea ?? item.area) || 0)
    ), 0));
    repairedDesign.notes = [
        repairedDesign.notes || '',
        'Door-to-overpanel clearance corrected to 4/8 inch on 2026-08-06.',
    ].filter(Boolean).join('\n');

    const pricingConfig: PricingConfig = { ...basePricing, thicknessPricing };
    repairedDesign.estimatedCost = calculateDesignOrderTotal(repairedDesign, pricingConfig, originalOrder.taxRate);
    const repairedOrder = upsertDesignItemsInOrder(originalOrder, repairedDesign, pricingConfig);

    const report = {
        mode: apply ? 'apply' : 'dry-run',
        order: ORDER_NUMBER,
        correctedDoorOutlines: shifts.size,
        shifts: [...shifts.entries()].map(([id, shift]) => ({ id, shiftUnits: shift, shiftInches: shift / 10 })),
        designAreaBefore: originalDesign.totalArea,
        designAreaAfter: repairedDesign.totalArea,
        designTotalBefore: originalDesign.estimatedCost,
        designTotalAfter: repairedDesign.estimatedCost,
        orderTotalBefore: originalOrder.total,
        orderTotalAfter: repairedOrder.total,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!apply) return;

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `so000015-before-overpanel-clearance-${timestamp}.json`);
    await fs.writeFile(backupPath, JSON.stringify({ originalOrder, originalDesign }, null, 2));
    await designsDb.update(repairedDesign);
    await db.orders.update(repairedOrder);
    console.log(JSON.stringify({ applied: true, backupPath }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
