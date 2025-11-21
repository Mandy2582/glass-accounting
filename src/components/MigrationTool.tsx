'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UploadCloud } from 'lucide-react';

export default function MigrationTool() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    const migrateData = async () => {
        if (!confirm('This will upload your local data to the cloud. Continue?')) return;

        setLoading(true);
        setStatus('Reading local data...');

        try {
            // Read from localStorage directly since db.* now points to Supabase
            const getLocal = (key: string) => {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : [];
            };

            const items = getLocal('glass_items');
            const parties = getLocal('glass_parties');
            const invoices = getLocal('glass_invoices');
            // ... other entities

            setStatus(`Found ${items.length} items, ${parties.length} parties, ${invoices.length} invoices.`);

            // Map old IDs to new UUIDs to preserve relationships
            const idMap: Record<string, string> = {};
            const getNewId = (oldId: string) => {
                if (!oldId) return crypto.randomUUID();
                if (!idMap[oldId]) {
                    // Check if it's already a valid UUID, if so keep it, else generate new
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oldId);
                    idMap[oldId] = isUUID ? oldId : crypto.randomUUID();
                }
                return idMap[oldId];
            };

            // 1. Upload Items
            if (items.length > 0) {
                setStatus('Uploading items...');
                const dbItems = items.map((item: any) => ({
                    id: getNewId(item.id),
                    name: item.name,
                    category: item.category || 'glass',
                    type: item.type,
                    make: item.make,
                    model: item.model,
                    thickness: item.thickness,
                    width: item.width,
                    height: item.height,
                    unit: item.unit,
                    stock: item.stock,
                    warehouse_stock: item.warehouseStock,
                    min_stock: item.minStock,
                    rate: item.rate,
                    purchase_rate: item.purchaseRate,
                    hsn_code: item.hsnCode
                }));
                const { error } = await supabase.from('items').upsert(dbItems);
                if (error) throw error;
            }

            // 2. Upload Parties
            if (parties.length > 0) {
                setStatus('Uploading parties...');
                const dbParties = parties.map((party: any) => ({
                    id: getNewId(party.id),
                    name: party.name,
                    type: party.type,
                    phone: party.phone,
                    email: party.email,
                    address: party.address,
                    gstin: party.gstin,
                    balance: party.balance
                }));
                const { error } = await supabase.from('parties').upsert(dbParties);
                if (error) throw error;
            }

            // 3. Upload Invoices
            if (invoices.length > 0) {
                setStatus('Uploading invoices...');
                for (const inv of invoices) {
                    const newInvId = getNewId(inv.id);

                    // Insert Invoice
                    const { error: invError } = await supabase.from('invoices').insert({
                        id: newInvId,
                        type: inv.type || 'sale', // Default to 'sale' if missing
                        number: inv.number,
                        supplier_invoice_number: inv.supplierInvoiceNumber,
                        date: inv.date,
                        party_id: idMap[inv.partyId], // Use mapped Party ID
                        party_name: inv.partyName,
                        subtotal: inv.subtotal,
                        tax_rate: inv.taxRate,
                        tax_amount: inv.taxAmount,
                        total: inv.total,
                        paid_amount: inv.paidAmount,
                        status: inv.status
                    });
                    if (invError) throw invError;

                    // Insert Invoice Items
                    if (inv.items && inv.items.length > 0) {
                        const dbInvItems = inv.items.map((item: any) => ({
                            invoice_id: newInvId,
                            item_id: idMap[item.itemId], // Use mapped Item ID
                            item_name: item.itemName,
                            description: item.description,
                            quantity: item.quantity,
                            unit: item.unit,
                            width: item.width,
                            height: item.height,
                            sqft: item.sqft,
                            rate: item.rate,
                            amount: item.amount,
                            warehouse: item.warehouse
                        }));
                        const { error: itemsError } = await supabase.from('invoice_items').insert(dbInvItems);
                        if (itemsError) throw itemsError;
                    }
                }
            }

            setStatus('Migration complete! You can now use the app online.');
        } catch (error: any) {
            console.error(error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card" style={{ marginTop: '2rem', border: '1px dashed var(--color-border)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Data Migration</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                Move your local data to the cloud database.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                    onClick={migrateData}
                    disabled={loading}
                    className="btn"
                    style={{ background: '#4f46e5', color: 'white' }}
                >
                    <UploadCloud size={16} />
                    {loading ? 'Migrating...' : 'Upload Local Data'}
                </button>
                {status && <span style={{ fontSize: '0.875rem' }}>{status}</span>}
            </div>
        </div>
    );
}
