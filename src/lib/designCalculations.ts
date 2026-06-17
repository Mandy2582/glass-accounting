// Utility functions for glass design calculations
import { roundCurrency } from '@/lib/utils';

export interface Point {
    x: number;
    y: number;
}

/**
 * Calculate area of a polygon using the Shoelace formula
 */
export function calculatePolygonArea(points: Point[]): number {
    if (points.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }

    return Math.abs(area / 2);
}

/**
 * Calculate area of a circle
 */
export function calculateCircleArea(radius: number): number {
    return Math.PI * radius * radius;
}

/**
 * Calculate area of a rectangle
 */
export function calculateRectangleArea(width: number, height: number): number {
    return width * height;
}

export function roundToNextEvenInch(inches: number): number {
    // Round to 3 decimal places to avoid JS floating point errors
    const rounded = Math.round(inches * 1000) / 1000;
    
    // Check if it is a whole even integer
    if (rounded % 2 === 0 && Number.isInteger(rounded)) {
        return rounded;
    }
    
    // Otherwise, change it to the next even number
    const nextInt = Math.ceil(rounded);
    if (nextInt % 2 === 0) {
        return nextInt;
    } else {
        return nextInt + 1;
    }
}

/**
 * Convert pixels to inches (assuming 96 DPI)
 */
export function pixelsToInches(pixels: number): number {
    return pixels / 96;
}

/**
 * Convert inches to square feet
 */
export function inchesToSquareFeet(inches: number): number {
    return inches / 144;
}

/**
 * Calculate complexity level based on shapes, holes, and cuts
 */
export function calculateComplexity(
    shapeCount: number,
    holeCount: number,
    cutCount: number,
    hasIrregularShapes: boolean
): 'simple' | 'medium' | 'complex' {
    const totalFeatures = shapeCount + holeCount + cutCount;

    if (hasIrregularShapes || totalFeatures > 5) {
        return 'complex';
    } else if (holeCount > 0 || cutCount > 0 || totalFeatures > 2) {
        return 'medium';
    } else {
        return 'simple';
    }
}

const getThicknessRate = (
    thickness: number,
    pricingConfig: {
        baseRatePerSqft: number;
        thicknessPricing?: Array<{ thickness: number; ratePerSqft: number }>;
    }
): number => {
    const match = pricingConfig.thicknessPricing?.find(item => Number(item.thickness) === Number(thickness));
    return Number(match?.ratePerSqft ?? pricingConfig.baseRatePerSqft ?? 0) || 0;
};

/**
 * Calculate design glass and processing charges. Glass area is charged from
 * thickness-wise rates; complexity multiplier, edge finishing, and minimum
 * charge are intentionally not applied.
 */
export function calculateCost(
    netArea: number,
    holeCount: number,
    cutCount: number,
    complexityLevel: 'simple' | 'medium' | 'complex',
    thickness: number = 6, // Default 6mm
    pricingConfig: {
        baseRatePerSqft: number;
        thicknessPricing?: Array<{ thickness: number; ratePerSqft: number }>;
        holeCharge: number;
        cutCharge: number;
        complexityMultiplier: {
            simple: number;
            medium: number;
            complex: number;
        };
        minimumCharge: number;
    },
    applyMinimumCharge: boolean = true
): {
    baseAmount: number;
    thicknessRate: number;
    holeCharges: number;
    cutCharges: number;
    complexityCharge: number;
    total: number;
} {
    const thicknessRate = getThicknessRate(thickness, pricingConfig);
    const baseAmount = roundCurrency(netArea * thicknessRate);
    const holeCharges = holeCount * pricingConfig.holeCharge;
    const cutCharges = cutCount * pricingConfig.cutCharge;

    const subtotal = baseAmount + holeCharges + cutCharges;
    const complexityCharge = 0;
    const total = subtotal;

    return {
        baseAmount,
        thicknessRate,
        holeCharges,
        cutCharges,
        complexityCharge,
        total
    };
}

export interface DesignEstimateInput {
    grossArea: number;
    holeCount: number;
    cutCount: number;
    complexity: 'simple' | 'medium' | 'complex';
    thickness?: number;
    items?: Array<{
        id?: string;
        name?: string;
        type?: string;
        thickness?: number;
        netArea?: number;
        area?: number;
        holes?: number;
        cuts?: number;
        quantity?: number;
    }>;
    pricingConfig: {
        baseRatePerSqft: number;
        thicknessPricing?: Array<{ thickness: number; ratePerSqft: number }>;
        holeCharge: number;
        cutCharge: number;
        complexityMultiplier: {
            simple: number;
            medium: number;
            complex: number;
        };
        minimumCharge: number;
    };
}

export function calculateDesignEstimate(input: DesignEstimateInput): {
    total: number;
    baseAmount: number;
    holeCharges: number;
    cutCharges: number;
    complexityCharge: number;
    minimumAdjustment: number;
    thicknessRate: number;
} {
    const designItems = input.items || [];

    if (designItems.length > 0) {
        let subtotal = 0;
        let totalBaseAmount = 0;
        let totalHoleCharges = 0;
        let totalCutCharges = 0;
        let totalComplexityCharge = 0;

        designItems.forEach(item => {
            const itemCost = calculateCost(
                item.netArea || item.area || 0,
                item.holes || 0,
                item.cuts || 0,
                input.complexity,
                item.thickness || input.thickness || 6,
                input.pricingConfig,
                false
            );
            subtotal += itemCost.total;
            totalBaseAmount += itemCost.baseAmount;
            totalHoleCharges += itemCost.holeCharges;
            totalCutCharges += itemCost.cutCharges;
            totalComplexityCharge += itemCost.complexityCharge;
        });

        return {
            total: subtotal,
            baseAmount: totalBaseAmount,
            holeCharges: totalHoleCharges,
            cutCharges: totalCutCharges,
            complexityCharge: totalComplexityCharge,
            minimumAdjustment: 0,
            thicknessRate: 0
        };
    }

    const singleItemCost = calculateCost(
        input.grossArea,
        input.holeCount,
        input.cutCount,
        input.complexity,
        input.thickness || 6,
        input.pricingConfig
    );

    return {
        ...singleItemCost,
        minimumAdjustment: 0
    };
}

/**
 * Calculate cost for multiple items in a design
 */
export function calculateMultiItemCost(
    items: Array<{
        name: string;
        type: string;
        thickness: number;
        area: number;
        holeCount?: number;
        cutCount?: number;
    }>,
    pricingConfig: {
        baseRatePerSqft: number;
        thicknessPricing?: Array<{ thickness: number; ratePerSqft: number }>;
        holeCharge: number;
        cutCharge: number;
        complexityMultiplier: {
            simple: number;
            medium: number;
            complex: number;
        };
        minimumCharge: number;
    }
): {
    items: Array<{
        name: string;
        type: string;
        thickness: number;
        area: number;
        thicknessRate: number;
        cost: number;
    }>;
    subtotal: number;
    total: number;
} {
    const itemCosts = items.map(item => {
        const costBreakdown = calculateCost(
            item.area,
            item.holeCount || 0,
            item.cutCount || 0,
            'simple', // Can be enhanced to calculate per item
            item.thickness,
            pricingConfig,
            false
        );

        return {
            name: item.name,
            type: item.type,
            thickness: item.thickness,
            area: item.area,
            thicknessRate: costBreakdown.thicknessRate,
            cost: costBreakdown.total
        };
    });

    const subtotal = itemCosts.reduce((sum, item) => sum + item.cost, 0);
    const total = subtotal;

    return {
        items: itemCosts,
        subtotal,
        total
    };
}

/**
 * Calculate perimeter of a polygon
 */
export function calculatePerimeter(points: Point[]): number {
    if (points.length < 2) return 0;

    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    return perimeter;
}

/**
 * Calculate circle perimeter (circumference)
 */
export function calculateCirclePerimeter(radius: number): number {
    return 2 * Math.PI * radius;
}
