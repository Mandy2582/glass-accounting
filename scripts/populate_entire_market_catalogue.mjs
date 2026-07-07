import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Comprehensive lists of glass parameters
const glassMakes = [
    'Saint-Gobain', 'AIS', 'ModiGuard', 'Pilkington', 'HNG', 
    'Gold Plus', 'Asahi', 'Gujarat Guardian', 'Sisecam', 'Sejal'
];
const glassTypes = [
    'Toughened', 'Clear Float', 'Mirror', 'Lacquered', 
    'Tinted', 'Frosted', 'Double Glazed', 'Laminated', 
    'Reflective', 'Patterned', 'Wire Glass', 'Low-E', 'Ultra Clear'
];
const glassThicknesses = [3, 4, 5, 6, 8, 10, 12, 15, 19];
const glassSizes = [
    { w: 36, h: 72 }, { w: 48, h: 72 }, { w: 48, h: 96 }, 
    { w: 60, h: 96 }, { w: 72, h: 96 }, { w: 72, h: 120 }, 
    { w: 84, h: 120 }, { w: 96, h: 120 }, { w: 96, h: 144 }, 
    { w: 108, h: 144 }, { w: 120, h: 144 }, { w: 120, h: 168 }
];
const colors = [
    'Clear', 'Extra White', 'Bronze', 'Grey', 'Green', 
    'Blue', 'Black', 'Red', 'Brown', 'Classic Grey', 
    'Yellow', 'Orange', 'Pink', 'Purple'
];

// Comprehensive lists of hardware parameters
const hardwareMakes = [
    'Dorma', 'Ozone', 'Dorset', 'Hardwyn', 'Hafele', 
    'Hettich', 'Godrej', 'Kaff', 'Icon', 'Trudoor', 
    'Geze', 'Stanley', 'ASSA ABLOY', 'Lixil', 'Enox'
];
const hardwareCategories = [
    {
        type: 'Floor Spring',
        models: [
            'FS-60', 'FS-74', 'FS-84', 'FS-90', 'BTS-75V', 
            'BTS-80', 'BTS-84', 'HFS-500', 'FS-200', 'BTS-65',
            'HFS-600', 'FS-100', 'BTS-85', 'FS-Lite'
        ],
        hsn: '83024110'
    },
    {
        type: 'Patch Fitting',
        models: [
            'PT-10 (Bottom Patch)', 'PT-20 (Top Patch)', 'PT-30 (Overpanel)', 
            'PT-40 (Sidepanel)', 'PT-50 (Overpanel Pivot)', 'US-10 (Lock Patch)', 
            'PT-24 (Top Pivot)', 'PT-80 (Overpanel Lock)', 'PT-90 (Double Overpanel)',
            'PT-22 (Corner Pivot)', 'PT-31 (Overpanel Connector)', 'PT-10-Short',
            'PT-20-Short', 'Patch Lock PL-01'
        ],
        hsn: '83024110'
    },
    {
        type: 'Shower Hinge',
        models: [
            'SH-90-GW (Glass-Wall 90°)', 'SH-180-GG (Glass-Glass 180°)', 
            'SH-135-GG (Glass-Glass 135°)', 'SH-90-GG (Glass-Glass 90°)', 
            'SH-Heavy-Duty', 'SH-Adjustable', 'SH-Glass-Glass-180-Offset',
            'SH-Sleek-90', 'SH-Mini-GW', 'SH-Hydraulic-GW'
        ],
        hsn: '83024110'
    },
    {
        type: 'Handle',
        models: [
            'DH-300-SS (D-Handle 300mm)', 'DH-450-SS (D-Handle 450mm)', 
            'DH-600-SS (D-Handle 600mm)', 'HH-450-SS (H-Handle 450mm)', 
            'HH-600-SS (H-Handle 600mm)', 'HH-900-SS (H-Handle 900mm)', 
            'TH-300 (T-Handle 300mm)', 'TH-450 (T-Handle 450mm)', 
            'PH-300 (Pull Handle)', 'OH-450 (Offset Handle)',
            'LH-150 (Loop Handle)', 'KH-50 (Knob Handle)', 'HH-1200-SS'
        ],
        hsn: '83024110'
    },
    {
        type: 'Lock',
        models: [
            'GL-85 (Single Door Lock)', 'GL-86 (Double Door Lock)', 
            'SL-99 (Sliding Door Lock)', 'Strike-PL (Strike Plate)', 
            'Deadbolt GL-12', 'Magnetic Lock ML-280', 'Latch Lock LL-10', 
            'Central Lock CL-50', 'Corner Lock CL-60', 'Sliding Hook Lock SHL-05',
            'Indicator Lock IL-12', 'Digital Glass Lock DGL-500'
        ],
        hsn: '83014090'
    },
    {
        type: 'Bracket',
        models: [
            'Balustrade Spigot SP-1', 'Standoff Pin 38x38', 'Standoff Pin 38x50', 
            'Standoff Pin 50x50', 'D-Clamp DC-01', 'D-Clamp DC-02', 
            'L-Bracket Glass-Glass', 'Glass Clip GC-90', 'Spigot SP-2', 
            'Standoff 50x100', 'Glass Stud GS-15', 'F-Clamp FC-12'
        ],
        hsn: '83024110'
    },
    {
        type: 'Sliding System',
        models: [
            'Syncro SL-100 Kit', 'Telescopic SL-200 Kit', 'Soft-Close SC-80 Kit', 
            'Shower Sliding Kit SS-30', 'Heavy Duty Sliding HDS-150', 
            'Sleek Sliding System SS-80', 'Automatic Sliding Door Kit ASD-120', 
            'Glass Folding Wall System FWS-300', 'Barn Style Sliding BS-120',
            'Synchronized 4-Door Sliding System'
        ],
        hsn: '83024110'
    },
    {
        type: 'Spider Fitting',
        models: [
            'SF-1 (1-Way)', 'SF-2 (2-Way)', 'SF-4 (4-Way)', 
            'Fin Spider FS-01', 'Connector Bolt CB-10', 
            'Articulated Routel AR-02', 'SF-3 (3-Way)', 'Fin Spider FS-02',
            'Heavy Duty Spider HDS-220', 'Routel Flat Head RF-30'
        ],
        hsn: '83024110'
    },
    {
        type: 'Accessories',
        models: [
            'U-Channel SS304 12mm', 'U-Channel SS304 15mm', 'U-Channel Aluminum 12mm',
            'PVC Magnetic Seal 90D', 'PVC Magnetic Seal 180D', 'PVC Bubble Seal',
            'PVC Bottom Drip Seal', 'Silicone Sealant Clear', 'Silicone Sealant Black',
            'UV Glass Glue Extra-Strong', 'PVC Fin Seal', 'U-Channel SS304 Gold'
        ],
        hsn: '39269099'
    }
];

async function run() {
    // 1. Fetch all existing item names to prevent duplicates
    console.log('Fetching existing item names...');
    const { data: existingItems, error: fetchError } = await supabase.from('items').select('name');
    if (fetchError) {
        console.error('Error fetching existing items:', fetchError);
        return;
    }
    const existingNames = new Set(existingItems.map(item => item.name.trim().toLowerCase()));
    console.log(`Found ${existingNames.size} existing items in DB.`);

    const newItems = [];

    // 2. Generate Glass items
    console.log('Generating Glass items...');
    for (const make of glassMakes) {
        for (const type of glassTypes) {
            for (const thickness of glassThicknesses) {
                // Keep combinations realistic to avoid nonsense items
                if (type === 'Mirror' && thickness > 8) continue;
                if (type === 'Lacquered' && thickness > 8) continue;
                if (type === 'Wire Glass' && (thickness < 6 || thickness > 10)) continue;

                // Loop over sizes
                for (const size of glassSizes) {
                    const color = (type === 'Tinted' || type === 'Lacquered' || type === 'Reflective') 
                        ? colors[Math.floor(Math.random() * colors.length)] 
                        : 'Clear';

                    if (type !== 'Tinted' && type !== 'Lacquered' && type !== 'Reflective' && color !== 'Clear') continue;

                    const name = `${thickness}mm ${type} ${color !== 'Clear' ? color + ' ' : ''}Glass (${make} ${size.w}x${size.h})`;
                    
                    if (existingNames.has(name.toLowerCase())) continue;

                    // Base Rates (INR per Sq. Ft)
                    let baseRate = 35 + (thickness * 6);
                    if (type === 'Toughened') baseRate += 18;
                    if (type === 'Mirror') baseRate += 22;
                    if (type === 'Lacquered') baseRate += 48;
                    if (type === 'Double Glazed') baseRate += 130;
                    if (type === 'Laminated') baseRate += 70;
                    if (type === 'Reflective') baseRate += 35;
                    if (type === 'Ultra Clear') baseRate += 50;
                    if (color !== 'Clear') baseRate += 12;

                    // Premium brand pricing
                    if (make === 'Saint-Gobain') baseRate = Math.round(baseRate * 1.25);
                    else if (make === 'AIS' || make === 'Asahi') baseRate = Math.round(baseRate * 1.12);

                    const rate = Math.round(baseRate);
                    const purchaseRate = Math.round(baseRate * 0.77);

                    let hsn = '70071900';
                    if (type === 'Mirror') hsn = '70099100';
                    if (type === 'Clear Float') hsn = '70051000';
                    if (type === 'Tinted' || type === 'Reflective') hsn = '70052100';

                    newItems.push({
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

    // 3. Generate Hardware items
    console.log('Generating Hardware items...');
    for (const brand of hardwareMakes) {
        for (const cat of hardwareCategories) {
            for (const model of cat.models) {
                const name = `${cat.type} ${model} (${brand})`;
                
                if (existingNames.has(name.toLowerCase())) continue;

                let baseRate = 120;
                if (cat.type === 'Floor Spring') baseRate = 1500 + Math.floor(Math.random() * 3000);
                else if (cat.type === 'Patch Fitting') baseRate = 350 + Math.floor(Math.random() * 1000);
                else if (cat.type === 'Shower Hinge') baseRate = 300 + Math.floor(Math.random() * 1200);
                else if (cat.type === 'Handle') baseRate = 180 + Math.floor(Math.random() * 2000);
                else if (cat.type === 'Lock') baseRate = 300 + Math.floor(Math.random() * 1800);
                else if (cat.type === 'Bracket') baseRate = 50 + Math.floor(Math.random() * 500);
                else if (cat.type === 'Sliding System') baseRate = 2000 + Math.floor(Math.random() * 10000);
                else if (cat.type === 'Spider Fitting') baseRate = 450 + Math.floor(Math.random() * 2500);
                else if (cat.type === 'Accessories') baseRate = 80 + Math.floor(Math.random() * 600);

                if (brand === 'Dorma' || brand === 'Hafele') baseRate = Math.round(baseRate * 1.55);
                else if (brand === 'Ozone' || brand === 'Dorset') baseRate = Math.round(baseRate * 1.20);
                else if (brand === 'ASSA ABLOY' || brand === 'Geze') baseRate = Math.round(baseRate * 1.40);

                const rate = Math.round(baseRate);
                const purchaseRate = Math.round(baseRate * 0.74);

                newItems.push({
                    id: crypto.randomUUID(),
                    name,
                    category: 'hardware',
                    type: cat.type,
                    make: brand,
                    model: model,
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

    console.log(`Generated ${newItems.length} new unique items. Starting database insert...`);

    if (newItems.length === 0) {
        console.log('No new unique items to add.');
        return;
    }

    // Batch insert items to Supabase
    const batchSize = 100;
    for (let i = 0; i < newItems.length; i += batchSize) {
        const batch = newItems.slice(i, i + batchSize);
        const { error } = await supabase.from('items').insert(batch);
        if (error) {
            console.error(`Error inserting batch at ${i}:`, error);
        } else {
            console.log(`Inserted batch ${i / batchSize + 1} / ${Math.ceil(newItems.length / batchSize)}`);
        }
    }
    console.log('Finished inserting entire catalog.');
}

run();
