import { db, designsDb } from '../src/lib/storage';
import { buildDesignDataFromImageAnalysis, type WhatsAppImageAnalysis } from '../src/lib/whatsappVision';
import { calculateDesignOrderTotal, upsertDesignItemsInOrder } from '../src/lib/orderDesignItems';
import type { CustomDesign, PricingConfig } from '../src/types';

const piece = (
    name: string,
    type: string,
    width: number,
    height: number,
    designCode: 'F' | null = null,
): WhatsAppImageAnalysis['drawing']['pieces'][number] => ({
    name,
    type,
    width,
    height,
    widthUnit: 'inch',
    heightUnit: 'inch',
    thickness: 12,
    quantity: 1,
    holes: [],
    cuts: [],
    tapers: [],
    connectedToPrevious: false,
    designCode,
    hardwareNotes: name,
    imageRegion: null,
    holeEdgeCounts: null,
});

const analysis: WhatsAppImageAnalysis = {
    classification: 'drawing',
    extractedText: [
        '12mm Plain Toughened',
        'Fixed panel 38 x 107 4/8 F',
        'Double Door 63 2/8 x 116 6/8',
        'Single Door 33 6/8 x 97',
        'Fixed panel 117 4/8 x 105 6/8 F',
    ].join('\n'),
    confidence: 1,
    orderLines: [],
    drawing: {
        notes: 'Rebuilt from the original SO-000015 image after staff verification.',
        pieces: [
            piece('Fixed Panel 38 x 107 4/8', 'fixed_panel', 38, 107.5, 'F'),
            piece('Double Door 63 2/8 x 116 6/8', 'door', 63.25, 116.75),
            piece('Single Door 33 6/8 x 97', 'door', 33.75, 97),
            piece('Fixed Panel 117 4/8 x 105 6/8', 'fixed_panel', 117.5, 105.75, 'F'),
        ],
    },
    glassSystem: null,
};

async function main() {
    const apply = process.argv.includes('--apply');
    const [orders, designs, fittings, basePricing, thicknessPricing] = await Promise.all([
        db.orders.getAll(),
        designsDb.getAll(),
        db.items.getAll(),
        db.settings.getPricing(),
        db.settings.getThicknessPricing(),
    ]);
    const order = orders.find(candidate => candidate.number === 'SO-000015');
    if (!order) throw new Error('SO-000015 was not found.');
    const existingDesign = designs.find(candidate => candidate.orderId === order.id);
    if (!existingDesign) throw new Error('The design linked to SO-000015 was not found.');

    const rebuilt = buildDesignDataFromImageAnalysis(analysis, fittings);
    const pricingConfig: PricingConfig = { ...basePricing, thicknessPricing };
    const draft: CustomDesign = {
        ...existingDesign,
        drawingData: rebuilt.drawingData,
        totalArea: rebuilt.totalArea,
        grossArea: rebuilt.grossArea,
        holes: rebuilt.holes,
        cuts: rebuilt.cuts,
        complexityLevel: 'complex',
        notes: [
            existingDesign.notes || '',
            'SO-000015 rebuilt from its original image: two F panels, one double-door-only system, and one single-door-only system.',
        ].filter(Boolean).join('\n'),
    };
    const repairedDesign = {
        ...draft,
        estimatedCost: calculateDesignOrderTotal(draft, pricingConfig, order.taxRate),
    };
    const repairedOrder = upsertDesignItemsInOrder(order, repairedDesign, pricingConfig);

    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        order: repairedOrder.number,
        canvasTabs: rebuilt.drawingData.pieces?.length || 0,
        glassItems: rebuilt.items.map(item => ({ name: item.name, type: item.type, area: item.area })),
        totalArea: rebuilt.totalArea,
        holes: rebuilt.holes,
        cuts: rebuilt.cuts,
        estimatedCost: repairedDesign.estimatedCost,
        orderTotal: repairedOrder.total,
        orderRows: repairedOrder.items.filter(item => item.designId === repairedDesign.id).map(item => ({
            name: item.itemName,
            quantity: item.quantity,
            rate: item.rate,
            total: item.lineTotal,
        })),
    }, null, 2));

    if (!apply) return;
    await designsDb.update(repairedDesign);
    await db.orders.update(repairedOrder);
    console.log('SO-000015 repair applied.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
