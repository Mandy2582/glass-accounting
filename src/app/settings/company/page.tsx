'use client';

import { useState, useEffect } from 'react';
import { Save, Building2, AlertCircle, Truck } from 'lucide-react';
import { db } from '@/lib/storage';
import { BusinessConfig, GSTType } from '@/types';
import { GST_STATE_CODES } from '@/lib/gstStateCodes';
import { getAuthHeaders } from '@/lib/auth';

export default function CompanySettingsPage() {
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [businessConfig, setBusinessConfig] = useState<BusinessConfig>(db.businessConfig.getDefaults());
    const [savingBusiness, setSavingBusiness] = useState(false);
    const [businessLoading, setBusinessLoading] = useState(true);

    useEffect(() => {
        loadBusinessConfig();
    }, []);

    const loadBusinessConfig = async () => {
        setBusinessLoading(true);
        try {
            const config = await db.businessConfig.get();
            setBusinessConfig(config);
        } catch (error) {
            console.error('Error loading business config:', error);
        } finally {
            setBusinessLoading(false);
        }
    };

    const handleSaveBusinessConfig = async () => {
        setSavingBusiness(true);
        try {
            await db.businessConfig.update(businessConfig);
            setMessage({ type: 'success', text: 'Business configuration saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving business config:', error);
            setMessage({ type: 'error', text: 'Failed to save business configuration' });
        } finally {
            setSavingBusiness(false);
        }
    };

    return (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Building2 size={24} />
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Company Details</h2>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Your business details for invoices and GST</p>
                    </div>
                </div>
            </div>
            <div style={{ padding: '1.5rem' }}>
                {message && (
                    <div style={{
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        borderRadius: '0.5rem',
                        background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                        color: message.type === 'success' ? '#166534' : '#991b1b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <AlertCircle size={20} />
                        {message.text}
                    </div>
                )}
                {businessLoading ? (
                    <p>Loading business configuration...</p>
                ) : (
                    <>
                        {/* Business Identity */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-primary)' }}>🏢 Business Identity</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Business Name *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.businessName}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, businessName: e.target.value })}
                                        placeholder="Arjun Glass House"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Tagline</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.tagline || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, tagline: e.target.value })}
                                        placeholder="Premium Glass Solutions"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>GSTIN</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.gstin || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, gstin: e.target.value.toUpperCase() })}
                                        placeholder="03AABCU9603R1ZM"
                                        maxLength={15}
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>PAN</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.pan || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, pan: e.target.value.toUpperCase() })}
                                        placeholder="AABCU9603R"
                                        maxLength={10}
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Contact & Address */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-primary)' }}>📍 Contact & Address</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Address</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.address}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, address: e.target.value })}
                                        placeholder="Shop No. 5, Glass Market"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>City</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.city}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, city: e.target.value })}
                                        placeholder="Ludhiana"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>State</label>
                                    <select
                                        className="input"
                                        value={businessConfig.stateCode || ''}
                                        onChange={(e) => {
                                            const code = e.target.value;
                                            const name = GST_STATE_CODES.find(s => s.code === code)?.name || businessConfig.state;
                                            setBusinessConfig({ ...businessConfig, stateCode: code, state: name });
                                        }}
                                    >
                                        <option value="">Select state</option>
                                        {GST_STATE_CODES.map(s => (
                                            <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                        ))}
                                    </select>
                                    <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        The GST state code is needed for e-Way Bill/e-Invoice generation.
                                    </small>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Pincode</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.pincode}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, pincode: e.target.value })}
                                        placeholder="141001"
                                        maxLength={6}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Phone *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.phone}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, phone: e.target.value })}
                                        placeholder="+91 98765 43210"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Email</label>
                                    <input
                                        type="email"
                                        className="input"
                                        value={businessConfig.email || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, email: e.target.value })}
                                        placeholder="info@arjunglasshouse.com"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Bank Details */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-primary)' }}>🏦 Bank & Payment Details</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Bank Name</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.bankName || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, bankName: e.target.value })}
                                        placeholder="State Bank of India"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Account Number</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.bankAccountNumber || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, bankAccountNumber: e.target.value })}
                                        placeholder="1234567890"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>IFSC Code</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.bankIfsc || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, bankIfsc: e.target.value.toUpperCase() })}
                                        placeholder="SBIN0001234"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Branch</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.bankBranch || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, bankBranch: e.target.value })}
                                        placeholder="Main Branch, Ludhiana"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>UPI ID</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.upiId || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, upiId: e.target.value.trim() })}
                                        placeholder="arjunglasshouse@upi"
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Customer Payment Instructions</label>
                                    <textarea
                                        className="input"
                                        value={businessConfig.paymentInstructions || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, paymentInstructions: e.target.value })}
                                        placeholder="Payment is verified by staff after receipt. Please mention the order number while paying."
                                        rows={3}
                                        style={{ minHeight: '86px', resize: 'vertical' }}
                                    />
                                    <small style={{ display: 'block', marginTop: '0.375rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        Shown on online checkout and saved inside online order notes.
                                    </small>
                                </div>
                            </div>
                        </div>

                        {/* Invoice & GST Settings */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-primary)' }}>🧾 Invoice & GST Settings</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Invoice Prefix</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.invoicePrefix}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, invoicePrefix: e.target.value.toUpperCase() })}
                                        placeholder="AGH"
                                        maxLength={5}
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                    <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        e.g. {businessConfig.invoicePrefix}/25-26/001
                                    </small>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Default GST Rate (%)</label>
                                    <select
                                        className="input"
                                        value={businessConfig.defaultGstRate}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, defaultGstRate: Number(e.target.value) })}
                                    >
                                        <option value={0}>0% (No GST)</option>
                                        <option value={5}>5%</option>
                                        <option value={12}>12%</option>
                                        <option value={18}>18%</option>
                                        <option value={28}>28%</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Default GST Type</label>
                                    <select
                                        className="input"
                                        value={businessConfig.defaultGstType}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, defaultGstType: e.target.value as GSTType })}
                                    >
                                        <option value="intra_state">Intra-State (CGST + SGST)</option>
                                        <option value="inter_state">Inter-State (IGST)</option>
                                        <option value="none">No GST</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Financial Year Start</label>
                                    <select
                                        className="input"
                                        value={businessConfig.financialYearStart}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, financialYearStart: Number(e.target.value) })}
                                    >
                                        <option value={1}>January</option>
                                        <option value={4}>April (Indian FY)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Default Glass HSN Code</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.defaultGlassHsnCode || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, defaultGlassHsnCode: e.target.value })}
                                        placeholder="7005"
                                        maxLength={8}
                                    />
                                    <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        Used for e-Way Bill/e-Invoice on custom/design order lines with no catalogue item (e.g. Toughened Glass). Catalogue items use their own HSN code instead.
                                    </small>
                                </div>
                            </div>
                        </div>

                        {/* GST e-Way Bill Integration */}
                        <EwayBillStatusSection />

                        {/* Tally Prime Integration */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-primary)' }}>🔌 Tally Prime Integration</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Tally Server IP Address</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.tallyServerIp || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, tallyServerIp: e.target.value })}
                                        placeholder="192.168.1.100"
                                    />
                                    <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        The local IP of the machine running Tally
                                    </small>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Tally ODBC/XML Port</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.tallyServerPort || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, tallyServerPort: e.target.value })}
                                        placeholder="9000"
                                    />
                                    <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        Default is 9000
                                    </small>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '0.875rem' }}>Exact Tally Company Name</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={businessConfig.tallyCompanyName || ''}
                                        onChange={(e) => setBusinessConfig({ ...businessConfig, tallyCompanyName: e.target.value })}
                                        placeholder="Arjun Glass House"
                                    />
                                    <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        Must exactly match the name in Tally
                                    </small>
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                            <button
                                className="btn"
                                onClick={loadBusinessConfig}
                                disabled={savingBusiness}
                                style={{ background: '#f1f5f9', border: '1px solid var(--color-border)' }}
                            >
                                Reset
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveBusinessConfig}
                                disabled={savingBusiness}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Save size={18} />
                                {savingBusiness ? 'Saving...' : 'Save Business Config'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Credentials themselves live in server env vars (CLEARTAX_BASE_URL/
// CLEARTAX_AUTH_TOKEN/EWB_GSTIN), not this page -- same pattern as the
// WhatsApp/SMTP integrations, which are also server-only secrets. This
// just shows whether they're configured and lets you check connectivity
// before relying on them from an order.
function EwayBillStatusSection() {
    const [status, setStatus] = useState<{ ok: boolean; reason?: string } | null>(null);
    const [testing, setTesting] = useState(false);

    const runTest = async () => {
        setTesting(true);
        setStatus(null);
        try {
            const authHeaders = await getAuthHeaders();
            const res = await fetch('/api/eway-bill/test', { headers: authHeaders });
            const data = await res.json();
            setStatus(data);
        } catch (error) {
            setStatus({ ok: false, reason: 'Could not reach the server to test the connection.' });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Truck size={16} /> GST e-Way Bill
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Generated via ClearTax (acting as GSP, using your NIC e-Way Bill portal login stored against your ClearTax account). Credentials (CLEARTAX_BASE_URL, CLEARTAX_AUTH_TOKEN, EWB_GSTIN) are set on the server, not here -- once they're in place, use this to confirm the connection before generating a real e-Way Bill from an order.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button type="button" className="btn" onClick={runTest} disabled={testing}>
                    {testing ? 'Testing...' : 'Test Connection'}
                </button>
                {status && (
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: status.ok ? '#166534' : '#991b1b' }}>
                        {status.ok ? 'Connected successfully' : status.reason}
                    </span>
                )}
            </div>
        </div>
    );
}
