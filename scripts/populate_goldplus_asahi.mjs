import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const makes = ['Gold Plus', 'Asahi'];
const glassTypes = ['Toughened', 'Clear Float', 'Mirror', 'Lacquered', 'Tinted', 'Frosted'];
const glassThicknesses = [4, 5, 6, 8, 10, 12, 15];
const glassSizes = [
    { w: 48, h: 72 },
    { w: 48, h: 96 },
    { w: 60, h: 96 },
    { w: 72, h: 96 },
    { w: 72, h: 120 }
];
const colors = ['Clear', 'Bronze', 'Grey', 'Green', 'Extra White', 'Black'];

function generateItems() {
    const list = [];
    for (const make of makes) {
        for (const type of glassTypes) {
            for (const thickness of glassThicknesses) {
                if (type === 'Mirror' && thickness > 8) continue;
                if (type === 'Lacquered' && thickness > 8) continue;

                for (const size of glassSizes) {
                    const color = (type === 'Tinted' || type === 'Lacquered') 
                        ? colors[Math.floor(Math.random() * colors.length)] 
                        : 'Clear';

                    if (type !== 'Tinted' && type !== 'Lacquered' && color !== 'Clear') continue;

                    const name = `${thickness}mm ${type} ${color !== 'Clear' ? color + ' ' : ''}Glass (${make} ${size.w}x${size.h})`;
                    
                    let baseRate = 30 + (thickness * 5);
                    if (type === 'Toughened') baseRate += 12;
                    if (type === 'Mirror') baseRate += 18;
                    if (type === 'Lacquered') baseRate += 40;
                    if (color !== 'Clear') baseRate += 10;

                    const purchaseRate = Math.round(baseRate * 0.76);
                    const rate = Math.round(baseRate);

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
                        min_stock: 15,
                        rate,
                        purchase_rate: purchaseRate,
                        hsn_code: hsn,
                        conversion_factor: 1
                    });
                }
            }
        }
    }
    return list;
}

async function run() {
    const items = generateItems();
    console.log(`Generated ${items.length} Gold Plus & Asahi glass items. Inserting in batches...`);
    
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const { error } = await supabase.from('items').insert(batch);
        
        if (error) {
            console.error(`Error inserting batch starting at index ${i}:`, error);
        } else {
            console.log(`Successfully inserted batch ${i / batchSize + 1} / ${Math.ceil(items.length / batchSize)}`);
        }
    }
    console.log('Finished inserting Gold Plus and Asahi items.');
}

run();
