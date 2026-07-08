'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, Eye, Heart, LogIn, MessageCircle, Minus, PackageCheck, Plus, Scale, Search, ShoppingBag, Trash2, UserRound, X } from 'lucide-react';
import { db } from '@/lib/storage';
import { BusinessConfig, GlassItem, InvoiceItem, Order, Party, Unit } from '@/types';
import { calculateLineAmounts, convertQuantityForItemUnit, convertRateForItemUnit, formatUnitLabel, getSheetAreaSqft, getUnitDefinition } from '@/lib/units';
import { roundToNextEvenInch } from '@/lib/designCalculations';
import { formatIndianCurrency, generateUUID, generateWhatsAppLink, roundCurrency } from '@/lib/utils';
import CustomerHeader from '@/components/customer/CustomerHeader';
import styles from '../shop.module.css';

type CartLine = {
    cartId: string;
    itemId: string;
    quantity: number;
    unit: Unit;
    width?: number;
    height?: number;
    pieces?: number;
    customLabel?: string;
};

type CustomerForm = {
    name: string;
    phone: string;
    email: string;
    address: string;
    pincode: string;
    notes: string;
    deliveryPreference: string;
    wantsInstallation: boolean;
    preferredDate: string;
    deliverySlot: string;
    paymentPreference: string;
    paymentMode: string;
};

type CheckoutChargeConfig = {
    deliveryChargeRules: NonNullable<BusinessConfig['deliveryChargeRules']>;
    installationChargePerSqft: number;
};

type CustomerAccount = Pick<CustomerForm, 'name' | 'phone' | 'email' | 'address' | 'pincode' | 'deliveryPreference' | 'wantsInstallation' | 'preferredDate' | 'deliverySlot' | 'paymentPreference' | 'paymentMode'>;

type CustomerCredentialAccount = CustomerAccount & {
    id: string;
    passwordHash: string;
    createdAt: string;
};

type ProductGroup = 'all' | 'clear-float' | 'reflective' | 'tinted' | 'toughened' | 'fluted' | 'mirrors' | 'handles' | 'locks' | 'hinges' | 'patch-fittings' | 'floor-springs' | 'shower-hardware' | 'sliding-systems' | 'brackets';
type SortMode = 'featured' | 'price-low' | 'price-high' | 'name';
type CollectionId = 'bathroom' | 'doors' | 'mirrors' | 'railings' | 'hardware-kits';
type ShopOrderReference = {
    id: string;
    number: string;
    date: string;
    total: number;
    items: number;
    status: string;
    paymentMode?: string;
    paymentStatus?: string;
    deliveryPreference?: string;
    deliveryPlace?: string;
    preferredDate?: string;
    balanceAmount?: number;
    supportRequest?: string;
    lines?: Array<{
        itemId: string;
        name: string;
        quantity: number;
        unit: Unit;
        total: number;
        width?: number;
        height?: number;
        pieces?: number;
    }>;
};

type BulkRequestForm = {
    projectType: string;
    approximateArea: string;
    timeline: string;
    message: string;
};

type FinderNeed = 'shower' | 'door' | 'mirror' | 'partition' | 'railing' | 'hardware';
type FinderFinish = 'clear' | 'tinted' | 'reflective' | 'fluted' | 'mirror';
type FinderPriority = 'budget' | 'premium' | 'complete-kit';

type ProductFinderForm = {
    need: FinderNeed;
    finish: FinderFinish;
    priority: FinderPriority;
};

type ProductInquiryForm = {
    name: string;
    phone: string;
    email: string;
    preferredContact: string;
    message: string;
};

type QuoteAttachment = {
    id: string;
    name: string;
    size: number;
    type: string;
    dataUrl: string;
};

type CustomQuoteForm = {
    projectType: string;
    width: string;
    height: string;
    unit: 'inch' | 'ft' | 'mm' | 'cm' | 'm';
    thickness: string;
    quantity: string;
    holes: string;
    cuts: string;
    finish: string;
    edgeWork: string;
    preferredDate: string;
    notes: string;
};

const CART_KEY = 'agh_shop_cart';
const CUSTOMER_KEY = 'agh_shop_customer';
const CUSTOMER_ACCOUNTS_KEY = 'agh_shop_customer_accounts';
const CUSTOMER_ORDERS_KEY = 'agh_shop_orders';
const WISHLIST_KEY = 'agh_shop_wishlist';
const COMPARE_KEY = 'agh_shop_compare';
const RECENTLY_VIEWED_KEY = 'agh_shop_recently_viewed';
const GST_RATE = 18;
const BUSINESS_WHATSAPP = process.env.NEXT_PUBLIC_COMPANY_WHATSAPP || '+911234567890';
const DEFAULT_CHECKOUT_CHARGES: CheckoutChargeConfig = {
    deliveryChargeRules: [],
    installationChargePerSqft: 0,
};
const DEFAULT_PAYMENT_SETTINGS: Pick<BusinessConfig, 'bankName' | 'bankAccountNumber' | 'bankIfsc' | 'bankBranch' | 'upiId' | 'paymentInstructions'> = {
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    upiId: '',
    paymentInstructions: 'Payment is verified by staff after receipt. Please mention the order number while paying.',
};

const SHOP_PRODUCTS_TIMEOUT_MS = 8000;

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
    pending: 'Order received',
    approved: 'Approved',
    supplier_ordered: 'In production',
    supplier_delivered: 'Ready for delivery',
    customer_delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

const getLatestPaymentConfirmation = (notes?: string) => {
    if (!notes) return '';
    const lines = notes.split('\n').filter(line => line.includes('[Payment confirmation'));
    return lines[lines.length - 1] || '';
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const loadPublicShopProducts = async (): Promise<GlassItem[]> => {
    try {
        const response = await withTimeout(fetch(`/api/shop/products?ts=${Date.now()}`, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        }), SHOP_PRODUCTS_TIMEOUT_MS, 'Shop product API timed out');

        if (!response.ok) {
            throw new Error(`Shop product API failed: ${response.status}`);
        }

        const payload = await response.json();
        if (Array.isArray(payload.items)) {
            return payload.items;
        }
    } catch (error) {
        console.warn('Same-origin shop product API failed, using direct catalogue query:', error);
    }

    return withTimeout(db.items.getShopProducts(), SHOP_PRODUCTS_TIMEOUT_MS, 'Direct shop product query timed out');
};

const PRODUCT_GROUPS: Array<{ id: ProductGroup; label: string; segment: 'all' | 'glass' | 'hardware' }> = [
    { id: 'all', label: 'All Products', segment: 'all' },
    { id: 'clear-float', label: 'Clear Float', segment: 'glass' },
    { id: 'reflective', label: 'Reflective Glass', segment: 'glass' },
    { id: 'tinted', label: 'Tinted Glass', segment: 'glass' },
    { id: 'toughened', label: 'Toughened', segment: 'glass' },
    { id: 'fluted', label: 'Fluted', segment: 'glass' },
    { id: 'mirrors', label: 'Mirrors', segment: 'glass' },
    { id: 'handles', label: 'Handles', segment: 'hardware' },
    { id: 'locks', label: 'Locks', segment: 'hardware' },
    { id: 'hinges', label: 'Hinges', segment: 'hardware' },
    { id: 'patch-fittings', label: 'Patch Fittings', segment: 'hardware' },
    { id: 'floor-springs', label: 'Floor Springs', segment: 'hardware' },
    { id: 'shower-hardware', label: 'Shower Hardware', segment: 'hardware' },
    { id: 'sliding-systems', label: 'Sliding Systems', segment: 'hardware' },
    { id: 'brackets', label: 'Brackets', segment: 'hardware' },
];

const SHOP_IMAGE_BY_GROUP: Record<ProductGroup, string> = {
    all: '/shop-products/photos/clear-glass-panels.png',
    'clear-float': '/shop-products/photos/clear-glass-panels.png',
    reflective: '/shop-products/photos/reflective-glass.png',
    tinted: '/shop-products/photos/tinted-glass.png',
    toughened: '/shop-products/photos/shower-enclosure.png',
    fluted: '/shop-products/photos/fluted-glass.png',
    mirrors: '/shop-products/photos/round-mirror.png',
    handles: '/shop-products/photos/hardware-handles.png',
    locks: '/shop-products/photos/hardware-locks.png',
    hinges: '/shop-products/photos/hardware-hinges.png',
    'patch-fittings': '/shop-products/photos/hardware-patch-fittings.png',
    'floor-springs': '/shop-products/photos/hardware-floor-springs.png',
    'shower-hardware': '/shop-products/photos/hardware-shower-set.png',
    'sliding-systems': '/shop-products/photos/hardware-sliding-systems.png',
    brackets: '/shop-products/photos/hardware-brackets-clamps.png',
};

const PAYMENT_METHODS = [
    {
        mode: 'UPI',
        title: 'UPI',
        subtitle: 'Preferred instant payment mode',
    },
    {
        mode: 'Payment link requested',
        title: 'Payment Link',
        subtitle: 'Request a secure payment link',
    },
    {
        mode: 'Cash on delivery / pickup',
        title: 'Cash',
        subtitle: 'Pay during pickup or delivery',
    },
    {
        mode: 'Bank transfer',
        title: 'Bank Transfer',
        subtitle: 'Pay by account transfer',
    },
    {
        mode: 'Card at store',
        title: 'Card at Store',
        subtitle: 'Swipe card when visiting store',
    },
];

const FEATURED_COLLECTIONS: Array<{
    id: CollectionId;
    title: string;
    description: string;
    groups: ProductGroup[];
    segment: 'glass' | 'hardware' | 'all';
}> = [
    {
        id: 'bathroom',
        title: 'Bathroom & Shower',
        description: 'Toughened glass, shower hinges, brackets and sliding kits.',
        groups: ['toughened', 'shower-hardware', 'hinges', 'brackets', 'sliding-systems'],
        segment: 'all',
    },
    {
        id: 'doors',
        title: 'Glass Doors',
        description: 'Door glass with patch fittings, floor springs, locks and handles.',
        groups: ['toughened', 'patch-fittings', 'floor-springs', 'handles', 'locks'],
        segment: 'all',
    },
    {
        id: 'mirrors',
        title: 'Mirrors',
        description: 'Silver, bronze and premium mirror options for interiors.',
        groups: ['mirrors'],
        segment: 'glass',
    },
    {
        id: 'railings',
        title: 'Railings & Partitions',
        description: 'Toughened panels, brackets, spigots and clamps.',
        groups: ['toughened', 'brackets'],
        segment: 'all',
    },
    {
        id: 'hardware-kits',
        title: 'Hardware Kits',
        description: 'Handles, locks, hinges, patch fittings and sliding systems.',
        groups: ['handles', 'locks', 'hinges', 'patch-fittings', 'sliding-systems'],
        segment: 'hardware',
    },
];

const getItemUnit = (item: GlassItem): Unit => (
    item.rateUnit || item.unit || (item.category === 'hardware' ? 'nos' : 'sqft')
);

const getCatalogueUnit = (item: GlassItem): Unit => {
    if (item.category === 'hardware') return item.unit || 'nos';
    return item.width && item.height ? 'sheets' : 'nos';
};

const getItemDetails = (item: GlassItem) => {
    if (item.category === 'hardware') {
        return [item.make, item.model, item.type].filter(Boolean).join(' • ') || 'Hardware';
    }

    const size = item.width && item.height ? `${item.width}" x ${item.height}"` : '';
    return [item.make, item.type, item.thickness ? `${item.thickness}mm` : '', size].filter(Boolean).join(' • ') || 'Glass';
};

const normalize = (value?: string) => (value || '').toLowerCase();

const getProductGroup = (item: GlassItem): ProductGroup => {
    const configuredGroup = normalize(item.productGroup || '');
    if (configuredGroup) {
        if (configuredGroup.includes('clear')) return 'clear-float';
        if (configuredGroup.includes('reflective')) return 'reflective';
        if (configuredGroup.includes('tinted')) return 'tinted';
        if (configuredGroup.includes('toughened') || configuredGroup.includes('tempered')) return 'toughened';
        if (configuredGroup.includes('fluted') || configuredGroup.includes('reeded')) return 'fluted';
        if (configuredGroup.includes('mirror')) return 'mirrors';
        if (configuredGroup.includes('handle')) return 'handles';
        if (configuredGroup.includes('lock') || configuredGroup.includes('latch')) return 'locks';
        if (configuredGroup.includes('hinge')) return 'hinges';
        if (configuredGroup.includes('patch') || configuredGroup.includes('pivot')) return 'patch-fittings';
        if (configuredGroup.includes('floor')) return 'floor-springs';
        if (configuredGroup.includes('shower')) return 'shower-hardware';
        if (configuredGroup.includes('sliding') || configuredGroup.includes('track') || configuredGroup.includes('roller')) return 'sliding-systems';
        if (configuredGroup.includes('bracket') || configuredGroup.includes('clamp') || configuredGroup.includes('spigot')) return 'brackets';
    }

    const text = normalize([item.name, item.type, item.model, item.make].filter(Boolean).join(' '));

    if (item.category === 'hardware') {
        if (text.includes('handle')) return 'handles';
        if (text.includes('lock') || text.includes('latch')) return 'locks';
        if (text.includes('hinge')) return 'hinges';
        if (text.includes('patch') || text.includes('pivot')) return 'patch-fittings';
        if (text.includes('floor spring') || text.includes('floor-spring')) return 'floor-springs';
        if (text.includes('shower')) return 'shower-hardware';
        if (text.includes('sliding') || text.includes('roller') || text.includes('track')) return 'sliding-systems';
        if (text.includes('bracket') || text.includes('clamp') || text.includes('spigot') || text.includes('standoff')) return 'brackets';
        return 'brackets';
    }

    if (text.includes('mirror')) return 'mirrors';
    if (text.includes('fluted') || text.includes('reeded') || text.includes('pattern')) return 'fluted';
    if (text.includes('toughened') || text.includes('tempered')) return 'toughened';
    if (text.includes('reflective') || text.includes('one way') || text.includes('solar')) return 'reflective';
    if (text.includes('tinted') || text.includes('bronze') || text.includes('grey') || text.includes('green') || text.includes('blue')) return 'tinted';
    return 'clear-float';
};

const getShopImage = (item: GlassItem) => {
    if (item.imageUrl) return item.imageUrl;

    const text = normalize([item.name, item.type, item.model, item.make].filter(Boolean).join(' '));
    const group = getProductGroup(item);

    if (group === 'tinted') {
        if (text.includes('bronze')) return '/shop-products/photos/tinted-bronze-glass.png';
        if (text.includes('green')) return '/shop-products/photos/tinted-green-glass.png';
        if (text.includes('grey') || text.includes('gray') || text.includes('smoke')) return '/shop-products/photos/tinted-grey-glass.png';
        return SHOP_IMAGE_BY_GROUP.tinted;
    }

    if (group === 'reflective') {
        if (text.includes('green')) return '/shop-products/photos/reflective-green-glass.png';
        if (text.includes('grey') || text.includes('gray') || text.includes('silver')) return '/shop-products/photos/reflective-grey-glass.png';
        return SHOP_IMAGE_BY_GROUP.reflective;
    }

    if (group === 'mirrors') {
        if (text.includes('led') || text.includes('backlit') || text.includes('light')) return '/shop-products/photos/led-mirror.png';
        if (text.includes('round') || text.includes('circle') || text.includes('circular')) return '/shop-products/photos/round-mirror.png';
        if (text.includes('oval') || text.includes('arch') || text.includes('arched') || text.includes('bevel') || text.includes('decorative') || text.includes('designer')) {
            return '/shop-products/photos/decorative-mirrors.png';
        }
        if (text.includes('bronze')) return '/shop-products/photos/tinted-bronze-glass.png';
        return SHOP_IMAGE_BY_GROUP.mirrors;
    }

    if (item.category === 'hardware') {
        if (group === 'shower-hardware' || text.includes('shower')) return '/shop-products/photos/hardware-shower-set.png';
        if (group === 'handles' || text.includes('handle')) return '/shop-products/photos/hardware-handles.png';
        if (group === 'locks' || text.includes('lock') || text.includes('latch')) return '/shop-products/photos/hardware-locks.png';
        if (group === 'hinges' || text.includes('hinge')) return '/shop-products/photos/hardware-hinges.png';
        if (group === 'patch-fittings' || text.includes('patch') || text.includes('pivot')) return '/shop-products/photos/hardware-patch-fittings.png';
        if (group === 'floor-springs' || text.includes('floor spring') || text.includes('floor-spring')) return '/shop-products/photos/hardware-floor-springs.png';
        if (group === 'sliding-systems' || text.includes('sliding') || text.includes('roller') || text.includes('track') || text.includes('barn')) return '/shop-products/photos/hardware-sliding-systems.png';
        if (group === 'brackets' || text.includes('bracket') || text.includes('clamp') || text.includes('spigot') || text.includes('standoff')) return '/shop-products/photos/hardware-brackets-clamps.png';
    }

    return SHOP_IMAGE_BY_GROUP[group];
};

const getSubtype = (item: GlassItem) => {
    if (item.model) return item.model;
    if (item.category === 'hardware') return item.type || 'General Hardware';
    return [item.thickness ? `${item.thickness}mm` : '', item.type].filter(Boolean).join(' ') || 'Standard';
};

const getStockLabel = (item: GlassItem) => {
    const stock = Number(item.stock) || 0;
    const unit = formatUnitLabel(item.unit);
    if (stock <= 0) return { label: 'Confirm availability', tone: 'neutral' };
    if (stock <= (item.minStock || 10)) return { label: `Limited stock: ${stock} ${unit}`, tone: 'warning' };
    return { label: `In stock: ${stock} ${unit}`, tone: 'success' };
};

const getReservedStockLabel = (item: GlassItem) => {
    const reservedStock = Number(item.reservedStock) || 0;
    if (reservedStock <= 0) return '';
    return `${roundCurrency(reservedStock).toFixed(2)} ${formatUnitLabel(item.unit)} reserved`;
};

const getEffectiveRate = (item: GlassItem, unit: Unit) => convertRateForItemUnit({
    rate: item.rate || 0,
    fromUnit: item.rateUnit || item.unit || (item.category === 'hardware' ? 'nos' : 'sqft'),
    toUnit: unit,
    width: item.width || 0,
    height: item.height || 0,
    conversionFactor: item.conversionFactor,
});

const detectDeliveryRule = (pincode: string, rules: NonNullable<BusinessConfig['deliveryChargeRules']>) => {
    const digits = pincode.replace(/\D/g, '');
    if (!digits) return undefined;

    const matches = rules.filter(rule => (rule.pincodePrefixes || []).some(prefix => prefix && digits.startsWith(prefix)));
    if (matches.length > 0) {
        // Prefer the most specific (longest) matching prefix, e.g. an exact
        // 6-digit match beats a 3-digit city-wide prefix.
        return matches.reduce((best, rule) => {
            const bestLen = Math.max(0, ...(best.pincodePrefixes || []).map(p => p.length));
            const ruleLen = Math.max(0, ...(rule.pincodePrefixes || []).map(p => p.length));
            return ruleLen > bestLen ? rule : best;
        });
    }

    // No configured prefix matched: fall back to the zone with no prefixes
    // configured (the catch-all "everywhere else" tier), if any.
    return rules.find(rule => !rule.pincodePrefixes || rule.pincodePrefixes.length === 0);
};

const getLineAmounts = (item: GlassItem, quantity: number, unit: Unit) => calculateLineAmounts({
    width: item.width || 0,
    height: item.height || 0,
    quantity,
    unit,
    rate: getEffectiveRate(item, unit),
    taxRate: GST_RATE,
    conversionFactor: item.conversionFactor,
});

const getStockComparison = (item: GlassItem, quantity: number, unit: Unit) => {
    const stock = Number(item.stock) || 0;
    const stockUnit = (item.unit || getCatalogueUnit(item)) as Unit;
    const requestedUnitDefinition = getUnitDefinition(unit);
    const stockUnitDefinition = getUnitDefinition(stockUnit);
    const sheetAreaSqft = getSheetAreaSqft({
        width: item.width || 0,
        height: item.height || 0,
        conversionFactor: item.conversionFactor,
    });
    const canCompare = unit === stockUnit
        || (requestedUnitDefinition.category === 'area' && stockUnitDefinition.category === 'area')
        || (((unit === 'sheets' && stockUnitDefinition.category === 'area') || (requestedUnitDefinition.category === 'area' && stockUnit === 'sheets')) && sheetAreaSqft > 0);
    const requestedInStockUnit = convertQuantityForItemUnit({
        quantity,
        fromUnit: unit,
        toUnit: stockUnit,
        width: item.width || 0,
        height: item.height || 0,
        conversionFactor: item.conversionFactor,
    });
    const isOutOfStock = stock <= 0;
    const isInsufficient = !isOutOfStock && canCompare && requestedInStockUnit > stock + 0.0001;
    const quantityLabel = `${roundCurrency(quantity).toFixed(2)} ${formatUnitLabel(unit)}`;
    const stockLabel = `${roundCurrency(stock).toFixed(2)} ${formatUnitLabel(stockUnit)}`;
    const requestedLabel = `${roundCurrency(requestedInStockUnit).toFixed(2)} ${formatUnitLabel(stockUnit)}`;

    return {
        stock,
        stockUnit,
        requestedInStockUnit,
        canCompare,
        isOutOfStock,
        isInsufficient,
        quantityLabel,
        stockLabel,
        requestedLabel,
    };
};

const getQuantityStep = (unit: Unit) => {
    if (['nos', 'pieces', 'pair', 'sets', 'sheets', 'box'].includes(unit)) return 1;
    if (['sqft', 'sqm', 'sqin', 'sqyd'].includes(unit)) return 0.25;
    return 0.01;
};

const quoteDimensionToInches = (value: number, unit: CustomQuoteForm['unit']) => {
    if (unit === 'ft') return value * 12;
    if (unit === 'mm') return value / 25.4;
    if (unit === 'cm') return value / 2.54;
    if (unit === 'm') return value * 39.37007874;
    return value;
};

const hashCustomerPassword = async (password: string) => {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
        const encoded = new TextEncoder().encode(password);
        const digest = await window.crypto.subtle.digest('SHA-256', encoded);
        return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    return btoa(password);
};

const normalizeLoginValue = (value: string) => value.trim().toLowerCase();

const phoneDigits = (value: string) => value.replace(/\D/g, '');

const findCustomerByPhone = (parties: Party[], phone: string) => {
    const digits = phoneDigits(phone);
    if (digits.length < 6) return null;

    return parties.find(party => {
        const partyDigits = phoneDigits(party.phone);
        return party.type === 'customer' && partyDigits.length >= 6 && (
            partyDigits.endsWith(digits) || digits.endsWith(partyDigits.slice(-10))
        );
    }) || null;
};

const getCustomerStorageKey = (baseKey: string, account?: CustomerAccount | null) => {
    if (!account) return baseKey;
    const rawKey = normalizeLoginValue(account.phone || account.email || account.name);
    const safeKey = rawKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return safeKey ? `${baseKey}_${safeKey}` : baseKey;
};

const migrateCustomerStorage = (baseKey: string, oldAccount: CustomerAccount | null, nextAccount: CustomerAccount) => {
    if (!oldAccount) return;
    const oldKey = getCustomerStorageKey(baseKey, oldAccount);
    const nextKey = getCustomerStorageKey(baseKey, nextAccount);
    if (oldKey === nextKey) return;
    const oldValue = window.localStorage.getItem(oldKey);
    if (oldValue && !window.localStorage.getItem(nextKey)) {
        window.localStorage.setItem(nextKey, oldValue);
    }
};

const readCustomerAccounts = (): CustomerCredentialAccount[] => {
    if (typeof window === 'undefined') return [];
    try {
        const saved = window.localStorage.getItem(CUSTOMER_ACCOUNTS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

const writeCustomerAccounts = (accounts: CustomerCredentialAccount[]) => {
    window.localStorage.setItem(CUSTOMER_ACCOUNTS_KEY, JSON.stringify(accounts));
};

export default function ShopPage() {
    const [items, setItems] = useState<GlassItem[]>([]);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [quickQuantities, setQuickQuantities] = useState<Record<string, string>>({});
    const [cartQuantityDrafts, setCartQuantityDrafts] = useState<Record<string, string>>({});
    const [cartOpen, setCartOpen] = useState(false);
    const [authOpen, setAuthOpen] = useState(false);
    const [authMode, setAuthMode] = useState<'login' | 'register' | 'edit'>('login');
    const [query, setQuery] = useState('');
    const [segment, setSegment] = useState<'all' | 'glass' | 'hardware'>('all');
    const [group, setGroup] = useState<ProductGroup>('all');
    const [subtype, setSubtype] = useState('all');
    const [sortMode, setSortMode] = useState<SortMode>('featured');
    const [priceRange, setPriceRange] = useState({ min: '', max: '' });
    const [copiedLink, setCopiedLink] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [customerAccount, setCustomerAccount] = useState<CustomerAccount | null>(null);
    const [authCredentials, setAuthCredentials] = useState({
        identifier: '',
        password: '',
        confirmPassword: '',
    });
    const [customerOrders, setCustomerOrders] = useState<ShopOrderReference[]>([]);
    const [accountOpen, setAccountOpen] = useState(false);
    const [ordersOpen, setOrdersOpen] = useState(false);
    const [supportOrder, setSupportOrder] = useState<ShopOrderReference | null>(null);
    const [supportType, setSupportType] = useState<'help' | 'cancel' | 'payment'>('help');
    const [supportMessage, setSupportMessage] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<GlassItem | null>(null);
    const [inquiryProduct, setInquiryProduct] = useState<GlassItem | null>(null);
    const [wishlistIds, setWishlistIds] = useState<string[]>([]);
    const [compareIds, setCompareIds] = useState<string[]>([]);
    const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
    const [compareOpen, setCompareOpen] = useState(false);
    const [customSizeProduct, setCustomSizeProduct] = useState<GlassItem | null>(null);
    const [bulkRequestOpen, setBulkRequestOpen] = useState(false);
    const [customQuoteOpen, setCustomQuoteOpen] = useState(false);
    const [finderOpen, setFinderOpen] = useState(false);
    const [orderSuccessOpen, setOrderSuccessOpen] = useState(false);
    const [lastOrder, setLastOrder] = useState<ShopOrderReference | null>(null);
    const [activeCollection, setActiveCollection] = useState<CollectionId | null>(null);
    const [finder, setFinder] = useState<ProductFinderForm>({
        need: 'shower',
        finish: 'clear',
        priority: 'complete-kit',
    });
    const [customSize, setCustomSize] = useState({
        width: '',
        height: '',
        pieces: '1',
    });
    const [customQuote, setCustomQuote] = useState<CustomQuoteForm>({
        projectType: 'Glass door / partition',
        width: '',
        height: '',
        unit: 'inch',
        thickness: '10',
        quantity: '1',
        holes: '0',
        cuts: '0',
        finish: 'Clear',
        edgeWork: 'Standard edge',
        preferredDate: '',
        notes: '',
    });
    const [quoteAttachments, setQuoteAttachments] = useState<QuoteAttachment[]>([]);
    const [bulkRequest, setBulkRequest] = useState<BulkRequestForm>({
        projectType: 'Bathroom / shower enclosure',
        approximateArea: '',
        timeline: 'This week',
        message: '',
    });
    const [productInquiry, setProductInquiry] = useState<ProductInquiryForm>({
        name: '',
        phone: '',
        email: '',
        preferredContact: 'Phone call',
        message: '',
    });
    const [customer, setCustomer] = useState<CustomerForm>({
        name: '',
        phone: '',
        email: '',
        address: '',
        pincode: '',
        notes: '',
        deliveryPreference: 'Delivery required',
        wantsInstallation: false,
        preferredDate: '',
        deliverySlot: 'Any time',
        paymentPreference: 'Pay with selected method',
        paymentMode: 'UPI',
    });
    const [checkoutCharges, setCheckoutCharges] = useState<CheckoutChargeConfig>(DEFAULT_CHECKOUT_CHARGES);
    const [paymentSettings, setPaymentSettings] = useState(DEFAULT_PAYMENT_SETTINGS);

    const refreshShopProducts = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const itemsData = await loadPublicShopProducts();
            setItems(itemsData);
        } catch (error) {
            console.error('Could not load shop products:', error);
            setItems([]);
            setErrorMessage('Could not load products right now. Please use Retry Products or contact Arjun Glass House.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const loadShop = async () => {
            refreshShopProducts();

            try {
                const businessConfig = await db.businessConfig.get();
                const configuredCharges = {
                    deliveryChargeRules: (businessConfig.deliveryChargeRules || []).filter(rule => rule.place.trim()),
                    installationChargePerSqft: Math.max(0, Number(businessConfig.installationChargePerSqft) || 0),
                };
                setCheckoutCharges(configuredCharges);
                setPaymentSettings({
                    bankName: businessConfig.bankName || '',
                    bankAccountNumber: businessConfig.bankAccountNumber || '',
                    bankIfsc: businessConfig.bankIfsc || '',
                    bankBranch: businessConfig.bankBranch || '',
                    upiId: businessConfig.upiId || '',
                    paymentInstructions: businessConfig.paymentInstructions || DEFAULT_PAYMENT_SETTINGS.paymentInstructions,
                });
            } catch (error) {
                console.error('Could not load checkout charge settings:', error);
                setCheckoutCharges(DEFAULT_CHECKOUT_CHARGES);
                setPaymentSettings(DEFAULT_PAYMENT_SETTINGS);
            }
        };

        loadShop();

        const params = new URLSearchParams(window.location.search);
        const groupParam = params.get('group') as ProductGroup | null;
        const segmentParam = params.get('segment') as 'all' | 'glass' | 'hardware' | null;
        const collectionParam = params.get('collection') as CollectionId | null;
        const queryParam = params.get('q');
        const subtypeParam = params.get('subtype');
        const sortParam = params.get('sort') as SortMode | null;
        const minParam = params.get('min');
        const maxParam = params.get('max');
        const accountParam = params.get('account');

        if (segmentParam && ['all', 'glass', 'hardware'].includes(segmentParam)) {
            setSegment(segmentParam);
        }

        if (groupParam && PRODUCT_GROUPS.some(productGroup => productGroup.id === groupParam)) {
            setGroup(groupParam);
            setSubtype('all');
        }

        if (collectionParam && FEATURED_COLLECTIONS.some(collection => collection.id === collectionParam)) {
            setActiveCollection(collectionParam);
        }

        if (queryParam) {
            setQuery(queryParam);
        }

        if (subtypeParam) {
            setSubtype(subtypeParam);
        }

        if (sortParam && ['featured', 'price-low', 'price-high', 'name'].includes(sortParam)) {
            setSortMode(sortParam);
        }

        if (minParam || maxParam) {
            setPriceRange({ min: minParam || '', max: maxParam || '' });
        }

        if (accountParam === 'login' || accountParam === 'register') {
            setAuthMode(accountParam);
            setAuthOpen(true);
        }

        if (accountParam === 'orders') {
            setOrdersOpen(true);
        }

        if (accountParam === 'profile') {
            setAccountOpen(true);
        }

        try {
            const savedCustomer = window.localStorage.getItem(CUSTOMER_KEY);
            let parsedCustomer: CustomerAccount | null = null;
            if (savedCustomer) {
                parsedCustomer = JSON.parse(savedCustomer) as CustomerAccount;
                setCustomerAccount(parsedCustomer);
                setCustomer(prev => ({ ...prev, ...parsedCustomer }));
            }

            const savedCart = window.localStorage.getItem(getCustomerStorageKey(CART_KEY, parsedCustomer)) || window.localStorage.getItem(CART_KEY);
            if (savedCart) setCart(JSON.parse(savedCart));

            const scopedOrdersKey = getCustomerStorageKey(CUSTOMER_ORDERS_KEY, parsedCustomer);
            const legacyOrders = parsedCustomer ? window.localStorage.getItem(CUSTOMER_ORDERS_KEY) : null;
            const savedOrders = window.localStorage.getItem(scopedOrdersKey) || legacyOrders;
            if (parsedCustomer && savedOrders && !window.localStorage.getItem(scopedOrdersKey)) {
                window.localStorage.setItem(scopedOrdersKey, savedOrders);
            }
            if (savedOrders) setCustomerOrders(JSON.parse(savedOrders));

            const scopedWishlistKey = getCustomerStorageKey(WISHLIST_KEY, parsedCustomer);
            const legacyWishlist = parsedCustomer ? window.localStorage.getItem(WISHLIST_KEY) : null;
            const savedWishlist = window.localStorage.getItem(scopedWishlistKey) || legacyWishlist;
            if (parsedCustomer && savedWishlist && !window.localStorage.getItem(scopedWishlistKey)) {
                window.localStorage.setItem(scopedWishlistKey, savedWishlist);
            }
            if (savedWishlist) setWishlistIds(JSON.parse(savedWishlist));

            const savedCompare = window.localStorage.getItem(COMPARE_KEY);
            if (savedCompare) setCompareIds(JSON.parse(savedCompare));

            const savedRecentlyViewed = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
            if (savedRecentlyViewed) setRecentlyViewedIds(JSON.parse(savedRecentlyViewed));
        } catch {
            setCart([]);
        }
    }, []);

    useEffect(() => {
        window.localStorage.setItem(getCustomerStorageKey(CART_KEY, customerAccount), JSON.stringify(cart));
    }, [cart, customerAccount]);

    const hasActiveOverlay = cartOpen
        || authOpen
        || accountOpen
        || ordersOpen
        || !!supportOrder
        || compareOpen
        || !!selectedProduct
        || !!inquiryProduct
        || !!customSizeProduct
        || customQuoteOpen
        || finderOpen
        || bulkRequestOpen
        || orderSuccessOpen;

    useEffect(() => {
        if (!hasActiveOverlay) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const closeTopOverlay = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            if (orderSuccessOpen) return setOrderSuccessOpen(false);
            if (supportOrder) return setSupportOrder(null);
            if (authOpen) return setAuthOpen(false);
            if (accountOpen) return setAccountOpen(false);
            if (ordersOpen) return setOrdersOpen(false);
            if (compareOpen) return setCompareOpen(false);
            if (selectedProduct) return setSelectedProduct(null);
            if (inquiryProduct) return setInquiryProduct(null);
            if (customSizeProduct) return setCustomSizeProduct(null);
            if (customQuoteOpen) return setCustomQuoteOpen(false);
            if (finderOpen) return setFinderOpen(false);
            if (bulkRequestOpen) return setBulkRequestOpen(false);
            if (cartOpen) return setCartOpen(false);
        };

        window.addEventListener('keydown', closeTopOverlay);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeTopOverlay);
        };
    }, [
        accountOpen,
        authOpen,
        bulkRequestOpen,
        cartOpen,
        compareOpen,
        customQuoteOpen,
        customSizeProduct,
        finderOpen,
        hasActiveOverlay,
        inquiryProduct,
        orderSuccessOpen,
        ordersOpen,
        selectedProduct,
        supportOrder,
    ]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (segment !== 'all') params.set('segment', segment);
        if (group !== 'all') params.set('group', group);
        if (subtype !== 'all') params.set('subtype', subtype);
        if (sortMode !== 'featured') params.set('sort', sortMode);
        if (query.trim()) params.set('q', query.trim());
        if (priceRange.min.trim()) params.set('min', priceRange.min.trim());
        if (priceRange.max.trim()) params.set('max', priceRange.max.trim());
        if (activeCollection) params.set('collection', activeCollection);

        const queryString = params.toString();
        const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
        if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
            window.history.replaceState(null, '', nextUrl);
        }
    }, [activeCollection, group, priceRange.max, priceRange.min, query, segment, sortMode, subtype]);

    const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

    const wishlistItems = useMemo(() => wishlistIds.map(id => itemById.get(id)).filter(Boolean) as GlassItem[], [itemById, wishlistIds]);
    const compareItems = useMemo(() => compareIds.map(id => itemById.get(id)).filter(Boolean) as GlassItem[], [compareIds, itemById]);
    const recentlyViewedItems = useMemo(() => recentlyViewedIds.map(id => itemById.get(id)).filter(Boolean) as GlassItem[], [itemById, recentlyViewedIds]);

    const showcaseSections = useMemo(() => {
        const availableItems = items.filter(item => (item.rate || 0) > 0);
        const popularGroups: ProductGroup[] = ['toughened', 'mirrors', 'handles', 'shower-hardware', 'patch-fittings'];
        const popularItems = availableItems
            .filter(item => popularGroups.includes(getProductGroup(item)))
            .slice(0, 6);
        const valueItems = [...availableItems]
            .sort((a, b) => (a.rate || 0) - (b.rate || 0))
            .slice(0, 6);

        return [
            {
                id: 'popular',
                title: 'Popular picks',
                subtitle: 'Fast-moving glass and hardware customers usually ask for.',
                items: popularItems,
            },
            {
                id: 'value',
                title: 'Value buys',
                subtitle: 'Lower starting-price items for quick browsing.',
                items: valueItems,
            },
        ].filter(section => section.items.length > 0);
    }, [items]);

    const finderResult = useMemo(() => {
        const finishGroup: Record<FinderFinish, ProductGroup> = {
            clear: 'clear-float',
            tinted: 'tinted',
            reflective: 'reflective',
            fluted: 'fluted',
            mirror: 'mirrors',
        };

        const byNeed: Record<FinderNeed, { title: string; description: string; groups: ProductGroup[]; segment: 'all' | 'glass' | 'hardware' }> = {
            shower: {
                title: 'Shower enclosure set',
                description: 'Use toughened glass with shower hinges, brackets and sliding/shower fittings.',
                groups: ['toughened', 'shower-hardware', 'hinges', 'brackets', 'sliding-systems'],
                segment: 'all',
            },
            door: {
                title: 'Glass door set',
                description: 'Start with toughened glass and add handles, locks, floor springs or patch fittings.',
                groups: ['toughened', 'handles', 'locks', 'floor-springs', 'patch-fittings'],
                segment: 'all',
            },
            mirror: {
                title: 'Mirror selection',
                description: 'Browse mirror products for bathrooms, wardrobes and interior walls.',
                groups: ['mirrors'],
                segment: 'glass',
            },
            partition: {
                title: 'Partition glass',
                description: 'Choose clear, fluted, tinted or reflective glass depending on privacy and finish.',
                groups: ['clear-float', 'fluted', 'tinted', 'reflective', 'toughened'],
                segment: 'glass',
            },
            railing: {
                title: 'Railing and balcony glass',
                description: 'Use toughened panels with brackets, clamps or standoff hardware.',
                groups: ['toughened', 'brackets'],
                segment: 'all',
            },
            hardware: {
                title: 'Hardware replacement',
                description: 'Browse handles, locks, hinges and patch/sliding hardware by type.',
                groups: ['handles', 'locks', 'hinges', 'patch-fittings', 'sliding-systems'],
                segment: 'hardware',
            },
        };

        const base = byNeed[finder.need];
        const finish = finishGroup[finder.finish];
        const groups = finder.need === 'hardware'
            ? base.groups
            : Array.from(new Set([finish, ...base.groups]));

        const priorityText: Record<FinderPriority, string> = {
            budget: 'Sorted for value options first.',
            premium: 'Sorted for premium/high-value options first.',
            'complete-kit': 'Shows both glass and matching hardware where useful.',
        };

        return {
            ...base,
            groups,
            priorityText: priorityText[finder.priority],
            primaryGroup: groups[0],
            sortMode: finder.priority === 'premium' ? 'price-high' as SortMode : finder.priority === 'budget' ? 'price-low' as SortMode : 'featured' as SortMode,
        };
    }, [finder]);

    const visibleGroups = useMemo(() => (
        PRODUCT_GROUPS.filter(productGroup => segment === 'all' || productGroup.segment === 'all' || productGroup.segment === segment)
    ), [segment]);

    const subtypeOptions = useMemo(() => {
        const values = new Set<string>();
        items.forEach(item => {
            if (group !== 'all' && getProductGroup(item) !== group) return;
            if (segment === 'glass' && item.category === 'hardware') return;
            if (segment === 'hardware' && item.category !== 'hardware') return;
            values.add(getSubtype(item));
        });
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [group, items, segment]);

    const filteredItems = useMemo(() => {
        const search = query.trim().toLowerCase();
        const minPrice = Number(priceRange.min);
        const maxPrice = Number(priceRange.max);
        const filtered = items.filter(item => {
            const itemGroup = getProductGroup(item);
            const collection = activeCollection ? FEATURED_COLLECTIONS.find(entry => entry.id === activeCollection) : null;
            const matchesSegment = segment === 'all'
                || (segment === 'glass' && item.category !== 'hardware')
                || (segment === 'hardware' && item.category === 'hardware');
            const matchesGroup = group === 'all' || itemGroup === group;
            const matchesSubtype = subtype === 'all' || getSubtype(item) === subtype;
            const matchesCollection = !collection || collection.groups.includes(itemGroup);
            const matchesMinPrice = !priceRange.min || ((item.rate || 0) >= minPrice);
            const matchesMaxPrice = !priceRange.max || ((item.rate || 0) <= maxPrice);

            const haystack = [
                item.name,
                item.make,
                item.model,
                item.type,
                item.thickness ? `${item.thickness}mm` : '',
                item.width && item.height ? `${item.width}x${item.height}` : '',
                PRODUCT_GROUPS.find(productGroup => productGroup.id === itemGroup)?.label,
            ].filter(Boolean).join(' ').toLowerCase();

            return matchesSegment && matchesGroup && matchesSubtype && matchesCollection && matchesMinPrice && matchesMaxPrice && (!search || haystack.includes(search));
        });

        return [...filtered].sort((a, b) => {
            if (sortMode === 'price-low') return (a.rate || 0) - (b.rate || 0);
            if (sortMode === 'price-high') return (b.rate || 0) - (a.rate || 0);
            if (sortMode === 'name') return a.name.localeCompare(b.name);
            return PRODUCT_GROUPS.findIndex(productGroup => productGroup.id === getProductGroup(a))
                - PRODUCT_GROUPS.findIndex(productGroup => productGroup.id === getProductGroup(b));
        });
    }, [activeCollection, group, items, priceRange.max, priceRange.min, query, segment, sortMode, subtype]);

    const activeFilterLabels = useMemo(() => {
        const labels: string[] = [];
        if (activeCollection) labels.push(FEATURED_COLLECTIONS.find(collection => collection.id === activeCollection)?.title || 'Collection');
        if (segment !== 'all') labels.push(segment === 'glass' ? 'Glass' : 'Hardware');
        if (group !== 'all') labels.push(PRODUCT_GROUPS.find(productGroup => productGroup.id === group)?.label || group);
        if (subtype !== 'all') labels.push(subtype);
        if (query.trim()) labels.push(`Search: ${query.trim()}`);
        if (priceRange.min || priceRange.max) labels.push(`Price: ${priceRange.min || '0'}-${priceRange.max || 'Any'}`);
        if (sortMode !== 'featured') labels.push(sortMode === 'price-low' ? 'Price low to high' : sortMode === 'price-high' ? 'Price high to low' : 'Name sort');
        return labels;
    }, [activeCollection, group, priceRange.max, priceRange.min, query, segment, sortMode, subtype]);

    const cartDetails = useMemo(() => {
        const lines = cart
            .map(line => {
                const item = itemById.get(line.itemId);
                if (!item) return null;
                const calculated = getLineAmounts(item, line.quantity, line.unit);
                return { ...line, item, calculated };
            })
            .filter(Boolean) as Array<CartLine & { item: GlassItem; calculated: ReturnType<typeof getLineAmounts> }>;

        const productSubtotal = roundCurrency(lines.reduce((sum, line) => sum + line.calculated.amount, 0));
        const areaSqft = roundCurrency(lines.reduce((sum, line) => sum + (line.calculated.sqft || 0), 0));
        const selectedDeliveryRule = detectDeliveryRule(customer.pincode, checkoutCharges.deliveryChargeRules);
        const transportCharge = customer.deliveryPreference === 'Pickup from store'
            ? 0
            : roundCurrency(Math.max(0, Number(selectedDeliveryRule?.charge) || 0));
        const installationCharge = customer.wantsInstallation
            ? roundCurrency(areaSqft * Math.max(0, Number(checkoutCharges.installationChargePerSqft) || 0))
            : 0;
        const additionalCharges = roundCurrency(transportCharge + installationCharge);
        const subtotal = roundCurrency(productSubtotal + additionalCharges);
        const taxAmount = roundCurrency(subtotal * GST_RATE / 100);
        const total = roundCurrency(subtotal + taxAmount);
        const rowCount = lines.length;
        const pieceCount = roundCurrency(lines.reduce((sum, line) => {
            if (['sqft', 'sqm', 'sqin', 'sqyd'].includes(line.unit)) return sum + (Number(line.pieces) || 1);
            return sum + line.quantity;
        }, 0));

        return { lines, productSubtotal, areaSqft, selectedDeliveryRule, transportCharge, installationCharge, additionalCharges, subtotal, taxAmount, total, itemCount: pieceCount, rowCount, pieceCount };
    }, [cart, checkoutCharges.deliveryChargeRules, checkoutCharges.installationChargePerSqft, customer.deliveryPreference, customer.pincode, customer.wantsInstallation, itemById]);

    const cartAvailability = useMemo(() => {
        const warnings: string[] = [];
        const blockingWarnings: string[] = [];

        cartDetails.lines.forEach(line => {
            const stockCheck = getStockComparison(line.item, line.quantity, line.unit);
            if (stockCheck.isOutOfStock) {
                blockingWarnings.push(`${line.customLabel || line.item.name}: out of stock.`);
                return;
            }
            if (stockCheck.isInsufficient) {
                blockingWarnings.push(`${line.customLabel || line.item.name}: requested ${stockCheck.quantityLabel} (${stockCheck.requestedLabel}), available ${stockCheck.stockLabel}.`);
                return;
            }
            if (!stockCheck.canCompare) {
                warnings.push(`${line.customLabel || line.item.name}: stock is held in ${formatUnitLabel(stockCheck.stockUnit)} while cart uses ${formatUnitLabel(line.unit)}.`);
            }
        });

        return {
            hasWarnings: warnings.length > 0 || blockingWarnings.length > 0,
            hasBlockingWarnings: blockingWarnings.length > 0,
            warnings: [...blockingWarnings, ...warnings],
        };
    }, [cartDetails.lines]);

    const paymentDetails = useMemo(() => {
        const amount = roundCurrency(cartDetails.total);
        const upiId = (paymentSettings.upiId || '').trim();
        const payeeName = encodeURIComponent('Arjun Glass House');
        const note = encodeURIComponent('Arjun Glass House online order');
        const upiLink = upiId && amount > 0
            ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${payeeName}&am=${amount.toFixed(2)}&cu=INR&tn=${note}`
            : '';
        const bankLines = [
            paymentSettings.bankName ? `Bank: ${paymentSettings.bankName}` : '',
            paymentSettings.bankAccountNumber ? `A/c: ${paymentSettings.bankAccountNumber}` : '',
            paymentSettings.bankIfsc ? `IFSC: ${paymentSettings.bankIfsc}` : '',
            paymentSettings.bankBranch ? `Branch: ${paymentSettings.bankBranch}` : '',
        ].filter(Boolean);
        const copyText = [
            'Arjun Glass House payment request',
            `Amount: ${formatIndianCurrency(amount)}`,
            customer.paymentMode ? `Mode: ${customer.paymentMode}` : '',
            upiId && customer.paymentMode === 'UPI' ? `UPI ID: ${upiId}` : '',
            customer.paymentMode === 'Bank transfer' ? bankLines.join(' | ') : '',
            paymentSettings.paymentInstructions || DEFAULT_PAYMENT_SETTINGS.paymentInstructions,
        ].filter(Boolean).join('\n');

        return { amount, upiId, upiLink, bankLines, copyText };
    }, [cartDetails.total, customer.paymentMode, paymentSettings]);

    const checkoutReadiness = useMemo(() => {
        const hasCart = cartDetails.lines.length > 0;
        const hasLogin = !!customerAccount;
        const hasValidPhone = phoneDigits(customer.phone).length >= 6;
        const hasPincode = customer.deliveryPreference === 'Pickup from store' || customer.pincode.replace(/\D/g, '').length >= 6;
        const hasDelivery = !!customer.name.trim() && hasValidPhone && !!customer.address.trim() && hasPincode;
        const hasPayment = !!customer.paymentMode.trim();
        const issues = [
            !hasCart ? 'Add at least one product' : '',
            !hasLogin ? 'Login or register' : '',
            !hasDelivery ? 'Complete name, valid phone, address and 6-digit pincode' : '',
            !hasPayment ? 'Choose payment mode' : '',
            cartAvailability.hasBlockingWarnings ? 'Remove out-of-stock items' : '',
        ].filter(Boolean);

        return {
            ready: issues.length === 0,
            issues,
            steps: [
                { label: 'Cart', done: hasCart },
                { label: 'Login', done: hasLogin },
                { label: 'Delivery', done: hasDelivery },
                { label: 'Payment', done: hasPayment },
                { label: 'Review', done: issues.length === 0 },
            ],
        };
    }, [cartAvailability.hasBlockingWarnings, cartDetails.lines.length, customer.name, customer.phone, customer.address, customer.pincode, customer.deliveryPreference, customer.paymentMode, customerAccount]);

    const customQuotePreview = useMemo(() => {
        const width = Number(customQuote.width) || 0;
        const height = Number(customQuote.height) || 0;
        const quantity = Math.max(1, Math.floor(Number(customQuote.quantity) || 1));
        const holes = Math.max(0, Math.floor(Number(customQuote.holes) || 0));
        const cuts = Math.max(0, Math.floor(Number(customQuote.cuts) || 0));
        const widthInches = quoteDimensionToInches(width, customQuote.unit);
        const heightInches = quoteDimensionToInches(height, customQuote.unit);
        const billedWidth = widthInches > 0 ? roundToNextEvenInch(widthInches) : 0;
        const billedHeight = heightInches > 0 ? roundToNextEvenInch(heightInches) : 0;
        const areaSqft = roundCurrency((billedWidth * billedHeight * quantity) / 144);

        return {
            enteredSize: width > 0 && height > 0 ? `${width} x ${height} ${customQuote.unit}` : 'Enter width and height',
            billedSize: billedWidth > 0 && billedHeight > 0 ? `${billedWidth}" x ${billedHeight}"` : 'Calculated after size entry',
            areaSqft,
            quantity,
            holesTotal: holes * quantity,
            cutsTotal: cuts * quantity,
        };
    }, [customQuote.cuts, customQuote.height, customQuote.holes, customQuote.quantity, customQuote.unit, customQuote.width]);

    const getQuickQuantity = (itemId: string) => {
        const value = Number(quickQuantities[itemId] || '1');
        return Number.isFinite(value) && value > 0 ? roundCurrency(value) : 1;
    };

    const updateQuickQuantity = (itemId: string, value: string) => {
        setQuickQuantities(prev => ({ ...prev, [itemId]: value }));
    };

    const addToCart = (item: GlassItem, quantity = 1, openCart = true) => {
        setSuccessMessage('');
        setErrorMessage('');
        const unit = getCatalogueUnit(item);
        const safeQuantity = Math.max(0.01, roundCurrency(quantity));
        setCart(prev => {
            const existing = prev.find(line => line.itemId === item.id && line.unit === unit);
            if (existing) {
                return prev.map(line => line.cartId === existing.cartId ? { ...line, quantity: roundCurrency(line.quantity + safeQuantity) } : line);
            }
            return [...prev, { cartId: generateUUID(), itemId: item.id, quantity: safeQuantity, unit }];
        });
        if (openCart) {
            setCartOpen(true);
        } else {
            setSuccessMessage(`${item.name} added to cart.`);
        }
    };

    const addCustomSizeToCart = (event: React.FormEvent) => {
        event.preventDefault();
        if (!customSizeProduct) return;

        const width = Number(customSize.width);
        const height = Number(customSize.height);
        const pieces = Number(customSize.pieces) || 1;

        if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(pieces) || width <= 0 || height <= 0 || pieces <= 0) {
            setErrorMessage('Please enter valid width, height, and number of pieces.');
            return;
        }

        // Bill on the next-even-inch size, same rounding rule used everywhere
        // else (order/estimate calculators) to account for cutting margin.
        const billedWidth = roundToNextEvenInch(width);
        const billedHeight = roundToNextEvenInch(height);
        const sqft = roundCurrency((billedWidth * billedHeight * pieces) / 144);
        const label = `${customSizeProduct.name} - Custom ${width}" x ${height}" x ${pieces} pc${pieces === 1 ? '' : 's'}`;

        setCart(prev => ([
            ...prev,
            {
                cartId: generateUUID(),
                itemId: customSizeProduct.id,
                quantity: sqft,
                unit: 'sqft',
                width,
                height,
                pieces,
                customLabel: label,
            },
        ]));
        setCustomSizeProduct(null);
        setCustomSize({ width: '', height: '', pieces: '1' });
        setCartOpen(true);
        setSuccessMessage('Custom size added to cart.');
    };

    const updateQuantity = (cartId: string, quantity: number) => {
        setCart(prev => prev.map(line => (
            line.cartId === cartId ? { ...line, quantity: Math.max(getQuantityStep(line.unit), roundCurrency(quantity || 0)) } : line
        )));
        setCartQuantityDrafts(prev => {
            const next = { ...prev };
            delete next[cartId];
            return next;
        });
    };

    const updateQuantityDraft = (cartId: string, value: string) => {
        setCartQuantityDrafts(prev => ({ ...prev, [cartId]: value }));
    };

    const commitQuantityDraft = (line: CartLine) => {
        const draft = cartQuantityDrafts[line.cartId];
        if (draft === undefined) return;

        const quantity = Number(draft);
        if (!draft.trim() || Number.isNaN(quantity) || quantity <= 0) {
            updateQuantity(line.cartId, line.quantity);
            return;
        }

        updateQuantity(line.cartId, quantity);
    };

    const removeLine = (cartId: string) => {
        setCart(prev => prev.filter(line => line.cartId !== cartId));
        setCartQuantityDrafts(prev => {
            const next = { ...prev };
            delete next[cartId];
            return next;
        });
    };

    const persistIds = (key: string, ids: string[]) => {
        window.localStorage.setItem(key, JSON.stringify(ids));
    };

    const loadCustomerLocalData = (account: CustomerAccount) => {
        try {
            const scopedCartKey = getCustomerStorageKey(CART_KEY, account);
            const scopedOrdersKey = getCustomerStorageKey(CUSTOMER_ORDERS_KEY, account);
            const scopedWishlistKey = getCustomerStorageKey(WISHLIST_KEY, account);
            const savedCart = window.localStorage.getItem(scopedCartKey);
            const savedOrders = window.localStorage.getItem(scopedOrdersKey) || window.localStorage.getItem(CUSTOMER_ORDERS_KEY);
            const savedWishlist = window.localStorage.getItem(scopedWishlistKey) || window.localStorage.getItem(WISHLIST_KEY);
            if (savedCart) {
                setCart(prev => prev.length > 0 ? prev : JSON.parse(savedCart));
            }
            if (savedOrders && !window.localStorage.getItem(scopedOrdersKey)) {
                window.localStorage.setItem(scopedOrdersKey, savedOrders);
            }
            if (savedWishlist && !window.localStorage.getItem(scopedWishlistKey)) {
                window.localStorage.setItem(scopedWishlistKey, savedWishlist);
            }
            setCustomerOrders(savedOrders ? JSON.parse(savedOrders) : []);
            setWishlistIds(savedWishlist ? JSON.parse(savedWishlist) : []);
        } catch {
            setCustomerOrders([]);
            setWishlistIds([]);
        }
    };

    const toggleWishlist = (itemId: string) => {
        setWishlistIds(prev => {
            const next = prev.includes(itemId) ? prev.filter(id => id !== itemId) : [itemId, ...prev].slice(0, 50);
            persistIds(getCustomerStorageKey(WISHLIST_KEY, customerAccount), next);
            return next;
        });
    };

    const toggleCompare = (itemId: string) => {
        setCompareIds(prev => {
            const next = prev.includes(itemId)
                ? prev.filter(id => id !== itemId)
                : [itemId, ...prev].slice(0, 4);
            persistIds(COMPARE_KEY, next);
            return next;
        });
    };

    const openProductDetails = (item: GlassItem) => {
        setSelectedProduct(item);
        setRecentlyViewedIds(prev => {
            const next = [item.id, ...prev.filter(id => id !== item.id)].slice(0, 8);
            persistIds(RECENTLY_VIEWED_KEY, next);
            return next;
        });
    };

    const openProductInquiry = (item: GlassItem) => {
        setInquiryProduct(item);
        setSelectedProduct(null);
        setProductInquiry(prev => ({
            ...prev,
            name: customer.name || customerAccount?.name || prev.name,
            phone: customer.phone || customerAccount?.phone || prev.phone,
            email: customer.email || customerAccount?.email || prev.email,
            message: prev.message || `I want to know more about ${item.name}.`,
        }));
    };

    const clearCart = () => {
        setCart([]);
        setSuccessMessage('');
        setErrorMessage('');
    };

    const applyCollection = (collection: typeof FEATURED_COLLECTIONS[number]) => {
        setActiveCollection(collection.id);
        setSegment(collection.segment);
        setGroup('all');
        setSubtype('all');
        setQuery('');
        setPriceRange({ min: '', max: '' });
    };

    const clearCollection = () => {
        setActiveCollection(null);
    };

    const copyCurrentCatalogueLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopiedLink(true);
            window.setTimeout(() => setCopiedLink(false), 1800);
        } catch {
            setErrorMessage('Could not copy the catalogue link from this browser.');
        }
    };

    const copyPaymentInstructions = async () => {
        try {
            await navigator.clipboard.writeText(paymentDetails.copyText);
            setSuccessMessage('Payment instructions copied.');
        } catch {
            setErrorMessage('Could not copy payment instructions from this browser.');
        }
    };

    const applyFinderRecommendation = () => {
        setSegment(finderResult.segment);
        setGroup(finderResult.primaryGroup);
        setSubtype('all');
        setSortMode(finderResult.sortMode);
        setActiveCollection(null);
        setQuery('');
        setFinderOpen(false);
        setSuccessMessage(`${finderResult.title} recommendation applied.`);
    };

    const persistCustomerAccount = (message: string) => {
        setErrorMessage('');
        const account: CustomerAccount = {
            name: customer.name.trim(),
            phone: customer.phone.trim(),
            email: customer.email.trim(),
            address: customer.address.trim(),
            pincode: customer.pincode.trim(),
            deliveryPreference: customer.deliveryPreference,
            wantsInstallation: customer.wantsInstallation,
            preferredDate: customer.preferredDate,
            deliverySlot: customer.deliverySlot,
            paymentPreference: customer.paymentPreference,
            paymentMode: customer.paymentMode,
        };

        if (!account.name || !account.phone) {
            setErrorMessage('Please enter customer name and phone number.');
            return false;
        }

        window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(account));
        setCustomerAccount(account);
        setCustomer(prev => ({ ...prev, ...account }));
        loadCustomerLocalData(account);
        setSuccessMessage(message);
        return true;
    };

    const saveCustomerAccount = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');

        if (authMode === 'edit') {
            if (!customerAccount) {
                setAuthMode('login');
                setErrorMessage('Please login before editing customer details.');
                return;
            }

            const account: CustomerAccount = {
                name: customer.name.trim(),
                phone: customer.phone.trim(),
                email: customer.email.trim(),
                address: customer.address.trim(),
                pincode: customer.pincode.trim(),
                deliveryPreference: customer.deliveryPreference,
                wantsInstallation: customer.wantsInstallation,
                preferredDate: customer.preferredDate,
                deliverySlot: customer.deliverySlot,
                paymentPreference: customer.paymentPreference,
                paymentMode: customer.paymentMode,
            };

            if (!account.name || !account.phone) {
                setErrorMessage('Please enter customer name and phone number.');
                return;
            }

            const accounts = readCustomerAccounts();
            const currentIndex = accounts.findIndex(saved => (
                normalizeLoginValue(saved.phone) === normalizeLoginValue(customerAccount.phone) ||
                (!!customerAccount.email && normalizeLoginValue(saved.email) === normalizeLoginValue(customerAccount.email))
            ));
            const duplicate = accounts.some((saved, index) => (
                index !== currentIndex &&
                (
                    normalizeLoginValue(saved.phone) === normalizeLoginValue(account.phone) ||
                    (!!account.email && normalizeLoginValue(saved.email) === normalizeLoginValue(account.email))
                )
            ));

            if (duplicate) {
                setErrorMessage('Another customer already uses this phone/email.');
                return;
            }

            if (currentIndex >= 0) {
                accounts[currentIndex] = { ...accounts[currentIndex], ...account };
                writeCustomerAccounts(accounts);
            }

            migrateCustomerStorage(CUSTOMER_ORDERS_KEY, customerAccount, account);
            migrateCustomerStorage(WISHLIST_KEY, customerAccount, account);
            window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(account));
            setCustomerAccount(account);
            setCustomer(prev => ({ ...prev, ...account }));
            loadCustomerLocalData(account);
            setAuthOpen(false);
            setSuccessMessage('Customer details updated.');
            return;
        }

        if (authMode === 'register') {
            const account: CustomerAccount = {
                name: customer.name.trim(),
                phone: customer.phone.trim(),
                email: customer.email.trim(),
                address: customer.address.trim(),
                pincode: customer.pincode.trim(),
                deliveryPreference: customer.deliveryPreference,
                wantsInstallation: customer.wantsInstallation,
                preferredDate: customer.preferredDate,
                deliverySlot: customer.deliverySlot,
                paymentPreference: customer.paymentPreference,
                paymentMode: customer.paymentMode,
            };

            if (!account.name || !account.phone) {
                setErrorMessage('Please enter customer name and phone number.');
                return;
            }

            if (authCredentials.password.length < 6) {
                setErrorMessage('Please create a password with at least 6 characters.');
                return;
            }

            if (authCredentials.password !== authCredentials.confirmPassword) {
                setErrorMessage('Password and confirm password do not match.');
                return;
            }

            const accounts = readCustomerAccounts();
            const phoneKey = normalizeLoginValue(account.phone);
            const emailKey = normalizeLoginValue(account.email);
            const alreadyExists = accounts.some(saved => (
                normalizeLoginValue(saved.phone) === phoneKey ||
                (!!emailKey && normalizeLoginValue(saved.email) === emailKey)
            ));

            if (alreadyExists) {
                setErrorMessage('This phone/email is already registered. Please login instead.');
                return;
            }

            const registeredAccount: CustomerCredentialAccount = {
                ...account,
                id: generateUUID(),
                passwordHash: await hashCustomerPassword(authCredentials.password),
                createdAt: new Date().toISOString(),
            };

            writeCustomerAccounts([registeredAccount, ...accounts]);
            window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(account));
            setCustomerAccount(account);
            setCustomer(prev => ({ ...prev, ...account }));
            loadCustomerLocalData(account);
            setAuthCredentials({ identifier: '', password: '', confirmPassword: '' });
            setAuthOpen(false);
            setSuccessMessage('Customer account registered and logged in.');
            return;
        }

        const identifier = normalizeLoginValue(authCredentials.identifier || customer.phone || customer.email);
        if (!identifier || !authCredentials.password) {
            setErrorMessage('Please enter phone/email and password.');
            return;
        }

        const accounts = readCustomerAccounts();
        const passwordHash = await hashCustomerPassword(authCredentials.password);
        const matchedAccount = accounts.find(saved => (
            (normalizeLoginValue(saved.phone) === identifier || normalizeLoginValue(saved.email) === identifier) &&
            saved.passwordHash === passwordHash
        ));

        if (!matchedAccount) {
            setErrorMessage('Invalid customer login details. Please check phone/email and password.');
            return;
        }

        const account: CustomerAccount = {
            name: matchedAccount.name,
            phone: matchedAccount.phone,
            email: matchedAccount.email,
            address: matchedAccount.address,
            pincode: matchedAccount.pincode || '',
            deliveryPreference: matchedAccount.deliveryPreference,
            wantsInstallation: matchedAccount.wantsInstallation || false,
            preferredDate: matchedAccount.preferredDate,
            deliverySlot: matchedAccount.deliverySlot,
            paymentPreference: matchedAccount.paymentPreference,
            paymentMode: matchedAccount.paymentMode,
        };
        window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(account));
        setCustomerAccount(account);
        setCustomer(prev => ({ ...prev, ...account }));
        loadCustomerLocalData(account);
        setAuthCredentials({ identifier: '', password: '', confirmPassword: '' });
        setAuthOpen(false);
        setSuccessMessage('Customer logged in.');
    };

    const saveCheckoutDetails = () => {
        persistCustomerAccount('Checkout details saved for next order.');
    };

    const logoutCustomer = () => {
        window.localStorage.removeItem(CUSTOMER_KEY);
        setCustomerAccount(null);
        setCart([]);
        setCustomerOrders([]);
        setWishlistIds([]);
        setAuthCredentials({ identifier: '', password: '', confirmPassword: '' });
        setOrdersOpen(false);
        setSuccessMessage('Customer logged out.');
    };

    const applySavedCheckoutDetails = () => {
        if (!customerAccount) return;
        setCustomer(prev => ({
            ...prev,
            ...customerAccount,
            deliveryPreference: customerAccount.deliveryPreference || prev.deliveryPreference,
            preferredDate: customerAccount.preferredDate || prev.preferredDate,
            deliverySlot: customerAccount.deliverySlot || prev.deliverySlot,
            paymentPreference: customerAccount.paymentPreference || prev.paymentPreference,
            paymentMode: customerAccount.paymentMode || prev.paymentMode,
        }));
        setSuccessMessage('Saved checkout details applied.');
    };

    const saveOrderReference = (order: Order) => {
        const reference: ShopOrderReference = {
            id: order.id,
            number: order.number,
            date: order.date,
            total: order.total,
            items: cartDetails.rowCount || order.items.length,
            status: 'Order received',
            paymentMode: customer.paymentMode,
            paymentStatus: order.paymentStatus || 'unpaid',
            deliveryPreference: customer.deliveryPreference,
            deliveryPlace: cartDetails.selectedDeliveryRule?.place,
            preferredDate: customer.preferredDate,
            balanceAmount: roundCurrency(Math.max(0, (order.total || 0) - (order.paidAmount || 0))),
            lines: order.items.map(item => ({
                itemId: item.itemId,
                name: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
                total: roundCurrency(item.lineTotal || item.amount || 0),
                width: item.width,
                height: item.height,
                pieces: item.description?.match(/Pieces: ([0-9.]+)/)?.[1]
                    ? Number(item.description.match(/Pieces: ([0-9.]+)/)?.[1])
                    : undefined,
            })),
        };
        const nextOrders = [reference, ...customerOrders].slice(0, 20);
        setCustomerOrders(nextOrders);
        window.localStorage.setItem(getCustomerStorageKey(CUSTOMER_ORDERS_KEY, customerAccount), JSON.stringify(nextOrders));
        setLastOrder(reference);
    };

    const reorderFromHistory = (order: ShopOrderReference) => {
        const restoredLines = (order.lines || [])
            .map(line => {
                const item = itemById.get(line.itemId);
                if (!item) return null;
                return {
                    cartId: generateUUID(),
                    itemId: line.itemId,
                    quantity: line.quantity,
                    unit: line.unit,
                    width: line.width,
                    height: line.height,
                    pieces: line.pieces,
                    customLabel: line.width && line.height ? line.name : undefined,
                };
            })
            .filter(Boolean) as CartLine[];

        if (restoredLines.length === 0) {
            setErrorMessage('Could not reorder because these products are not available in the current catalogue.');
            return;
        }

        setCart(prev => [...prev, ...restoredLines]);
        setOrdersOpen(false);
        setCartOpen(true);
        setSuccessMessage(`${restoredLines.length} item row${restoredLines.length === 1 ? '' : 's'} added again to cart.`);
    };

    const syncCustomerOrders = async () => {
        if (!customerAccount) {
            setAuthMode('login');
            setAuthOpen(true);
            setErrorMessage('Please login before syncing orders.');
            return;
        }

        if (customerOrders.length === 0) {
            setSuccessMessage('No saved online orders to sync yet.');
            return;
        }

        setSubmitting(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const backendOrders = await db.orders.getAll();
            const updatedHistory = customerOrders.map(savedOrder => {
                const backendOrder = backendOrders.find(order => order.id === savedOrder.id || order.number === savedOrder.number);
                if (!backendOrder) return savedOrder;

                const balanceAmount = roundCurrency(Math.max(0, (backendOrder.total || 0) - (backendOrder.paidAmount || 0)));
                const paymentConfirmation = getLatestPaymentConfirmation(backendOrder.notes);

                return {
                    ...savedOrder,
                    total: backendOrder.total,
                    items: backendOrder.items.length,
                    status: paymentConfirmation
                        ? 'payment confirmation submitted'
                        : CUSTOMER_STATUS_LABELS[backendOrder.status] || backendOrder.status,
                    paymentStatus: backendOrder.paymentStatus || savedOrder.paymentStatus || 'unpaid',
                    balanceAmount,
                    supportRequest: paymentConfirmation ? paymentConfirmation.replace(/^\[Payment confirmation[^\]]*\]\s*/, '') : savedOrder.supportRequest,
                    lines: backendOrder.items.map(item => ({
                        itemId: item.itemId,
                        name: item.itemName,
                        quantity: item.quantity,
                        unit: item.unit,
                        total: roundCurrency(item.lineTotal || item.amount || 0),
                        width: item.width,
                        height: item.height,
                        pieces: item.description?.match(/Pieces: ([0-9.]+)/)?.[1]
                            ? Number(item.description.match(/Pieces: ([0-9.]+)/)?.[1])
                            : undefined,
                    })),
                };
            });

            setCustomerOrders(updatedHistory);
            window.localStorage.setItem(getCustomerStorageKey(CUSTOMER_ORDERS_KEY, customerAccount), JSON.stringify(updatedHistory));
            if (lastOrder) {
                const updatedLastOrder = updatedHistory.find(order => order.id === lastOrder.id);
                if (updatedLastOrder) setLastOrder(updatedLastOrder);
            }
            setSuccessMessage('Order status synced from Arjun Glass House.');
        } catch (error) {
            console.error(error);
            setErrorMessage('Could not sync order status right now.');
        } finally {
            setSubmitting(false);
        }
    };

    const buildOrderShareMessage = (order: ShopOrderReference) => {
        const lines = (order.lines || []).map((line, index) => (
            `${index + 1}. ${line.name} - ${line.quantity} ${formatUnitLabel(line.unit)} - ${formatIndianCurrency(line.total)}`
        ));

        return [
            'Arjun Glass House - Order Confirmation',
            `Order: ${order.number}`,
            `Date: ${new Date(order.date).toLocaleDateString('en-IN')}`,
            `Customer: ${customer.name || customerAccount?.name || ''}`,
            `Phone: ${customer.phone || customerAccount?.phone || ''}`,
            order.deliveryPreference ? `Delivery: ${order.deliveryPreference}${order.deliveryPlace ? ` - ${order.deliveryPlace}` : ''}` : '',
            order.paymentMode ? `Payment mode: ${order.paymentMode}` : '',
            order.paymentStatus ? `Payment status: ${order.paymentStatus}` : '',
            '',
            ...lines,
            '',
            `Total: ${formatIndianCurrency(order.total)}`,
            order.balanceAmount !== undefined ? `Balance: ${formatIndianCurrency(order.balanceAmount)}` : '',
            `Status: ${order.status}`,
            '',
            'Order total includes available stock items and selected checkout charges.',
        ].filter(line => line !== undefined).join('\n');
    };

    const buildTrackHref = (order: ShopOrderReference) => {
        const params = new URLSearchParams({
            order: order.number,
            phone: customer.phone || customerAccount?.phone || '',
        });
        return `/track?${params.toString()}`;
    };

    const printOrderConfirmation = (order: ShopOrderReference) => {
        const receiptWindow = window.open('', '_blank', 'width=840,height=900');
        if (!receiptWindow) {
            setErrorMessage('Could not open print window. Please allow popups and try again.');
            return;
        }

        const rows = (order.lines || []).map((line, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${line.name}</td>
                <td>${line.quantity} ${formatUnitLabel(line.unit)}</td>
                <td style="text-align:right">${formatIndianCurrency(line.total)}</td>
            </tr>
        `).join('');

        receiptWindow.document.write(`
            <!doctype html>
            <html>
                <head>
                    <title>${order.number} - Arjun Glass House</title>
                    <style>
                        body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
                        .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 16px; }
                        h1 { margin: 0; font-size: 28px; }
                        h2 { margin: 4px 0 0; font-size: 18px; color: #475569; }
                        .meta { margin-top: 22px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; }
                        .box { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 22px; }
                        th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; vertical-align: top; }
                        th { background: #f8fafc; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
                        .total { margin-top: 18px; text-align: right; font-size: 22px; font-weight: 800; }
                        .note { margin-top: 24px; color: #64748b; font-size: 13px; }
                        @media print { button { display: none; } body { margin: 18px; } }
                    </style>
                </head>
                <body>
                    <button onclick="window.print()" style="float:right;padding:10px 16px;border:0;border-radius:999px;background:#ffd814;font-weight:700;cursor:pointer">Print</button>
                    <div class="header">
                        <div>
                            <h1>Arjun Glass House</h1>
                            <h2>Order Confirmation</h2>
                        </div>
                        <div style="text-align:right">
                            <strong>${order.number}</strong><br />
                            <span>${new Date(order.date).toLocaleDateString('en-IN')}</span>
                        </div>
                    </div>
                    <div class="meta">
                        <div class="box"><strong>Customer</strong><br />${customer.name || customerAccount?.name || ''}<br />${customer.phone || customerAccount?.phone || ''}</div>
                        <div class="box"><strong>Status</strong><br />${order.status}<br />${order.paymentMode || customer.paymentMode || customerAccount?.paymentMode || ''}<br />${order.paymentStatus || 'unpaid'}</div>
                    </div>
                    <table>
                        <thead><tr><th>#</th><th>Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr></thead>
                        <tbody>${rows || '<tr><td colspan="4">No item lines stored for this browser order.</td></tr>'}</tbody>
                    </table>
                    <div class="total">Total: ${formatIndianCurrency(order.total)}</div>
                    <p class="note">This is an online order confirmation. Payment remains pending until Arjun Glass House confirms collection through the selected mode.</p>
                </body>
            </html>
        `);
        receiptWindow.document.close();
        receiptWindow.focus();
    };

    const openSupportRequest = (order: ShopOrderReference, type: 'help' | 'cancel' | 'payment') => {
        setSupportOrder(order);
        setSupportType(type);
        setSupportMessage(
            type === 'cancel'
                ? 'Please cancel this order if work has not started yet.'
                : type === 'payment'
                    ? 'I have paid. Payment reference / UTR: '
                    : 'Please contact me regarding this order.'
        );
    };

    const submitSupportRequest = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!supportOrder) return;

        setSubmitting(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const orders = await db.orders.getAll();
            const backendOrder = orders.find(order => order.id === supportOrder.id);
            if (!backendOrder) {
                throw new Error('Order was not found in backend.');
            }

            const requestLabel = supportType === 'cancel'
                ? 'Cancellation request'
                : supportType === 'payment'
                    ? 'Payment confirmation'
                    : 'Customer support request';
            const requestText = supportMessage.trim() || (
                supportType === 'cancel'
                    ? 'Customer requested cancellation.'
                    : supportType === 'payment'
                        ? 'Customer says payment has been made. Reference not provided.'
                        : 'Customer requested support.'
            );
            const timestamp = new Date().toLocaleString('en-IN');
            const updatedOrder: Order = {
                ...backendOrder,
                notes: [
                    backendOrder.notes || '',
                    `[${requestLabel} - ${timestamp}] ${requestText}`,
                ].filter(Boolean).join('\n'),
            };

            await db.orders.update(updatedOrder);

            const updatedHistory = customerOrders.map(order => (
                order.id === supportOrder.id
                    ? {
                        ...order,
                        status: supportType === 'cancel'
                            ? 'cancellation requested'
                            : supportType === 'payment'
                                ? 'payment confirmation submitted'
                                : 'support requested',
                        supportRequest: requestText
                    }
                    : order
            ));
            setCustomerOrders(updatedHistory);
            window.localStorage.setItem(getCustomerStorageKey(CUSTOMER_ORDERS_KEY, customerAccount), JSON.stringify(updatedHistory));
            if (lastOrder?.id === supportOrder.id) {
                setLastOrder({
                    ...lastOrder,
                    status: supportType === 'payment' ? 'payment confirmation submitted' : lastOrder.status,
                    supportRequest: requestText,
                });
            }
            window.dispatchEvent(new Event('agh_notifications_refresh'));
            setSupportOrder(null);
            setSupportMessage('');
            setSuccessMessage(`${requestLabel} sent for ${supportOrder.number}.`);
        } catch (error: any) {
            console.error(error);
            setErrorMessage(error.message || 'Could not send request. Please contact Arjun Glass House.');
        } finally {
            setSubmitting(false);
        }
    };

    const createOrFindCustomer = async () => {
        const parties = await db.parties.getAll();
        const existingCustomer = findCustomerByPhone(parties, customer.phone);

        if (existingCustomer) {
            const updatedCustomer: Party = {
                ...existingCustomer,
                name: customer.name.trim() || existingCustomer.name,
                phone: customer.phone.trim() || existingCustomer.phone,
                email: customer.email.trim() || existingCustomer.email,
                address: customer.address.trim() || existingCustomer.address,
            };
            await db.parties.update(updatedCustomer);
            return updatedCustomer;
        }

        const newCustomer: Party = {
            id: generateUUID(),
            name: customer.name.trim(),
            type: 'customer',
            phone: customer.phone.trim(),
            email: customer.email.trim(),
            address: customer.address.trim(),
            balance: 0,
        };

        await db.parties.add(newCustomer);
        return newCustomer;
    };

    const submitOrder = async (event: React.FormEvent) => {
        event.preventDefault();
        setSuccessMessage('');
        setErrorMessage('');

        if (cartDetails.lines.length === 0) {
            setErrorMessage('Please add at least one item to cart.');
            return;
        }

        if (!customerAccount) {
            setAuthOpen(true);
            setErrorMessage('Please login or register as a customer before placing the order.');
            return;
        }

        if (!customer.name.trim() || !customer.phone.trim() || !customer.address.trim()) {
            setErrorMessage('Please enter name, phone, and delivery address.');
            return;
        }

        if (phoneDigits(customer.phone).length < 6) {
            setErrorMessage('Please enter a valid phone number for order tracking.');
            return;
        }

        if (!customer.paymentMode.trim()) {
            setErrorMessage('Please choose a payment mode before placing the order.');
            return;
        }

        if (cartAvailability.hasBlockingWarnings) {
            setErrorMessage(`Some cart items are not available: ${cartAvailability.warnings.slice(0, 2).join(' ')}`);
            return;
        }

        setSubmitting(true);

        // Stock in `items` may be stale (loaded whenever this tab opened) --
        // re-check against live inventory right before actually placing the
        // order, so two customers racing for the last sheet don't both win.
        let freshItems: GlassItem[];
        try {
            freshItems = await loadPublicShopProducts();
        } catch {
            setSubmitting(false);
            setErrorMessage('Could not verify current stock. Please try again.');
            return;
        }

        const freshItemById = new Map(freshItems.map(item => [item.id, item]));
        const staleWarnings: string[] = [];
        for (const line of cartDetails.lines) {
            const freshItem = freshItemById.get(line.item.id);
            if (!freshItem) {
                staleWarnings.push(`${line.customLabel || line.item.name} is no longer available online.`);
                continue;
            }
            const check = getStockComparison(freshItem, line.quantity, line.unit);
            if (check.isOutOfStock) {
                staleWarnings.push(`${line.customLabel || line.item.name}: now out of stock.`);
            } else if (check.isInsufficient) {
                staleWarnings.push(`${line.customLabel || line.item.name}: only ${check.stockLabel} left (requested ${check.requestedLabel}).`);
            }
        }

        if (staleWarnings.length > 0) {
            setItems(freshItems);
            setSubmitting(false);
            setErrorMessage(`Stock changed since you added these items: ${staleWarnings.slice(0, 2).join(' ')}`);
            return;
        }

        try {
            const party = await createOrFindCustomer();
            const orderItems: InvoiceItem[] = cartDetails.lines.map(line => ({
                id: generateUUID(),
                itemId: line.item.id,
                itemName: line.customLabel || line.item.name,
                description: [
                    getItemDetails(line.item),
                    line.width && line.height ? `Custom size: ${line.width}" x ${line.height}"` : '',
                    line.pieces ? `Pieces: ${line.pieces}` : '',
                ].filter(Boolean).join(' | '),
                make: line.item.make,
                model: line.item.model,
                type: line.item.category === 'hardware' ? 'Hardware' : line.item.type,
                warehouse: 'Warehouse A',
                width: line.width || line.item.width || 0,
                height: line.height || line.item.height || 0,
                quantity: line.quantity,
                unit: line.unit,
                sqft: line.calculated.sqft,
                rate: getEffectiveRate(line.item, line.unit),
                amount: line.calculated.amount,
                lineTotal: line.calculated.lineTotal,
                sourceType: 'catalog',
            }));

            const chargeItems: InvoiceItem[] = [
                cartDetails.transportCharge > 0 ? {
                    id: generateUUID(),
                    itemId: 'online-transport-charge',
                    itemName: 'Transportation Charges',
                    description: cartDetails.selectedDeliveryRule?.place
                        ? `Transportation charge for ${cartDetails.selectedDeliveryRule.place}`
                        : 'Customer checkout transportation charge',
                    type: 'Service Charge',
                    width: 0,
                    height: 0,
                    quantity: 1,
                    unit: 'nos' as Unit,
                    sqft: 0,
                    rate: cartDetails.transportCharge,
                    amount: cartDetails.transportCharge,
                    lineTotal: roundCurrency(cartDetails.transportCharge * (1 + GST_RATE / 100)),
                    sourceType: 'text',
                } : null,
                cartDetails.installationCharge > 0 ? {
                    id: generateUUID(),
                    itemId: 'online-installation-charge',
                    itemName: 'Installation Charges',
                    description: 'Customer checkout installation charge',
                    type: 'Service Charge',
                    width: 0,
                    height: 0,
                    quantity: 1,
                    unit: 'nos' as Unit,
                    sqft: 0,
                    rate: cartDetails.installationCharge,
                    amount: cartDetails.installationCharge,
                    lineTotal: roundCurrency(cartDetails.installationCharge * (1 + GST_RATE / 100)),
                    sourceType: 'text',
                } : null,
            ].filter(Boolean) as InvoiceItem[];

            const allOrderItems = [...orderItems, ...chargeItems];

            const [orderNumber, generalNumber] = await Promise.all([
                db.orders.generateNextOrderNumber('sale_order', party.name),
                db.orders.generateNextGeneralNumber(),
            ]);
            const today = new Date().toISOString().split('T')[0];
            const order: Order = {
                id: generateUUID(),
                type: 'sale_order',
                number: orderNumber,
                generalNumber,
                soNumber: orderNumber,
                date: today,
                partyId: party.id,
                partyName: party.name,
                items: allOrderItems,
                subtotal: cartDetails.subtotal,
                taxRate: GST_RATE,
                taxAmount: cartDetails.taxAmount,
                total: cartDetails.total,
                status: 'pending',
                notes: [
                    'Source: Online shop',
                    'Order type: Customer checkout',
                    customer.email ? `Email: ${customer.email.trim()}` : '',
                    `Delivery preference: ${customer.deliveryPreference}`,
                    customer.pincode.trim() ? `Delivery pincode: ${customer.pincode.trim()}` : '',
                    cartDetails.selectedDeliveryRule?.place ? `Delivery place (auto-detected): ${cartDetails.selectedDeliveryRule.place}` : '',
                    customer.wantsInstallation ? 'Installation support requested' : '',
                    customer.preferredDate ? `Preferred date: ${customer.preferredDate}` : '',
                    `Preferred time slot: ${customer.deliverySlot}`,
                    `Payment preference: ${customer.paymentPreference}`,
                    `Payment mode: ${customer.paymentMode}`,
                    `Payment request amount: ${formatIndianCurrency(paymentDetails.amount)}`,
                    customer.paymentMode === 'UPI' && paymentDetails.upiId ? `UPI ID shown to customer: ${paymentDetails.upiId}` : '',
                    customer.paymentMode === 'Bank transfer' && paymentDetails.bankLines.length ? `Bank details shown to customer: ${paymentDetails.bankLines.join(' | ')}` : '',
                    paymentSettings.paymentInstructions ? `Payment instructions: ${paymentSettings.paymentInstructions}` : '',
                    'Payment status: Unpaid - collect through selected mode before dispatch unless staff approves credit',
                    `Product subtotal: ${formatIndianCurrency(cartDetails.productSubtotal)}`,
                    cartDetails.transportCharge > 0 ? `Transportation charges: ${formatIndianCurrency(cartDetails.transportCharge)}` : '',
                    cartDetails.installationCharge > 0 ? `Installation charges: ${formatIndianCurrency(cartDetails.installationCharge)}` : '',
                    customer.notes.trim() ? `Customer note: ${customer.notes.trim()}` : '',
                ].filter(Boolean).join('\n'),
                paidAmount: 0,
                paymentStatus: 'unpaid',
            };

            await db.orders.add(order);
            saveOrderReference(order);
            window.dispatchEvent(new Event('agh_notifications_refresh'));
            clearCart();
            setCartOpen(false);
            setOrderSuccessOpen(true);
            setCustomer(prev => ({ ...prev, notes: '' }));
            setSuccessMessage(`Order ${orderNumber} placed successfully. Payment is marked unpaid until staff confirms collection.`);
        } catch (error) {
            console.error(error);
            setErrorMessage('Could not place the order. Please try again or contact Arjun Glass House.');
        } finally {
            setSubmitting(false);
        }
    };

    const submitBulkRequest = async (event: React.FormEvent) => {
        event.preventDefault();
        setSuccessMessage('');
        setErrorMessage('');

        if (!customerAccount) {
            setAuthOpen(true);
            setErrorMessage('Please login or register before sending a bulk request.');
            return;
        }

        if (!customer.name.trim() || !customer.phone.trim()) {
            setErrorMessage('Please enter customer name and phone number.');
            return;
        }

        if (phoneDigits(customer.phone).length < 6) {
            setErrorMessage('Please enter a valid phone number for the bulk request.');
            return;
        }

        if (!bulkRequest.approximateArea.trim() && !bulkRequest.message.trim()) {
            setErrorMessage('Please enter approximate area/quantity or a short project detail.');
            return;
        }

        setSubmitting(true);
        try {
            const party = await createOrFindCustomer();
            const [orderNumber, generalNumber] = await Promise.all([
                db.orders.generateNextOrderNumber('sale_order', party.name),
                db.orders.generateNextGeneralNumber(),
            ]);
            const today = new Date().toISOString().split('T')[0];
            const order: Order = {
                id: generateUUID(),
                type: 'sale_order',
                number: orderNumber,
                generalNumber,
                soNumber: orderNumber,
                date: today,
                partyId: party.id,
                partyName: party.name,
                items: [{
                    id: generateUUID(),
                    itemId: 'bulk-project-request',
                    itemName: `Bulk request - ${bulkRequest.projectType}`,
                    description: [
                        `Project type: ${bulkRequest.projectType}`,
                        bulkRequest.approximateArea ? `Approx area: ${bulkRequest.approximateArea}` : '',
                        `Timeline: ${bulkRequest.timeline}`,
                        bulkRequest.message ? `Details: ${bulkRequest.message}` : '',
                    ].filter(Boolean).join(' | '),
                    width: 0,
                    height: 0,
                    quantity: 1,
                    unit: 'nos',
                    sqft: 0,
                    rate: 0,
                    amount: 0,
                    lineTotal: 0,
                    sourceType: 'text',
                }],
                subtotal: 0,
                taxRate: GST_RATE,
                taxAmount: 0,
                total: 0,
                status: 'pending',
                notes: [
                    'Online bulk/project quote request',
                    customer.email ? `Email: ${customer.email.trim()}` : '',
                    customer.address ? `Address: ${customer.address.trim()}` : '',
                    `Delivery preference: ${customer.deliveryPreference}`,
                    `Payment preference: ${customer.paymentPreference}`,
                ].filter(Boolean).join('\n'),
                paidAmount: 0,
                paymentStatus: 'unpaid',
            };

            await db.orders.add(order);
            saveOrderReference(order);
            setOrderSuccessOpen(true);
            setBulkRequestOpen(false);
            setBulkRequest({
                projectType: 'Bathroom / shower enclosure',
                approximateArea: '',
                timeline: 'This week',
                message: '',
            });
            setSuccessMessage(`Bulk request ${orderNumber} submitted. Our team will call you for measurements and pricing.`);
        } catch (error) {
            console.error(error);
            setErrorMessage('Could not submit the bulk request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const submitProductInquiry = async (event: React.FormEvent) => {
        event.preventDefault();
        setSuccessMessage('');
        setErrorMessage('');

        if (!inquiryProduct) return;
        if (!productInquiry.name.trim() || !productInquiry.phone.trim()) {
            setErrorMessage('Please enter name and phone number for the enquiry.');
            return;
        }

        if (phoneDigits(productInquiry.phone).length < 6) {
            setErrorMessage('Please enter a valid phone number for the enquiry.');
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch('/api/customer/product-inquiry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: inquiryProduct.id,
                    ...productInquiry,
                }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not submit enquiry.');
            }

            if (customerAccount && data.orderId && data.orderNumber) {
                const reference: ShopOrderReference = {
                    id: data.orderId,
                    number: data.orderNumber,
                    date: new Date().toISOString().split('T')[0],
                    total: 0,
                    items: 1,
                    status: 'Product enquiry submitted',
                    lines: [{
                        itemId: inquiryProduct.id,
                        name: `Product enquiry - ${inquiryProduct.name}`,
                        quantity: 1,
                        unit: getCatalogueUnit(inquiryProduct),
                        total: 0,
                    }],
                };
                const nextOrders = [reference, ...customerOrders].slice(0, 20);
                setCustomerOrders(nextOrders);
                window.localStorage.setItem(getCustomerStorageKey(CUSTOMER_ORDERS_KEY, customerAccount), JSON.stringify(nextOrders));
                setLastOrder(reference);
                setOrderSuccessOpen(true);
            }

            setInquiryProduct(null);
            setProductInquiry({
                name: customer.name || customerAccount?.name || '',
                phone: customer.phone || customerAccount?.phone || '',
                email: customer.email || customerAccount?.email || '',
                preferredContact: 'Phone call',
                message: '',
            });
            setSuccessMessage(`Enquiry ${data.orderNumber} submitted. Our team will contact you shortly.`);
        } catch (error: any) {
            console.error(error);
            setErrorMessage(error.message || 'Could not submit product enquiry.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleQuoteAttachments = async (files: FileList | null) => {
        if (!files) return;
        setErrorMessage('');

        const selectedFiles = Array.from(files).slice(0, Math.max(0, 4 - quoteAttachments.length));
        const validFiles = selectedFiles.filter(file => file.type.startsWith('image/') && file.size <= 700 * 1024);

        if (selectedFiles.length !== validFiles.length) {
            setErrorMessage('Please upload only image files up to 700 KB each. Maximum 4 images.');
        }

        const previews = await Promise.all(validFiles.map(file => new Promise<QuoteAttachment>((resolve, reject) => {
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

        setQuoteAttachments(prev => [...prev, ...previews].slice(0, 4));
    };

    const submitCustomQuote = async (event: React.FormEvent) => {
        event.preventDefault();
        setSuccessMessage('');
        setErrorMessage('');

        if (!customerAccount) {
            setAuthOpen(true);
            setErrorMessage('Please login or register before sending a custom quote request.');
            return;
        }

        if (!customer.name.trim() || !customer.phone.trim() || !customer.address.trim()) {
            setErrorMessage('Please enter customer name, phone and address before sending a custom quote request.');
            return;
        }

        if (phoneDigits(customer.phone).length < 6) {
            setErrorMessage('Please enter a valid phone number for the custom quote request.');
            return;
        }

        const quoteWidth = Number(customQuote.width);
        const quoteHeight = Number(customQuote.height);
        const quoteQuantity = Number(customQuote.quantity);
        const quoteHoles = Number(customQuote.holes);
        const quoteCuts = Number(customQuote.cuts);

        if (!Number.isFinite(quoteWidth) || !Number.isFinite(quoteHeight) || !Number.isFinite(quoteQuantity) || quoteWidth <= 0 || quoteHeight <= 0 || quoteQuantity <= 0) {
            setErrorMessage('Please enter valid width, height and number of pieces.');
            return;
        }

        if (!Number.isFinite(quoteHoles) || !Number.isFinite(quoteCuts) || quoteHoles < 0 || quoteCuts < 0) {
            setErrorMessage('Holes and cuts cannot be negative.');
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch('/api/customer/custom-glass-quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...customQuote,
                    width: quoteWidth,
                    height: quoteHeight,
                    thickness: Number(customQuote.thickness),
                    quantity: quoteQuantity,
                    holes: quoteHoles,
                    cuts: quoteCuts,
                    name: customer.name,
                    phone: customer.phone,
                    email: customer.email,
                    address: customer.address,
                    attachments: quoteAttachments.map(({ name, size, type, dataUrl }) => ({ name, size, type, dataUrl })),
                }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not submit custom quote request.');
            }

            const reference: ShopOrderReference = {
                id: data.orderId,
                number: data.orderNumber,
                date: new Date().toISOString().split('T')[0],
                total: Number(data.total || 0),
                items: 1,
                status: 'Custom quote requested',
                lines: [{
                    itemId: 'online-custom-glass-quote',
                    name: `${customQuote.projectType} - ${customQuote.thickness}mm ${customQuote.finish}`,
                    quantity: Number(data.areaSqft || 0),
                    unit: 'sqft',
                    total: Number(data.total || 0),
                    width: Number(customQuote.width) || undefined,
                    height: Number(customQuote.height) || undefined,
                    pieces: Number(customQuote.quantity) || undefined,
                }],
            };

            const nextOrders = [reference, ...customerOrders].slice(0, 20);
            setCustomerOrders(nextOrders);
            window.localStorage.setItem(getCustomerStorageKey(CUSTOMER_ORDERS_KEY, customerAccount), JSON.stringify(nextOrders));
            setLastOrder(reference);
            setOrderSuccessOpen(true);
            setCustomQuoteOpen(false);
            setQuoteAttachments([]);
            setCustomQuote(prev => ({ ...prev, width: '', height: '', quantity: '1', holes: '0', cuts: '0', notes: '' }));
            window.dispatchEvent(new Event('agh_notifications_refresh'));
            setSuccessMessage(`Custom quote request ${data.orderNumber} submitted.`);
        } catch (error: any) {
            console.error(error);
            setErrorMessage(error.message || 'Could not submit custom quote request.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.shopShell}>
            <CustomerHeader
                actions={(
                    <>
                    {customerAccount ? (
                        <>
                            <button className="customerBtn" type="button" onClick={() => setOrdersOpen(true)}>
                                <PackageCheck size={17} />
                                My Orders
                            </button>
                            <button className="customerBtn" type="button" onClick={() => setAccountOpen(true)}>
                                <UserRound size={17} />
                                {customerAccount.name}
                            </button>
                        </>
                    ) : (
                        <button className="customerBtn" type="button" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>
                            <LogIn size={17} />
                            Login
                        </button>
                    )}
                    <button className="customerBtnPrimary" type="button" onClick={() => setCartOpen(true)}>
                        <ShoppingBag size={18} />
                        Cart ({cartDetails.lines.length})
                    </button>
                    </>
                )}
            />

            <section className={styles.hero}>
                <div>
                    <div className={styles.heroEyebrow}>Glass and hardware catalogue</div>
                    <h1>Choose products faster.</h1>
                    <div className={styles.heroActions}>
                        <button className="btn btn-primary" type="button" onClick={() => setCustomQuoteOpen(true)}>
                            Custom Glass Quote
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => setBulkRequestOpen(true)}>
                            Project Quote
                        </button>
                    </div>
                    {successMessage && <div className={styles.notice}><CheckCircle2 size={18} /> {successMessage}</div>}
                    {errorMessage && <div className={styles.error}>{errorMessage}</div>}
                    {lastOrder && (
                        <div className={styles.orderSuccessCard}>
                            <div>
                                <span>Order submitted</span>
                                <h2>{lastOrder.number}</h2>
                                <p>Your order total and selected payment mode are saved with Arjun Glass House.</p>
                            </div>
                            <div>
                                <strong>{formatIndianCurrency(lastOrder.total)}</strong>
                                <button className={styles.detailButton} type="button" onClick={() => setOrdersOpen(true)}>
                                    View Orders
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <div className={styles.heroCard} aria-hidden="true">
                    <div className={styles.glassPreview} />
                    <div className={styles.heroStatCard}>
                        <span>38+</span>
                        <p>Ready catalogue products</p>
                    </div>
                    <div className={styles.heroSpecCard}>
                        <span>Custom size</span>
                        <strong>Live sq.ft estimate</strong>
                    </div>
                    <div className={styles.floatingBadge}>Glass, mirrors, fittings, and custom-ready products</div>
                </div>
            </section>

            <section className={styles.collectionGrid} aria-label="Featured collections">
                {FEATURED_COLLECTIONS.map(collection => (
                    <button
                        key={collection.id}
                        type="button"
                        className={`${styles.collectionCard} ${activeCollection === collection.id ? styles.collectionCardActive : ''}`}
                        onClick={() => applyCollection(collection)}
                    >
                        <div className={styles.collectionIcon}>
                            {collection.title.split(' ').slice(0, 2).map(word => word[0]).join('')}
                        </div>
                        <span>{collection.title}</span>
                        <p>{collection.description}</p>
                    </button>
                ))}
                {activeCollection && (
                    <button type="button" className={styles.clearCollectionButton} onClick={clearCollection}>
                        Show all products
                    </button>
                )}
            </section>

            <section className={styles.marketLayout}>
                <aside className={styles.marketSidebar} aria-label="Shop filters">
                    <div className={styles.toolbarLabel}>
                        <span>Results</span>
                        <strong>{loading ? 'Loading...' : `${filteredItems.length} products`}</strong>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--color-text-muted)' }} />
                        <input
                            className={styles.searchInput}
                            style={{ paddingLeft: '2.6rem' }}
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search products"
                        />
                    </div>
                    <div className={styles.segmentTabs}>
                        {(['all', 'glass', 'hardware'] as const).map(value => (
                            <button
                                key={value}
                                type="button"
                                className={`${styles.segmentTab} ${segment === value ? styles.segmentTabActive : ''}`}
                                onClick={() => {
                                    setSegment(value);
                                    setGroup('all');
                                    setSubtype('all');
                                    setActiveCollection(null);
                                }}
                            >
                                {value === 'all' ? 'All' : value === 'glass' ? 'Glass' : 'Hardware'}
                            </button>
                        ))}
                    </div>
                    <label className={styles.filterBlock}>
                        Category
                        <select className={styles.filterSelect} value={group} onChange={event => { setGroup(event.target.value as ProductGroup); setSubtype('all'); setActiveCollection(null); }}>
                            {visibleGroups.map(productGroup => (
                                <option key={productGroup.id} value={productGroup.id}>{productGroup.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.filterBlock}>
                        Sub type
                        <select className={styles.filterSelect} value={subtype} onChange={event => setSubtype(event.target.value)}>
                            <option value="all">All Sub Types</option>
                            {subtypeOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.filterBlock}>
                        Sort
                        <select className={styles.filterSelect} value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}>
                            <option value="featured">Featured</option>
                            <option value="price-low">Price: Low to High</option>
                            <option value="price-high">Price: High to Low</option>
                            <option value="name">Name</option>
                        </select>
                    </label>
                    <div className={styles.filterBlock}>
                        Price Range
                        <div className={styles.priceFilterGrid}>
                            <input
                                className={styles.filterSelect}
                                value={priceRange.min}
                                onChange={event => setPriceRange(prev => ({ ...prev, min: event.target.value }))}
                                inputMode="decimal"
                                placeholder="Min"
                            />
                            <input
                                className={styles.filterSelect}
                                value={priceRange.max}
                                onChange={event => setPriceRange(prev => ({ ...prev, max: event.target.value }))}
                                inputMode="decimal"
                                placeholder="Max"
                            />
                        </div>
                        {(priceRange.min || priceRange.max || query || group !== 'all' || subtype !== 'all' || activeCollection) && (
                            <button
                                className={styles.clearFiltersButton}
                                type="button"
                                onClick={() => {
                                    setPriceRange({ min: '', max: '' });
                                    setQuery('');
                                    setGroup('all');
                                    setSubtype('all');
                                    setSegment('all');
                                    setActiveCollection(null);
                                    setSortMode('featured');
                                }}
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                    <div className={styles.groupRail} aria-label="Product groups">
                        {visibleGroups.filter(productGroup => productGroup.id !== 'all').map(productGroup => (
                            <button
                                key={productGroup.id}
                                type="button"
                                className={`${styles.groupCard} ${group === productGroup.id ? styles.groupCardActive : ''}`}
                                onClick={() => {
                                    setGroup(productGroup.id);
                                    setSubtype('all');
                                    setActiveCollection(null);
                                }}
                            >
                                <Image src={SHOP_IMAGE_BY_GROUP[productGroup.id]} alt="" width={52} height={52} />
                                <span>{productGroup.label}</span>
                            </button>
                        ))}
                    </div>
                </aside>

                <main className={styles.resultsColumn}>
                    <div className={styles.resultsBar}>
                        <div>
                            <span>{loading ? 'Loading catalogue' : `${filteredItems.length} product${filteredItems.length === 1 ? '' : 's'} found`}</span>
                            <strong>{activeFilterLabels.length ? activeFilterLabels.join(' / ') : 'All online products'}</strong>
                        </div>
                        <button type="button" onClick={copyCurrentCatalogueLink}>
                            {copiedLink ? 'Link Copied' : 'Copy View Link'}
                        </button>
                        <button type="button" onClick={refreshShopProducts} disabled={loading}>
                            {loading ? 'Loading...' : 'Retry Products'}
                        </button>
                    </div>
                    {activeFilterLabels.length > 0 && (
                        <div className={styles.activeFilterRow} aria-label="Active filters">
                            {activeFilterLabels.map(label => (
                                <span key={label}>{label}</span>
                            ))}
                        </div>
                    )}
                    <div className={styles.productsGrid}>
                        {!loading && filteredItems.length === 0 && (
                            <div className={styles.catalogueEmpty}>
                                <ShoppingBag size={34} />
                                <h2>No products are available online yet</h2>
                                <p>Add or seed inventory items with selling rates, and they will appear here automatically.</p>
                                <button type="button" className={styles.addButton} onClick={refreshShopProducts}>
                                    Retry Products
                                </button>
                            </div>
                        )}
                        {filteredItems.map(item => {
                        const unit = getCatalogueUnit(item);
                        const itemGroup = getProductGroup(item);
                        const stockLabel = getStockLabel(item);
                        return (
                            <article key={item.id} className={styles.productCard}>
                            <div className={styles.productVisual}>
                                <div className={styles.productVisualGlow} />
                                <Image
                                    src={getShopImage(item)}
                                    alt={item.name}
                                    width={220}
                                    height={150}
                                    className={styles.productImage}
                                />
                            </div>
                            <div className={styles.productBody}>
                                <div className={styles.productMeta}>
                                    <span className={styles.pill}>{PRODUCT_GROUPS.find(productGroup => productGroup.id === itemGroup)?.label}</span>
                                    <span className={`${styles.stockBadge} ${styles[`stock${stockLabel.tone}`]}`}>{stockLabel.label}</span>
                                    {getReservedStockLabel(item) && (
                                        <span className={styles.reservedBadge}>{getReservedStockLabel(item)}</span>
                                    )}
                                </div>
                                <h2 className={styles.productName}>{item.name}</h2>
                                <span className={styles.subtypePill}>{getSubtype(item)}</span>
                                <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{getItemDetails(item)}</p>
                                <div className={styles.productSpecs}>
                                    {item.category !== 'hardware' && (
                                        <>
                                            <span>{item.thickness || 0}mm</span>
                                            <span>{item.width || 0}&quot; x {item.height || 0}&quot;</span>
                                        </>
                                    )}
                                    <span>HSN {item.hsnCode || 'N/A'}</span>
                                </div>
                                <div className={styles.priceRow}>
                                    <div>
                                        <div className={styles.price}>{formatIndianCurrency(getEffectiveRate(item, unit))}</div>
                                        <small>per {formatUnitLabel(unit)}</small>
                                    </div>
                                    <div className={styles.quickBuyRow}>
                                        <label>
                                            Qty
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                value={quickQuantities[item.id] ?? '1'}
                                                onChange={event => updateQuickQuantity(item.id, event.target.value)}
                                            />
                                        </label>
                                        <span>{formatUnitLabel(unit)}</span>
                                    </div>
                                    <div className={styles.productActions}>
                                        <button className={styles.detailButton} type="button" onClick={() => openProductDetails(item)}>
                                            <Eye size={15} />
                                            Details
                                        </button>
                                        <button className={styles.detailButton} type="button" onClick={() => openProductInquiry(item)}>
                                            <MessageCircle size={15} />
                                            Enquire
                                        </button>
                                        <button className={styles.addButton} type="button" onClick={() => addToCart(item, getQuickQuantity(item.id), false)}>
                                            Add
                                        </button>
                                        <button className={styles.buyNowButton} type="button" onClick={() => addToCart(item, getQuickQuantity(item.id), true)}>
                                            Buy Now
                                        </button>
                                    </div>
                                </div>
                            </div>
                            </article>
                        );
                        })}
                    </div>
                </main>
            </section>

            {(wishlistItems.length > 0 || recentlyViewedItems.length > 0) && (
                <section className={styles.personalShelf}>
                    {wishlistItems.length > 0 && (
                        <div className={styles.shelfBlock}>
                            <div className={styles.shelfHeader}>
                                <h2>Wishlist</h2>
                                <span>{wishlistItems.length} saved</span>
                            </div>
                            <div className={styles.miniProductRail}>
                                {wishlistItems.slice(0, 6).map(item => (
                                    <button key={item.id} className={styles.miniProductCard} type="button" onClick={() => openProductDetails(item)}>
                                        <Image src={getShopImage(item)} alt="" width={58} height={44} />
                                        <span>{item.name}</span>
                                        <strong>{formatIndianCurrency(item.rate)}</strong>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {recentlyViewedItems.length > 0 && (
                        <div className={styles.shelfBlock}>
                            <div className={styles.shelfHeader}>
                                <h2>Recently Viewed</h2>
                                <span>{recentlyViewedItems.length} items</span>
                            </div>
                            <div className={styles.miniProductRail}>
                                {recentlyViewedItems.slice(0, 6).map(item => (
                                    <button key={item.id} className={styles.miniProductCard} type="button" onClick={() => openProductDetails(item)}>
                                        <Image src={getShopImage(item)} alt="" width={58} height={44} />
                                        <span>{item.name}</span>
                                        <strong>{formatIndianCurrency(item.rate)}</strong>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {cartOpen && (
                <aside className={styles.cartPanel} aria-label="Shopping cart">
                    <div className={styles.cartHeader}>
                            <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Your Cart</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>
                                    {cartDetails.rowCount} item row{cartDetails.rowCount === 1 ? '' : 's'} • {cartDetails.pieceCount} piece/sheet qty
                                </p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className={styles.cartItems}>
                        {cartDetails.lines.length === 0 ? (
                            <div className={styles.emptyState}>Your cart is empty. Add products from the catalogue.</div>
                        ) : (
                            cartDetails.lines.map(line => {
                                const stockCheck = getStockComparison(line.item, line.quantity, line.unit);
                                return (
                                <div key={line.cartId} className={styles.cartLine}>
                                    <div>
                                        <strong>{line.customLabel || line.item.name}</strong>
                                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                            {getItemDetails(line.item)}
                                        </p>
                                        {line.width && line.height && (
                                            <p style={{ color: 'var(--color-primary-deep)', fontSize: '0.86rem', fontWeight: 800, marginTop: '0.25rem' }}>
                                                {line.width}&quot; x {line.height}&quot; • {line.pieces || 1} pc{(line.pieces || 1) === 1 ? '' : 's'}
                                            </p>
                                        )}
                                        {stockCheck.isOutOfStock && (
                                            <p className={styles.cartStockNote}>Availability to be confirmed</p>
                                        )}
                                        {stockCheck.isInsufficient && (
                                            <p className={styles.cartStockNote}>
                                                Requested {stockCheck.quantityLabel} needs {stockCheck.requestedLabel}; available {stockCheck.stockLabel}.
                                            </p>
                                        )}
                                        {!stockCheck.isOutOfStock && !stockCheck.isInsufficient && stockCheck.canCompare && line.unit !== stockCheck.stockUnit && (
                                            <p className={styles.cartStockOk}>
                                                Stock check: {stockCheck.requestedLabel} of {stockCheck.stockLabel} available.
                                            </p>
                                        )}
                                        <div className={styles.qtyRow}>
                                            <button className={styles.iconButton} type="button" onClick={() => updateQuantity(line.cartId, line.quantity - getQuantityStep(line.unit))}>
                                                <Minus size={15} />
                                            </button>
                                            <input
                                                type="number"
                                                min={getQuantityStep(line.unit)}
                                                step={getQuantityStep(line.unit)}
                                                value={cartQuantityDrafts[line.cartId] ?? String(line.quantity)}
                                                onChange={event => updateQuantityDraft(line.cartId, event.target.value)}
                                                onBlur={() => commitQuantityDraft(line)}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        event.currentTarget.blur();
                                                    }
                                                }}
                                            />
                                            <button className={styles.iconButton} type="button" onClick={() => updateQuantity(line.cartId, line.quantity + getQuantityStep(line.unit))}>
                                                <Plus size={15} />
                                            </button>
                                            <span>{formatUnitLabel(line.unit)}</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <strong>{formatIndianCurrency(line.calculated.lineTotal)}</strong>
                                        <button className={styles.iconButton} type="button" onClick={() => removeLine(line.cartId)} style={{ marginTop: '0.6rem' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                            })
                        )}

                        <form className={styles.checkoutForm} onSubmit={submitOrder}>
                            <h3>Delivery Details</h3>
                            <div className={styles.checkoutSummaryMini}>
                                <span>{cartDetails.rowCount} product row{cartDetails.rowCount === 1 ? '' : 's'} • {cartDetails.pieceCount} piece/sheet qty</span>
                                <strong>{formatIndianCurrency(cartDetails.total)}</strong>
                            </div>
                            {cartAvailability.hasWarnings && (
                                <div className={styles.cartAvailabilityNotice}>
                                    <strong>{cartAvailability.hasBlockingWarnings ? 'Stock issue' : 'Stock note'}</strong>
                                    {cartAvailability.warnings.slice(0, 3).map(warning => (
                                        <span key={warning}>{warning}</span>
                                    ))}
                                    {cartAvailability.warnings.length > 3 && (
                                        <span>{cartAvailability.warnings.length - 3} more item(s) need attention.</span>
                                    )}
                                </div>
                            )}
                            <div className={styles.checkoutSteps} aria-label="Checkout progress">
                                {checkoutReadiness.steps.map(step => (
                                    <div key={step.label} className={step.done ? styles.checkoutStepDone : ''}>
                                        <span>{step.done ? '✓' : ''}</span>
                                        <strong>{step.label}</strong>
                                    </div>
                                ))}
                            </div>
                            {checkoutReadiness.issues.length > 0 && (
                                <div className={styles.checkoutHint}>
                                    <strong>Before placing order</strong>
                                    <span>{checkoutReadiness.issues.join(' • ')}</span>
                                </div>
                            )}
                            {!customerAccount && (
                                <button
                                    type="button"
                                    className={styles.loginPrompt}
                                    onClick={() => { setAuthMode('login'); setAuthOpen(true); }}
                                >
                                    Login or register before checkout
                                </button>
                            )}
                            {customerAccount && (
                                <div className={styles.savedCheckoutCard}>
                                    <div>
                                        <span>Using saved customer</span>
                                        <strong>{customerAccount.name}</strong>
                                        <p>{customerAccount.address || 'No saved address yet.'}</p>
                                        <small>{customerAccount.deliveryPreference} • {customerAccount.deliverySlot || 'Any time'} • {customerAccount.paymentMode || customerAccount.paymentPreference}</small>
                                    </div>
                                    <button type="button" onClick={applySavedCheckoutDetails}>
                                        Use Saved
                                    </button>
                                </div>
                            )}
                            <input className={styles.checkoutInput} value={customer.name} onChange={event => setCustomer(prev => ({ ...prev, name: event.target.value }))} placeholder="Customer name *" />
                            <input className={styles.checkoutInput} value={customer.phone} onChange={event => setCustomer(prev => ({ ...prev, phone: event.target.value }))} placeholder="Phone number *" />
                            <input className={styles.checkoutInput} value={customer.email} onChange={event => setCustomer(prev => ({ ...prev, email: event.target.value }))} placeholder="Email address" />
                            <textarea className={styles.checkoutTextarea} value={customer.address} onChange={event => setCustomer(prev => ({ ...prev, address: event.target.value }))} placeholder="Delivery address *" rows={3} />
                            <select className={styles.checkoutInput} value={customer.deliveryPreference} onChange={event => setCustomer(prev => ({ ...prev, deliveryPreference: event.target.value }))}>
                                <option>Delivery required</option>
                                <option>Pickup from store</option>
                            </select>
                            {customer.deliveryPreference !== 'Pickup from store' && (
                                <>
                                    <input
                                        className={styles.checkoutInput}
                                        value={customer.pincode}
                                        onChange={event => setCustomer(prev => ({ ...prev, pincode: event.target.value }))}
                                        placeholder="Delivery pincode *"
                                        inputMode="numeric"
                                        maxLength={6}
                                    />
                                    {cartDetails.selectedDeliveryRule && (
                                        <p className={styles.paymentNote}>
                                            Delivery zone: <strong>{cartDetails.selectedDeliveryRule.place}</strong> — {formatIndianCurrency(cartDetails.transportCharge)} transportation, detected automatically from your pincode.
                                        </p>
                                    )}
                                    <label className={styles.installationToggle}>
                                        <input
                                            type="checkbox"
                                            checked={customer.wantsInstallation}
                                            onChange={event => setCustomer(prev => ({ ...prev, wantsInstallation: event.target.checked }))}
                                        />
                                        Add installation support ({formatIndianCurrency(checkoutCharges.installationChargePerSqft)}/sq.ft)
                                    </label>
                                </>
                            )}
                            <input
                                className={styles.checkoutInput}
                                type="date"
                                value={customer.preferredDate}
                                onChange={event => setCustomer(prev => ({ ...prev, preferredDate: event.target.value }))}
                            />
                            <select className={styles.checkoutInput} value={customer.deliverySlot} onChange={event => setCustomer(prev => ({ ...prev, deliverySlot: event.target.value }))}>
                                <option>Any time</option>
                                <option>Morning</option>
                                <option>Afternoon</option>
                                <option>Evening</option>
                                <option>Call before dispatch</option>
                            </select>
                            <section className={styles.extraChargeSection} aria-label="Additional checkout charges">
                                <div className={styles.extraChargeHeader}>
                                    <span>Checkout Charges</span>
                                    <strong>Calculated from settings</strong>
                                </div>
                                <div className={styles.extraChargeGrid}>
                                    <div className={styles.chargeSummaryCard}>
                                        <span>Transportation</span>
                                        <strong>{formatIndianCurrency(cartDetails.transportCharge)}</strong>
                                        <small>{customer.deliveryPreference === 'Pickup from store' ? 'Pickup selected' : cartDetails.selectedDeliveryRule?.place || 'No delivery place rule'}</small>
                                    </div>
                                    <div className={styles.chargeSummaryCard}>
                                        <span>Installation</span>
                                        <strong>{formatIndianCurrency(cartDetails.installationCharge)}</strong>
                                        <small>{customer.wantsInstallation ? `${cartDetails.areaSqft} sq.ft × ${formatIndianCurrency(checkoutCharges.installationChargePerSqft)}` : 'Check "Add installation support" above to apply'}</small>
                                    </div>
                                </div>
                            </section>
                            <section className={styles.paymentSection} aria-label="Payment details">
                                <div className={styles.paymentHeader}>
                                    <div>
                                        <span>Payment</span>
                                        <strong>Choose preferred method</strong>
                                    </div>
                                    <em>Ready total</em>
                                </div>
                                <div className={styles.paymentMethodGrid}>
                                    {PAYMENT_METHODS.map(method => (
                                        <button
                                            key={method.mode}
                                            type="button"
                                            className={`${styles.paymentMethodCard} ${customer.paymentMode === method.mode ? styles.paymentMethodActive : ''}`}
                                            onClick={() => setCustomer(prev => ({ ...prev, paymentMode: method.mode }))}
                                        >
                                            <span>{method.title}</span>
                                            <small>{method.subtitle}</small>
                                        </button>
                                    ))}
                                </div>
                                <label className={styles.paymentPolicy}>
                                    Payment timing
                                    <select value={customer.paymentPreference} onChange={event => setCustomer(prev => ({ ...prev, paymentPreference: event.target.value }))}>
                                        <option>Pay with selected method</option>
                                        <option>Pay at pickup or delivery</option>
                                        <option>Request payment link</option>
                                    </select>
                                </label>
                                <div className={styles.paymentInstructionCard}>
                                    <div className={styles.paymentInstructionHeader}>
                                        <div>
                                            <span>Amount to pay</span>
                                            <strong>{formatIndianCurrency(paymentDetails.amount)}</strong>
                                        </div>
                                        <button type="button" onClick={copyPaymentInstructions}>Copy details</button>
                                    </div>
                                    {customer.paymentMode === 'UPI' && (
                                        paymentDetails.upiId ? (
                                            <div className={styles.paymentInstructionGrid}>
                                                <span>UPI ID</span>
                                                <strong>{paymentDetails.upiId}</strong>
                                                {paymentDetails.upiLink && (
                                                    <a href={paymentDetails.upiLink}>Open UPI app</a>
                                                )}
                                            </div>
                                        ) : (
                                            <p>UPI is selected. Staff will share the UPI details after order review.</p>
                                        )
                                    )}
                                    {customer.paymentMode === 'Bank transfer' && (
                                        paymentDetails.bankLines.length > 0 ? (
                                            <div className={styles.paymentInstructionList}>
                                                {paymentDetails.bankLines.map(line => <span key={line}>{line}</span>)}
                                            </div>
                                        ) : (
                                            <p>Bank transfer is selected. Staff will share account details after order review.</p>
                                        )
                                    )}
                                    {customer.paymentMode === 'Payment link requested' && (
                                        <p>A secure payment link will be sent after staff verifies stock and delivery details.</p>
                                    )}
                                    {customer.paymentMode === 'Cash on delivery / pickup' && (
                                        <p>Payment will be collected during pickup or delivery before handover.</p>
                                    )}
                                    {customer.paymentMode === 'Card at store' && (
                                        <p>Card payment will be collected at store when you visit for pickup or confirmation.</p>
                                    )}
                                    <small>{paymentSettings.paymentInstructions || DEFAULT_PAYMENT_SETTINGS.paymentInstructions}</small>
                                </div>
                                <p className={styles.paymentNote}>
                                    The order is saved as unpaid until staff confirms payment receipt. Stock is checked from inventory, including sheet and area conversions where size data is available.
                                </p>
                            </section>
                            {customerAccount && (
                                <button className={styles.saveCheckoutButton} type="button" onClick={saveCheckoutDetails}>
                                    Save these checkout details
                                </button>
                            )}
                            <textarea className={styles.checkoutTextarea} value={customer.notes} onChange={event => setCustomer(prev => ({ ...prev, notes: event.target.value }))} placeholder="Special instructions" rows={2} />
                        </form>
                    </div>

                    <div className={styles.cartFooter}>
                        <div className={styles.totals}>
                            <div className={styles.totalRow}><span>Products</span><strong>{formatIndianCurrency(cartDetails.productSubtotal)}</strong></div>
                            {cartDetails.transportCharge > 0 && (
                                <div className={styles.totalRow}><span>Transportation</span><strong>{formatIndianCurrency(cartDetails.transportCharge)}</strong></div>
                            )}
                            {cartDetails.installationCharge > 0 && (
                                <div className={styles.totalRow}><span>Installation</span><strong>{formatIndianCurrency(cartDetails.installationCharge)}</strong></div>
                            )}
                            <div className={styles.totalRow}><span>Subtotal</span><strong>{formatIndianCurrency(cartDetails.subtotal)}</strong></div>
                            <div className={styles.totalRow}><span>GST ({GST_RATE}%)</span><strong>{formatIndianCurrency(cartDetails.taxAmount)}</strong></div>
                            <div className={`${styles.totalRow} ${styles.grandTotal}`}><span>Total</span><strong>{formatIndianCurrency(cartDetails.total)}</strong></div>
                        </div>
                        <button className="btn btn-primary" type="button" disabled={submitting || cartDetails.lines.length === 0} onClick={submitOrder} style={{ width: '100%', marginTop: '1rem' }}>
                            {submitting ? 'Placing Order...' : 'Place Order'}
                        </button>
                    </div>
                </aside>
            )}

            {authOpen && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.authCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>{authMode === 'edit' ? 'Edit Customer Details' : authMode === 'register' ? 'Customer Registration' : 'Customer Login'}</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>
                                    {authMode === 'edit'
                                        ? 'Update your delivery details and preferences for future orders.'
                                        : authMode === 'register'
                                            ? 'Create a customer account for orders, delivery details and order history.'
                                            : 'Login with your registered phone/email and password.'}
                                </p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setAuthOpen(false)} aria-label="Close customer login">
                                <X size={20} />
                            </button>
                        </div>
                        <form className={styles.checkoutForm} onSubmit={saveCustomerAccount}>
                            {authMode === 'login' ? (
                                <>
                                    <input
                                        className={styles.checkoutInput}
                                        value={authCredentials.identifier}
                                        onChange={event => setAuthCredentials(prev => ({ ...prev, identifier: event.target.value }))}
                                        placeholder="Phone or email *"
                                        autoComplete="username"
                                    />
                                    <input
                                        className={styles.checkoutInput}
                                        type="password"
                                        value={authCredentials.password}
                                        onChange={event => setAuthCredentials(prev => ({ ...prev, password: event.target.value }))}
                                        placeholder="Password *"
                                        autoComplete="current-password"
                                    />
                                </>
                            ) : (
                                <>
                                    <input className={styles.checkoutInput} value={customer.name} onChange={event => setCustomer(prev => ({ ...prev, name: event.target.value }))} placeholder="Customer name *" autoComplete="name" />
                                    <input className={styles.checkoutInput} value={customer.phone} onChange={event => setCustomer(prev => ({ ...prev, phone: event.target.value }))} placeholder="Phone number *" autoComplete="tel" />
                                    <input className={styles.checkoutInput} value={customer.email} onChange={event => setCustomer(prev => ({ ...prev, email: event.target.value }))} placeholder="Email address" autoComplete="email" />
                                    <textarea className={styles.checkoutTextarea} value={customer.address} onChange={event => setCustomer(prev => ({ ...prev, address: event.target.value }))} placeholder="Delivery address" rows={3} />
                                    {authMode === 'register' && (
                                        <>
                                            <input
                                                className={styles.checkoutInput}
                                                type="password"
                                                value={authCredentials.password}
                                                onChange={event => setAuthCredentials(prev => ({ ...prev, password: event.target.value }))}
                                                placeholder="Create password *"
                                                autoComplete="new-password"
                                            />
                                            <input
                                                className={styles.checkoutInput}
                                                type="password"
                                                value={authCredentials.confirmPassword}
                                                onChange={event => setAuthCredentials(prev => ({ ...prev, confirmPassword: event.target.value }))}
                                                placeholder="Confirm password *"
                                                autoComplete="new-password"
                                            />
                                        </>
                                    )}
                                </>
                            )}
                            {errorMessage && <div className={styles.inlineError}>{errorMessage}</div>}
                            <button className="btn btn-primary" type="submit">
                                {authMode === 'edit' ? 'Save Details' : authMode === 'register' ? 'Register & Continue' : 'Login & Continue'}
                            </button>
                        </form>
                        {authMode !== 'edit' && (
                            <button
                                className={styles.switchAuthButton}
                                type="button"
                                onClick={() => {
                                    setAuthMode(authMode === 'login' ? 'register' : 'login');
                                    setAuthCredentials({ identifier: '', password: '', confirmPassword: '' });
                                    setErrorMessage('');
                                }}
                            >
                                {authMode === 'login' ? 'New customer? Register here' : 'Already registered? Login here'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {orderSuccessOpen && lastOrder && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.orderPlacedCard}>
                        <div className={styles.orderPlacedIcon}>
                            <CheckCircle2 size={34} />
                        </div>
                        <h2>{lastOrder.total > 0 ? 'Order placed successfully' : 'Request submitted successfully'}</h2>
                        <p>{lastOrder.total > 0 ? 'Your order has been placed with Arjun Glass House.' : 'Your request has been sent to Arjun Glass House. Our team will contact you shortly.'}</p>
                        <div className={styles.orderPlacedSummary}>
                            <span>Reference number</span>
                            <strong>{lastOrder.number}</strong>
                            <span>Status</span>
                            <strong>{lastOrder.status}</strong>
                            <span>Payment status</span>
                            <strong>{lastOrder.paymentStatus || 'unpaid'}</strong>
                            {lastOrder.total > 0 && (
                                <>
                                    <span>Total amount</span>
                                    <strong>{formatIndianCurrency(lastOrder.total)}</strong>
                                    <span>Payment mode</span>
                                    <strong>{lastOrder.paymentMode || customer.paymentMode}</strong>
                                    <span>Balance</span>
                                    <strong>{formatIndianCurrency(lastOrder.balanceAmount ?? lastOrder.total)}</strong>
                                </>
                            )}
                        </div>
                        {lastOrder.total > 0 && (
                            <div className={styles.orderPlacedPayment}>
                                <strong>Payment next step</strong>
                                <p>{lastOrder.paymentMode === 'UPI' && paymentDetails.upiId
                                    ? `Pay ${formatIndianCurrency(lastOrder.balanceAmount ?? lastOrder.total)} to ${paymentDetails.upiId}, then share the reference on WhatsApp.`
                                    : lastOrder.paymentMode === 'Bank transfer' && paymentDetails.bankLines.length
                                        ? `Transfer ${formatIndianCurrency(lastOrder.balanceAmount ?? lastOrder.total)} using the bank details selected at checkout.`
                                        : 'Staff will confirm payment collection details for this order.'}</p>
                                <button className={styles.detailButton} type="button" onClick={copyPaymentInstructions}>Copy Payment Details</button>
                                {lastOrder.paymentMode === 'UPI' && paymentDetails.upiLink && (
                                    <a className={styles.addButton} href={paymentDetails.upiLink}>Open UPI App</a>
                                )}
                                <button
                                    className={styles.detailButton}
                                    type="button"
                                    onClick={() => {
                                        setOrderSuccessOpen(false);
                                        openSupportRequest(lastOrder, 'payment');
                                    }}
                                >
                                    I Have Paid
                                </button>
                            </div>
                        )}
                        <div className={styles.orderPlacedActions}>
                            <button className={styles.addButton} type="button" onClick={() => { setOrdersOpen(true); setOrderSuccessOpen(false); }}>
                                View My Orders
                            </button>
                            <button className={styles.detailButton} type="button" onClick={() => printOrderConfirmation(lastOrder)}>
                                Print Receipt
                            </button>
                            <a
                                className={styles.detailButton}
                                href={generateWhatsAppLink(BUSINESS_WHATSAPP, buildOrderShareMessage(lastOrder))}
                                target="_blank"
                                rel="noreferrer"
                            >
                                WhatsApp
                            </a>
                            <Link className={styles.detailButton} href={buildTrackHref(lastOrder)} onClick={() => setOrderSuccessOpen(false)}>
                                Track Order
                            </Link>
                            <button className={styles.detailButton} type="button" onClick={() => setOrderSuccessOpen(false)}>
                                Continue Shopping
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {accountOpen && customerAccount && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.accountCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Your Account</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>Saved details, cart, and recent online orders.</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setAccountOpen(false)} aria-label="Close account">
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.accountHero}>
                            <div className={styles.accountAvatar}>
                                {customerAccount.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                                <span>Hello,</span>
                                <strong>{customerAccount.name}</strong>
                                <p>{customerAccount.phone || 'No phone saved'}{customerAccount.email ? ` • ${customerAccount.email}` : ''}</p>
                            </div>
                        </div>

                        <div className={styles.accountStats}>
                            <div>
                                <span>Cart</span>
                                <strong>{cartDetails.lines.length}</strong>
                                <small>{formatIndianCurrency(cartDetails.total)}</small>
                            </div>
                            <div>
                                <span>Orders</span>
                                <strong>{customerOrders.length}</strong>
                                <small>For this customer</small>
                            </div>
                            <div>
                                <span>Wishlist</span>
                                <strong>{wishlistItems.length}</strong>
                                <small>Saved products</small>
                            </div>
                        </div>

                        <div className={styles.savedDetails}>
                            <h3>Saved Delivery Details</h3>
                            <p>{customerAccount.address || 'No delivery address saved yet.'}</p>
                            <p>{customerAccount.deliveryPreference} • {customerAccount.deliverySlot || 'Any time'} • {customerAccount.paymentMode || customerAccount.paymentPreference}</p>
                        </div>

                        {customerOrders[0] && (
                            <div className={styles.savedDetails}>
                                <h3>Latest Order</h3>
                                <p>{customerOrders[0].number} • {formatIndianCurrency(customerOrders[0].total)} • {customerOrders[0].status}</p>
                            </div>
                        )}

                        <div className={styles.accountActions}>
                            <button type="button" className={styles.addButton} onClick={() => { setCartOpen(true); setAccountOpen(false); }}>
                                Open Cart
                            </button>
                            <button type="button" className={styles.detailButton} onClick={() => { setOrdersOpen(true); setAccountOpen(false); }}>
                                My Orders
                            </button>
                            <button type="button" className={styles.detailButton} onClick={syncCustomerOrders} disabled={submitting}>
                                {submitting ? 'Syncing...' : 'Sync Orders'}
                            </button>
                            <button type="button" className={styles.detailButton} onClick={() => { setAuthMode('edit'); setAuthOpen(true); setAccountOpen(false); }}>
                                Edit Details
                            </button>
                            <button type="button" className={styles.logoutButton} onClick={() => { logoutCustomer(); setAccountOpen(false); }}>
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {ordersOpen && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.ordersCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>My Orders</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>Track browser orders, review items, and reorder quickly.</p>
                            </div>
                            <div className={styles.orderToolbar}>
                                <button className={styles.detailButton} type="button" onClick={syncCustomerOrders} disabled={submitting || customerOrders.length === 0}>
                                    {submitting ? 'Syncing...' : 'Sync Status'}
                                </button>
                                <button className={styles.iconButton} type="button" onClick={() => setOrdersOpen(false)} aria-label="Close orders">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.orderList}>
                            {customerOrders.length === 0 ? (
                                <div className={styles.emptyState}>No online orders saved for this customer yet.</div>
                            ) : customerOrders.map(order => (
                                <div key={order.id} className={styles.orderCard}>
                                    <div className={styles.orderSummaryRow}>
                                        <div>
                                            <strong>{order.number}</strong>
                                            <p>{new Date(order.date).toLocaleDateString('en-IN')} • {order.items} item rows</p>
                                        </div>
                                        <div className={styles.orderAmountBlock}>
                                            <strong>{formatIndianCurrency(order.total)}</strong>
                                            <span>{order.status}</span>
                                        </div>
                                    </div>
                                    {order.lines && order.lines.length > 0 && (
                                        <div className={styles.orderLineList}>
                                            {order.lines.map((line, index) => (
                                                <div key={`${order.id}-${line.itemId}-${index}`} className={styles.orderLine}>
                                                    <span>{line.name}</span>
                                                    <strong>
                                                        {line.quantity} {formatUnitLabel(line.unit)} • {formatIndianCurrency(line.total)}
                                                    </strong>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button className={styles.reorderButton} type="button" onClick={() => reorderFromHistory(order)}>
                                        Add these items again
                                    </button>
                                    {order.supportRequest && (
                                        <div className={styles.orderRequestNote}>
                                            Request sent: {order.supportRequest}
                                        </div>
                                    )}
                                    <div className={styles.orderActionRow}>
                                        <button className={styles.detailButton} type="button" onClick={() => printOrderConfirmation(order)}>
                                            Print Receipt
                                        </button>
                                        <a
                                            className={styles.detailButton}
                                            href={generateWhatsAppLink(BUSINESS_WHATSAPP, buildOrderShareMessage(order))}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            WhatsApp
                                        </a>
                                        <button className={styles.detailButton} type="button" onClick={() => openSupportRequest(order, 'help')}>
                                            Need Help
                                        </button>
                                        {order.total > 0 && order.paymentStatus !== 'paid' && (
                                            <button className={styles.detailButton} type="button" onClick={() => openSupportRequest(order, 'payment')}>
                                                Payment Ref
                                            </button>
                                        )}
                                        <Link className={styles.detailButton} href={buildTrackHref(order)} onClick={() => setOrdersOpen(false)}>
                                            Track
                                        </Link>
                                        <button className={styles.cancelRequestButton} type="button" onClick={() => openSupportRequest(order, 'cancel')}>
                                            Request Cancel
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {supportOrder && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.authCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>{supportType === 'cancel' ? 'Request Cancellation' : supportType === 'payment' ? 'Submit Payment Reference' : 'Order Support'}</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>{supportOrder.number}</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setSupportOrder(null)} aria-label="Close request">
                                <X size={20} />
                            </button>
                        </div>
                        <form className={styles.checkoutForm} onSubmit={submitSupportRequest}>
                            <textarea
                                className={styles.checkoutTextarea}
                                value={supportMessage}
                                onChange={event => setSupportMessage(event.target.value)}
                                rows={4}
                                placeholder={supportType === 'payment' ? 'Enter UPI reference / UTR / bank transaction number...' : 'Write your request for the store...'}
                            />
                            {supportType === 'payment' && (
                                <div className={styles.paymentNote}>
                                    Submitting a reference does not mark the order paid automatically. Staff will verify receipt and then update payment in accounts.
                                </div>
                            )}
                            <button className="btn btn-primary" type="submit" disabled={submitting}>
                                {submitting ? 'Sending...' : supportType === 'payment' ? 'Submit Payment Reference' : 'Send Request'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {compareOpen && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.compareCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Compare Products</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>Compare up to 4 glass or hardware products.</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setCompareOpen(false)} aria-label="Close compare">
                                <X size={20} />
                            </button>
                        </div>
                        {compareItems.length === 0 ? (
                            <div className={styles.emptyState}>Select products using the compare button on product cards.</div>
                        ) : (
                            <div className={styles.compareTable}>
                                {compareItems.map(item => (
                                    <div key={item.id} className={styles.compareColumn}>
                                        <Image src={getShopImage(item)} alt="" width={120} height={86} />
                                        <h3>{item.name}</h3>
                                        <strong>{formatIndianCurrency(item.rate)} / {formatUnitLabel(getItemUnit(item))}</strong>
                                        <span>{PRODUCT_GROUPS.find(productGroup => productGroup.id === getProductGroup(item))?.label}</span>
                                        <span>{getSubtype(item)}</span>
                                        <span>{item.category !== 'hardware' ? `${item.thickness || 0}mm` : item.type}</span>
                                        <span>{item.category !== 'hardware' ? `${item.width || 0}" x ${item.height || 0}"` : item.model}</span>
                                        <span>Stock: {Number(item.stock) || 0} {formatUnitLabel(item.unit)}</span>
                                        <div className={styles.compareActions}>
                                            <button className={styles.addButton} type="button" onClick={() => addToCart(item)}>Add</button>
                                            <button className={styles.detailButton} type="button" onClick={() => openProductDetails(item)}>Details</button>
                                            <button className={styles.detailButton} type="button" onClick={() => toggleCompare(item.id)}>Remove</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {selectedProduct && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.productDetailCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <span className={styles.pill}>{PRODUCT_GROUPS.find(productGroup => productGroup.id === getProductGroup(selectedProduct))?.label}</span>
                                <h2 style={{ marginTop: '0.65rem' }}>{selectedProduct.name}</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>{getItemDetails(selectedProduct)}</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setSelectedProduct(null)} aria-label="Close product details">
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.productDetailGrid}>
                            <div className={styles.productDetailVisual}>
                                <Image
                                    src={getShopImage(selectedProduct)}
                                    alt={selectedProduct.name}
                                    width={300}
                                    height={210}
                                />
                                <div className={styles.quickViewBadges}>
                                    <span>{PRODUCT_GROUPS.find(productGroup => productGroup.id === getProductGroup(selectedProduct))?.label}</span>
                                    <span>{getStockLabel(selectedProduct).label}</span>
                                    {getReservedStockLabel(selectedProduct) && (
                                        <span>{getReservedStockLabel(selectedProduct)}</span>
                                    )}
                                </div>
                            </div>
                            <div className={styles.productDetailInfo}>
                                {(() => {
                                    const unit = getCatalogueUnit(selectedProduct);
                                    const quantity = getQuickQuantity(selectedProduct.id);
                                    const estimate = getLineAmounts(selectedProduct, quantity, unit);
                                    return (
                                        <div className={styles.quickViewBuyBox}>
                                            <div>
                                                <div className={styles.detailPrice}>{formatIndianCurrency(getEffectiveRate(selectedProduct, unit))}</div>
                                                <p>per {formatUnitLabel(unit)}</p>
                                            </div>
                                            <label>
                                                Qty
                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    value={quickQuantities[selectedProduct.id] ?? '1'}
                                                    onChange={event => updateQuickQuantity(selectedProduct.id, event.target.value)}
                                                />
                                            </label>
                                            <div className={styles.quickViewEstimate}>
                                                <span>Estimated line total</span>
                                                <strong>{formatIndianCurrency(estimate.lineTotal)}</strong>
                                                <small>{estimate.sqft.toFixed(2)} sq.ft equivalent</small>
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className={styles.specGrid}>
                                    <span>Category</span><strong>{selectedProduct.category === 'hardware' ? 'Hardware' : 'Glass'}</strong>
                                    <span>Sub type</span><strong>{getSubtype(selectedProduct)}</strong>
                                    <span>Make</span><strong>{selectedProduct.make || 'General'}</strong>
                                    {selectedProduct.category !== 'hardware' && (
                                        <>
                                            <span>Thickness</span><strong>{selectedProduct.thickness || 0}mm</strong>
                                            <span>Sheet size</span><strong>{selectedProduct.width || 0}&quot; x {selectedProduct.height || 0}&quot;</strong>
                                        </>
                                    )}
                                    <span>Stock</span><strong>{Number(selectedProduct.stock) || 0} {formatUnitLabel(selectedProduct.unit)}</strong>
                                    <span>HSN</span><strong>{selectedProduct.hsnCode || 'N/A'}</strong>
                                </div>
                                <div className={styles.detailActions}>
                                    <button className={styles.detailButton} type="button" onClick={() => toggleWishlist(selectedProduct.id)}>
                                        <Heart size={16} />
                                        {wishlistIds.includes(selectedProduct.id) ? 'Saved' : 'Wishlist'}
                                    </button>
                                    <button className={styles.detailButton} type="button" onClick={() => toggleCompare(selectedProduct.id)}>
                                        <Scale size={16} />
                                        {compareIds.includes(selectedProduct.id) ? 'Comparing' : 'Compare'}
                                    </button>
                                    <button className={styles.detailButton} type="button" onClick={() => openProductInquiry(selectedProduct)}>
                                        <MessageCircle size={16} />
                                        Enquire
                                    </button>
                                    {selectedProduct.category !== 'hardware' && (
                                        <button className={styles.detailButton} type="button" onClick={() => { setCustomSizeProduct(selectedProduct); setSelectedProduct(null); }}>
                                            Custom Size
                                        </button>
                                    )}
                                    <button className="btn btn-primary" type="button" onClick={() => { addToCart(selectedProduct, getQuickQuantity(selectedProduct.id), false); setSelectedProduct(null); }}>
                                        Add to Cart
                                    </button>
                                    <button className={styles.buyNowButton} type="button" onClick={() => { addToCart(selectedProduct, getQuickQuantity(selectedProduct.id), true); setSelectedProduct(null); }}>
                                        Buy Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {inquiryProduct && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.authCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Product Enquiry</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>{inquiryProduct.name}</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setInquiryProduct(null)} aria-label="Close product enquiry">
                                <X size={20} />
                            </button>
                        </div>
                        <form className={styles.checkoutForm} onSubmit={submitProductInquiry}>
                            <input
                                className={styles.checkoutInput}
                                value={productInquiry.name}
                                onChange={event => setProductInquiry(prev => ({ ...prev, name: event.target.value }))}
                                placeholder="Customer name *"
                            />
                            <input
                                className={styles.checkoutInput}
                                value={productInquiry.phone}
                                onChange={event => setProductInquiry(prev => ({ ...prev, phone: event.target.value }))}
                                placeholder="Phone number *"
                                inputMode="tel"
                            />
                            <input
                                className={styles.checkoutInput}
                                value={productInquiry.email}
                                onChange={event => setProductInquiry(prev => ({ ...prev, email: event.target.value }))}
                                placeholder="Email address"
                                inputMode="email"
                            />
                            <select
                                className={styles.checkoutInput}
                                value={productInquiry.preferredContact}
                                onChange={event => setProductInquiry(prev => ({ ...prev, preferredContact: event.target.value }))}
                            >
                                <option>Phone call</option>
                                <option>WhatsApp</option>
                                <option>Email</option>
                            </select>
                            <textarea
                                className={styles.checkoutTextarea}
                                value={productInquiry.message}
                                onChange={event => setProductInquiry(prev => ({ ...prev, message: event.target.value }))}
                                placeholder="Ask about size, availability, rate, installation, colour, hardware compatibility..."
                                rows={4}
                            />
                            <button className="btn btn-primary" type="submit" disabled={submitting}>
                                {submitting ? 'Sending...' : 'Send Product Enquiry'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {customSizeProduct && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.authCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Custom Size</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>{customSizeProduct.name}</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setCustomSizeProduct(null)} aria-label="Close custom size">
                                <X size={20} />
                            </button>
                        </div>
                        <form className={styles.checkoutForm} onSubmit={addCustomSizeToCart}>
                            <div className={styles.customSizeGrid}>
                                <input className={styles.checkoutInput} type="number" min="0" step="0.01" value={customSize.width} onChange={event => setCustomSize(prev => ({ ...prev, width: event.target.value }))} placeholder="Width in inches" />
                                <input className={styles.checkoutInput} type="number" min="0" step="0.01" value={customSize.height} onChange={event => setCustomSize(prev => ({ ...prev, height: event.target.value }))} placeholder="Height in inches" />
                                <input className={styles.checkoutInput} type="number" min="1" step="1" value={customSize.pieces} onChange={event => setCustomSize(prev => ({ ...prev, pieces: event.target.value }))} placeholder="Pieces" />
                            </div>
                            <div className={styles.customEstimateBox}>
                                {(() => {
                                    const width = Number(customSize.width) || 0;
                                    const height = Number(customSize.height) || 0;
                                    const pieces = Number(customSize.pieces) || 0;
                                    const billedWidth = roundToNextEvenInch(width);
                                    const billedHeight = roundToNextEvenInch(height);
                                    const sqft = roundCurrency((billedWidth * billedHeight * pieces) / 144);
                                    const amount = getLineAmounts(customSizeProduct, sqft, 'sqft').lineTotal;
                                    return (
                                        <>
                                            <span>Billed Size</span>
                                            <strong>{width > 0 && height > 0 ? `${billedWidth}" x ${billedHeight}"` : '—'}</strong>
                                            <span>Calculated Area</span>
                                            <strong>{sqft.toFixed(2)} sq.ft</strong>
                                            <span>Estimated Amount</span>
                                            <strong>{formatIndianCurrency(amount)}</strong>
                                        </>
                                    );
                                })()}
                            </div>
                            <button className="btn btn-primary" type="submit">Add Custom Size to Cart</button>
                        </form>
                    </div>
                </div>
            )}

            {customQuoteOpen && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.customQuoteCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Custom Glass Quote</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>Send size, finish, holes/cuts and site photos for staff review.</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setCustomQuoteOpen(false)} aria-label="Close custom quote">
                                <X size={20} />
                            </button>
                        </div>
                        <form className={styles.checkoutForm} onSubmit={submitCustomQuote}>
                            <div className={styles.customQuoteGrid}>
                                <select className={styles.checkoutInput} value={customQuote.projectType} onChange={event => setCustomQuote(prev => ({ ...prev, projectType: event.target.value }))}>
                                    <option>Glass door / partition</option>
                                    <option>Bathroom / shower enclosure</option>
                                    <option>Window glass</option>
                                    <option>Mirror</option>
                                    <option>Table top / shelf</option>
                                    <option>Railing panel</option>
                                    <option>Other custom work</option>
                                </select>
                                <select className={styles.checkoutInput} value={customQuote.finish} onChange={event => setCustomQuote(prev => ({ ...prev, finish: event.target.value }))}>
                                    <option>Clear</option>
                                    <option>Toughened Clear</option>
                                    <option>Frosted</option>
                                    <option>Fluted</option>
                                    <option>Tinted Bronze</option>
                                    <option>Tinted Green</option>
                                    <option>Reflective</option>
                                    <option>Mirror</option>
                                </select>
                                <input className={styles.checkoutInput} value={customQuote.width} onChange={event => setCustomQuote(prev => ({ ...prev, width: event.target.value }))} inputMode="decimal" placeholder="Width" />
                                <input className={styles.checkoutInput} value={customQuote.height} onChange={event => setCustomQuote(prev => ({ ...prev, height: event.target.value }))} inputMode="decimal" placeholder="Height" />
                                <select className={styles.checkoutInput} value={customQuote.unit} onChange={event => setCustomQuote(prev => ({ ...prev, unit: event.target.value as CustomQuoteForm['unit'] }))}>
                                    <option value="inch">Inch</option>
                                    <option value="ft">Feet</option>
                                    <option value="mm">Millimetre</option>
                                    <option value="cm">Centimetre</option>
                                    <option value="m">Metre</option>
                                </select>
                                <select className={styles.checkoutInput} value={customQuote.thickness} onChange={event => setCustomQuote(prev => ({ ...prev, thickness: event.target.value }))}>
                                    <option value="4">4mm</option>
                                    <option value="5">5mm</option>
                                    <option value="6">6mm</option>
                                    <option value="8">8mm</option>
                                    <option value="10">10mm</option>
                                    <option value="12">12mm</option>
                                    <option value="15">15mm</option>
                                </select>
                                <input className={styles.checkoutInput} value={customQuote.quantity} onChange={event => setCustomQuote(prev => ({ ...prev, quantity: event.target.value }))} inputMode="numeric" placeholder="Pieces" />
                                <input className={styles.checkoutInput} value={customQuote.holes} onChange={event => setCustomQuote(prev => ({ ...prev, holes: event.target.value }))} inputMode="numeric" placeholder="Holes per piece" />
                                <input className={styles.checkoutInput} value={customQuote.cuts} onChange={event => setCustomQuote(prev => ({ ...prev, cuts: event.target.value }))} inputMode="numeric" placeholder="Cuts per piece" />
                                <select className={styles.checkoutInput} value={customQuote.edgeWork} onChange={event => setCustomQuote(prev => ({ ...prev, edgeWork: event.target.value }))}>
                                    <option>Standard edge</option>
                                    <option>Polished edge</option>
                                    <option>Bevel edge</option>
                                    <option>Round corners</option>
                                    <option>Cutout required</option>
                                </select>
                                <input className={styles.checkoutInput} type="date" value={customQuote.preferredDate} onChange={event => setCustomQuote(prev => ({ ...prev, preferredDate: event.target.value }))} />
                            </div>
                            <div className={styles.customQuotePreview}>
                                <div>
                                    <span>Entered Size</span>
                                    <strong>{customQuotePreview.enteredSize}</strong>
                                </div>
                                <div>
                                    <span>Billed Size</span>
                                    <strong>{customQuotePreview.billedSize}</strong>
                                </div>
                                <div>
                                    <span>Total Area</span>
                                    <strong>{customQuotePreview.areaSqft.toFixed(2)} sq.ft</strong>
                                </div>
                                <div>
                                    <span>Work Details</span>
                                    <strong>{customQuotePreview.quantity} pc • {customQuotePreview.holesTotal} holes • {customQuotePreview.cutsTotal} cuts</strong>
                                </div>
                            </div>
                            <textarea className={styles.checkoutTextarea} value={customQuote.notes} onChange={event => setCustomQuote(prev => ({ ...prev, notes: event.target.value }))} rows={3} placeholder="Mention fitting, hardware position, special shape, site constraints or urgency..." />
                            <label className={styles.quoteUploadBox}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={event => {
                                        handleQuoteAttachments(event.target.files);
                                        event.currentTarget.value = '';
                                    }}
                                />
                                Upload photos or rough sketches
                                <span>Up to 4 images, 700 KB each</span>
                            </label>
                            {quoteAttachments.length > 0 && (
                                <div className={styles.quoteAttachmentGrid}>
                                    {quoteAttachments.map(file => (
                                        <div className={styles.quoteAttachmentCard} key={file.id}>
                                            <img src={file.dataUrl} alt={file.name} />
                                            <span>{file.name}</span>
                                            <button type="button" onClick={() => setQuoteAttachments(prev => prev.filter(item => item.id !== file.id))}>
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button className="btn btn-primary" type="submit" disabled={submitting}>
                                {submitting ? 'Sending Quote...' : 'Send Custom Quote Request'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {finderOpen && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.finderCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Guided Product Finder</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>Answer three quick questions and apply the best shop filters.</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setFinderOpen(false)} aria-label="Close product finder">
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.finderGrid}>
                            <label>
                                <span>Project type</span>
                                <select className={styles.checkoutInput} value={finder.need} onChange={event => setFinder(prev => ({ ...prev, need: event.target.value as FinderNeed }))}>
                                    <option value="shower">Bathroom / shower enclosure</option>
                                    <option value="door">Glass door</option>
                                    <option value="mirror">Mirror work</option>
                                    <option value="partition">Office / home partition</option>
                                    <option value="railing">Railing / balcony</option>
                                    <option value="hardware">Hardware replacement</option>
                                </select>
                            </label>
                            <label>
                                <span>Preferred finish</span>
                                <select className={styles.checkoutInput} value={finder.finish} onChange={event => setFinder(prev => ({ ...prev, finish: event.target.value as FinderFinish }))}>
                                    <option value="clear">Clear</option>
                                    <option value="tinted">Tinted</option>
                                    <option value="reflective">Reflective</option>
                                    <option value="fluted">Fluted / privacy</option>
                                    <option value="mirror">Mirror</option>
                                </select>
                            </label>
                            <label>
                                <span>Buying priority</span>
                                <select className={styles.checkoutInput} value={finder.priority} onChange={event => setFinder(prev => ({ ...prev, priority: event.target.value as FinderPriority }))}>
                                    <option value="complete-kit">Complete glass + hardware kit</option>
                                    <option value="budget">Value / budget first</option>
                                    <option value="premium">Premium options first</option>
                                </select>
                            </label>
                        </div>
                        <div className={styles.finderResult}>
                            <span>Recommended path</span>
                            <h3>{finderResult.title}</h3>
                            <p>{finderResult.description} {finderResult.priorityText}</p>
                            <div>
                                {finderResult.groups.slice(0, 6).map(productGroup => (
                                    <strong key={productGroup}>{PRODUCT_GROUPS.find(entry => entry.id === productGroup)?.label}</strong>
                                ))}
                            </div>
                        </div>
                        <button className="btn btn-primary" type="button" onClick={applyFinderRecommendation}>
                            Show Recommended Products
                        </button>
                    </div>
                </div>
            )}

            {bulkRequestOpen && (
                <div className={styles.authOverlay} role="dialog" aria-modal="true">
                    <div className={styles.authCard}>
                        <div className={styles.cartTitleRow}>
                            <div>
                                <h2>Bulk / Project Quote</h2>
                                <p style={{ color: 'var(--color-text-muted)' }}>Send project details for measurement, availability and final pricing.</p>
                            </div>
                            <button className={styles.iconButton} type="button" onClick={() => setBulkRequestOpen(false)} aria-label="Close bulk request">
                                <X size={20} />
                            </button>
                        </div>
                        {!customerAccount && (
                            <button className={styles.loginPrompt} type="button" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>
                                Login or register before sending request
                            </button>
                        )}
                        <form className={styles.checkoutForm} onSubmit={submitBulkRequest}>
                            <select className={styles.checkoutInput} value={bulkRequest.projectType} onChange={event => setBulkRequest(prev => ({ ...prev, projectType: event.target.value }))}>
                                <option>Bathroom / shower enclosure</option>
                                <option>Glass door</option>
                                <option>Glass partition</option>
                                <option>Railing / balcony</option>
                                <option>Mirror work</option>
                                <option>Hardware bulk purchase</option>
                                <option>Other custom project</option>
                            </select>
                            <input className={styles.checkoutInput} value={bulkRequest.approximateArea} onChange={event => setBulkRequest(prev => ({ ...prev, approximateArea: event.target.value }))} placeholder="Approx area / quantity, e.g. 120 sq.ft or 8 doors" />
                            <select className={styles.checkoutInput} value={bulkRequest.timeline} onChange={event => setBulkRequest(prev => ({ ...prev, timeline: event.target.value }))}>
                                <option>This week</option>
                                <option>Within 15 days</option>
                                <option>This month</option>
                                <option>Planning stage</option>
                            </select>
                            <textarea className={styles.checkoutTextarea} value={bulkRequest.message} onChange={event => setBulkRequest(prev => ({ ...prev, message: event.target.value }))} placeholder="Project details, sizes, location or installation notes" rows={4} />
                            <button className="btn btn-primary" type="submit" disabled={submitting || !customerAccount}>
                                {submitting ? 'Submitting...' : 'Submit Quote Request'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
