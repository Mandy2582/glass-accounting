export type Unit = 'sqft' | 'sheets' | 'nos';

export interface GlassItem {
    id: string;
    name: string;
    category?: 'glass' | 'hardware';
    type: string; // e.g., Toughened, Mirror, Lacquered
    make?: string; // Brand for hardware
    model?: string; // Model for hardware
    thickness?: number; // in mm (Optional for hardware)
    width?: number; // in inches or mm, usually inches for glass sheets (Optional for hardware)
    height?: number; // in inches (Optional for hardware)
    unit: Unit;
    stock: number; // Total stock
    warehouseStock?: { [key: string]: number }; // Breakdown by warehouse
    minStock?: number; // Minimum stock level for alerts
    rate: number; // Base rate per unit (Selling Price)
    purchaseRate?: number; // Cost Price per unit
    hsnCode?: string;
    conversionFactor?: number; // e.g. sqft per sheet
}

export interface Party {
    id: string;
    name: string;
    type: 'customer' | 'supplier';
    phone: string;
    address: string;
    balance: number; // Positive = Receivable (Dr), Negative = Payable (Cr)
}

export type VoucherType = 'payment' | 'receipt' | 'expense';

export interface Voucher {
    id: string;
    number: string;
    date: string;
    type: VoucherType;
    partyId?: string; // Optional for some expenses
    partyName?: string;
    amount: number;
    description: string;
    mode: 'cash' | 'bank';
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
    amount: number;
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

export interface Order {
    id: string;
    type: OrderType;
    number: string; // e.g., SO-001 or PO-001
    date: string;
    deliveryDate?: string;
    partyId: string;
    partyName: string;
    items: InvoiceItem[];
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    status: 'pending' | 'completed' | 'cancelled';
}

export interface Employee {
    id: string;
    name: string;
    designation: string;
    phone: string;
    joiningDate: string;
    basicSalary: number;
    status: 'active' | 'inactive';
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
