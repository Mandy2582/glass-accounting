'use client';

import { useState, useEffect } from 'react';
import { Download, Database, AlertCircle, DollarSign, Save, FileText, Building2, CreditCard } from 'lucide-react';
import { db } from '@/lib/storage';
import { PricingConfig, BusinessConfig, GSTType } from '@/types';
import MigrationTool from '@/components/MigrationTool';

export default function SettingsPage() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [pricing, setPricing] = useState<PricingConfig>({
        baseRatePerSqft: 0,
        holeCharge: 50,
        cutCharge: 30,
        complexityMultiplier: { simple: 1.0, medium: 1.0, complex: 1.0 },
        edgeFinishing: { polished: 0, beveled: 0, none: 0 },
        minimumCharge: 0
    });
    const [pricingLoading, setPricingLoading] = useState(true);
    const [savingPricing, setSavingPricing] = useState(false);
    const [thicknessPricing, setThicknessPricing] = useState<Array<{ thickness: number; ratePerSqft: number }>>([]);
    const [savingThickness, setSavingThickness] = useState(false);

    // Business Config State
    const [businessConfig, setBusinessConfig] = useState<BusinessConfig>(db.businessConfig.getDefaults());
    const [savingBusiness, setSavingBusiness] = useState(false);
    const [businessLoading, setBusinessLoading] = useState(true);

    useEffect(() => {
        loadPricing();
        loadThicknessPricing();
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


    const loadPricing = async () => {
        setPricingLoading(true);
        try {
            const config = await db.settings.getPricing();
            setPricing({
                ...config,
                baseRatePerSqft: 0,
                minimumCharge: 0,
                complexityMultiplier: { simple: 1, medium: 1, complex: 1 },
                edgeFinishing: { polished: 0, beveled: 0, none: 0 },
            });
        } catch (error) {
            console.error('Error loading pricing:', error);
        } finally {
            setPricingLoading(false);
        }
    };

    const loadThicknessPricing = async () => {
        try {
            const thicknessPricingData = await db.settings.getThicknessPricing();
            setThicknessPricing(thicknessPricingData);
        } catch (error) {
            console.error('Error loading thickness pricing:', error);
        }
    };

    const handleSavePricing = async () => {
        setSavingPricing(true);
        try {
            await db.settings.updatePricing({
                ...pricing,
                baseRatePerSqft: 0,
                minimumCharge: 0,
                complexityMultiplier: { simple: 1, medium: 1, complex: 1 },
                edgeFinishing: { polished: 0, beveled: 0, none: 0 },
            });
            setMessage({ type: 'success', text: 'Pricing configuration saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving pricing:', error);
            setMessage({ type: 'error', text: 'Failed to save pricing configuration' });
        } finally {
            setSavingPricing(false);
        }
    };

    const handleSaveThicknessPricing = async () => {
        setSavingThickness(true);
        try {
            await db.settings.updateThicknessPricing(thicknessPricing);
            setMessage({ type: 'success', text: 'Thickness pricing saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving thickness pricing:', error);
            setMessage({ type: 'error', text: 'Failed to save thickness pricing' });
        } finally {
            setSavingThickness(false);
        }
    };

    const handleThicknessChange = (index: number, field: 'thickness' | 'ratePerSqft', value: number) => {
        const updated = [...thicknessPricing];
        updated[index] = { ...updated[index], [field]: value };
        setThicknessPricing(updated);
    };

    const handleAddThickness = () => {
        setThicknessPricing([...thicknessPricing, { thickness: 6, ratePerSqft: 0 }]);
    };

    const handleRemoveThickness = (index: number) => {
        setThicknessPricing(thicknessPricing.filter((_, i) => i !== index));
    };

    const handleBackupData = async () => {
        try {
            setLoading(true);
            setMessage(null);

            // Fetch all data from all tables
            const [items, parties, invoices, orders, vouchers, employees, bankAccounts] = await Promise.all([
                db.items.getAll(),
                db.parties.getAll(),
                db.invoices.getAll(),
                db.orders.getAll(),
                db.vouchers.getAll(),
                db.employees.getAll(),
                db.bankAccounts.getAll()
            ]);

            const backupData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                data: {
                    items,
                    parties,
                    invoices,
                    orders,
                    vouchers,
                    employees,
                    bankAccounts
                }
            };

            // Create and download JSON file
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `arjun-glass-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setMessage({ type: 'success', text: 'Backup downloaded successfully!' });
        } catch (error) {
            console.error('Backup error:', error);
            setMessage({ type: 'error', text: 'Failed to create backup. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>Settings</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>Manage your application settings and data</p>
            </div>

            {/* Business Configuration Section */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Building2 size={24} />
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Business Configuration</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Your business details for invoices and GST</p>
                        </div>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
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
                                        <input
                                            type="text"
                                            className="input"
                                            value={businessConfig.state}
                                            onChange={(e) => setBusinessConfig({ ...businessConfig, state: e.target.value })}
                                            placeholder="Punjab"
                                        />
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
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-primary)' }}>🏦 Bank Details (shown on invoices)</h3>
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
                                </div>
                            </div>

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

            {/* Backup & Restore Section */}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Database size={24} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Data Backup</h2>
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

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Backup Your Data</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                            Download a complete backup of all your data including items, parties, invoices, orders, vouchers, employees, and bank accounts.
                        </p>
                        <button
                            onClick={handleBackupData}
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Download size={18} />
                            {loading ? 'Creating Backup...' : 'Download Backup'}
                        </button>
                    </div>

                    <div style={{ padding: '1rem', background: '#fffbeb', border: '1px solid #fde047', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <AlertCircle size={20} style={{ color: '#ca8a04', flexShrink: 0, marginTop: '0.125rem' }} />
                            <div>
                                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#854d0e', marginBottom: '0.25rem' }}>Important Notes</h4>
                                <ul style={{ fontSize: '0.875rem', color: '#713f12', paddingLeft: '1.25rem', margin: 0 }}>
                                    <li>Backups are saved as JSON files on your computer</li>
                                    <li>Store backups in a safe location</li>
                                    <li>Regular backups are recommended (weekly or monthly)</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pricing Configuration */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <DollarSign size={24} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Pricing Configuration</h2>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {pricingLoading ? (
                        <p>Loading pricing configuration...</p>
                    ) : (
                        <>
                            {/* Thickness-Based Glass Rates */}
                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Thickness-Wise Glass Rates</h3>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                            Used for custom design glass cost as: area × rate for selected thickness.
                                        </p>
                                    </div>
                                    <button type="button" className="btn" onClick={handleAddThickness}>
                                        Add Thickness
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {thicknessPricing.map((item, index) => (
                                        <div
                                            key={`${item.thickness}-${index}`}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 1fr) auto',
                                                gap: '0.75rem',
                                                alignItems: 'end'
                                            }}
                                        >
                                            <div>
                                                <label className="form-label">Thickness (mm)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={item.thickness}
                                                    onChange={(e) => handleThicknessChange(index, 'thickness', parseFloat(e.target.value) || 0)}
                                                    min="0"
                                                    step="0.5"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Rate (₹ per sq ft)</label>
                                                <input
                                                    type="number"
                                                    className="form-input money-input"
                                                    value={item.ratePerSqft}
                                                    onChange={(e) => handleThicknessChange(index, 'ratePerSqft', parseFloat(e.target.value) || 0)}
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                            <button type="button" className="btn btn-secondary" onClick={() => handleRemoveThickness(index)}>
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSaveThicknessPricing}
                                        disabled={savingThickness}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        <Save size={18} />
                                        {savingThickness ? 'Saving...' : 'Save Thickness Rates'}
                                    </button>
                                </div>
                            </div>

                            {/* Additional Charges */}
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Design Processing Charges</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                    Custom design estimates use only hole and cut charges.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    <div>
                                        <label className="form-label">Hole Charge (₹ per hole)</label>
                                        <input
                                            type="number"
                                            className="form-input money-input"
                                            value={pricing.holeCharge}
                                            onChange={(e) => setPricing({ ...pricing, holeCharge: parseFloat(e.target.value) || 0 })}
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Cut Charge (₹ per cut)</label>
                                        <input
                                            type="number"
                                            className="form-input money-input"
                                            value={pricing.cutCharge}
                                            onChange={(e) => setPricing({ ...pricing, cutCharge: parseFloat(e.target.value) || 0 })}
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Save Button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={loadPricing}
                                    disabled={savingPricing}
                                >
                                    Reset
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSavePricing}
                                    disabled={savingPricing}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={18} />
                                    {savingPricing ? 'Saving...' : 'Save Pricing'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>


            {/* Terms & Conditions */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileText size={24} />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Terms & Conditions</h2>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {pricingLoading ? (
                        <p>Loading settings...</p>
                    ) : (
                        <>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                    These terms will be automatically included in all generated PDF estimates.
                                </p>
                                <textarea
                                    className="form-input"
                                    value={pricing.termsAndConditions || ''}
                                    onChange={(e) => setPricing({ ...pricing, termsAndConditions: e.target.value })}
                                    placeholder="1. Estimate is valid for 30 days&#10;2. 50% advance payment required&#10;3. Delivery within 7-10 days"
                                    rows={8}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSavePricing}
                                    disabled={savingPricing}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={18} />
                                    {savingPricing ? 'Saving...' : 'Save Terms'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* General Settings */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>General Settings</h2>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <p style={{ color: 'var(--color-text-muted)' }}>App Version: 1.0.0 (Cloud)</p>
                </div>
            </div>

            {/* Migration Tool */}
            <MigrationTool />
        </div >
    );
}
