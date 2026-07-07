import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuthenticatedRequest } from '@/lib/serverAuth';
import { roundCurrency } from '@/lib/utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Encoding Helper ────────────────────────────────────────────────────────────
function decodeFileBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    // Detect UTF-16LE BOM: 0xFF 0xFE
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        return new TextDecoder('utf-16le').decode(buffer);
    }
    // Detect UTF-16BE BOM: 0xFE 0xFF
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        return new TextDecoder('utf-16be').decode(buffer);
    }
    // Default UTF-8
    return new TextDecoder('utf-8').decode(buffer);
}

// ─── Tag Helper ─────────────────────────────────────────────────────────────────
function getTag(content: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i');
    const m = content.match(regex);
    return m ? m[1].trim() : '';
}

// ─── FORMAT A: Tally DSP Display Report Parser (e.g. Stock Summary export) ─────

function parseDSPStockItems(xml: string): any[] {
    const itemMap: Map<string, { qty: number; unit: string; purchaseRate: number }> = new Map();

    // Each stock entry starts with STKVCHPRNITEMTITLE and ends before the next one
    const blocks = xml.split('<STKVCHPRNITEMTITLE>');
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const nameEnd = block.indexOf('</STKVCHPRNITEMTITLE>');
        if (nameEnd === -1) continue;

        const name = block.substring(0, nameEnd).trim();
        if (!name) continue;

        const clQtyStr = getTag(block, 'DSPVCHCLQTY');
        const clAmtStr = getTag(block, 'DSPVCHCLAMT');

        if (!clQtyStr) continue;

        // Parse "5 PCS" or "150.0000 Sqft" or "249.0000 Sqft"
        const qtyParts = clQtyStr.match(/^([\d.]+)\s*(.*)$/);
        const qty = qtyParts ? parseFloat(qtyParts[1]) || 0 : 0;
        const unitRaw = qtyParts ? (qtyParts[2] || '').trim().toLowerCase() : '';
        const unit = unitRaw.includes('sqft') ? 'sqft' : 'nos';

        const amount = Math.abs(parseFloat(clAmtStr.replace(/[^0-9.-]/g, '')) || 0);
        const purchaseRate = qty > 0 ? Math.round((amount / qty) * 100) / 100 : 0;

        // Keep last (most recent) entry per item
        itemMap.set(name, { qty, unit, purchaseRate });
    }

    return Array.from(itemMap.entries()).map(([name, d]) => ({
        id: crypto.randomUUID(),
        name,
        category: 'glass',
        type: 'Standard',
        unit: d.unit,
        stock: d.qty,
        rate: 0,
        purchase_rate: d.purchaseRate,
        thickness: null,
        width: null,
        height: null,
        make: null,
        model: null,
        min_stock: 0,
        hsn_code: null,
        conversion_factor: null,
        warehouse_stock: { 'Warehouse A': d.qty, 'Warehouse B': 0 },
    }));
}

function parseDSPLedgers(xml: string): any[] {
    const partyMap: Map<string, { balance: number; type: string }> = new Map();

    // In ledger DSP exports, items use DSPACCNAME or DSPLEDNAME
    const blocks = xml.split(/<DSPACCNAME>|<DSPLEDNAME>/);
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const nameEnd = block.search(/<\/DSPACCNAME>|<\/DSPLEDNAME>/);
        if (nameEnd === -1) continue;
        const name = block.substring(0, nameEnd).trim();
        if (!name || name.length > 100) continue;

        const parent = getTag(block, 'DSPACCPARENT') || getTag(block, 'DSPLEDPARENT') || '';
        const isCustomer = parent.toLowerCase().includes('debtor') || parent.toLowerCase().includes('receivable');
        const isSupplier = parent.toLowerCase().includes('creditor') || parent.toLowerCase().includes('payable');
        if (!isCustomer && !isSupplier) continue;

        const balStr = getTag(block, 'DSPACCBAL') || getTag(block, 'DSPLEDBAL') || '';
        let balance = parseFloat(balStr.replace(/[^0-9.-]/g, '')) || 0;
        if (balStr.toUpperCase().includes('CR')) balance = -Math.abs(balance);
        else if (balStr.toUpperCase().includes('DR')) balance = Math.abs(balance);

        partyMap.set(name, { balance: roundCurrency(balance), type: isCustomer ? 'customer' : 'supplier' });
    }

    return Array.from(partyMap.entries()).map(([name, d]) => ({
        id: crypto.randomUUID(),
        name,
        type: d.type,
        phone: '',
        address: '',
        balance: d.balance,
    }));
}

// ─── FORMAT B: Standard Tally Exchange Format (STOCKITEM, LEDGER, VOUCHER tags) ─

function parseStandardLedgers(xml: string) {
    const parties: any[] = [];
    const ledgerRegex = /<LEDGER([^>]*)>([\s\S]*?)<\/LEDGER>/g;
    let match;
    while ((match = ledgerRegex.exec(xml)) !== null) {
        const attrs = match[1], content = match[2];
        const name = (attrs.match(/NAME="([^"]*)"/)?.[1] || getTag(content, 'NAME')).trim();
        if (!name) continue;
        const parent = getTag(content, 'PARENT');
        const isCustomer = parent.toLowerCase().includes('debtor');
        const isSupplier = parent.toLowerCase().includes('creditor');
        if (!isCustomer && !isSupplier) continue;
        const bal = getTag(content, 'CLOSINGBALANCE');
        let balance = parseFloat(bal.replace(/[^0-9.-]/g, '')) || 0;
        if (bal.toUpperCase().includes('CR')) balance = -Math.abs(balance);
        parties.push({ id: crypto.randomUUID(), name, type: isCustomer ? 'customer' : 'supplier', phone: getTag(content, 'LEDGERPHONE'), address: getTag(content, 'ADDRESS'), balance: roundCurrency(balance) });
    }
    return parties;
}

function parseStandardStockItems(xml: string) {
    const items: any[] = [];
    const itemRegex = /<STOCKITEM([^>]*)>([\s\S]*?)<\/STOCKITEM>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const attrs = match[1], content = match[2];
        const name = (attrs.match(/NAME="([^"]*)"/)?.[1] || getTag(content, 'NAME')).trim();
        if (!name) continue;
        const baseUnits = getTag(content, 'BASEUNITS') || 'nos';
        const clBal = getTag(content, 'CLOSINGBALANCE');
        const stock = Math.abs(parseFloat(clBal.replace(/[^0-9.-]/g, '')) || 0);
        const rate = parseFloat(getTag(content, 'STANDARDRATE').replace(/[^0-9.-]/g, '')) || 0;
        const pr = parseFloat(getTag(content, 'LASTPURCHASERATE').replace(/[^0-9.-]/g, '')) || 0;
        const unit = baseUnits.toLowerCase().includes('sqft') ? 'sqft' : 'nos';
        items.push({ id: crypto.randomUUID(), name, category: 'glass', type: 'Standard', unit, stock, rate: roundCurrency(rate), purchase_rate: roundCurrency(pr), thickness: null, width: null, height: null, make: null, model: null, min_stock: 0, hsn_code: null, conversion_factor: null, warehouse_stock: { 'Warehouse A': stock, 'Warehouse B': 0 } });
    }
    return items;
}

function parseStandardVouchers(xml: string) {
    const vouchers: any[] = [];
    const invoices: any[] = [];
    const vRx = /<VOUCHER([^>]*)>([\s\S]*?)<\/VOUCHER>/g;
    let match;
    while ((match = vRx.exec(xml)) !== null) {
        const attrs = match[1], content = match[2];
        const vchType = (attrs.match(/VCHTYPE="([^"]*)"/)?.[1] || getTag(content, 'VOUCHERTYPENAME')).toLowerCase();
        const date = getTag(content, 'DATE');
        const fDate = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : new Date().toISOString().split('T')[0];
        const partyName = getTag(content, 'PARTYLEDGERNAME');
        const narration = getTag(content, 'NARRATION');
        let total = 0;
        const ledAmts = content.match(/<AMOUNT>([^<]+)<\/AMOUNT>/g) || [];
        ledAmts.forEach(a => { const v = Math.abs(parseFloat(a.replace(/<[^>]+>/g, '').replace(/[^0-9.-]/g, '')) || 0); if (v > total) total = v; });

        total = roundCurrency(total);
        if (vchType.includes('sales') || vchType.includes('purchase')) {
            invoices.push({ id: crypto.randomUUID(), number: getTag(content, 'VOUCHERNUMBER') || `IMP-${Date.now()}`, date: fDate, type: vchType.includes('sales') ? 'sale' : 'purchase', party_name: partyName, subtotal: total, tax: 0, total, paid: 0, status: 'pending', notes: narration });
        } else if (vchType.includes('receipt') || vchType.includes('payment')) {
            vouchers.push({ id: crypto.randomUUID(), number: getTag(content, 'VOUCHERNUMBER') || `VCH-${Date.now()}`, date: fDate, type: vchType.includes('receipt') ? 'receipt' : 'payment', amount: total, description: narration || `${vchType} - ${partyName}`, mode: 'cash', party_name: partyName });
        }
    }
    return { vouchers, invoices };
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const authError = await requireAuthenticatedRequest(request);
    if (authError) return authError;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const importType = (formData.get('type') as string) || 'auto';

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        // Decode with proper encoding detection (handles UTF-16LE from Tally)
        const buffer = await file.arrayBuffer();
        const xml = decodeFileBuffer(buffer);

        const logs: string[] = [];
        const results: Record<string, number> = {};

        // Detect format: DSP (display) or Standard (exchange)
        const isDSP = xml.includes('STKVCHPRNITEMTITLE') || xml.includes('DSPACCNAME') || xml.includes('DSPLEDNAME');
        
        let formatDesc = '';
        if (isDSP) {
            const subtypes = [];
            if (xml.includes('STKVCHPRNITEMTITLE') || xml.includes('DSPVCHCLQTY')) subtypes.push('Stock Report');
            if (xml.includes('DSPACCNAME') || xml.includes('DSPLEDNAME')) subtypes.push('Ledger Report');
            formatDesc = `Tally Display/Report Export (DSP) [${subtypes.join(', ') || 'Report'}]`;
        } else {
            formatDesc = 'Tally Data Exchange Format (XML Master/Transaction)';
        }

        logs.push(`📄 File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        logs.push(`🔍 Format: ${formatDesc}`);

        // Initialize counts in results to ensure they exist
        results.items = 0;
        results.parties = 0;
        results.invoices = 0;
        results.vouchers = 0;

        // ── Import Stock Items ──
        if (importType === 'auto' || importType === 'items') {
            const items = isDSP ? parseDSPStockItems(xml) : parseStandardStockItems(xml);
            logs.push(`📦 Found ${items.length} stock items in file`);

            if (items.length > 0) {
                let inserted = 0, updated = 0, failed = 0;
                for (const item of items) {
                    const { data: existing } = await supabase.from('items').select('id').ilike('name', item.name).maybeSingle();
                    if (existing) {
                        const { error } = await supabase.from('items').update({ stock: item.stock, purchase_rate: item.purchase_rate, unit: item.unit, warehouse_stock: item.warehouse_stock }).eq('id', existing.id);
                        error ? failed++ : updated++;
                    } else {
                        const { error } = await supabase.from('items').insert(item);
                        error ? (failed++, logs.push(`  ⚠ "${item.name}": ${error.message}`)) : inserted++;
                    }
                }
                results.items = inserted + updated;
                logs.push(`✅ Stock Items: ${inserted} new, ${updated} updated, ${failed} failed`);
            }
        }

        // ── Import Ledgers (Parties) ──
        if (importType === 'auto' || importType === 'ledgers') {
            const parties = isDSP ? parseDSPLedgers(xml) : parseStandardLedgers(xml);
            logs.push(`📋 Found ${parties.length} ledgers (customers/suppliers) in file`);

            if (parties.length > 0) {
                let inserted = 0, updated = 0, failed = 0;
                for (const party of parties) {
                    const { data: existing } = await supabase.from('parties').select('id').ilike('name', party.name).maybeSingle();
                    if (existing) {
                        const { error } = await supabase.from('parties').update({ balance: party.balance, type: party.type }).eq('id', existing.id);
                        error ? failed++ : updated++;
                    } else {
                        const { error } = await supabase.from('parties').insert(party);
                        error ? (failed++, logs.push(`  ⚠ "${party.name}": ${error.message}`)) : inserted++;
                    }
                }
                results.parties = inserted + updated;
                logs.push(`✅ Parties: ${inserted} new, ${updated} updated, ${failed} failed`);
            }
        }

        // ── Import Vouchers (standard format only) ──
        if (!isDSP && (importType === 'auto' || importType === 'vouchers')) {
            const { vouchers, invoices } = parseStandardVouchers(xml);
            logs.push(`🧾 Found ${invoices.length} invoices and ${vouchers.length} vouchers`);
            if (invoices.length > 0) {
                let ok = 0;
                for (const inv of invoices) {
                    if (inv.party_name) {
                        const { data: p } = await supabase.from('parties').select('id').ilike('name', inv.party_name).maybeSingle();
                        if (p) inv.party_id = p.id;
                    }
                    const { error } = await supabase.from('invoices').insert(inv);
                    if (!error) ok++;
                }
                results.invoices = ok;
                logs.push(`✅ Invoices: ${ok} imported`);
            }
            if (vouchers.length > 0) {
                let ok = 0;
                for (const v of vouchers) {
                    if (v.party_name) {
                        const { data: p } = await supabase.from('parties').select('id').ilike('name', v.party_name).maybeSingle();
                        if (p) v.party_id = p.id;
                    }
                    const { error } = await supabase.from('vouchers').insert(v);
                    if (!error) ok++;
                }
                results.vouchers = ok;
                logs.push(`✅ Vouchers: ${ok} imported`);
            }
        }

        // Add helpful guide warnings depending on what they uploaded
        if (isDSP) {
            if (xml.includes('STKVCHPRNITEMTITLE') || xml.includes('DSPVCHCLQTY')) {
                logs.push(`ℹ️ Note: This is a Stock report export. Ledgers and Vouchers are not included in this file.`);
            } else if (xml.includes('DSPACCNAME') || xml.includes('DSPLEDNAME')) {
                logs.push(`ℹ️ Note: This is a Ledger report export. Stock Items and Vouchers are not included in this file.`);
            }
            logs.push(`💡 Tip: To export all masters or all transactions in a single standard XML file, use Tally's top menu: Alt+E (Export) → Masters OR Transactions.`);
        } else {
            if (results.items === 0 && results.parties === 0 && results.invoices === 0 && results.vouchers === 0) {
                logs.push(`⚠ Warning: No supported records found. Verify that the XML file was exported from Tally Prime using Alt+E (Export) → Masters or Transactions.`);
            }
        }

        logs.push(`🎉 Import complete!`);
        return NextResponse.json({ success: true, logs, results });
        return NextResponse.json({ success: true, logs, results });

    } catch (err: any) {
        console.error('Import error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
