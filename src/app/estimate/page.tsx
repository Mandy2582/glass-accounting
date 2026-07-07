'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, CheckCircle2, IndianRupee, MessageCircle, Ruler, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { formatIndianCurrency, generateWhatsAppLink } from '@/lib/utils';
import CustomerHeader from '@/components/customer/CustomerHeader';
import styles from './estimate.module.css';

type EstimateResult = {
    entered: {
        width: number;
        height: number;
        unit: string;
        thickness: number;
        quantity: number;
        holes: number;
        cuts: number;
    };
    billed: {
        width: number;
        height: number;
        unit: string;
        widthInches: number;
        heightInches: number;
        areaSqft: number;
    };
    ratePerSqft: number;
    glassAmount: number;
    holeCharges: number;
    cutCharges: number;
    total: number;
    thicknessOptions: Array<{ thickness: number; ratePerSqft: number }>;
};

type FormState = {
    width: string;
    height: string;
    unit: 'inch' | 'ft' | 'mm' | 'cm' | 'm';
    thickness: string;
    quantity: string;
    holes: string;
    cuts: string;
};

type QuoteFormState = {
    name: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
};

type StoredOrderReference = {
    id: string;
    number: string;
    date: string;
    total: number;
    items: number;
    status: string;
};

const defaultForm: FormState = {
    width: '36',
    height: '72',
    unit: 'inch',
    thickness: '10',
    quantity: '1',
    holes: '0',
    cuts: '0',
};

const customerStorageKey = 'agh_shop_customer';
const customerOrdersKey = 'agh_shop_orders';
const businessWhatsApp = process.env.NEXT_PUBLIC_COMPANY_WHATSAPP || '+911234567890';

type SavedCustomer = Partial<Pick<QuoteFormState, 'name' | 'phone' | 'email' | 'address'>>;

function readSavedCustomer(): SavedCustomer | null {
    if (typeof window === 'undefined') return null;

    try {
        const saved = window.localStorage.getItem(customerStorageKey);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as SavedCustomer;
        return parsed && (parsed.name || parsed.phone || parsed.email || parsed.address) ? parsed : null;
    } catch {
        return null;
    }
}

const normalizeLoginValue = (value: string) => value.trim().toLowerCase();

const getCustomerStorageKey = (baseKey: string, account?: SavedCustomer | null) => {
    if (!account) return baseKey;
    const rawKey = normalizeLoginValue(account.phone || account.email || account.name || '');
    const safeKey = rawKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return safeKey ? `${baseKey}_${safeKey}` : baseKey;
};

function saveOrderReference(account: SavedCustomer, reference: StoredOrderReference) {
    if (typeof window === 'undefined') return;

    try {
        const key = getCustomerStorageKey(customerOrdersKey, account);
        const saved = window.localStorage.getItem(key);
        const orders = saved ? JSON.parse(saved) as StoredOrderReference[] : [];
        const nextOrders = [reference, ...orders.filter(order => order.number !== reference.number)].slice(0, 20);
        window.localStorage.setItem(key, JSON.stringify(nextOrders));
    } catch {
        // Local history is a convenience only; backend submission has already succeeded.
    }
}

function buildEstimateWhatsAppMessage(estimate: EstimateResult, contact: QuoteFormState) {
    const customerLines = [
        contact.name ? `Name: ${contact.name}` : '',
        contact.phone ? `Phone: ${contact.phone}` : '',
        contact.address ? `Site: ${contact.address}` : '',
        contact.notes ? `Notes: ${contact.notes}` : '',
    ].filter(Boolean);

    return [
        'Hello Arjun Glass House, I want a quote for this glass estimate:',
        '',
        `Size entered: ${estimate.entered.width} x ${estimate.entered.height} ${estimate.entered.unit}`,
        `Billed size: ${estimate.billed.widthInches}" x ${estimate.billed.heightInches}"`,
        `Thickness: ${estimate.entered.thickness}mm`,
        `Quantity: ${estimate.entered.quantity}`,
        `Area: ${estimate.billed.areaSqft.toFixed(2)} sqft`,
        `Holes: ${estimate.entered.holes} per piece`,
        `Cuts: ${estimate.entered.cuts} per piece`,
        `Estimated amount: ${formatIndianCurrency(estimate.total)}`,
        customerLines.length ? '' : '',
        ...customerLines,
        '',
        'Please confirm final pricing, hardware, installation and delivery.',
    ].filter(line => line !== undefined).join('\n');
}

export default function InstantEstimatePage() {
    const [form, setForm] = useState<FormState>(defaultForm);
    const [quoteForm, setQuoteForm] = useState<QuoteFormState>({
        name: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
    });
    const [estimate, setEstimate] = useState<EstimateResult | null>(null);
    const [error, setError] = useState('');
    const [quoteError, setQuoteError] = useState('');
    const [quoteReference, setQuoteReference] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
    const [savedCustomer, setSavedCustomer] = useState<SavedCustomer | null>(null);

    const requestBody = useMemo(() => ({
        width: Number(form.width),
        height: Number(form.height),
        unit: form.unit,
        thickness: Number(form.thickness),
        quantity: Number(form.quantity),
        holes: Number(form.holes),
        cuts: Number(form.cuts),
    }), [form]);

    const whatsappHref = useMemo(() => {
        if (!estimate) return '';
        return generateWhatsAppLink(businessWhatsApp, buildEstimateWhatsAppMessage(estimate, quoteForm));
    }, [estimate, quoteForm]);

    useEffect(() => {
        const timer = window.setTimeout(async () => {
            if (!requestBody.width || !requestBody.height) {
                setEstimate(null);
                return;
            }

            setIsLoading(true);
            setError('');
            try {
                const response = await fetch('/api/customer/quick-estimate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'Could not calculate estimate.');
                }

                setEstimate(data.estimate);
            } catch (estimateError: any) {
                setError(estimateError.message || 'Could not calculate estimate.');
                setEstimate(null);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => window.clearTimeout(timer);
    }, [requestBody]);

    useEffect(() => {
        const customer = readSavedCustomer();
        if (!customer) return;

        setSavedCustomer(customer);
        setQuoteForm(prev => ({
            ...prev,
            name: prev.name || customer.name || '',
            phone: prev.phone || customer.phone || '',
            email: prev.email || customer.email || '',
            address: prev.address || customer.address || '',
        }));
    }, []);

    const updateField = (field: keyof FormState, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const updateQuoteField = (field: keyof QuoteFormState, value: string) => {
        setQuoteForm(prev => ({ ...prev, [field]: value }));
    };

    const submitQuoteRequest = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setQuoteError('');
        setQuoteReference('');
        setIsSubmittingQuote(true);

        try {
            const response = await fetch('/api/customer/estimate-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...requestBody,
                    ...quoteForm,
                }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not send quote request.');
            }

            setQuoteReference(data.orderNumber);
            saveOrderReference(quoteForm, {
                id: data.orderId || data.orderNumber,
                number: data.orderNumber,
                date: new Date().toISOString(),
                total: estimate?.total || 0,
                items: Number(form.quantity) || 1,
                status: 'Estimate requested',
            });
            setQuoteForm(prev => ({
                ...prev,
                name: savedCustomer?.name || prev.name,
                phone: savedCustomer?.phone || prev.phone,
                email: savedCustomer?.email || prev.email,
                address: savedCustomer?.address || prev.address,
                notes: '',
            }));
        } catch (submitError: any) {
            setQuoteError(submitError.message || 'Could not send quote request.');
        } finally {
            setIsSubmittingQuote(false);
        }
    };

    return (
        <main className={styles.page}>
            <CustomerHeader />

            <section className={styles.hero}>
                <div className={styles.copy}>
                    <Link className={styles.backLink} href="/shop">
                        <ArrowLeft size={17} />
                        Back to shop
                    </Link>
                    <p className={styles.eyebrow}>Instant estimate</p>
                    <h1>Check glass cost quickly.</h1>
                    <p>
                        Enter size, thickness, holes and cuts to see a quick customer estimate.
                    </p>
                    <div className={styles.badges}>
                        <span><Ruler size={18} /> Rounded to next even inch</span>
                        <span><ShieldCheck size={18} /> Thickness based rate</span>
                        <span><Sparkles size={18} /> Live calculation</span>
                    </div>
                </div>
            </section>

            <section className={styles.workspace}>
                <form className={styles.formCard}>
                    <div className={styles.formHeader}>
                        <div>
                            <p className={styles.eyebrow}>Glass details</p>
                            <h2>Enter dimensions</h2>
                        </div>
                        <Calculator size={30} />
                    </div>

                    <div className={styles.grid}>
                        <label>
                            Width
                            <input value={form.width} onChange={event => updateField('width', event.target.value)} inputMode="decimal" />
                        </label>
                        <label>
                            Height
                            <input value={form.height} onChange={event => updateField('height', event.target.value)} inputMode="decimal" />
                        </label>
                        <label>
                            Unit
                            <select value={form.unit} onChange={event => updateField('unit', event.target.value as FormState['unit'])}>
                                <option value="inch">Inch</option>
                                <option value="ft">Feet</option>
                                <option value="mm">Millimetre</option>
                                <option value="cm">Centimetre</option>
                                <option value="m">Metre</option>
                            </select>
                        </label>
                        <label>
                            Thickness
                            <select value={form.thickness} onChange={event => updateField('thickness', event.target.value)}>
                                {(estimate?.thicknessOptions || [
                                    { thickness: 4, ratePerSqft: 0 },
                                    { thickness: 5, ratePerSqft: 0 },
                                    { thickness: 6, ratePerSqft: 0 },
                                    { thickness: 8, ratePerSqft: 0 },
                                    { thickness: 10, ratePerSqft: 0 },
                                    { thickness: 12, ratePerSqft: 0 },
                                ]).map(option => (
                                    <option key={option.thickness} value={option.thickness}>{option.thickness}mm</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Quantity
                            <input value={form.quantity} onChange={event => updateField('quantity', event.target.value)} inputMode="numeric" />
                        </label>
                        <label>
                            Holes per piece
                            <input value={form.holes} onChange={event => updateField('holes', event.target.value)} inputMode="numeric" />
                        </label>
                        <label>
                            Cuts per piece
                            <input value={form.cuts} onChange={event => updateField('cuts', event.target.value)} inputMode="numeric" />
                        </label>
                    </div>

                    {error && <p className={styles.error}>{error}</p>}
                    <p className={styles.note}>Final pricing may change after site check, hardware, transport or installation.</p>
                </form>

                <aside className={styles.estimateCard}>
                    <p className={styles.eyebrow}>Estimated amount</p>
                    <div className={styles.total}>
                        <IndianRupee size={30} />
                        <span>{isLoading && !estimate ? 'Calculating...' : formatIndianCurrency(estimate?.total || 0)}</span>
                    </div>

                    {estimate ? (
                        <>
                            <div className={styles.metricGrid}>
                                <div>
                                    <span>Billed size</span>
                                    <strong>{estimate.billed.widthInches}" x {estimate.billed.heightInches}"</strong>
                                </div>
                                <div>
                                    <span>Area</span>
                                    <strong>{estimate.billed.areaSqft.toFixed(2)} sqft</strong>
                                </div>
                                <div>
                                    <span>Rate</span>
                                    <strong>{formatIndianCurrency(estimate.ratePerSqft)}/sqft</strong>
                                </div>
                                <div>
                                    <span>Qty</span>
                                    <strong>{estimate.entered.quantity}</strong>
                                </div>
                            </div>

                            <div className={styles.breakdown}>
                                <p><span>Glass amount</span><strong>{formatIndianCurrency(estimate.glassAmount)}</strong></p>
                                <p><span>Hole charges</span><strong>{formatIndianCurrency(estimate.holeCharges)}</strong></p>
                                <p><span>Cut charges</span><strong>{formatIndianCurrency(estimate.cutCharges)}</strong></p>
                                <p className={styles.grandLine}><span>Total</span><strong>{formatIndianCurrency(estimate.total)}</strong></p>
                            </div>

                            <div className={styles.actions}>
                                <a className={styles.whatsappAction} href={whatsappHref} target="_blank" rel="noreferrer">
                                    <MessageCircle size={18} />
                                    WhatsApp Quote
                                </a>
                                <Link href="/measure">Book Measurement</Link>
                                <Link href="/shop/products">Shop Products</Link>
                            </div>
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            <CheckCircle2 size={26} />
                            <p>Enter width and height to see the estimate.</p>
                        </div>
                    )}
                </aside>
            </section>

            <section className={styles.quoteSection}>
                <form className={styles.quoteCard} onSubmit={submitQuoteRequest}>
                    <div className={styles.formHeader}>
                        <div>
                            <p className={styles.eyebrow}>Send to store</p>
                            <h2>Send this estimate to the store</h2>
                        </div>
                        <Send size={28} />
                    </div>

                    <div className={styles.quoteGrid}>
                        {savedCustomer && (
                            <div className={styles.savedProfile}>
                                <CheckCircle2 size={18} />
                                <span>Using saved customer: <strong>{savedCustomer.name || savedCustomer.phone}</strong></span>
                            </div>
                        )}
                        <label>
                            Name *
                            <input value={quoteForm.name} onChange={event => updateQuoteField('name', event.target.value)} placeholder="Customer name" />
                        </label>
                        <label>
                            Phone *
                            <input value={quoteForm.phone} onChange={event => updateQuoteField('phone', event.target.value)} placeholder="Mobile number" inputMode="tel" />
                        </label>
                        <label>
                            Email
                            <input value={quoteForm.email} onChange={event => updateQuoteField('email', event.target.value)} placeholder="Optional email" inputMode="email" />
                        </label>
                        <label className={styles.full}>
                            Site address *
                            <textarea value={quoteForm.address} onChange={event => updateQuoteField('address', event.target.value)} placeholder="Full address with landmark" rows={3} />
                        </label>
                        <label className={styles.full}>
                            Notes
                            <textarea value={quoteForm.notes} onChange={event => updateQuoteField('notes', event.target.value)} placeholder="Fitting, delivery, urgency or special shape details" rows={3} />
                        </label>
                    </div>

                    {quoteError && <p className={styles.error}>{quoteError}</p>}
                    {quoteReference && (
                        <div className={styles.success}>
                            <CheckCircle2 size={20} />
                            <span>Quote request submitted. Reference: <strong>{quoteReference}</strong></span>
                        </div>
                    )}

                    <button className={styles.primaryButton} type="submit" disabled={!estimate || isSubmittingQuote}>
                        {isSubmittingQuote ? 'Sending...' : 'Send Quote Request'}
                    </button>
                </form>
            </section>
        </main>
    );
}
