'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, IndianRupee, PackageCheck, Phone, Search, ShieldCheck, Truck } from 'lucide-react';
import { formatIndianCurrency } from '@/lib/utils';
import CustomerHeader from '@/components/customer/CustomerHeader';
import styles from './track.module.css';

type ProgressStep = {
    key: string;
    label: string;
    done: boolean;
    current: boolean;
};

type TrackedOrder = {
    number: string;
    generalNumber: string | null;
    date: string;
    expectedDelivery: string | null;
    status: string;
    statusLabel: string;
    paymentStatus: string;
    paymentConfirmationSubmitted: boolean;
    paymentConfirmationText: string;
    total: number;
    paidAmount: number;
    balanceAmount: number;
    itemCount: number;
    items: Array<{
        name: string;
        description: string;
        quantity: number;
        unit: string;
        pieceCount?: number | null;
        sqft: number;
        rate: number;
        amount: number;
        width: number;
        height: number;
    }>;
    totalSqft: number;
    deliveredToUs: number;
    deliveredToCustomer: number;
    supplierDeliveryDate: string | null;
    customerDeliveryDate: string | null;
    customerName: string;
    requiresDesign: boolean;
    designCount: number;
    designStatus: string | null;
    progress: ProgressStep[];
};

type SavedCustomer = {
    name?: string;
    phone?: string;
    email?: string;
};

type StoredOrderReference = {
    id: string;
    number: string;
    date: string;
    total: number;
    items: number;
    status: string;
};

const customerStorageKey = 'agh_shop_customer';
const customerOrdersKey = 'agh_shop_orders';

const normalizeLoginValue = (value: string) => value.trim().toLowerCase();

const getCustomerStorageKey = (baseKey: string, account?: SavedCustomer | null) => {
    if (!account) return baseKey;
    const rawKey = normalizeLoginValue(account.phone || account.email || account.name || '');
    const safeKey = rawKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return safeKey ? `${baseKey}_${safeKey}` : baseKey;
};

function readSavedCustomer(): SavedCustomer | null {
    if (typeof window === 'undefined') return null;

    try {
        const saved = window.localStorage.getItem(customerStorageKey);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as SavedCustomer;
        return parsed && (parsed.name || parsed.phone || parsed.email) ? parsed : null;
    } catch {
        return null;
    }
}

function readStoredOrders(customer: SavedCustomer | null): StoredOrderReference[] {
    if (typeof window === 'undefined') return [];

    try {
        const saved = window.localStorage.getItem(getCustomerStorageKey(customerOrdersKey, customer))
            || window.localStorage.getItem(customerOrdersKey);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

function formatDate(value: string | null) {
    if (!value) return 'Not scheduled';
    return new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function titleCase(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export default function TrackOrderPage() {
    const [orderNumber, setOrderNumber] = useState('');
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentMessage, setPaymentMessage] = useState('');
    const [isSubmittingReference, setIsSubmittingReference] = useState(false);
    const [order, setOrder] = useState<TrackedOrder | null>(null);
    const [savedCustomer, setSavedCustomer] = useState<SavedCustomer | null>(null);
    const [recentOrders, setRecentOrders] = useState<StoredOrderReference[]>([]);

    const lookupOrder = async (lookupOrderNumber = orderNumber, lookupPhone = phone) => {
        setError('');
        setOrder(null);
        setIsLoading(true);

        try {
            const response = await fetch('/api/customer/order-track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNumber: lookupOrderNumber, phone: lookupPhone }),
            });
            const data = await response.json();

            if (!response.ok || !data.found) {
                throw new Error(data.message || 'No order found for these details.');
            }

            setOrder(data.order);
            setPaymentReference('');
        } catch (lookupError: any) {
            setError(lookupError.message || 'Unable to track this order right now.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const orderParam = params.get('order') || params.get('orderNumber') || '';
        const phoneParam = params.get('phone') || '';
        const customer = readSavedCustomer();
        const fallbackPhone = customer?.phone || '';

        setSavedCustomer(customer);
        setRecentOrders(readStoredOrders(customer).slice(0, 5));

        if (orderParam) setOrderNumber(orderParam);
        if (phoneParam || fallbackPhone) setPhone(phoneParam || fallbackPhone);
        if (orderParam && (phoneParam || fallbackPhone)) {
            lookupOrder(orderParam, phoneParam || fallbackPhone);
        }
        // The initial URL prefill should run once on page load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectRecentOrder = async (recentOrder: StoredOrderReference) => {
        const lookupPhone = phone || savedCustomer?.phone || '';
        if (!lookupPhone) {
            setError('Please enter the phone number linked with this order.');
            setOrderNumber(recentOrder.number);
            return;
        }
        setOrderNumber(recentOrder.number);
        setPhone(lookupPhone);
        await lookupOrder(recentOrder.number, lookupPhone);
    };

    const trackOrder = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await lookupOrder();
    };

    const submitPaymentReference = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setPaymentMessage('');
        setIsSubmittingReference(true);

        try {
            const response = await fetch('/api/customer/payment-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNumber, phone, reference: paymentReference }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not submit payment reference.');
            }

            setPaymentReference('');
            await lookupOrder(orderNumber, phone);
            setPaymentMessage(data.message || 'Payment reference submitted for verification.');
        } catch (submitError: any) {
            setError(submitError.message || 'Could not submit payment reference right now.');
        } finally {
            setIsSubmittingReference(false);
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
                    <p className={styles.eyebrow}>Order tracking</p>
                    <h1>Track your glass order.</h1>
                    <p>
                        Enter order number and phone number to see production, payment and delivery status.
                    </p>
                    {orderNumber && phone && (
                        <p className={styles.prefillNote}>
                            Order details are prefilled from your recent shopping activity. Latest status is checked automatically.
                        </p>
                    )}

                    <div className={styles.trustRow}>
                        <span><ShieldCheck size={17} /> Phone verified</span>
                        <span><Truck size={17} /> Delivery status</span>
                        <span><PackageCheck size={17} /> Design progress</span>
                    </div>
                </div>

                <form className={styles.lookupCard} onSubmit={trackOrder}>
                    <div>
                        <label htmlFor="orderNumber">Order number</label>
                        <div className={styles.inputShell}>
                            <Search size={18} />
                            <input
                                id="orderNumber"
                                value={orderNumber}
                                onChange={event => setOrderNumber(event.target.value)}
                                placeholder="SO-CUSTOMER-001 or 100001"
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="phone">Phone number</label>
                        <div className={styles.inputShell}>
                            <Phone size={18} />
                            <input
                                id="phone"
                                value={phone}
                                onChange={event => setPhone(event.target.value)}
                                placeholder="Last 6 digits also work"
                                inputMode="tel"
                                autoComplete="tel"
                            />
                        </div>
                    </div>

                    {error && <p className={styles.error}>{error}</p>}

                    <button className={styles.primaryButton} type="submit" disabled={isLoading}>
                        {isLoading ? 'Checking...' : 'Track Order'}
                    </button>

                    {recentOrders.length > 0 && (
                        <div className={styles.recentOrders}>
                            <div className={styles.recentHeader}>
                                <PackageCheck size={18} />
                                <span>{savedCustomer?.name ? `${savedCustomer.name}'s recent orders` : 'Recent orders'}</span>
                            </div>
                            {recentOrders.map(recentOrder => (
                                <button
                                    key={recentOrder.id || recentOrder.number}
                                    type="button"
                                    onClick={() => selectRecentOrder(recentOrder)}
                                >
                                    <span>
                                        <strong>{recentOrder.number}</strong>
                                        <small>{formatDate(recentOrder.date)} • {recentOrder.items} item{recentOrder.items === 1 ? '' : 's'}</small>
                                    </span>
                                    <em>{formatIndianCurrency(recentOrder.total)}</em>
                                </button>
                            ))}
                        </div>
                    )}
                </form>
            </section>

            {order && (
                <section className={styles.resultGrid}>
                    <article className={styles.statusCard}>
                        <div className={styles.cardHeader}>
                            <div>
                                <p className={styles.eyebrow}>Current status</p>
                                <h2>{order.statusLabel}</h2>
                            </div>
                            <span className={styles.statusPill}>{titleCase(order.paymentStatus)}</span>
                        </div>

                        <div className={styles.timeline}>
                            {order.progress.map(step => (
                                <div
                                    className={`${styles.step} ${step.done ? styles.stepDone : ''} ${step.current ? styles.stepCurrent : ''}`}
                                    key={step.key}
                                >
                                    <span className={styles.stepDot}>
                                        {step.done ? <CheckCircle2 size={17} /> : <Clock3 size={15} />}
                                    </span>
                                    <span>{step.label}</span>
                                </div>
                            ))}
                        </div>

                        <div className={styles.paymentStrip}>
                            <div>
                                <span>Total</span>
                                <strong>{formatIndianCurrency(order.total)}</strong>
                            </div>
                            <div>
                                <span>Paid</span>
                                <strong>{formatIndianCurrency(order.paidAmount)}</strong>
                            </div>
                            <div>
                                <span>Balance</span>
                                <strong>{formatIndianCurrency(order.balanceAmount)}</strong>
                            </div>
                        </div>
                        {order.paymentConfirmationSubmitted && (
                            <div className={styles.paymentConfirmationNote}>
                                <strong>Payment reference submitted</strong>
                                <span>{order.paymentConfirmationText || 'Your reference has been sent to Arjun Glass House for verification.'}</span>
                            </div>
                        )}
                        {order.balanceAmount > 0 && order.paymentStatus !== 'paid' && (
                            <form className={styles.paymentReferenceForm} onSubmit={submitPaymentReference}>
                                <label htmlFor="paymentReference">Submit payment reference / UTR</label>
                                <div className={styles.referenceInputRow}>
                                    <input
                                        id="paymentReference"
                                        value={paymentReference}
                                        onChange={event => setPaymentReference(event.target.value)}
                                        placeholder="UPI ref, UTR or bank transaction number"
                                    />
                                    <button type="submit" disabled={isSubmittingReference || paymentReference.trim().length < 4}>
                                        {isSubmittingReference ? 'Submitting...' : 'Submit'}
                                    </button>
                                </div>
                                <small>Staff will verify receipt before marking the order paid.</small>
                                {paymentMessage && <span className={styles.referenceSuccess}>{paymentMessage}</span>}
                            </form>
                        )}
                    </article>

                    <article className={styles.summaryCard}>
                        <div className={styles.cardHeader}>
                            <div>
                                <p className={styles.eyebrow}>Order</p>
                                <h2>{order.number}</h2>
                            </div>
                            {order.generalNumber && <span className={styles.statusPill}>#{order.generalNumber}</span>}
                        </div>

                        <div className={styles.metricGrid}>
                            <div>
                                <CalendarDays size={18} />
                                <span>Order date</span>
                                <strong>{formatDate(order.date)}</strong>
                            </div>
                            <div>
                                <Truck size={18} />
                                <span>Expected delivery</span>
                                <strong>{formatDate(order.expectedDelivery)}</strong>
                            </div>
                            <div>
                                <PackageCheck size={18} />
                                <span>Items</span>
                                <strong>{order.itemCount}</strong>
                            </div>
                            <div>
                                <IndianRupee size={18} />
                                <span>Balance</span>
                                <strong>{formatIndianCurrency(order.balanceAmount)}</strong>
                            </div>
                        </div>

                        <div className={styles.detailList}>
                            <p><span>Total area</span><strong>{order.totalSqft.toFixed(2)} sqft</strong></p>
                            <p><span>Total order value</span><strong>{formatIndianCurrency(order.total)}</strong></p>
                            <p><span>Paid amount</span><strong>{formatIndianCurrency(order.paidAmount)}</strong></p>
                            <p><span>Payment status</span><strong>{titleCase(order.paymentStatus)}</strong></p>
                            <p><span>Payment reference</span><strong>{order.paymentConfirmationSubmitted ? 'Submitted for verification' : 'Not submitted'}</strong></p>
                            <p><span>Received from supplier</span><strong>{order.deliveredToUs.toFixed(2)} sqft</strong></p>
                            <p><span>Delivered to customer</span><strong>{order.deliveredToCustomer.toFixed(2)} sqft</strong></p>
                            <p><span>Custom design</span><strong>{order.requiresDesign ? `${order.designCount || 1} design${(order.designCount || 1) > 1 ? 's' : ''}` : 'No'}</strong></p>
                            {order.designStatus && <p><span>Design status</span><strong>{titleCase(order.designStatus)}</strong></p>}
                        </div>
                    </article>

                    <article className={styles.itemsCard}>
                        <div className={styles.cardHeader}>
                            <div>
                                <p className={styles.eyebrow}>Order items</p>
                                <h2>{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</h2>
                            </div>
                            <span className={styles.statusPill}>{formatIndianCurrency(order.total)}</span>
                        </div>

                        <div className={styles.trackedItemList}>
                            {order.items.map((item, index) => (
                                <div className={styles.trackedItem} key={`${item.name}-${index}`}>
                                    <div>
                                        <strong>{item.name}</strong>
                                        {item.description && <p>{item.description}</p>}
                                        <span>
                                            {item.width > 0 && item.height > 0 ? `${item.width}" x ${item.height}" • ` : ''}
                                            {item.sqft > 0 ? `${item.sqft.toFixed(2)} sqft • ` : ''}
                                            {item.pieceCount != null ? `${item.pieceCount} pcs` : `${item.quantity} ${item.unit}`}
                                        </span>
                                    </div>
                                    <em>{formatIndianCurrency(item.amount)}</em>
                                </div>
                            ))}
                        </div>
                    </article>
                </section>
            )}
        </main>
    );
}
