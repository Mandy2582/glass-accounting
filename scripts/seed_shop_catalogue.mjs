import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const warehouseStock = quantity => ({ 'Warehouse A': quantity, 'Warehouse B': 0 });

const glass = [
  ['Clear Float Glass 4mm', 'Clear Float', 'Standard Clear', 4, 72, 96, 58, 42, 1200, '70052990'],
  ['Clear Float Glass 5mm', 'Clear Float', 'Standard Clear', 5, 72, 96, 68, 50, 1200, '70052990'],
  ['Clear Float Glass 6mm', 'Clear Float', 'Standard Clear', 6, 72, 96, 82, 62, 1000, '70052990'],
  ['Ultra Clear Low Iron Glass 6mm', 'Clear Float', 'Low Iron / Extra Clear', 6, 72, 96, 145, 112, 650, '70052990'],
  ['Reflective Glass Blue 5mm', 'Reflective Glass', 'Blue Reflective', 5, 72, 96, 96, 74, 700, '70052110'],
  ['Reflective Glass Green 5mm', 'Reflective Glass', 'Green Reflective', 5, 72, 96, 96, 74, 700, '70052110'],
  ['Reflective Glass Grey 6mm', 'Reflective Glass', 'Grey Reflective', 6, 72, 96, 118, 90, 650, '70052110'],
  ['Tinted Bronze Glass 5mm', 'Tinted Glass', 'Bronze', 5, 72, 96, 88, 68, 760, '70052190'],
  ['Tinted Grey Glass 5mm', 'Tinted Glass', 'Grey', 5, 72, 96, 88, 68, 760, '70052190'],
  ['Tinted Green Glass 5mm', 'Tinted Glass', 'Green', 5, 72, 96, 92, 70, 720, '70052190'],
  ['Toughened Clear Glass 8mm', 'Toughened Glass', 'Clear Toughened', 8, 72, 96, 135, 104, 500, '70071900'],
  ['Toughened Clear Glass 10mm', 'Toughened Glass', 'Clear Toughened', 10, 72, 96, 165, 128, 450, '70071900'],
  ['Toughened Clear Glass 12mm', 'Toughened Glass', 'Clear Toughened', 12, 72, 96, 210, 166, 380, '70071900'],
  ['Toughened Frosted Glass 10mm', 'Toughened Glass', 'Frosted Toughened', 10, 72, 96, 205, 160, 320, '70071900'],
  ['Fluted Glass 5mm', 'Fluted Glass', 'Narrow Reeded', 5, 48, 84, 155, 118, 420, '70031290'],
  ['Fluted Glass 8mm', 'Fluted Glass', 'Wide Reeded', 8, 48, 84, 245, 188, 320, '70031290'],
  ['Patterned Mistlite Glass 5mm', 'Fluted Glass', 'Mistlite Pattern', 5, 48, 84, 128, 98, 380, '70031290'],
  ['Silver Mirror 4mm', 'Mirror', 'Standard Silver', 4, 48, 72, 82, 62, 600, '70099100'],
  ['Saint-Gobain Mirror 5mm', 'Mirror', 'Premium Silver', 5, 48, 72, 118, 92, 480, '70099100'],
  ['Bronze Mirror 5mm', 'Mirror', 'Bronze Mirror', 5, 48, 72, 145, 112, 300, '70099100'],
  ['Round Wall Mirror 24 Inch', 'Mirror', 'Round Mirror', 5, 24, 24, 1850, 1350, 24, '70099100'],
  ['Round Wall Mirror 30 Inch', 'Mirror', 'Round Mirror', 5, 30, 30, 2450, 1800, 18, '70099100'],
  ['Oval Designer Mirror 24 x 36 Inch', 'Mirror', 'Oval Designer Mirror', 5, 24, 36, 3250, 2400, 14, '70099100'],
  ['Arched Decorative Mirror 24 x 42 Inch', 'Mirror', 'Arched Decorative Mirror', 5, 24, 42, 3850, 2850, 10, '70099100'],
  ['Bevelled Wall Mirror 24 x 36 Inch', 'Mirror', 'Bevelled Designer Mirror', 5, 24, 36, 2950, 2200, 16, '70099100'],
  ['LED Bathroom Mirror 24 x 36 Inch', 'Mirror', 'LED Backlit Mirror', 5, 24, 36, 5200, 3900, 12, '70099100'],
  ['LED Vanity Mirror 30 x 42 Inch', 'Mirror', 'LED Vanity Mirror', 5, 30, 42, 6800, 5100, 8, '70099100'],
  ['Touch Sensor LED Mirror 24 x 36 Inch', 'Mirror', 'Touch Sensor LED Mirror', 5, 24, 36, 7600, 5700, 7, '70099100'],
];

const hardware = [
  ['D Handle 300mm Stainless Steel', 'Handle', 'D Handle', 'Ozone', 'DH-300-SS', 420, 300, 40, '83024110'],
  ['D Handle 450mm Stainless Steel', 'Handle', 'D Handle', 'Ozone', 'DH-450-SS', 640, 470, 35, '83024110'],
  ['H Handle 600mm Stainless Steel', 'Handle', 'H Handle', 'Dorma', 'HH-600-SS', 1250, 920, 25, '83024110'],
  ['Glass Door Lock Single', 'Lock', 'Single Door Lock', 'Ozone', 'GL-85', 1450, 1050, 20, '83014090'],
  ['Glass Door Lock Double', 'Lock', 'Double Door Lock', 'Dorma', 'GL-86', 2200, 1680, 18, '83014090'],
  ['Sliding Door Lock', 'Lock', 'Sliding Lock', 'Dorset', 'SL-99', 980, 720, 22, '83014090'],
  ['Shower Hinge Glass to Wall 90 Degree', 'Hinge', 'Shower Hinge', 'Ozone', 'SH-90-GW', 1250, 910, 24, '83024110'],
  ['Shower Hinge Glass to Glass 180 Degree', 'Hinge', 'Shower Hinge', 'Ozone', 'SH-180-GG', 1380, 990, 18, '83024110'],
  ['Top Patch Fitting', 'Patch Fitting', 'Top Patch', 'Ozone', 'PT-20', 860, 620, 28, '83024110'],
  ['Bottom Patch Fitting', 'Patch Fitting', 'Bottom Patch', 'Ozone', 'PT-10', 980, 720, 28, '83024110'],
  ['Overpanel Patch Fitting', 'Patch Fitting', 'Overpanel Patch', 'Dorma', 'PT-30', 1120, 840, 18, '83024110'],
  ['Floor Spring Medium Duty', 'Floor Spring', 'Medium Duty', 'Ozone', 'FS-74', 2850, 2120, 12, '83024110'],
  ['Floor Spring Heavy Duty', 'Floor Spring', 'Heavy Duty', 'Dorma', 'BTS-75V', 5200, 4100, 8, '83024110'],
  ['Shower Sliding Kit', 'Sliding System', 'Shower Sliding', 'Ozone', 'SS-30', 6800, 5200, 6, '83024110'],
  ['Barn Door Sliding Kit', 'Sliding System', 'Barn Door', 'Dorset', 'BD-80', 7200, 5400, 5, '83024110'],
  ['L Connector Shower Bracket', 'Bracket', 'L Connector', 'Ozone', 'LC-90', 320, 220, 60, '83024110'],
  ['Glass Shelf D Clamp', 'Bracket', 'D Clamp', 'Ozone', 'DC-01', 240, 160, 80, '83024110'],
  ['Balustrade Spigot', 'Bracket', 'Spigot', 'Icon', 'SP-01', 1550, 1180, 20, '83024110'],
];

const items = [
  ...glass.map(([name, type, model, thickness, width, height, rate, purchaseRate, stock, hsnCode]) => ({
    id: crypto.randomUUID(),
    name,
    category: 'glass',
    type,
    make: 'General',
    model,
    thickness,
    width,
    height,
    unit: 'sqft',
    stock,
    warehouse_stock: warehouseStock(stock),
    min_stock: 100,
    rate,
    purchase_rate: purchaseRate,
    hsn_code: hsnCode,
    conversion_factor: 1,
  })),
  ...hardware.map(([name, type, model, make, code, rate, purchaseRate, stock, hsnCode]) => ({
    id: crypto.randomUUID(),
    name,
    category: 'hardware',
    type,
    make,
    model: `${model} ${code}`,
    thickness: 0,
    width: 0,
    height: 0,
    unit: 'nos',
    stock,
    warehouse_stock: warehouseStock(stock),
    min_stock: 5,
    rate,
    purchase_rate: purchaseRate,
    hsn_code: hsnCode,
    conversion_factor: 0,
  })),
];

async function run() {
  const { data: existing, error: existingError } = await supabase
    .from('items')
    .select('name');

  if (existingError) {
    console.error('Could not read existing inventory:', existingError);
    process.exit(1);
  }

  const existingNames = new Set((existing || []).map(item => String(item.name || '').trim().toLowerCase()));
  const toInsert = items.filter(item => !existingNames.has(item.name.trim().toLowerCase()));

  if (toInsert.length === 0) {
    console.log('Shop catalogue already seeded. No new items added.');
    return;
  }

  const { error } = await supabase.from('items').insert(toInsert);
  if (error) {
    console.error('Could not seed shop catalogue:', error);
    process.exit(1);
  }

  console.log(`Seeded ${toInsert.length} shop catalogue items.`);
}

run();
