export type Unit =
    | 'sqft'
    | 'sqm'
    | 'sqin'
    | 'sqyd'
    | 'sheets'
    | 'nos'
    | 'pcs'
    | 'sets'
    | 'pair'
    | 'box'
    | 'inch'
    | 'ft'
    | 'mm'
    | 'cm'
    | 'm'
    | 'kg'
    | 'g'
    | 'ltr'
    | (string & {});

export interface GlassItem {
    id: string;
    name: string;
    category?: 'glass' | 'hardware';
    type: string; // e.g., Toughened, Mirror, Lacquered
    productGroup?: string; // Customer-facing product grouping
    showOnline?: boolean; // Show this inventory item in online shop
    imageUrl?: string; // Customer-facing product image URL or data URL
    make?: string; // Brand for hardware
    model?: string; // Model for hardware
    thickness?: number; // in mm (Optional for hardware)
    width?: number; // in inches or mm, usually inches for glass sheets (Optional for hardware)
    height?: number; // in inches (Optional for hardware)
    unit: Unit;
    stock: number; // Total stock
    physicalStock?: number; // Actual inventory before customer cart/order reservations
    reservedStock?: number; // Quantity reserved by pending online orders
    availableStock?: number; // Stock available for new online orders
    warehouseStock?: { [key: string]: number }; // Breakdown by warehouse
    minStock?: number; // Minimum stock level for alerts
    rate: number; // Base rate per unit (Selling Price)
    rateUnit?: Unit; // Unit in which selling rate was entered
    purchaseRate?: number; // Cost Price per unit
    purchaseRateUnit?: Unit; // Unit in which purchase rate was entered
    hsnCode?: string;
    conversionFactor?: number; // e.g. sqft per sheet
}

export interface StockBatch {
    id: string;
    itemId: string;
    invoiceId?: string; // Link to Purchase Invoice
    date: string; // Purchase Date
    rate: number; // Purchase Rate
    quantity: number; // Original Qty
    remainingQuantity: number; // Current Qty available for sale
    warehouse?: string;
    cost_amount?: number; // FIFO cost at time of sale
}

export interface Party {
    id: string;
    name: string;
    type: 'customer' | 'supplier';
    phone: string;
    address: string;
    balance: number; // Positive = Receivable (Dr), Negative = Payable (Cr)
    gstin?: string;
    email?: string;
}

export type VoucherType = 'payment' | 'receipt' | 'expense';

export interface Voucher {
    id: string;
    number: string;
    date: string;
    type: VoucherType;
    partyId?: string; // Optional for some expenses
    partyName?: string;
    employeeId?: string;
    employeeName?: string;
    amount: number;
    description: string;
    mode: 'cash' | 'bank';
    bankAccountId?: string;
}

export interface BankAccount {
    id: string;
    name: string;
    accountNumber: string;
    type: 'savings' | 'current' | 'od';
    odLimit: number;
    interestRate: number; // Percentage
    openingBalance: number;
    currentBalance?: number; // Calculated
}

export interface InvoiceItem {
    id?: string;
    itemId: string;
    itemName: string;
    description?: string;
    make?: string;
    model?: string;
    type?: string;
    warehouse?: string; // 'Warehouse A' | 'Warehouse B'
    width: number;
    height: number;
    quantity: number; // Number of pieces
    unit: Unit;
    sqft: number; // Calculated sqft
    rate: number;
    rateUnit?: Unit; // Unit `rate` is denominated in -- may differ from `unit` (e.g. rate entered per sqft while billing in sheets)
    amount: number;
    lineTotal?: number; // Customer-facing amount including tax, used to prevent paisa drift
    cost_amount?: number; // FIFO Cost
    sourceType?: 'catalog' | 'text' | 'design';
    designId?: string;
    designPieceId?: string;
    // Display-only piece count for an sqft-billed line whose `quantity`
    // must stay equal to `sqft` (the design-item billing/delivery-tracking
    // convention enforced by normalizeDesignItemBillingFields) -- e.g. a
    // Toughened Glass line for "2 pcs of 84in x 31.5in". Leave unset for
    // every other item; UI should fall back to `quantity` when absent.
    pieceCount?: number;
    // HSN code for GST e-Way Bill / e-Invoice item lines. Catalogue items
    // carry their own (GlassItem.hsnCode); custom/design line items have no
    // catalogue link and fall back to BusinessConfig.defaultGlassHsnCode.
    hsnCode?: string;
}

export interface Invoice {
    id: string;
    type: 'sale' | 'purchase';
    number: string; // Invoice Number (e.g., INV-001)
    supplierInvoiceNumber?: string; // For purchases
    date: string; // ISO Date
    partyId: string;
    partyName: string;
    items: InvoiceItem[];
    subtotal: number;
    taxRate: number; // Percentage
    taxAmount: number;
    total: number;
    paidAmount?: number;
    status: 'draft' | 'paid' | 'unpaid' | 'partially_paid';
}

export type OrderType = 'sale_order' | 'purchase_order';
export type OrderStatus = 'pending' | 'approved' | 'supplier_ordered' | 'supplier_delivered' | 'customer_delivered' | 'completed' | 'cancelled';

export interface OrderDelivery {
    id: string;
    date: string;
    type: 'supplier' | 'customer';
    items: {
        orderItemId?: string;
        itemId: string;
        itemName?: string;
        quantity: number;
        sqft: number;
    }[];
    notes?: string;
}

export interface Order {
    id: string;
    type: OrderType;
    number: string; // e.g., SO-001 or PO-001
    generalNumber?: string;
    soNumber?: string;
    poNumber?: string;
    requiresDesign?: boolean;
    date: string;
    deliveryDate?: string; // Expected delivery date
    partyId: string;
    partyName: string;
    items: InvoiceItem[];
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;

    // Status and flow tracking
    status: OrderStatus;

    // Linking fields
    linkedOrderId?: string; // For SO: links to PO, For PO: links to SO
    parentOrderId?: string; // Customer order ID (for reference)
    invoiceId?: string; // ID of the generated invoice

    // Delivery tracking
    isDirectDelivery?: boolean; // True if skipping supplier delivery
    deliveries?: OrderDelivery[]; // Track partial deliveries
    supplierDeliveryDate?: string; // When supplier delivered
    customerDeliveryDate?: string; // When delivered to customer

    // Real creation/update instants (Postgres timestamptz, set once at
    // insert time) -- unlike `date`, which is a date-only field staff can
    // edit and which several same-day orders share identically. Used to
    // give notifications an actual time and a correct newest-first order.
    createdAt?: string;
    updatedAt?: string;

    // Quantities tracking for partial deliveries
    deliveredToUs?: number; // Total sqft delivered by supplier
    deliveredToCustomer?: number; // Total sqft delivered to customer

    // Notes
    notes?: string;

    // Payment tracking
    paidAmount?: number;
    paymentStatus?: 'unpaid' | 'partially_paid' | 'paid';

    // GST e-Way Bill (NIC Direct API) -- set once generation succeeds.
    ewayBillNumber?: string;
    ewayBillDate?: string;
    ewayBillValidUpto?: string;
}

export interface Employee {
    id: string;
    name: string;
    designation: string;
    phone: string;
    joiningDate: string;
    basicSalary: number;
    status: 'active' | 'inactive';
    balance: number; // Positive = Advance Given, Negative = Salary Due
}

export interface Attendance {
    id: string;
    employeeId: string;
    date: string;
    status: 'present' | 'absent' | 'leave' | 'half_day';
    note?: string;
}

export interface SalarySlip {
    id: string;
    employeeId: string;
    employeeName: string;
    month: string; // YYYY-MM
    basicSalary: number;
    presentDays: number;
    totalDays: number;
    deductions: number;
    bonus: number;
    netSalary: number;
    status: 'generated' | 'paid';
    paymentDate?: string;
}

// Custom Glass Designer Types
export interface DrawingPoint {
    x: number;
    y: number;
}

export interface DrawingShape {
    id: string;
    type: 'rectangle' | 'circle' | 'polygon' | 'hole' | 'cut';
    points: DrawingPoint[];
    dimensions?: {
        width?: number;
        height?: number;
        radius?: number;
    };
    label?: string;
    color?: string;
    thickness?: number; // Glass thickness in mm
}

// Multi-item design support
export interface DesignItem {
    id: string;
    name: string; // e.g., "Window 1", "Door 2"
    type: string; // e.g., "Window", "Door", "Partition"
    thickness: number; // in mm
    shapes: DrawingShape[]; // Shapes belonging to this item
    canvasJSON?: any; // Fabric canvas JSON for full fidelity
    area: number; // Calculated area for this item in sqft
    cost?: number; // Calculated cost for this item
}

// Canvas geometry for the Konva-based glass designer (GlassDesigner.tsx).
// Shared here so whatsappVision.ts (server-side, no client component imports)
// can build against the exact same shape the canvas reads back, instead of
// maintaining a hand-synced duplicate.
export interface KonvaShape {
    id: string;
    type: 'glass_rect' | 'glass_circle' | 'hole' | 'cut' | 'glass_polygon' | 'glass_parallelogram' | 'accessory';
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    sides?: number;
    points?: number[];
    skewX?: number;
    accessoryType?: 'lock' | 'connector' | 'hinge' | 'profile';
    accessoryName?: string;
    parentId?: string;
    hardwareItemId?: string;
    accessoryRate?: number;
    accessoryHoleCount?: number;
    accessoryCutCount?: number;
    accessoryHoleRadiusIn?: number;
    accessoryCutAreaSqIn?: number;
    accessoryRequirementLabel?: string;
    // Set only on hole/cut shapes generated from a photo whose position could
    // NOT be read off the drawing (fell back to even-spacing). Absent means
    // "trust this position" -- either it was really extracted from the photo,
    // it came from a manual preset, or a staff member has since repositioned
    // it (GlassDesigner's updateShape clears the flag on the first manual
    // geometry edit).
    positionSource?: 'estimated-fallback';
}

export interface GlassPiece {
    id: string;
    name: string;
    type: string;
    thickness: number;
    quantity?: number;
    shapes: KonvaShape[];
}

export interface DesignData {
    items?: DesignItem[]; // Multi-item support
    shapes: DrawingShape[]; // Keep for backward compatibility
    dimensions: {
        width: number;
        height: number;
        unit: 'inch' | 'mm' | 'ft';
    };
    holes: DrawingShape[];
    cuts: DrawingShape[];
    notes: string;
    // Deliberately kept as `any[]` rather than `GlassPiece[]`: at least one
    // legacy call site (orders/new/page.tsx's Fabric-canvas fallback path)
    // builds objects here that don't structurally match GlassPiece. Use the
    // exported GlassPiece/KonvaShape types directly in code that knows it's
    // producing/consuming the real Konva format (GlassDesigner.tsx,
    // whatsappVision.ts) instead of tightening this field.
    pieces?: any[];
    pdfBase64?: string; // Cached high-fidelity PDF
}

export interface CustomDesign {
    id: string;
    name: string;
    customerId?: string;
    customerName?: string;
    drawingData: DesignData;
    baseShape?: string;
    totalArea: number; // sqft after deductions
    grossArea: number; // sqft before deductions
    holes: number;
    cuts: number;
    complexityLevel: 'simple' | 'medium' | 'complex';

    // Pricing
    baseRate: number;
    complexityCharge: number;
    edgeFinishingCharge: number;
    estimatedCost: number;

    // Status
    status: 'draft' | 'sent' | 'approved' | 'rejected' | 'converted';
    createdDate: string;
    approvedDate?: string;
    notes?: string;

    // Link to order if converted
    orderId?: string;

    // The customer's original intake photo (EXIF-normalized and downscaled),
    // kept so the order review page can show it beside the extracted drawing.
    // Purged after 90 days by the nightly maintenance job.
    sourceImageBase64?: string;
    sourceImageMimeType?: string;
}

// Thickness-based pricing
export interface ThicknessPricing {
    thickness: number; // in mm (e.g., 3.5, 4, 5, 6, 8, 10, 12, 15, 19)
    ratePerSqft: number; // Direct rate per sqft for this thickness
    // Optional colour/type this rate applies to (e.g. "Clear", "Brown") --
    // mainly for Toughened Glass, which is priced by thickness AND colour
    // rather than matched against a fixed-size catalogue item. Left unset,
    // a row is a generic rate for that thickness (existing behaviour for
    // every non-toughened custom design piece, unchanged).
    glassType?: string;
}

export interface PricingConfig {
    baseRatePerSqft: number;
    thicknessPricing?: ThicknessPricing[]; // Thickness-based rates
    holeCharge: number; // per hole
    cutCharge: number; // per cut
    complexityMultiplier: {
        simple: number;
        medium: number;
        complex: number;
    };
    edgeFinishing: {
        polished: number; // per linear foot
        beveled: number;
        none: number;
    };
    minimumCharge: number;
    termsAndConditions?: string;
}

// GST Types
export type GSTType = 'intra_state' | 'inter_state' | 'none';

// Business Configuration
// Controls whether incoming WhatsApp/email orders are quoted automatically
// or held for staff review. Off by default -- automation only starts once
// someone deliberately turns it on in Settings.
export interface AutomationConfig {
    autoReviewEnabled: boolean;
    // Orders quoting above this rupee amount always go to staff even when
    // auto-review is on. 0 disables the ceiling.
    autoReviewMaxOrderValue: number;
    // Drawing/design orders only auto-quote when every hole and cut position
    // was read cleanly from the photo. Any amber-flagged position means the
    // price could be wrong, so it goes to a human instead.
    autoReviewRequireCleanDrawing: boolean;
}

// Lets specific staff/owner phone numbers manage the catalogue by WhatsApp
// message instead of editing inventory by hand: reprice a product line
// ("RATE 12mm Saint Gobain Clear 85"), correct a stock count ("STOCK 12mm
// Saint Gobain Clear 4x6ft 50"), or record a purchase ("PURCHASE ABC
// Traders\n12mm Saint Gobain Clear 4x6ft - 50 sheets @800"). Off by
// default, and only ever acted on for numbers explicitly listed here --
// never a customer number. One shared authorized-phone list covers all
// three actions; the three keywords are how a message picks which one.
export interface RateUpdateConfig {
    enabled: boolean;
    authorizedPhones: string[];
    rateKeyword: string;
    stockKeyword: string;
    purchaseKeyword: string;
}

export interface BusinessConfig {
    businessName: string;
    tagline?: string;
    gstin?: string;
    pan?: string;
    address: string;
    city: string;
    state: string;
    stateCode?: string;
    pincode: string;
    phone: string;
    email?: string;
    website?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankBranch?: string;
    upiId?: string;
    paymentInstructions?: string;
    defaultGstRate: number; // e.g., 18
    defaultGstType: GSTType;
    invoicePrefix: string; // e.g., 'AGH'
    financialYearStart: number; // month (1-12), typically 4 (April) in India
    logo?: string; // base64 or URL
    deliveryChargeRules?: DeliveryChargeRule[];
    installationChargePerSqft?: number;
    unitPreferences?: UnitPreferences;
    
    // Tally Integration Settings
    tallyServerIp?: string;
    tallyServerPort?: string;
    tallyCompanyName?: string;
    tallyAutoSyncEnabled?: boolean;
    tallySyncInterval?: number; // In minutes
    tallyLastSyncTime?: string;
    tallySyncLogs?: string[];
    tallyConsecutiveFailures?: number;
    employeeConfigs?: Record<string, EmployeeConfig>;
    customAccounts?: LedgerAccount[];

    // Fallback HSN code for order line items with no catalogue link (custom
    // design/Toughened Glass pieces) when generating a GST e-Way Bill --
    // catalogue items use their own GlassItem.hsnCode instead.
    defaultGlassHsnCode?: string;
}

export interface UnitPreferences {
    defaultCountUnit: Unit;
    defaultGlassBillingUnit: Unit;
    unknownUnitFallback: Unit;
}

export interface DeliveryChargeRule {
    id: string;
    place: string;
    charge: number;
    // Pincode prefixes this zone auto-matches against (e.g. "180010" for an
    // exact match, "180" for anything starting with 180). A rule with no
    // prefixes configured acts as the fallback/default zone.
    pincodePrefixes?: string[];
}

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: 'insight' | 'pending_order' | 'order_approval' | 'operation' | 'overdue_payment' | 'low_stock';
    severity: 'info' | 'warning' | 'error';
    timestamp: string;
    read: boolean;
    link?: string;
    actionLabel?: string;
    secondaryLink?: string;
    secondaryActionLabel?: string;
    // Set when type === 'order_approval' -- the Notifications page renders
    // Approve/Reject buttons targeting this order instead of plain nav links.
    orderId?: string;
    // Whether a quotation has already been sent for this order -- determines
    // whether the Notifications page shows "Send Quotation" (required first)
    // or "Approve Now" (which also converts the order to an invoice).
    estimateSent?: boolean;
    details?: {
        label: string;
        value: string;
    }[];
}

export interface EmployeeAdvance {
    id: string;
    date: string;
    amount: number;
    deductionType: 'emi' | 'lump_sum';
    emiAmount?: number;
    remaining: number;
    paidOff: boolean;
    repayments?: { date: string; amount: number; salarySlipId?: string }[];
}

export interface EmployeeOvertimeLog {
    id: string;
    date: string;
    hours: number;
    description?: string;
    rateApplied: number;
    amount: number;
    salarySlipId?: string;
}

export interface EmployeeConfig {
    employeeId: string;
    overtimeRate: number;
    maxOvertimeCeiling: number;
    advances: EmployeeAdvance[];
    overtimeLogs: EmployeeOvertimeLog[];
}

export interface LedgerAccount {
    id: string;
    name: string;
    type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'general';
    system?: boolean;
}

export interface AttendanceTiming {
    clockIn: string;
    clockOut: string;
    overtime: number;
}
