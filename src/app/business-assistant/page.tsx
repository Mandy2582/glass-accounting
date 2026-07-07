'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    BellRing,
    Bot,
    Camera,
    CheckCircle2,
    ExternalLink,
    FileText,
    Inbox,
    MessageCircle,
    Mic,
    Plus,
    Receipt,
    RefreshCw,
    Send,
    Sparkles,
    Wand2,
    Webhook,
} from 'lucide-react';
import { db, designsDb } from '@/lib/storage';
import { calculateLineAmounts, convertRateForItemUnit, formatUnitLabel } from '@/lib/units';
import { formatIndianCurrency, generateUUID, generateWhatsAppLink, roundCurrency } from '@/lib/utils';
import type { CustomDesign, GlassItem, InvoiceItem, Order, Party, Unit, Voucher, VoucherType } from '@/types';
import styles from './business-assistant.module.css';

type AssistantTab = 'inbox' | 'whatsapp' | 'ledger' | 'estimate' | 'supplier';

type ParsedLine = {
    id: string;
    raw: string;
    item?: GlassItem;
    quantity: number;
    unit: Unit;
    rate: number;
    amount: number;
    lineTotal: number;
    sqft: number;
    confidence: 'matched' | 'review';
};

type LedgerDraft = {
    party?: Party;
    amount: number;
    type: VoucherType;
    mode: 'cash' | 'bank';
    description: string;
};

type SupplierReminder = {
    id: string;
    supplierName: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    amount: number;
    sourceText: string;
    status: 'pending' | 'paid';
};

const today = () => new Date().toISOString().slice(0, 10);
const reminderStorageKey = 'agh_supplier_payment_reminders';

const sampleOrderText = `Rahul Glass Store
2 sheets 12mm clear glass
4 pcs patch lock
1 shower handle`;

export default function BusinessAssistantPage() {
    const [items, setItems] = useState<GlassItem[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [designs, setDesigns] = useState<CustomDesign[]>([]);
    const [activeTab, setActiveTab] = useState<AssistantTab>('inbox');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [origin, setOrigin] = useState('');

    const [orderText, setOrderText] = useState(sampleOrderText);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);

    const [ledgerText, setLedgerText] = useState('Rahul paid 5000 cash');
    const [ledgerDraft, setLedgerDraft] = useState<LedgerDraft | null>(null);
    const [isListening, setIsListening] = useState(false);

    const [estimateText, setEstimateText] = useState('1 sheet 10mm toughened glass\n2 handles');
    const [estimateCustomerId, setEstimateCustomerId] = useState('');
    const [estimateLines, setEstimateLines] = useState<ParsedLine[]>([]);

    const [supplierText, setSupplierText] = useState('Supplier invoice INV-101 dated 28/06/2026 amount 12500 due in 15 days');
    const [reminders, setReminders] = useState<SupplierReminder[]>([]);

    useEffect(() => {
        void loadData();
        setOrigin(window.location.origin);
        const saved = window.localStorage.getItem(reminderStorageKey);
        if (saved) {
            try {
                setReminders(JSON.parse(saved) as SupplierReminder[]);
            } catch {
                setReminders([]);
            }
        }
    }, []);

    useEffect(() => {
        window.localStorage.setItem(reminderStorageKey, JSON.stringify(reminders));
    }, [reminders]);

    const customers = useMemo(() => parties.filter(party => party.type === 'customer'), [parties]);
    const suppliers = useMemo(() => parties.filter(party => party.type === 'supplier'), [parties]);
    const selectedCustomer = customers.find(customer => customer.id === selectedCustomerId);
    const selectedEstimateCustomer = customers.find(customer => customer.id === estimateCustomerId);

    const whatsAppTotal = useMemo(() => getTotals(parsedLines), [parsedLines]);
    const estimateTotal = useMemo(() => getTotals(estimateLines), [estimateLines]);
    const dueSoonCount = reminders.filter(reminder => reminder.status === 'pending' && daysUntil(reminder.dueDate) <= 7).length;
    const whatsAppIntake = useMemo(() => buildWhatsAppIntake(orders, designs), [orders, designs]);
    const reviewCount = whatsAppIntake.filter(entry => entry.needsReview).length;

    async function loadData() {
        setLoading(true);
        try {
            const [inventory, partyList, orderList, designList] = await Promise.all([
                db.items.getAll(),
                db.parties.getAll(),
                db.orders.getAll(),
                designsDb.getAll(),
            ]);
            setItems(inventory);
            setParties(partyList);
            setOrders(orderList);
            setDesigns(designList);
        } catch (loadError) {
            console.error(loadError);
            setError('Could not load inventory or parties. Please refresh and try again.');
        } finally {
            setLoading(false);
        }
    }

    function clearStatus() {
        setMessage('');
        setError('');
    }

    function parseWhatsAppOrder() {
        clearStatus();
        const lines = parseItemLines(orderText, items);
        setParsedLines(lines);
        const detectedCustomer = detectParty(orderText, customers);
        if (detectedCustomer && !selectedCustomerId) setSelectedCustomerId(detectedCustomer.id);
        setMessage(lines.length ? `Parsed ${lines.length} order row${lines.length === 1 ? '' : 's'}. Review unmatched rows before creating the order.` : 'No item rows found.');
    }

    function parseEstimate() {
        clearStatus();
        const lines = parseItemLines(estimateText, items);
        setEstimateLines(lines);
        const detectedCustomer = detectParty(estimateText, customers);
        if (detectedCustomer && !estimateCustomerId) setEstimateCustomerId(detectedCustomer.id);
        setMessage(lines.length ? `Quick estimate prepared with ${lines.length} row${lines.length === 1 ? '' : 's'}.` : 'No estimate rows found.');
    }

    async function createOrderFromLines(input: {
        lines: ParsedLine[];
        party?: Party;
        notes: string;
        successLabel: string;
    }) {
        clearStatus();
        if (!input.party) {
            setError('Select a customer before creating the order.');
            return;
        }
        const usableLines = input.lines.filter(line => line.item);
        if (!usableLines.length) {
            setError('At least one parsed row must match an inventory item.');
            return;
        }

        setBusy(true);
        try {
            const orderItems = usableLines.map(toInvoiceItem);
            const totals = getTotals(usableLines);
            const number = await db.orders.generateNextOrderNumber('sale_order', input.party.name);
            const order: Order = {
                id: generateUUID(),
                type: 'sale_order',
                number,
                date: today(),
                partyId: input.party.id,
                partyName: input.party.name,
                items: orderItems,
                subtotal: totals.subtotal,
                taxRate: 18,
                taxAmount: totals.taxAmount,
                total: totals.total,
                status: 'pending',
                notes: input.notes,
                paidAmount: 0,
                paymentStatus: 'unpaid',
            };

            await db.orders.add(order);
            setMessage(`${input.successLabel}: ${number} for ${formatIndianCurrency(totals.total)}.`);
        } catch (saveError) {
            console.error(saveError);
            setError('Could not create the sale order. Please check the parsed rows and try again.');
        } finally {
            setBusy(false);
        }
    }

    function parseLedgerEntry() {
        clearStatus();
        const draft = parseLedgerText(ledgerText, parties);
        setLedgerDraft(draft);
        if (!draft.amount) {
            setError('I found the narration, but could not detect an amount.');
            return;
        }
        setMessage('Ledger draft is ready. Review it once, then save the voucher.');
    }

    async function saveLedgerVoucher() {
        clearStatus();
        if (!ledgerDraft?.amount) {
            setError('Prepare a ledger draft before saving.');
            return;
        }

        setBusy(true);
        try {
            const voucher: Voucher = {
                id: generateUUID(),
                number: `VA-${Date.now().toString().slice(-8)}`,
                date: today(),
                type: ledgerDraft.type,
                partyId: ledgerDraft.party?.id,
                partyName: ledgerDraft.party?.name,
                amount: ledgerDraft.amount,
                description: ledgerDraft.description,
                mode: ledgerDraft.mode,
            };
            await db.vouchers.add(voucher);
            setMessage(`Voucher saved: ${voucher.number} for ${formatIndianCurrency(voucher.amount)}.`);
            setLedgerDraft(null);
        } catch (saveError) {
            console.error(saveError);
            setError('Could not save voucher. Please verify the party and amount.');
        } finally {
            setBusy(false);
        }
    }

    function startVoiceLedger() {
        clearStatus();
        const SpeechRecognition = (window as typeof window & {
            SpeechRecognition?: SpeechRecognitionConstructor;
            webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }).SpeechRecognition || (window as typeof window & {
            webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setError('Voice input is not supported in this browser. You can still type the entry manually.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.interimResults = false;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => {
            setIsListening(false);
            setError('Voice capture stopped. Please try again or type the entry.');
        };
        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const spoken = Array.from(event.results)
                .map(result => result[0]?.transcript || '')
                .join(' ')
                .trim();
            setLedgerText(spoken);
            setLedgerDraft(parseLedgerText(spoken, parties));
            setMessage('Voice entry captured.');
        };
        recognition.start();
    }

    function addSupplierReminder() {
        clearStatus();
        const parsed = parseSupplierReminder(supplierText, suppliers);
        setReminders(prev => [parsed, ...prev].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
        setMessage(`Supplier reminder added for ${parsed.supplierName} due on ${formatDate(parsed.dueDate)}.`);
    }

    function markReminderPaid(id: string) {
        setReminders(prev => prev.map(reminder => reminder.id === id ? { ...reminder, status: 'paid' } : reminder));
    }

    function deleteReminder(id: string) {
        setReminders(prev => prev.filter(reminder => reminder.id !== id));
    }

    async function approveWhatsAppOrder(orderId: string) {
        clearStatus();
        const order = orders.find(item => item.id === orderId);
        if (!order) {
            setError('Order not found. Please refresh the intake inbox.');
            return;
        }

        if (designs.some(design => design.orderId === order.id)) {
            setError('This order has a drawing draft. Please review the drawing before approval.');
            return;
        }

        setBusy(true);
        try {
            await db.orders.update({
                ...order,
                status: 'approved',
                notes: [
                    order.notes || '',
                    '',
                    `Reviewed from Business Assistant on ${today()}.`,
                ].join('\n').trim(),
            });
            await loadData();
            setMessage(`WhatsApp order ${order.number} marked as approved.`);
        } catch (approveError) {
            console.error(approveError);
            setError('Could not approve this WhatsApp order. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    const activeSummary = activeTab === 'whatsapp'
        ? whatsAppTotal
        : activeTab === 'estimate'
            ? estimateTotal
            : null;

    return (
        <div className={styles.page}>
            <section className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Business Assistant</div>
                    <h1 className={styles.title}>Capture orders, ledger entries, estimates and supplier dues faster.</h1>
                    <p className={styles.subtitle}>
                        A practical assistant for WhatsApp orders, spoken cash entries, rough-to-formal estimates and supplier payment reminders.
                    </p>
                </div>
                <div className={styles.statusPill}>
                    <Sparkles size={18} />
                    API-ready, local-first workflows
                </div>
            </section>

            <div className={styles.tabs}>
                <TabButton active={activeTab === 'inbox'} onClick={() => setActiveTab('inbox')} icon={<Inbox size={18} />} label="Intake Inbox" />
                <TabButton active={activeTab === 'whatsapp'} onClick={() => setActiveTab('whatsapp')} icon={<MessageCircle size={18} />} label="WhatsApp Orders" />
                <TabButton active={activeTab === 'ledger'} onClick={() => setActiveTab('ledger')} icon={<Mic size={18} />} label="Voice Ledger" />
                <TabButton active={activeTab === 'estimate'} onClick={() => setActiveTab('estimate')} icon={<FileText size={18} />} label="Quick Estimate" />
                <TabButton active={activeTab === 'supplier'} onClick={() => setActiveTab('supplier')} icon={<BellRing size={18} />} label="Supplier Alerts" />
            </div>

            {loading ? (
                <div className={styles.card}>
                    <div className={styles.cardBody}>Loading assistant data...</div>
                </div>
            ) : (
                <div className={styles.grid}>
                    <main>
                        {activeTab === 'inbox' && (
                            <AssistantCard
                                icon={<Inbox size={24} />}
                                title="WhatsApp intake inbox"
                                text="Review orders and drawing drafts created automatically from WhatsApp messages, photos and sketches."
                            >
                                <div className={styles.actions}>
                                    <button className={styles.secondaryButton} type="button" onClick={loadData}>
                                        <RefreshCw size={18} /> Refresh intake
                                    </button>
                                </div>
                                <IntakeInbox entries={whatsAppIntake} busy={busy} onApproveOrder={approveWhatsAppOrder} />
                            </AssistantCard>
                        )}

                        {activeTab === 'whatsapp' && (
                            <AssistantCard
                                icon={<MessageCircle size={24} />}
                                title="WhatsApp-first order tracker"
                                text="Paste a WhatsApp order or voice-note transcription. The assistant matches catalogue items and creates a sale order."
                            >
                                <div className={styles.setupBox}>
                                    <p className={styles.setupTitle}><Webhook size={16} /> Automatic WhatsApp webhook is ready</p>
                                    <p className={styles.setupText}>
                                        In Meta WhatsApp Cloud API, set this callback URL and use the same verify token as your server environment.
                                    </p>
                                    <div className={styles.codeLine}>{origin || 'https://your-domain.com'}/api/whatsapp/webhook</div>
                                    <ul className={styles.setupList}>
                                        <li>Required env: WHATSAPP_VERIFY_TOKEN</li>
                                        <li>Recommended env: WHATSAPP_APP_SECRET for signature validation</li>
                                        <li>Required for image/drawing orders: WHATSAPP_ACCESS_TOKEN to download media</li>
                                        <li>Optional env: WHATSAPP_PHONE_NUMBER_ID for automatic confirmation replies</li>
                                        <li>Optional vision env: OPENAI_API_KEY and OPENAI_VISION_MODEL to read photos, screenshots and drawings</li>
                                    </ul>
                                </div>
                                <div className={styles.formGrid}>
                                    <label className={`${styles.label} ${styles.full}`}>
                                        Customer
                                        <select className={styles.select} value={selectedCustomerId} onChange={event => setSelectedCustomerId(event.target.value)}>
                                            <option value="">Select customer</option>
                                            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                                        </select>
                                    </label>
                                    <label className={`${styles.label} ${styles.full}`}>
                                        WhatsApp message
                                        <textarea className={styles.textarea} value={orderText} onChange={event => setOrderText(event.target.value)} />
                                    </label>
                                </div>
                                <div className={styles.actions}>
                                    <button className={styles.secondaryButton} type="button" onClick={parseWhatsAppOrder}>
                                        <Wand2 size={18} /> Parse message
                                    </button>
                                    <button
                                        className={styles.button}
                                        type="button"
                                        disabled={busy || !parsedLines.length}
                                        onClick={() => createOrderFromLines({
                                            lines: parsedLines,
                                            party: selectedCustomer,
                                            notes: `Created from WhatsApp assistant.\n\nOriginal message:\n${orderText}`,
                                            successLabel: 'Sale order created',
                                        })}
                                    >
                                        <Send size={18} /> Create sale order
                                    </button>
                                </div>
                                <ParsedRows lines={parsedLines} />
                            </AssistantCard>
                        )}

                        {activeTab === 'ledger' && (
                            <AssistantCard
                                icon={<Mic size={24} />}
                                title="Voice-driven daily ledger"
                                text="Speak or type simple entries like 'Rahul paid 5000 cash'. The assistant prepares a receipt/payment voucher."
                            >
                                <label className={styles.label}>
                                    Ledger narration
                                    <textarea className={styles.textarea} value={ledgerText} onChange={event => setLedgerText(event.target.value)} />
                                </label>
                                <div className={styles.actions}>
                                    <button className={styles.secondaryButton} type="button" onClick={startVoiceLedger}>
                                        <Mic size={18} /> {isListening ? 'Listening...' : 'Speak entry'}
                                    </button>
                                    <button className={styles.ghostButton} type="button" onClick={parseLedgerEntry}>
                                        <Wand2 size={18} /> Prepare voucher
                                    </button>
                                    <button className={styles.button} type="button" disabled={busy || !ledgerDraft} onClick={saveLedgerVoucher}>
                                        <Receipt size={18} /> Save voucher
                                    </button>
                                </div>
                                {ledgerDraft && (
                                    <div className={styles.resultList}>
                                        <div className={styles.resultRow}>
                                            <div>
                                                <p className={styles.rowTitle}>{ledgerDraft.type === 'receipt' ? 'Receipt' : ledgerDraft.type === 'payment' ? 'Payment' : 'Expense'} voucher</p>
                                                <p className={styles.rowMeta}>
                                                    {ledgerDraft.party?.name || 'No party detected'} | {ledgerDraft.mode} | {ledgerDraft.description}
                                                </p>
                                            </div>
                                            <div className={styles.amount}>{formatIndianCurrency(ledgerDraft.amount)}</div>
                                        </div>
                                    </div>
                                )}
                            </AssistantCard>
                        )}

                        {activeTab === 'estimate' && (
                            <AssistantCard
                                icon={<FileText size={24} />}
                                title="Kachha-Pakka estimate builder"
                                text="Prepare a rough estimate quickly, share it on WhatsApp, and save it as a pending sale order when the customer confirms."
                            >
                                <div className={styles.formGrid}>
                                    <label className={styles.label}>
                                        Customer
                                        <select className={styles.select} value={estimateCustomerId} onChange={event => setEstimateCustomerId(event.target.value)}>
                                            <option value="">Select customer</option>
                                            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                                        </select>
                                    </label>
                                    <label className={styles.label}>
                                        GST rate
                                        <input className={styles.input} value="18%" readOnly />
                                    </label>
                                    <label className={`${styles.label} ${styles.full}`}>
                                        Estimate items
                                        <textarea className={styles.textarea} value={estimateText} onChange={event => setEstimateText(event.target.value)} />
                                    </label>
                                </div>
                                <div className={styles.actions}>
                                    <button className={styles.secondaryButton} type="button" onClick={parseEstimate}>
                                        <Wand2 size={18} /> Prepare estimate
                                    </button>
                                    <button className={styles.ghostButton} type="button" disabled={!estimateLines.length} onClick={() => shareEstimate(estimateLines, selectedEstimateCustomer)}>
                                        <MessageCircle size={18} /> Share text
                                    </button>
                                    <button
                                        className={styles.button}
                                        type="button"
                                        disabled={busy || !estimateLines.length}
                                        onClick={() => createOrderFromLines({
                                            lines: estimateLines,
                                            party: selectedEstimateCustomer,
                                            notes: `Kachha estimate saved for formal follow-up.\n\nOriginal estimate:\n${estimateText}`,
                                            successLabel: 'Estimate order created',
                                        })}
                                    >
                                        <Plus size={18} /> Save as order
                                    </button>
                                </div>
                                <ParsedRows lines={estimateLines} />
                            </AssistantCard>
                        )}

                        {activeTab === 'supplier' && (
                            <AssistantCard
                                icon={<BellRing size={24} />}
                                title="Supplier payment alert system"
                                text="Upload or paste invoice text, detect due date and amount, then track pending supplier payments."
                            >
                                <div className={styles.formGrid}>
                                    <label className={styles.label}>
                                        Invoice photo
                                        <input className={styles.input} type="file" accept="image/*,.pdf" />
                                    </label>
                                    <label className={styles.label}>
                                        OCR mode
                                        <input className={styles.input} value="Paste extracted text for now" readOnly />
                                    </label>
                                    <label className={`${styles.label} ${styles.full}`}>
                                        Invoice text
                                        <textarea className={styles.textarea} value={supplierText} onChange={event => setSupplierText(event.target.value)} />
                                    </label>
                                </div>
                                <div className={styles.actions}>
                                    <button className={styles.secondaryButton} type="button" onClick={addSupplierReminder}>
                                        <Camera size={18} /> Add reminder
                                    </button>
                                </div>
                                <ReminderList reminders={reminders} onPaid={markReminderPaid} onDelete={deleteReminder} />
                            </AssistantCard>
                        )}
                    </main>

                    <aside className={styles.summary}>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <span className={styles.iconTile}><Bot size={22} /></span>
                                <div>
                                    <h2 className={styles.cardTitle}>Assistant Summary</h2>
                                    <p className={styles.cardText}>Live status from this workspace.</p>
                                </div>
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.summary}>
                                    {activeSummary ? (
                                        <>
                                            <Metric label="Subtotal" value={formatIndianCurrency(activeSummary.subtotal)} />
                                            <Metric label="GST @ 18%" value={formatIndianCurrency(activeSummary.taxAmount)} />
                                            <Metric label="Total" value={formatIndianCurrency(activeSummary.total)} />
                                        </>
                                    ) : (
                                        <>
                                            <Metric label="Known parties" value={String(parties.length)} />
                                            <Metric label="Catalogue items" value={String(items.length)} />
                                            <Metric label="WhatsApp review" value={String(reviewCount)} />
                                            <Metric label="Due within 7 days" value={String(dueSoonCount)} />
                                        </>
                                    )}
                                </div>
                                {message && <div className={styles.notice}><CheckCircle2 size={16} /> {message}</div>}
                                {error && <div className={styles.error}>{error}</div>}
                            </div>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}

function TabButton(props: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button type="button" className={`${styles.tab} ${props.active ? styles.tabActive : ''}`} onClick={props.onClick}>
            {props.icon}
            {props.label}
        </button>
    );
}

function AssistantCard(props: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
    return (
        <section className={styles.card}>
            <div className={styles.cardHeader}>
                <span className={styles.iconTile}>{props.icon}</span>
                <div>
                    <h2 className={styles.cardTitle}>{props.title}</h2>
                    <p className={styles.cardText}>{props.text}</p>
                </div>
            </div>
            <div className={styles.cardBody}>{props.children}</div>
        </section>
    );
}

function Metric(props: { label: string; value: string }) {
    return (
        <div className={styles.metric}>
            <div className={styles.metricLabel}>{props.label}</div>
            <div className={styles.metricValue}>{props.value}</div>
        </div>
    );
}

function ParsedRows({ lines }: { lines: ParsedLine[] }) {
    if (!lines.length) return <div className={styles.empty}>No parsed rows yet.</div>;

    return (
        <div className={styles.resultList}>
            {lines.map(line => (
                <div key={line.id} className={styles.resultRow}>
                    <div>
                        <p className={styles.rowTitle}>{line.item?.name || line.raw}</p>
                        <p className={styles.rowMeta}>
                            {line.confidence === 'matched' ? 'Catalogue match' : 'Needs review'} | {line.quantity} {formatUnitLabel(line.unit)} | Rate {formatIndianCurrency(line.rate)}
                        </p>
                    </div>
                    <div className={styles.amount}>{formatIndianCurrency(line.lineTotal)}</div>
                </div>
            ))}
        </div>
    );
}

function ReminderList(props: {
    reminders: SupplierReminder[];
    onPaid: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    if (!props.reminders.length) return <div className={styles.empty}>No supplier reminders yet.</div>;

    return (
        <div className={styles.resultList}>
            {props.reminders.map(reminder => {
                const remaining = daysUntil(reminder.dueDate);
                const isOverdue = remaining < 0 && reminder.status === 'pending';
                const isPaid = reminder.status === 'paid';
                return (
                    <div key={reminder.id} className={styles.resultRow}>
                        <div>
                            <p className={styles.rowTitle}>{reminder.supplierName}</p>
                            <p className={styles.rowMeta}>
                                Invoice {reminder.invoiceNumber} | {formatDate(reminder.invoiceDate)} | Due {formatDate(reminder.dueDate)}
                            </p>
                            <span className={`${styles.badge} ${isOverdue ? styles.dangerBadge : ''} ${isPaid ? styles.successBadge : ''}`}>
                                {isPaid ? 'Paid' : isOverdue ? `${Math.abs(remaining)} days overdue` : `${remaining} days left`}
                            </span>
                        </div>
                        <div>
                            <div className={styles.amount}>{formatIndianCurrency(reminder.amount)}</div>
                            <div className={styles.actions}>
                                {!isPaid && <button className={styles.ghostButton} type="button" onClick={() => props.onPaid(reminder.id)}>Paid</button>}
                                <button className={styles.ghostButton} type="button" onClick={() => props.onDelete(reminder.id)}>Delete</button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

type IntakeEntry = {
    id: string;
    order: Order;
    design?: CustomDesign;
    messageId: string;
    source: string;
    needsReview: boolean;
    statusLabel: string;
};

function IntakeInbox({
    entries,
    busy,
    onApproveOrder,
}: {
    entries: IntakeEntry[];
    busy: boolean;
    onApproveOrder: (orderId: string) => void;
}) {
    if (!entries.length) {
        return (
            <div className={styles.empty}>
                No WhatsApp intake yet. New WhatsApp text orders, image orders and drawing drafts will appear here automatically.
            </div>
        );
    }

    return (
        <div className={styles.resultList}>
            {entries.map(entry => (
                <div key={entry.id} className={styles.intakeRow}>
                    <div>
                        <div className={styles.intakeTopLine}>
                            <p className={styles.rowTitle}>{entry.order.number} | {entry.order.partyName}</p>
                            <span className={`${styles.badge} ${entry.needsReview ? styles.dangerBadge : styles.successBadge}`}>
                                {entry.statusLabel}
                            </span>
                        </div>
                        <p className={styles.rowMeta}>
                            {entry.source} | {formatDate(entry.order.date)} | Message {entry.messageId || 'not recorded'}
                        </p>
                        {entry.design && (
                            <p className={styles.rowMeta}>
                                Drawing draft: {entry.design.name} | {entry.design.status} | {entry.design.totalArea.toFixed(2)} sq.ft
                            </p>
                        )}
                    </div>
                    <div className={styles.intakeActions}>
                        <div className={styles.amount}>{formatIndianCurrency(entry.order.total)}</div>
                        <Link className={styles.ghostButton} href={`/orders/${entry.order.id}`}>
                            <ExternalLink size={16} /> Open order
                        </Link>
                        {!entry.design && entry.order.status === 'pending' && entry.order.items.length > 0 && (
                            <button
                                className={styles.button}
                                type="button"
                                disabled={busy}
                                onClick={() => onApproveOrder(entry.order.id)}
                            >
                                <CheckCircle2 size={16} /> Mark reviewed
                            </button>
                        )}
                        {entry.design && (
                            <Link className={styles.secondaryButton} href={`/orders/${entry.order.id}/designs/${entry.design.id}`}>
                                <ExternalLink size={16} /> Review drawing
                            </Link>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function parseItemLines(text: string, items: GlassItem[]): ParsedLine[] {
    return text
        .split(/\n|,/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(raw => {
            const item = findBestItem(raw, items);
            const quantity = extractQuantity(raw);
            const unit = extractUnit(raw, item);
            const baseRate = item?.rate || 0;
            const rate = item
                ? convertRateForItemUnit({
                    rate: baseRate,
                    fromUnit: item.rateUnit || item.unit,
                    toUnit: unit,
                    width: item.width,
                    height: item.height,
                    conversionFactor: item.conversionFactor,
                })
                : 0;
            const calculation = calculateLineAmounts({
                width: item?.width,
                height: item?.height,
                quantity,
                unit,
                rate,
                taxRate: 18,
                conversionFactor: item?.conversionFactor,
            });

            return {
                id: generateUUID(),
                raw,
                item,
                quantity,
                unit,
                rate,
                amount: calculation.amount,
                lineTotal: calculation.lineTotal,
                sqft: calculation.sqft,
                confidence: item ? 'matched' : 'review',
            };
        });
}

function findBestItem(line: string, items: GlassItem[]): GlassItem | undefined {
    const lineTokens = tokenize(line);
    if (!lineTokens.length) return undefined;

    const ranked = items
        .map(item => {
            const haystack = tokenize(`${item.name} ${item.type || ''} ${item.make || ''} ${item.model || ''} ${item.thickness || ''}mm`);
            const matches = haystack.filter(token => lineTokens.includes(token)).length;
            const exactName = normalize(line).includes(normalize(item.name));
            return { item, score: matches + (exactName ? 5 : 0) };
        })
        .filter(entry => entry.score >= 2)
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.item;
}

function extractQuantity(line: string): number {
    const match = line.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s*(?:sheets?|pcs?|pieces?|nos|sets?|pair|sq\.?\s*ft|sqft|sqm|sq\.?\s*m))?/i);
    return match ? Number(match[1]) || 1 : 1;
}

function extractUnit(line: string, item?: GlassItem): Unit {
    const lower = line.toLowerCase();
    if (/sq\.?\s*ft|sqft|square feet/.test(lower)) return 'sqft';
    if (/sq\.?\s*m|sqm|square metre|square meter/.test(lower)) return 'sqm';
    if (/sheets?/.test(lower)) return 'sheets';
    if (/sets?/.test(lower)) return 'sets';
    if (/pair/.test(lower)) return 'pair';
    if (/pcs?|pieces?/.test(lower)) return 'pcs';
    if (/nos/.test(lower)) return 'nos';
    return item?.unit || 'nos';
}

function toInvoiceItem(line: ParsedLine): InvoiceItem {
    const item = line.item;
    if (!item) throw new Error('Cannot convert unmatched line to invoice item');
    return {
        id: generateUUID(),
        itemId: item.id,
        itemName: item.name,
        description: line.raw,
        make: item.make,
        model: item.model,
        type: item.type,
        warehouse: 'Main Warehouse',
        width: item.width || 0,
        height: item.height || 0,
        quantity: line.quantity,
        unit: line.unit,
        sqft: line.sqft,
        rate: line.rate,
        amount: line.amount,
        lineTotal: line.lineTotal,
        sourceType: 'text',
    };
}

function getTotals(lines: ParsedLine[]) {
    const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.amount, 0));
    const total = roundCurrency(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    return {
        subtotal,
        taxAmount: roundCurrency(total - subtotal),
        total,
    };
}

function buildWhatsAppIntake(orders: Order[], designs: CustomDesign[]): IntakeEntry[] {
    return orders
        .filter(order => order.notes?.includes('WhatsApp Message ID:'))
        .map(order => {
            const design = designs.find(item => item.orderId === order.id);
            const messageId = order.notes?.match(/WhatsApp Message ID:\s*([^\n]+)/)?.[1]?.trim() || '';
            const classification = order.notes?.match(/Vision Classification:\s*([^\n]+)/)?.[1]?.trim();
            const isDrawing = Boolean(design) || order.notes?.includes('manual design review') || classification === 'drawing' || classification === 'unknown';
            const needsReview = isDrawing || order.items.length === 0 || order.requiresDesign || order.status === 'pending';
            const source = order.notes?.includes('WhatsApp image')
                ? 'WhatsApp image'
                : order.notes?.includes('image/drawing')
                    ? 'WhatsApp drawing'
                    : 'WhatsApp text';

            return {
                id: `${order.id}-${design?.id || 'order'}`,
                order,
                design,
                messageId,
                source,
                needsReview,
                statusLabel: needsReview ? 'Needs review' : 'Order ready',
            };
        })
        .sort((a, b) => {
            const timeA = new Date((a.order as any).created_at || a.order.date).getTime();
            const timeB = new Date((b.order as any).created_at || b.order.date).getTime();
            return timeB - timeA;
        });
}

function parseLedgerText(text: string, parties: Party[]): LedgerDraft {
    const lower = text.toLowerCase();
    const amount = extractAmount(text);
    const party = detectParty(text, parties);
    const mode = /bank|upi|online|neft|rtgs|imps/.test(lower) ? 'bank' : 'cash';
    const type: VoucherType = /expense|spent|kharcha/.test(lower)
        ? 'expense'
        : /paid to|gave|supplier|payment/.test(lower) && !/paid by|paid me|received/.test(lower)
            ? 'payment'
            : 'receipt';

    return {
        party,
        amount,
        type,
        mode,
        description: text.trim() || 'Voice ledger entry',
    };
}

function parseSupplierReminder(text: string, suppliers: Party[]): SupplierReminder {
    const supplier = detectParty(text, suppliers);
    const invoiceNumber = text.match(/(?:invoice|inv|bill)\s*(?:no\.?|#)?\s*([a-z0-9/-]+)/i)?.[1] || `INV-${Date.now().toString().slice(-5)}`;
    const invoiceDate = parseDateFromText(text) || today();
    const dueDays = Number(text.match(/due\s*(?:in)?\s*(\d+)\s*days?/i)?.[1]) || 15;
    const dueDate = addDays(invoiceDate, dueDays);

    return {
        id: generateUUID(),
        supplierName: supplier?.name || 'Supplier',
        invoiceNumber,
        invoiceDate,
        dueDate,
        amount: extractAmount(text),
        sourceText: text,
        status: 'pending',
    };
}

function detectParty(text: string, parties: Party[]): Party | undefined {
    const normalizedText = normalize(text);
    return parties.find(party => normalizedText.includes(normalize(party.name)));
}

function extractAmount(text: string): number {
    const match = text.match(/(?:₹|rs\.?|rupees?)\s*([0-9,.]+)|([0-9,.]+)\s*(?:₹|rs\.?|rupees?)/i);
    if (match) return roundCurrency(Number((match[1] || match[2] || '').replace(/,/g, '')) || 0);
    const fallback = text.match(/\b(\d{2,}(?:,\d{3})*(?:\.\d+)?)\b/);
    return fallback ? roundCurrency(Number(fallback[1].replace(/,/g, '')) || 0) : 0;
}

function shareEstimate(lines: ParsedLine[], customer?: Party) {
    const totals = getTotals(lines);
    const body = [
        'Arjun Glass House Estimate',
        customer ? `Customer: ${customer.name}` : '',
        '',
        ...lines.map(line => `${line.item?.name || line.raw} - ${line.quantity} ${formatUnitLabel(line.unit)} - ${formatIndianCurrency(line.lineTotal)}`),
        '',
        `Total: ${formatIndianCurrency(totals.total)}`,
    ].filter(Boolean).join('\n');

    const link = customer?.phone ? generateWhatsAppLink(customer.phone, body) : `https://wa.me/?text=${encodeURIComponent(body)}`;
    window.open(link, '_blank', 'noopener,noreferrer');
}

function parseDateFromText(text: string): string | null {
    const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (!match) return null;
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
    const parsed = new Date(`${date}T00:00:00`);
    parsed.setDate(parsed.getDate() + days);
    return parsed.toISOString().slice(0, 10);
}

function daysUntil(date: string): number {
    const target = new Date(`${date}T00:00:00`).getTime();
    const current = new Date(`${today()}T00:00:00`).getTime();
    return Math.ceil((target - current) / 86_400_000);
}

function formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
}

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value: string): string[] {
    return normalize(value)
        .split(/\s+/)
        .filter(token => token.length > 1 && !['mm', 'the', 'and', 'for', 'pcs', 'nos', 'set'].includes(token));
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
    lang: string;
    interimResults: boolean;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    start: () => void;
};

type SpeechRecognitionEvent = {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
