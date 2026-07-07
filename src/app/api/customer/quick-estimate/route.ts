import { NextResponse } from 'next/server';
import { calculateCost, roundToNextEvenInch } from '@/lib/designCalculations';
import { db } from '@/lib/storage';
import { roundCurrency } from '@/lib/utils';

type EstimateBody = {
    width?: number;
    height?: number;
    unit?: 'inch' | 'ft' | 'mm' | 'cm' | 'm';
    thickness?: number;
    quantity?: number;
    holes?: number;
    cuts?: number;
};

function toNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function dimensionToInches(value: number, unit: EstimateBody['unit']) {
    if (unit === 'ft') return value * 12;
    if (unit === 'mm') return value / 25.4;
    if (unit === 'cm') return value / 2.54;
    if (unit === 'm') return value * 39.37007874;
    return value;
}

function inchesToDisplay(value: number, unit: EstimateBody['unit']) {
    if (unit === 'ft') return value / 12;
    if (unit === 'mm') return value * 25.4;
    if (unit === 'cm') return value * 2.54;
    if (unit === 'm') return value / 39.37007874;
    return value;
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as EstimateBody | null;
        const unit = body?.unit || 'inch';
        const width = toNumber(body?.width);
        const height = toNumber(body?.height);
        const thickness = toNumber(body?.thickness, 6);
        const quantity = Math.max(1, Math.floor(toNumber(body?.quantity, 1)));
        const holes = Math.max(0, Math.floor(toNumber(body?.holes, 0)));
        const cuts = Math.max(0, Math.floor(toNumber(body?.cuts, 0)));

        if (width <= 0 || height <= 0) {
            return NextResponse.json({ message: 'Width and height must be greater than zero.' }, { status: 400 });
        }

        if (thickness <= 0) {
            return NextResponse.json({ message: 'Thickness must be greater than zero.' }, { status: 400 });
        }

        const widthInches = dimensionToInches(width, unit);
        const heightInches = dimensionToInches(height, unit);
        const billedWidthInches = roundToNextEvenInch(widthInches);
        const billedHeightInches = roundToNextEvenInch(heightInches);
        const netArea = roundCurrency((billedWidthInches * billedHeightInches / 144) * quantity);

        const [pricing, thicknessPricing] = await Promise.all([
            db.settings.getPricing(),
            db.settings.getThicknessPricing(),
        ]);

        const fullPricing = { ...pricing, thicknessPricing };
        const cost = calculateCost(netArea, holes * quantity, cuts * quantity, 'simple', thickness, fullPricing, false);

        return NextResponse.json({
            success: true,
            estimate: {
                entered: {
                    width,
                    height,
                    unit,
                    thickness,
                    quantity,
                    holes,
                    cuts,
                },
                billed: {
                    width: roundCurrency(inchesToDisplay(billedWidthInches, unit)),
                    height: roundCurrency(inchesToDisplay(billedHeightInches, unit)),
                    unit,
                    widthInches: billedWidthInches,
                    heightInches: billedHeightInches,
                    areaSqft: netArea,
                },
                ratePerSqft: roundCurrency(cost.thicknessRate),
                glassAmount: roundCurrency(cost.baseAmount),
                holeCharges: roundCurrency(cost.holeCharges),
                cutCharges: roundCurrency(cost.cutCharges),
                total: roundCurrency(cost.total),
                thicknessOptions: thicknessPricing,
            },
        });
    } catch (error) {
        console.error('Quick estimate failed:', error);
        return NextResponse.json({ message: 'Could not calculate estimate right now.' }, { status: 500 });
    }
}
