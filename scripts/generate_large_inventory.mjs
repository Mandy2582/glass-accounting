import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Combinations for Glass Items
const glassMakes = ['Saint-Gobain', 'AIS', 'ModiGuard', 'Pilkington', 'HNG'];
const glassTypes = ['Toughened', 'Clear Float', 'Mirror', 'Lacquered', 'Tinted', 'Frosted', 'Laminated', 'Double Glazed'];
const glassThicknesses = [3, 4, 5, 6, 8, 10, 12, 15, 19];
const glassSizes = [
    { w: 36, h: 72 },
    { w: 48, h: 72 },
    { w: 48, h: 96 },
    { w: 60, h: 96 },
    { w: 72, h: 96 },
    { w: 72, h: 120 },
    { w: 84, h: 120 },
    { w: 96, h: 144 }
];
const colors = ['Clear', 'Extra White', 'Bronze', 'Grey', 'Green', 'Blue', 'Black', 'Red', 'Brown', 'Classic Grey'];

// Combinations for Hardware Items
const hardwareMakes = ['Dorma', 'Ozone', 'Dorset', 'Hardwyn', 'Hafele', 'Hettich', 'Godrej', 'Kaff'];
const hardwareCategories = [
    {
        type: 'Floor Spring',
        models: ['FS-60', 'FS-74', 'FS-84', 'FS-90', 'BTS-75V', 'BTS-80', 'BTS-84', 'HFS-500'],
        hsn: '83024110'
    },
    {
        type: 'Patch Fitting',
        models: ['PT-10 (Bottom)', 'PT-20 (Top)', 'PT-30 (Overpanel)', 'PT-40 (Sidepanel)', 'PT-50 (Overpanel Pivot)', 'US-10 (Lock Patch)', 'PT-24 (Top Pivot)'],
        hsn: '83024110'
    },
    {
        type: 'Hinge',
        models: ['SH-90-GW (Glass-Wall)', 'SH-180-GG (Glass-Glass)', 'SH-135-GG (Glass-Glass)', 'H-101 (Pivot)', 'Hydraulic Hinge 90D'],
        hsn: '83024110'
    },
    {
        type: 'Handle',
        models: ['DH-300-SS (D-Handle)', 'DH-450-SS (D-Handle)', 'DH-600-SS (D-Handle)', 'HH-450 (H-Handle)', 'HH-600 (H-Handle)', 'HH-900 (H-Handle)', 'T-Handle 300', 'T-Handle 450'],
        hsn: '83024110'
    },
    {
        type: 'Lock',
        models: ['GL-85 (Single)', 'GL-86 (Double)', 'SL-99 (Sliding)', 'Strike-PL (Strike Plate)', 'Deadbolt GL-12', 'Magnetic Lock ML-280'],
        hsn: '83014090'
    },
    {
        type: 'Bracket',
        models: ['Balustrade Spigot SP-1', 'Standoff Pin 38x38', 'Standoff Pin 38x50', 'Standoff Pin 50x50', 'D-Clamp DC-01', 'D-Clamp DC-02', 'L-Bracket Glass-Glass'],
        hsn: '83024110'
    },
    {
        type: 'Sliding System',
        models: ['Syncro SL-100', 'Telescopic SL-200', 'Soft-Close SC-80', 'Shower Sliding Kit SS-30', 'Heavy Duty Sliding HDS-150'],
        hsn: '83024110'
    },
    {
        type: 'Spider Fitting',
        models: ['SF-1 (1-Way)', 'SF-2 (2-Way)', 'SF-4 (4-Way)', 'Fin Spider FS-01', 'Connector Bolt CB-10'],
        hsn: '83024110'
    }
];

function generateItems() {
    const list = [];

    // 1. Generate Glass Items (~500 items)
    for (const make of glassMakes) {
        for (const type of glassTypes) {
            for (const thickness of glassThicknesses) {
                // Not all types are available in all thicknesses or sizes, we skip or filter to keep it realistic
                if (type === 'Mirror' && thickness > 8) continue; // Mirrors are usually 3mm to 8mm
                if (type === 'Lacquered' && thickness > 8) continue; // Lacquered is usually 4mm to 8mm

                for (const size of glassSizes) {
                    const color = (type === 'Tinted' || type === 'Lacquered') 
                        ? colors[Math.floor(Math.random() * colors.length)] 
                        : 'Clear';

                    if (type !== 'Tinted' && type !== 'Lacquered' && color !== 'Clear') continue;

                    const name = `${thickness}mm ${type} ${color !== 'Clear' ? color + ' ' : ''}Glass (${make} ${size.w}x${size.h})`;
                    
                    // Selling rate based on thickness and type
                    let baseRate = 35 + (thickness * 5);
                    if (type === 'Toughened') baseRate += 15;
                    if (type === 'Mirror') baseRate += 20;
                    if (type === 'Lacquered') baseRate += 45;
                    if (type === 'Double Glazed') baseRate += 120;
                    if (type === 'Laminated') baseRate += 60;
                    if (color !== 'Clear') baseRate += 15;

                    const purchaseRate = Math.round(baseRate * 0.78);
                    const rate = Math.round(baseRate);

                    // HSN Code
                    let hsn = '70071900';
                    if (type === 'Mirror') hsn = '70099100';
                    if (type === 'Clear Float') hsn = '70051000';
                    if (type === 'Tinted') hsn = '70052100';

                    list.push({
                        id: crypto.randomUUID(),
                        name,
                        category: 'glass',
                        type,
                        make,
                        model: '',
                        thickness,
                        width: size.w,
                        height: size.h,
                        unit: 'sqft',
                        stock: 0,
                        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
                        min_stock: 20,
                        rate,
                        purchase_rate: purchaseRate,
                        hsn_code: hsn,
                        conversion_factor: 1
                    });
                }
            }
        }
    }

    // 2. Generate Hardware Items (~500 items)
    for (const make of hardwareMakes) {
        for (const cat of hardwareCategories) {
            for (const model of cat.models) {
                const name = `${cat.type} ${model} (${make})`;
                
                // Selling rate based on make and type
                let baseRate = 150;
                if (cat.type === 'Floor Spring') baseRate = 1800 + Math.floor(Math.random() * 2000);
                if (cat.type === 'Patch Fitting') baseRate = 450 + Math.floor(Math.random() * 800);
                if (cat.type === 'Hinge') baseRate = 300 + Math.floor(Math.random() * 900);
                if (cat.type === 'Handle') baseRate = 250 + Math.floor(Math.random() * 1500);
                if (cat.type === 'Lock') baseRate = 400 + Math.floor(Math.random() * 1200);
                if (cat.type === 'Bracket') baseRate = 80 + Math.floor(Math.random() * 400);
                if (cat.type === 'Sliding System') baseRate = 2500 + Math.floor(Math.random() * 8000);
                if (cat.type === 'Spider Fitting') baseRate = 600 + Math.floor(Math.random() * 1800);

                // Premium brands cost more
                if (make === 'Dorma' || make === 'Hafele') {
                    baseRate = Math.round(baseRate * 1.5);
                } else if (make === 'Ozone' || make === 'Dorset') {
                    baseRate = Math.round(baseRate * 1.15);
                }

                const purchaseRate = Math.round(baseRate * 0.75);
                const rate = Math.round(baseRate);

                list.push({
                    id: crypto.randomUUID(),
                    name,
                    category: 'hardware',
                    type: cat.type,
                    make,
                    model,
                    thickness: 0,
                    width: 0,
                    height: 0,
                    unit: 'nos',
                    stock: 0,
                    warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
                    min_stock: 10,
                    rate,
                    purchase_rate: purchaseRate,
                    hsn_code: cat.hsn,
                    conversion_factor: 0
                });
            }
        }
    }

    return list;
}

async function run() {
    const allItems = generateItems();
    console.log(`Generated ${allItems.length} items. Slicing to exactly 1000 items.`);
    
    // Shuffle slightly and slice to 1000 items
    const selectedItems = allItems.sort(() => 0.5 - Math.random()).slice(0, 1000);

    console.log(`Inserting 1000 items in batches of 100...`);
    const batchSize = 100;
    
    for (let i = 0; i < selectedItems.length; i += batchSize) {
        const batch = selectedItems.slice(i, i + batchSize);
        const { error } = await supabase.from('items').insert(batch);
        
        if (error) {
            console.error(`Error inserting batch starting at index ${i}:`, error);
        } else {
            console.log(`Successfully inserted batch ${i / batchSize + 1} / ${selectedItems.length / batchSize}`);
        }
    }
    console.log('Finished populating database.');
}

run();
