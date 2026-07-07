import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const brands = ['Dorma', 'Ozone', 'Icon', 'Trudoor', 'Dorset'];

const hardwareSpecs = [
    {
        type: 'Floor Spring',
        models: ['FS-60', 'FS-74', 'FS-84', 'FS-90', 'BTS-75V', 'BTS-80', 'BTS-84', 'HFS-500', 'FS-200', 'BTS-65'],
        hsn: '83024110'
    },
    {
        type: 'Patch Fitting',
        models: [
            'PT-10 (Bottom Patch)', 
            'PT-20 (Top Patch)', 
            'PT-30 (Overpanel)', 
            'PT-40 (Sidepanel)', 
            'PT-50 (Overpanel Pivot)', 
            'US-10 (Lock Patch)', 
            'PT-24 (Top Pivot)', 
            'PT-80 (Overpanel Lock)',
            'PT-90 (Double Overpanel)'
        ],
        hsn: '83024110'
    },
    {
        type: 'Shower Hinge',
        models: [
            'SH-90-GW (Glass-Wall 90°)', 
            'SH-180-GG (Glass-Glass 180°)', 
            'SH-135-GG (Glass-Glass 135°)', 
            'SH-90-GG (Glass-Glass 90°)',
            'SH-Heavy-Duty'
        ],
        hsn: '83024110'
    },
    {
        type: 'Handle',
        models: [
            'DH-300-SS (D-Handle 300mm)', 
            'DH-450-SS (D-Handle 450mm)', 
            'DH-600-SS (D-Handle 600mm)', 
            'HH-450-SS (H-Handle 450mm)', 
            'HH-600-SS (H-Handle 600mm)', 
            'HH-900-SS (H-Handle 900mm)', 
            'TH-300 (T-Handle 300mm)', 
            'TH-450 (T-Handle 450mm)'
        ],
        hsn: '83024110'
    },
    {
        type: 'Lock',
        models: [
            'GL-85 (Single Door Lock)', 
            'GL-86 (Double Door Lock)', 
            'SL-99 (Sliding Door Lock)', 
            'Strike-PL (Strike Plate)', 
            'Deadbolt GL-12', 
            'Magnetic Lock ML-280', 
            'Latch Lock LL-10'
        ],
        hsn: '83014090'
    },
    {
        type: 'Bracket',
        models: [
            'Balustrade Spigot SP-1', 
            'Standoff Pin 38x38', 
            'Standoff Pin 38x50', 
            'Standoff Pin 50x50', 
            'D-Clamp DC-01', 
            'D-Clamp DC-02', 
            'L-Bracket Glass-Glass',
            'Glass Clip GC-90'
        ],
        hsn: '83024110'
    },
    {
        type: 'Sliding System',
        models: [
            'Syncro SL-100 Kit', 
            'Telescopic SL-200 Kit', 
            'Soft-Close SC-80 Kit', 
            'Shower Sliding Kit SS-30', 
            'Heavy Duty Sliding HDS-150',
            'Sleek Sliding System SS-80'
        ],
        hsn: '83024110'
    },
    {
        type: 'Spider Fitting',
        models: [
            'SF-1 (1-Way)', 
            'SF-2 (2-Way)', 
            'SF-4 (4-Way)', 
            'Fin Spider FS-01', 
            'Connector Bolt CB-10', 
            'Articulated Routel AR-02'
        ],
        hsn: '83024110'
    }
];

async function run() {
    // 1. Fetch all existing items from DB to prevent duplicates
    console.log('Fetching existing items from database...');
    const { data: existingItems, error: fetchError } = await supabase.from('items').select('name, make, model');
    if (fetchError) {
        console.error('Error fetching existing items:', fetchError);
        return;
    }

    // Map to a key set for lookup
    const existingKeys = new Set(
        existingItems.map(item => `${(item.name || '').trim().toLowerCase()}`)
    );

    const newItems = [];

    // 2. Generate hardware items combinatorially
    for (const brand of brands) {
        for (const spec of hardwareSpecs) {
            for (const model of spec.models) {
                // Formatting standard name: e.g. "Floor Spring FS-84 (Dorma)"
                const name = `${spec.type} ${model} (${brand})`;
                
                // If it already exists, skip it
                if (existingKeys.has(name.trim().toLowerCase())) {
                    continue;
                }

                // Rates based on category and brand
                let baseRate = 120;
                if (spec.type === 'Floor Spring') baseRate = 1600 + Math.floor(Math.random() * 2000);
                if (spec.type === 'Patch Fitting') baseRate = 400 + Math.floor(Math.random() * 800);
                if (spec.type === 'Shower Hinge') baseRate = 350 + Math.floor(Math.random() * 900);
                if (spec.type === 'Handle') baseRate = 200 + Math.floor(Math.random() * 1500);
                if (spec.type === 'Lock') baseRate = 350 + Math.floor(Math.random() * 1200);
                if (spec.type === 'Bracket') baseRate = 60 + Math.floor(Math.random() * 400);
                if (spec.type === 'Sliding System') baseRate = 2200 + Math.floor(Math.random() * 8000);
                if (spec.type === 'Spider Fitting') baseRate = 500 + Math.floor(Math.random() * 1800);

                // Brand premium multipliers
                if (brand === 'Dorma') {
                    baseRate = Math.round(baseRate * 1.55);
                } else if (brand === 'Ozone' || brand === 'Dorset') {
                    baseRate = Math.round(baseRate * 1.18);
                } else if (brand === 'Icon' || brand === 'Trudoor') {
                    baseRate = Math.round(baseRate * 0.95);
                }

                const purchaseRate = Math.round(baseRate * 0.74);
                const rate = Math.round(baseRate);

                newItems.push({
                    id: crypto.randomUUID(),
                    name,
                    category: 'hardware',
                    type: spec.type,
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
                    hsn_code: spec.hsn,
                    conversion_factor: 0
                });
            }
        }
    }

    console.log(`Generated ${newItems.length} new hardware items (excluding existing duplicates).`);
    
    if (newItems.length === 0) {
        console.log('No new items to insert.');
        return;
    }

    // 3. Batch insert new items
    const batchSize = 100;
    for (let i = 0; i < newItems.length; i += batchSize) {
        const batch = newItems.slice(i, i + batchSize);
        const { error } = await supabase.from('items').insert(batch);
        if (error) {
            console.error(`Error inserting batch starting at index ${i}:`, error);
        } else {
            console.log(`Successfully inserted batch ${i / batchSize + 1} / ${Math.ceil(newItems.length / batchSize)}`);
        }
    }
    console.log('Finished inserting hardware items.');
}

run();
