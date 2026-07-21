import { Unit } from '@/types';
import { roundCurrency } from '@/lib/utils';
import { roundToNextEvenInch } from '@/lib/designCalculations';

export type MeasurementCategory = 'area' | 'count' | 'length' | 'weight' | 'volume' | 'package';

export interface UnitDefinition {
    value: Unit;
    label: string;
    shortLabel: string;
    category: MeasurementCategory;
    toSqftFactor?: number;
    toInchFactor?: number;
}

export const UNIT_DEFINITIONS: UnitDefinition[] = [
    { value: 'sqft', label: 'Square Feet', shortLabel: 'sq.ft', category: 'area', toSqftFactor: 1 },
    { value: 'sqm', label: 'Square Metre', shortLabel: 'sq.m', category: 'area', toSqftFactor: 10.7639104167 },
    { value: 'sqin', label: 'Square Inch', shortLabel: 'sq.in', category: 'area', toSqftFactor: 1 / 144 },
    { value: 'sqyd', label: 'Square Yard', shortLabel: 'sq.yd', category: 'area', toSqftFactor: 9 },
    { value: 'nos', label: 'Pieces / Nos', shortLabel: 'nos', category: 'count' },
    { value: 'pcs', label: 'Pieces', shortLabel: 'pcs', category: 'count' },
    { value: 'sets', label: 'Sets', shortLabel: 'sets', category: 'count' },
    { value: 'pair', label: 'Pair', shortLabel: 'pair', category: 'count' },
    { value: 'sheets', label: 'Sheets', shortLabel: 'sheets', category: 'package' },
    { value: 'box', label: 'Box', shortLabel: 'box', category: 'package' },
    { value: 'inch', label: 'Inch', shortLabel: 'in', category: 'length', toInchFactor: 1 },
    { value: 'ft', label: 'Feet', shortLabel: 'ft', category: 'length', toInchFactor: 12 },
    { value: 'mm', label: 'Millimetre', shortLabel: 'mm', category: 'length', toInchFactor: 1 / 25.4 },
    { value: 'cm', label: 'Centimetre', shortLabel: 'cm', category: 'length', toInchFactor: 1 / 2.54 },
    { value: 'm', label: 'Metre', shortLabel: 'm', category: 'length', toInchFactor: 39.3700787402 },
    { value: 'kg', label: 'Kilogram', shortLabel: 'kg', category: 'weight' },
    { value: 'g', label: 'Gram', shortLabel: 'g', category: 'weight' },
    { value: 'ltr', label: 'Litre', shortLabel: 'ltr', category: 'volume' },
];

export const UNIT_OPTIONS_BY_GROUP = [
    { label: 'Area', units: UNIT_DEFINITIONS.filter(unit => unit.category === 'area') },
    { label: 'Pieces / Packs', units: UNIT_DEFINITIONS.filter(unit => ['count', 'package'].includes(unit.category)) },
    { label: 'Length', units: UNIT_DEFINITIONS.filter(unit => unit.category === 'length') },
    { label: 'Weight / Volume', units: UNIT_DEFINITIONS.filter(unit => ['weight', 'volume'].includes(unit.category)) },
];

const UNIT_ALIASES: Record<string, Unit> = {
    squarefeet: 'sqft',
    squarefoot: 'sqft',
    sqfeet: 'sqft',
    sqfoot: 'sqft',
    sqft: 'sqft',
    'sq ft': 'sqft',
    ft2: 'sqft',
    foot2: 'sqft',
    feet2: 'sqft',
    squaremetre: 'sqm',
    squaremeter: 'sqm',
    sqmetre: 'sqm',
    sqmeter: 'sqm',
    sqm: 'sqm',
    'sq m': 'sqm',
    m2: 'sqm',
    squareinch: 'sqin',
    squareinches: 'sqin',
    sqinch: 'sqin',
    sqinches: 'sqin',
    sqin: 'sqin',
    'sq in': 'sqin',
    in2: 'sqin',
    squareyard: 'sqyd',
    squareyards: 'sqyd',
    sqyard: 'sqyd',
    sqyards: 'sqyd',
    sqyd: 'sqyd',
    'sq yd': 'sqyd',
    yd2: 'sqyd',
    number: 'nos',
    numbers: 'nos',
    no: 'nos',
    nos: 'nos',
    piece: 'pcs',
    pieces: 'pcs',
    pc: 'pcs',
    pcs: 'pcs',
    set: 'sets',
    sets: 'sets',
    pair: 'pair',
    pairs: 'pair',
    sheet: 'sheets',
    sheets: 'sheets',
    box: 'box',
    boxes: 'box',
    inch: 'inch',
    inches: 'inch',
    in: 'inch',
    '"': 'inch',
    feet: 'ft',
    foot: 'ft',
    ft: 'ft',
    "'": 'ft',
    mm: 'mm',
    millimetre: 'mm',
    millimeter: 'mm',
    millimetres: 'mm',
    millimeters: 'mm',
    cm: 'cm',
    centimetre: 'cm',
    centimeter: 'cm',
    centimetres: 'cm',
    centimeters: 'cm',
    metre: 'm',
    meter: 'm',
    metres: 'm',
    meters: 'm',
    m: 'm',
    kg: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    g: 'g',
    gram: 'g',
    grams: 'g',
    litre: 'ltr',
    liter: 'ltr',
    litres: 'ltr',
    liters: 'ltr',
    ltr: 'ltr',
    l: 'ltr',
};

function normalizeUnitKey(unit?: string): string {
    return String(unit || '')
        .trim()
        .toLowerCase()
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ');
}

export function normalizeUnit(unit?: string, fallback: Unit = 'nos'): Unit {
    const key = normalizeUnitKey(unit);
    if (!key) return fallback;

    const direct = UNIT_DEFINITIONS.find(definition => definition.value === key);
    if (direct) return direct.value;

    const compactKey = key.replace(/\s+/g, '');
    return UNIT_ALIASES[key] || UNIT_ALIASES[compactKey] || fallback;
}

export function getUnitOptionsForItem(item?: { category?: string; type?: string; unit?: string }) {
    const category = item?.category?.toLowerCase();
    const type = item?.type?.toLowerCase() || '';

    if (category === 'glass' || (!category && type && !type.includes('hardware'))) {
        return [
            { label: 'Area', units: UNIT_DEFINITIONS.filter(unit => unit.category === 'area') },
            { label: 'Sheets', units: UNIT_DEFINITIONS.filter(unit => unit.value === 'sheets') },
        ];
    }

    if (category === 'hardware' || type.includes('hardware')) {
        return [{ label: 'Pieces / Packs', units: UNIT_DEFINITIONS.filter(unit => ['count', 'package'].includes(unit.category)) }];
    }

    return UNIT_OPTIONS_BY_GROUP;
}

// Sensible starting units when a catalogue item is first added to a line --
// quantity and rate are independently changeable afterward, but glass is
// conventionally ordered by sheet count while priced per square foot, so
// defaulting both to whatever the catalogue's rate unit happens to be (often
// sqft) made "quantity" default to sqft too, which reads oddly for something
// customers actually order in sheets.
export function defaultUnitsForItem(item: { category?: string; unit?: string; rateUnit?: string; width?: number; height?: number }): { unit: Unit; rateUnit: Unit } {
    const rateUnit = normalizeUnit(item.rateUnit || item.unit, 'sqft');
    const isSizedGlass = item.category === 'glass' && Number(item.width) > 0 && Number(item.height) > 0;
    const unit = isSizedGlass ? ('sheets' as Unit) : rateUnit;
    return { unit, rateUnit };
}

export function getUnitDefinition(unit?: string): UnitDefinition {
    const normalizedUnit = normalizeUnit(unit);
    return UNIT_DEFINITIONS.find(definition => definition.value === normalizedUnit) || {
        value: normalizedUnit,
        label: normalizedUnit,
        shortLabel: normalizedUnit,
        category: 'count',
    };
}

export function isAreaUnit(unit?: string): boolean {
    return getUnitDefinition(unit).category === 'area';
}

export function formatUnitLabel(unit?: string): string {
    return getUnitDefinition(unit).shortLabel;
}

export function convertAreaToSqft(value: number, unit?: string): number {
    const definition = getUnitDefinition(unit);
    return (Number(value) || 0) * (definition.toSqftFactor || 0);
}

export function convertSqftToArea(value: number, unit?: string): number {
    const definition = getUnitDefinition(unit);
    return definition.toSqftFactor ? (Number(value) || 0) / definition.toSqftFactor : Number(value) || 0;
}

export function convertLengthToInches(value: number, unit?: string): number {
    const definition = getUnitDefinition(normalizeUnit(unit, 'inch'));
    const numericValue = Number(value) || 0;
    return definition.toInchFactor ? numericValue * definition.toInchFactor : numericValue;
}

export function convertInchesToLength(value: number, unit?: string): number {
    const definition = getUnitDefinition(normalizeUnit(unit, 'inch'));
    const numericValue = Number(value) || 0;
    return definition.toInchFactor ? numericValue / definition.toInchFactor : numericValue;
}

export function convertRateBetweenUnits(rate: number, fromUnit?: string, toUnit?: string): number {
    const currentRate = Number(rate) || 0;
    const from = getUnitDefinition(fromUnit);
    const to = getUnitDefinition(toUnit);

    if (!currentRate || from.value === to.value) return roundCurrency(currentRate);

    if (from.category === 'area' && to.category === 'area' && from.toSqftFactor && to.toSqftFactor) {
        const ratePerSqft = currentRate / from.toSqftFactor;
        return roundCurrency(ratePerSqft * to.toSqftFactor);
    }

    if (from.category === 'length' && to.category === 'length' && from.toInchFactor && to.toInchFactor) {
        const ratePerInch = currentRate / from.toInchFactor;
        return roundCurrency(ratePerInch * to.toInchFactor);
    }

    return roundCurrency(currentRate);
}

export function getSheetAreaSqft(input: { width?: number; height?: number; conversionFactor?: number }): number {
    // Width/height are the geometric source of truth for a sheet's area.
    // conversionFactor is only a fallback for items with no fixed dimensions
    // (it must not silently override a real width x height, which stale or
    // default-seeded conversionFactor values otherwise would).
    const width = Number(input.width) || 0;
    const height = Number(input.height) || 0;
    if (width > 0 && height > 0) {
        return roundCurrency((roundToNextEvenInch(width) * roundToNextEvenInch(height)) / 144);
    }

    return Number(input.conversionFactor) || 0;
}

export function convertRateForItemUnit(input: {
    rate: number;
    fromUnit?: string;
    toUnit?: string;
    width?: number;
    height?: number;
    conversionFactor?: number;
}): number {
    const currentRate = Number(input.rate) || 0;
    const from = getUnitDefinition(input.fromUnit);
    const to = getUnitDefinition(input.toUnit);
    const sheetAreaSqft = getSheetAreaSqft(input);

    if (!currentRate || from.value === to.value) return roundCurrency(currentRate);

    if (from.value === 'sheets' && to.category === 'area' && sheetAreaSqft > 0 && to.toSqftFactor) {
        const ratePerSqft = currentRate / sheetAreaSqft;
        return roundCurrency(ratePerSqft * to.toSqftFactor);
    }

    if (from.category === 'area' && to.value === 'sheets' && sheetAreaSqft > 0 && from.toSqftFactor) {
        const ratePerSqft = currentRate / from.toSqftFactor;
        return roundCurrency(ratePerSqft * sheetAreaSqft);
    }

    return convertRateBetweenUnits(currentRate, from.value, to.value);
}

export function convertQuantityForItemUnit(input: {
    quantity: number;
    fromUnit?: string;
    toUnit?: string;
    width?: number;
    height?: number;
    conversionFactor?: number;
}): number {
    const quantity = Number(input.quantity) || 0;
    const from = getUnitDefinition(input.fromUnit);
    const to = getUnitDefinition(input.toUnit);
    const sheetAreaSqft = getSheetAreaSqft(input);

    if (!quantity || from.value === to.value) return roundCurrency(quantity);

    if (from.category === 'area' && to.category === 'area' && from.toSqftFactor && to.toSqftFactor) {
        return roundCurrency(convertSqftToArea(convertAreaToSqft(quantity, from.value), to.value));
    }

    if (from.value === 'sheets' && to.category === 'area' && sheetAreaSqft > 0) {
        return roundCurrency(convertSqftToArea(quantity * sheetAreaSqft, to.value));
    }

    if (from.category === 'area' && to.value === 'sheets' && sheetAreaSqft > 0) {
        return roundCurrency(convertAreaToSqft(quantity, from.value) / sheetAreaSqft);
    }

    return roundCurrency(quantity);
}

export function calculateDimensionAreaSqft(widthInches: number, heightInches: number, quantity: number): number {
    const width = Number(widthInches) || 0;
    const height = Number(heightInches) || 0;
    const qty = Number(quantity) || 0;
    if (width <= 0 || height <= 0 || qty <= 0) return 0;
    return roundCurrency((roundToNextEvenInch(width) * roundToNextEvenInch(height) * qty) / 144);
}

export function calculateLineMeasurement(input: {
    width?: number;
    height?: number;
    quantity?: number;
    unit?: string;
    conversionFactor?: number;
    unitFallback?: Unit;
}): {
    sqft: number;
    billingQuantity: number;
    billingUnit: Unit;
    billingLabel: string;
} {
    const unit = normalizeUnit(input.unit, input.unitFallback);
    const definition = getUnitDefinition(unit);
    const qty = Number(input.quantity) || 0;
    const dimensionSqft = calculateDimensionAreaSqft(Number(input.width) || 0, Number(input.height) || 0, qty);
    const sheetAreaSqft = getSheetAreaSqft(input);

    let sqft = 0;
    let billingQuantity = qty;

    if (definition.category === 'area') {
        sqft = convertAreaToSqft(qty, unit);
        billingQuantity = qty;
    } else {
        sqft = definition.value === 'sheets' && sheetAreaSqft > 0
            ? roundCurrency(qty * sheetAreaSqft)
            : dimensionSqft;
        billingQuantity = qty;
    }

    return {
        sqft: roundCurrency(sqft),
        billingQuantity: roundCurrency(billingQuantity),
        billingUnit: unit,
        billingLabel: `${roundCurrency(billingQuantity).toFixed(2)} ${definition.shortLabel}`,
    };
}

export function calculateLineAmounts(input: {
    width?: number;
    height?: number;
    quantity?: number;
    unit?: string;
    rate?: number;
    // Unit `rate` is denominated in, when it differs from `unit` (the
    // billing/quantity unit) -- e.g. a rate quoted per sqft while the line
    // bills in sheets. Without this, quantity * rate silently mixes units
    // whenever they don't already match (a rate typed in while a line
    // happens to be billing in sheets was being read as "per sheet" even
    // when the person entering it meant "per sqft").
    rateUnit?: string;
    taxRate?: number;
    conversionFactor?: number;
    unitFallback?: Unit;
}): {
    sqft: number;
    billingQuantity: number;
    amount: number;
    lineTotal: number;
    billingLabel: string;
} {
    const measurement = calculateLineMeasurement(input);
    const rawRate = Number(input.rate) || 0;
    const rate = input.rateUnit && input.rateUnit !== measurement.billingUnit
        ? convertRateForItemUnit({
            rate: rawRate,
            fromUnit: input.rateUnit,
            toUnit: measurement.billingUnit,
            width: input.width,
            height: input.height,
            conversionFactor: input.conversionFactor,
        })
        : rawRate;
    const taxRate = Number(input.taxRate) || 0;
    // rate is the GST-INCLUSIVE, customer-facing unit price (confirmed by the
    // business owner 2026-07-21) -- quantity * rate IS the line total already,
    // and the pre-tax amount/subtotal is backed out of it. This reverses
    // commit 45c5709 (2026-07-10), which flipped this the other way believing
    // rate was pre-tax. It has now been changed both ways -- do not invert
    // this again without checking with the business owner directly.
    const lineTotal = roundCurrency(measurement.billingQuantity * rate);
    const amount = roundCurrency(lineTotal / (1 + taxRate / 100));

    return {
        sqft: measurement.sqft,
        billingQuantity: measurement.billingQuantity,
        amount,
        lineTotal,
        billingLabel: measurement.billingLabel,
    };
}
