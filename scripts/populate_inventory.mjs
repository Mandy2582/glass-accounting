import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const items = [
    // GLASS
    {
        name: '12mm Toughened Clear Glass (Saint-Gobain)',
        category: 'glass',
        type: 'Toughened',
        make: 'Saint-Gobain',
        model: '',
        thickness: 12,
        width: 72,
        height: 96,
        unit: 'sqft',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 50,
        rate: 110,
        purchase_rate: 85,
        hsn_code: '70071900',
        conversion_factor: 1
    },
    {
        name: '8mm Toughened Clear Glass (Saint-Gobain)',
        category: 'glass',
        type: 'Toughened',
        make: 'Saint-Gobain',
        model: '',
        thickness: 8,
        width: 72,
        height: 96,
        unit: 'sqft',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 50,
        rate: 85,
        purchase_rate: 65,
        hsn_code: '70071900',
        conversion_factor: 1
    },
    {
        name: '10mm Toughened Clear Glass (AIS)',
        category: 'glass',
        type: 'Toughened',
        make: 'AIS',
        model: '',
        thickness: 10,
        width: 72,
        height: 96,
        unit: 'sqft',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 50,
        rate: 95,
        purchase_rate: 72,
        hsn_code: '70071900',
        conversion_factor: 1
    },
    {
        name: '6mm Clear Mirror (ModiGuard)',
        category: 'glass',
        type: 'Mirror',
        make: 'ModiGuard',
        model: '',
        thickness: 6,
        width: 48,
        height: 72,
        unit: 'sqft',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 30,
        rate: 75,
        purchase_rate: 58,
        hsn_code: '70099100',
        conversion_factor: 1
    },
    {
        name: '5mm Tinted Bronze Glass (Saint-Gobain)',
        category: 'glass',
        type: 'Tinted',
        make: 'Saint-Gobain',
        model: '',
        thickness: 5,
        width: 60,
        height: 96,
        unit: 'sqft',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 20,
        rate: 80,
        purchase_rate: 62,
        hsn_code: '70052100',
        conversion_factor: 1
    },
    {
        name: '4mm Lacquered Extra White (Saint-Gobain)',
        category: 'glass',
        type: 'Lacquered',
        make: 'Saint-Gobain',
        model: '',
        thickness: 4,
        width: 72,
        height: 96,
        unit: 'sqft',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 15,
        rate: 180,
        purchase_rate: 140,
        hsn_code: '70071900',
        conversion_factor: 1
    },
    {
        name: '4mm Lacquered Black (Saint-Gobain)',
        category: 'glass',
        type: 'Lacquered',
        make: 'Saint-Gobain',
        model: '',
        thickness: 4,
        width: 72,
        height: 96,
        unit: 'sqft',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 15,
        rate: 165,
        purchase_rate: 130,
        hsn_code: '70071900',
        conversion_factor: 1
    },
    // HARDWARE
    {
        name: 'Floor Spring FS-84 (Dorma)',
        category: 'hardware',
        type: 'Floor Spring',
        make: 'Dorma',
        model: 'FS-84',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 10,
        rate: 3800,
        purchase_rate: 2900,
        hsn_code: '83024110',
        conversion_factor: 0
    },
    {
        name: 'Floor Spring FS-74 (Ozone)',
        category: 'hardware',
        type: 'Floor Spring',
        make: 'Ozone',
        model: 'FS-74',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 10,
        rate: 2600,
        purchase_rate: 1950,
        hsn_code: '83024110',
        conversion_factor: 0
    },
    {
        name: 'Corner Patch PT-10 (Ozone)',
        category: 'hardware',
        type: 'Patch Fitting',
        make: 'Ozone',
        model: 'PT-10',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 25,
        rate: 850,
        purchase_rate: 620,
        hsn_code: '83024110',
        conversion_factor: 0
    },
    {
        name: 'Top Patch PT-20 (Ozone)',
        category: 'hardware',
        type: 'Patch Fitting',
        make: 'Ozone',
        model: 'PT-20',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 25,
        rate: 850,
        purchase_rate: 620,
        hsn_code: '83024110',
        conversion_factor: 0
    },
    {
        name: 'Glass Door Lock GL-85 (Dorset)',
        category: 'hardware',
        type: 'Lock',
        make: 'Dorset',
        model: 'GL-85',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 15,
        rate: 1450,
        purchase_rate: 1100,
        hsn_code: '83014090',
        conversion_factor: 0
    },
    {
        name: 'Shower Hinge 90deg Chrome (Ozone)',
        category: 'hardware',
        type: 'Shower Hinge',
        make: 'Ozone',
        model: 'SH-90-C',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 20,
        rate: 980,
        purchase_rate: 720,
        hsn_code: '83024110',
        conversion_factor: 0
    },
    {
        name: 'D-Handle 300mm SS304 (Dorset)',
        category: 'hardware',
        type: 'Handle',
        make: 'Dorset',
        model: 'DH-300-SS',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 15,
        rate: 1150,
        purchase_rate: 850,
        hsn_code: '83024110',
        conversion_factor: 0
    },
    {
        name: 'T-Handle 450mm SS (Ozone)',
        category: 'hardware',
        type: 'Handle',
        make: 'Ozone',
        model: 'TH-450',
        thickness: 0,
        width: 0,
        height: 0,
        unit: 'nos',
        stock: 0,
        warehouse_stock: { 'Warehouse A': 0, 'Warehouse B': 0 },
        min_stock: 15,
        rate: 1550,
        purchase_rate: 1200,
        hsn_code: '83024110',
        conversion_factor: 0
    }
];

async function run() {
    console.log('Inserting items...');
    for (const item of items) {
        const id = crypto.randomUUID();
        const { error } = await supabase.from('items').insert({
            id,
            ...item
        });
        if (error) {
            console.error(`Error inserting ${item.name}:`, error);
        } else {
            console.log(`Successfully inserted: ${item.name}`);
        }
    }
    console.log('Finished inserting items.');
}

run();
