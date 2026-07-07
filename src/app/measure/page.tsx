'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Home, Image as ImageIcon, MapPin, Phone, Ruler, Send, ShieldCheck, X } from 'lucide-react';
import CustomerHeader from '@/components/customer/CustomerHeader';
import styles from './measure.module.css';

type FormState = {
    name: string;
    phone: string;
    email: string;
    address: string;
    projectType: string;
    preferredDate: string;
    preferredTime: string;
    approximateSize: string;
    message: string;
};

type AttachmentPreview = {
    id: string;
    name: string;
    size: number;
    type: string;
    dataUrl: string;
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
    name: '',
    phone: '',
    email: '',
    address: '',
    projectType: 'Bathroom / shower enclosure',
    preferredDate: '',
    preferredTime: 'Morning',
    approximateSize: '',
    message: '',
};

const customerStorageKey = 'agh_shop_customer';
const customerOrdersKey = 'agh_shop_orders';

const projectTypes = [
    'Bathroom / shower enclosure',
    'Glass door',
    'Window glass',
    'Mirror',
    'Railing / balcony glass',
    'Office partition',
    'Shopfront glass',
    'Other custom work',
];

type SavedCustomer = Partial<Pick<FormState, 'name' | 'phone' | 'email' | 'address'>>;

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

export default function MeasurementPage() {
    const [form, setForm] = useState<FormState>(defaultForm);
    const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [reference, setReference] = useState('');
    const [savedCustomer, setSavedCustomer] = useState<SavedCustomer | null>(null);

    useEffect(() => {
        const customer = readSavedCustomer();
        if (!customer) return;

        setSavedCustomer(customer);
        setForm(prev => ({
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

    const handleAttachments = async (files: FileList | null) => {
        if (!files) return;
        setError('');

        const selectedFiles = Array.from(files).slice(0, Math.max(0, 3 - attachments.length));
        const validFiles = selectedFiles.filter(file => file.type.startsWith('image/') && file.size <= 700 * 1024);

        if (selectedFiles.length !== validFiles.length) {
            setError('Please upload only images up to 700 KB each. Maximum 3 images.');
        }

        const nextAttachments = await Promise.all(validFiles.map(file => new Promise<AttachmentPreview>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
                name: file.name,
                size: file.size,
                type: file.type,
                dataUrl: String(reader.result || ''),
            });
            reader.onerror = () => reject(new Error('Could not read image.'));
            reader.readAsDataURL(file);
        })));

        setAttachments(prev => [...prev, ...nextAttachments].slice(0, 3));
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(item => item.id !== id));
    };

    const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setReference('');
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/customer/site-measurement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    attachments: attachments.map(({ name, size, type, dataUrl }) => ({ name, size, type, dataUrl })),
                }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not submit request.');
            }

            setReference(data.orderNumber);
            saveOrderReference(form, {
                id: data.orderId || data.orderNumber,
                number: data.orderNumber,
                date: new Date().toISOString(),
                total: 0,
                items: 1,
                status: 'Measurement requested',
            });
            setForm({
                ...defaultForm,
                name: savedCustomer?.name || form.name,
                phone: savedCustomer?.phone || form.phone,
                email: savedCustomer?.email || form.email,
                address: savedCustomer?.address || form.address,
            });
            setAttachments([]);
        } catch (submitError: any) {
            setError(submitError.message || 'Could not submit request. Please try again.');
        } finally {
            setIsSubmitting(false);
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
                    <p className={styles.eyebrow}>Site measurement</p>
                    <h1>Book a measurement visit.</h1>
                    <p>
                        Share location, project type and preferred time. We will confirm exact size and hardware needs.
                    </p>

                    <div className={styles.featureGrid}>
                        <span><Ruler size={18} /> Accurate dimensions</span>
                        <span><Home size={18} /> Home and project visits</span>
                        <span><ShieldCheck size={18} /> Linked to Orders</span>
                    </div>
                </div>

                <aside className={styles.infoCard}>
                    <div>
                        <Clock3 size={24} />
                        <h2>What happens next?</h2>
                    </div>
                    <ol>
                        <li>Submit this request.</li>
                        <li>We receive the request.</li>
                        <li>Team confirms timing.</li>
                        <li>Final estimate is prepared from measured sizes.</li>
                    </ol>
                </aside>
            </section>

            <section className={styles.formSection}>
                <form className={styles.formCard} onSubmit={submitRequest}>
                    <div className={styles.formHeader}>
                        <div>
                            <p className={styles.eyebrow}>Request form</p>
                            <h2>Tell us where to measure</h2>
                        </div>
                        <MapPin size={28} />
                    </div>

                    <div className={styles.grid}>
                        {savedCustomer && (
                            <div className={styles.savedProfile}>
                                <CheckCircle2 size={18} />
                                <span>Using saved customer: <strong>{savedCustomer.name || savedCustomer.phone}</strong></span>
                            </div>
                        )}
                        <label>
                            Name *
                            <input value={form.name} onChange={event => updateField('name', event.target.value)} placeholder="Customer name" />
                        </label>
                        <label>
                            Phone *
                            <input value={form.phone} onChange={event => updateField('phone', event.target.value)} placeholder="Mobile number" inputMode="tel" />
                        </label>
                        <label>
                            Email
                            <input value={form.email} onChange={event => updateField('email', event.target.value)} placeholder="Optional email" inputMode="email" />
                        </label>
                        <label>
                            Project type
                            <select value={form.projectType} onChange={event => updateField('projectType', event.target.value)}>
                                {projectTypes.map(type => <option key={type}>{type}</option>)}
                            </select>
                        </label>
                        <label className={styles.full}>
                            Site address *
                            <textarea value={form.address} onChange={event => updateField('address', event.target.value)} placeholder="Full address with landmark" rows={3} />
                        </label>
                        <label>
                            Preferred date
                            <input value={form.preferredDate} onChange={event => updateField('preferredDate', event.target.value)} type="date" />
                        </label>
                        <label>
                            Preferred time
                            <select value={form.preferredTime} onChange={event => updateField('preferredTime', event.target.value)}>
                                <option>Morning</option>
                                <option>Afternoon</option>
                                <option>Evening</option>
                                <option>Any time</option>
                            </select>
                        </label>
                        <label className={styles.full}>
                            Approximate size or rooms
                            <input value={form.approximateSize} onChange={event => updateField('approximateSize', event.target.value)} placeholder="e.g. 2 bathrooms, 1 fixed + door, 36 x 72 inch" />
                        </label>
                        <label className={styles.full}>
                            Notes
                            <textarea value={form.message} onChange={event => updateField('message', event.target.value)} placeholder="Drawing, hardware preference, access, parking or urgency" rows={4} />
                        </label>
                        <div className={styles.full}>
                            <label className={styles.uploadBox}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={event => {
                                        handleAttachments(event.target.files);
                                        event.currentTarget.value = '';
                                    }}
                                />
                                <ImageIcon size={22} />
                                <span>Attach site photos or rough sketches</span>
                                <small>Up to 3 images, 700 KB each</small>
                            </label>
                            {attachments.length > 0 && (
                                <div className={styles.attachmentGrid}>
                                    {attachments.map(file => (
                                        <div className={styles.attachmentCard} key={file.id}>
                                            <img src={file.dataUrl} alt={file.name} />
                                            <div>
                                                <strong>{file.name}</strong>
                                                <span>{Math.round(file.size / 1024)} KB</span>
                                            </div>
                                            <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`Remove ${file.name}`}>
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {error && <p className={styles.error}>{error}</p>}
                    {reference && (
                        <div className={styles.success}>
                            <CheckCircle2 size={20} />
                            <span>Request submitted. Reference: <strong>{reference}</strong></span>
                        </div>
                    )}

                    <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            'Submitting...'
                        ) : (
                            <>
                                <Send size={18} />
                                Submit Measurement Request
                            </>
                        )}
                    </button>
                </form>

                <div className={styles.sidePanel}>
                    <div>
                        <Phone size={22} />
                        <h3>Prefer a call?</h3>
                        <p>Submit the form and staff can call back with your reference number.</p>
                    </div>
                    <div>
                        <CalendarDays size={22} />
                        <h3>Scheduling</h3>
                        <p>The preferred slot is a request. Final visit timing will be confirmed by staff.</p>
                    </div>
                </div>
            </section>
        </main>
    );
}
