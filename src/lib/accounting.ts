import { BankAccount, BusinessConfig, Employee, Invoice, LedgerAccount, Party, SalarySlip, Voucher } from '@/types';
import { roundCurrency } from '@/lib/utils';

export const SYSTEM_ACCOUNT_IDS = {
    cash: 'sys-cash-in-hand',
    bank: 'sys-bank-accounts',
    receivables: 'sys-accounts-receivable',
    payables: 'sys-accounts-payable',
    inventory: 'sys-inventory-stock',
    gstInput: 'sys-gst-input',
    gstOutput: 'sys-gst-output',
    sales: 'sys-sales-revenue',
    purchases: 'sys-purchase-cost',
    cogs: 'sys-cost-of-goods-sold',
    salary: 'sys-salary-expense',
    employeePayable: 'sys-employee-payable',
    miscExpense: 'sys-misc-expense',
    capital: 'sys-owners-capital',
} as const;

export type LedgerType = 'system' | 'customer' | 'supplier' | 'employee' | 'general';

export type JournalEntrySource = 'invoice' | 'voucher' | 'salary' | 'opening';

export interface JournalLine {
    id: string;
    date: string;
    accountId: string;
    accountName: string;
    accountType: LedgerAccount['type'];
    debit: number;
    credit: number;
    description: string;
    refNumber: string;
    source: JournalEntrySource;
    sourceId: string;
}

export interface LedgerSummary {
    id: string;
    name: string;
    type: LedgerType;
    accountType: LedgerAccount['type'];
    balance: number;
    phone?: string;
    system?: boolean;
}

export const SYSTEM_ACCOUNTS: LedgerAccount[] = [
    { id: SYSTEM_ACCOUNT_IDS.cash, name: 'Cash in Hand', type: 'asset', system: true },
    { id: SYSTEM_ACCOUNT_IDS.bank, name: 'Bank Accounts', type: 'asset', system: true },
    { id: SYSTEM_ACCOUNT_IDS.receivables, name: 'Accounts Receivable', type: 'asset', system: true },
    { id: SYSTEM_ACCOUNT_IDS.payables, name: 'Accounts Payable', type: 'liability', system: true },
    { id: SYSTEM_ACCOUNT_IDS.inventory, name: 'Inventory Stock', type: 'asset', system: true },
    { id: SYSTEM_ACCOUNT_IDS.gstInput, name: 'GST Input Credit', type: 'asset', system: true },
    { id: SYSTEM_ACCOUNT_IDS.gstOutput, name: 'GST Output Payable', type: 'liability', system: true },
    { id: SYSTEM_ACCOUNT_IDS.sales, name: 'Sales Revenue', type: 'revenue', system: true },
    { id: SYSTEM_ACCOUNT_IDS.purchases, name: 'Purchase Cost', type: 'expense', system: true },
    { id: SYSTEM_ACCOUNT_IDS.cogs, name: 'Cost of Goods Sold', type: 'expense', system: true },
    { id: SYSTEM_ACCOUNT_IDS.salary, name: 'Salary Expense', type: 'expense', system: true },
    { id: SYSTEM_ACCOUNT_IDS.employeePayable, name: 'Employee Payables', type: 'liability', system: true },
    { id: SYSTEM_ACCOUNT_IDS.miscExpense, name: 'Miscellaneous Expense', type: 'expense', system: true },
    { id: SYSTEM_ACCOUNT_IDS.capital, name: "Owner's Capital", type: 'equity', system: true },
];

const accountTypeForBalance = (type: LedgerAccount['type']): 1 | -1 => {
    return ['asset', 'expense', 'general'].includes(type) ? 1 : -1;
};

export const getBalance = (lines: JournalLine[], accountType: LedgerAccount['type']): number => {
    const drMinusCr = lines.reduce((sum, line) => sum + line.debit - line.credit, 0);
    return roundCurrency(drMinusCr * accountTypeForBalance(accountType));
};

export const formatDrCr = (balance: number, accountType: LedgerAccount['type']): { amount: number; suffix: 'Dr' | 'Cr' | '-' } => {
    if (Math.abs(balance) < 0.01) return { amount: 0, suffix: '-' };
    const normalSide = accountTypeForBalance(accountType) === 1 ? 'Dr' : 'Cr';
    const oppositeSide = normalSide === 'Dr' ? 'Cr' : 'Dr';
    return {
        amount: Math.abs(balance),
        suffix: balance >= 0 ? normalSide : oppositeSide,
    };
};

export const mergeChartAccounts = (config?: BusinessConfig | null): LedgerAccount[] => {
    const custom = config?.customAccounts || [];
    const byName = new Map<string, LedgerAccount>();

    SYSTEM_ACCOUNTS.forEach(account => byName.set(account.name.toLowerCase(), account));
    custom.forEach(account => {
        if (!byName.has(account.name.toLowerCase())) {
            byName.set(account.name.toLowerCase(), account);
        }
    });

    return Array.from(byName.values()).sort((a, b) => {
        if (a.system && !b.system) return -1;
        if (!a.system && b.system) return 1;
        return a.name.localeCompare(b.name);
    });
};

const line = (input: Omit<JournalLine, 'debit' | 'credit'> & { debit?: number; credit?: number }): JournalLine => ({
    ...input,
    debit: roundCurrency(input.debit || 0),
    credit: roundCurrency(input.credit || 0),
});

export const buildJournal = (input: {
    invoices: Invoice[];
    vouchers: Voucher[];
    parties: Party[];
    employees: Employee[];
    salarySlips: SalarySlip[];
    bankAccounts: BankAccount[];
    config?: BusinessConfig | null;
}): JournalLine[] => {
    const accounts = mergeChartAccounts(input.config);
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const lines: JournalLine[] = [];

    const pushAccountLine = (date: string, accountId: string, debit: number, credit: number, description: string, refNumber: string, source: JournalEntrySource, sourceId: string) => {
        const account = accountById.get(accountId);
        if (!account || (!debit && !credit)) return;
        lines.push(line({
            id: `${sourceId}-${accountId}-${lines.length}`,
            date,
            accountId,
            accountName: account.name,
            accountType: account.type,
            debit,
            credit,
            description,
            refNumber,
            source,
            sourceId,
        }));
    };

    input.bankAccounts.forEach(account => {
        const amount = roundCurrency(account.openingBalance || 0);
        if (!amount) return;
        pushAccountLine(new Date().toISOString().split('T')[0], SYSTEM_ACCOUNT_IDS.bank, Math.max(amount, 0), Math.max(-amount, 0), `Opening balance - ${account.name}`, 'OPENING', 'opening', `bank-opening-${account.id}`);
        pushAccountLine(new Date().toISOString().split('T')[0], SYSTEM_ACCOUNT_IDS.capital, Math.max(-amount, 0), Math.max(amount, 0), `Opening balance - ${account.name}`, 'OPENING', 'opening', `bank-opening-${account.id}`);
    });

    input.invoices.forEach(inv => {
        const net = roundCurrency(inv.subtotal || 0);
        const tax = roundCurrency(inv.taxAmount || 0);
        const total = roundCurrency(inv.total || 0);
        const cost = roundCurrency(inv.items.reduce((sum, item) => sum + (item.cost_amount || 0), 0));
        const party = input.parties.find(p => p.id === inv.partyId);
        const partyType = party?.type || (inv.type === 'sale' ? 'customer' : 'supplier');
        const partyAccountType: LedgerAccount['type'] = partyType === 'supplier' ? 'liability' : 'asset';

        if (inv.type === 'sale') {
            pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.receivables, total, 0, `Sale invoice ${inv.number} - ${inv.partyName}`, inv.number, 'invoice', inv.id);
            lines.push(line({
                id: `${inv.id}-party`,
                date: inv.date,
                accountId: inv.partyId,
                accountName: inv.partyName,
                accountType: partyAccountType,
                debit: total,
                credit: 0,
                description: `Sale invoice ${inv.number}`,
                refNumber: inv.number,
                source: 'invoice',
                sourceId: inv.id,
            }));
            pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.sales, 0, net, `Sale invoice ${inv.number}`, inv.number, 'invoice', inv.id);
            pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.gstOutput, 0, tax, `GST output on sale ${inv.number}`, inv.number, 'invoice', inv.id);
            if (cost > 0) {
                pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.cogs, cost, 0, `Cost booked for sale ${inv.number}`, inv.number, 'invoice', inv.id);
                pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.inventory, 0, cost, `Inventory issued for sale ${inv.number}`, inv.number, 'invoice', inv.id);
            }
        } else {
            pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.inventory, net, 0, `Purchase invoice ${inv.number} - ${inv.partyName}`, inv.number, 'invoice', inv.id);
            pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.gstInput, tax, 0, `GST input on purchase ${inv.number}`, inv.number, 'invoice', inv.id);
            pushAccountLine(inv.date, SYSTEM_ACCOUNT_IDS.payables, 0, total, `Purchase invoice ${inv.number} - ${inv.partyName}`, inv.number, 'invoice', inv.id);
            lines.push(line({
                id: `${inv.id}-party`,
                date: inv.date,
                accountId: inv.partyId,
                accountName: inv.partyName,
                accountType: partyAccountType,
                debit: 0,
                credit: total,
                description: `Purchase invoice ${inv.number}`,
                refNumber: inv.number,
                source: 'invoice',
                sourceId: inv.id,
            }));
        }
    });

    input.vouchers.forEach(voucher => {
        const amount = roundCurrency(voucher.amount || 0);
        const cashBankAccount = voucher.mode === 'bank' ? SYSTEM_ACCOUNT_IDS.bank : SYSTEM_ACCOUNT_IDS.cash;
        const party = input.parties.find(p => p.id === voucher.partyId);
        const employee = input.employees.find(e => e.id === voucher.employeeId);
        const customAccount = accountById.get(voucher.partyId || '');
        const ref = voucher.number || 'VCH';
        const description = voucher.description || ref;

        if (voucher.type === 'receipt') {
            pushAccountLine(voucher.date, cashBankAccount, amount, 0, description, ref, 'voucher', voucher.id);
            if (party) {
                const control = party.type === 'supplier' ? SYSTEM_ACCOUNT_IDS.payables : SYSTEM_ACCOUNT_IDS.receivables;
                pushAccountLine(voucher.date, control, 0, amount, description, ref, 'voucher', voucher.id);
                lines.push(line({
                    id: `${voucher.id}-party`,
                    date: voucher.date,
                    accountId: party.id,
                    accountName: party.name,
                    accountType: party.type === 'supplier' ? 'liability' : 'asset',
                    debit: 0,
                    credit: amount,
                    description,
                    refNumber: ref,
                    source: 'voucher',
                    sourceId: voucher.id,
                }));
            } else if (employee) {
                lines.push(line({
                    id: `${voucher.id}-employee`,
                    date: voucher.date,
                    accountId: employee.id,
                    accountName: employee.name,
                    accountType: 'asset',
                    debit: 0,
                    credit: amount,
                    description,
                    refNumber: ref,
                    source: 'voucher',
                    sourceId: voucher.id,
                }));
            } else if (customAccount) {
                pushAccountLine(voucher.date, customAccount.id, 0, amount, description, ref, 'voucher', voucher.id);
            }
        } else {
            pushAccountLine(voucher.date, cashBankAccount, 0, amount, description, ref, 'voucher', voucher.id);
            if (party) {
                const control = party.type === 'supplier' ? SYSTEM_ACCOUNT_IDS.payables : SYSTEM_ACCOUNT_IDS.receivables;
                pushAccountLine(voucher.date, control, amount, 0, description, ref, 'voucher', voucher.id);
                lines.push(line({
                    id: `${voucher.id}-party`,
                    date: voucher.date,
                    accountId: party.id,
                    accountName: party.name,
                    accountType: party.type === 'supplier' ? 'liability' : 'asset',
                    debit: amount,
                    credit: 0,
                    description,
                    refNumber: ref,
                    source: 'voucher',
                    sourceId: voucher.id,
                }));
            } else if (employee) {
                lines.push(line({
                    id: `${voucher.id}-employee`,
                    date: voucher.date,
                    accountId: employee.id,
                    accountName: employee.name,
                    accountType: 'liability',
                    debit: amount,
                    credit: 0,
                    description,
                    refNumber: ref,
                    source: 'voucher',
                    sourceId: voucher.id,
                }));
            } else if (customAccount) {
                pushAccountLine(voucher.date, customAccount.id, amount, 0, description, ref, 'voucher', voucher.id);
            } else if (voucher.type === 'expense') {
                pushAccountLine(voucher.date, SYSTEM_ACCOUNT_IDS.miscExpense, amount, 0, description, ref, 'voucher', voucher.id);
            }
        }
    });

    input.salarySlips.forEach(slip => {
        const grossSalary = roundCurrency(slip.netSalary + (slip.deductions || 0));
        const netSalary = roundCurrency(slip.netSalary || 0);
        const date = slip.paymentDate || `${slip.month}-28`;

        pushAccountLine(date, SYSTEM_ACCOUNT_IDS.salary, grossSalary, 0, `Salary booked for ${slip.employeeName} (${slip.month})`, slip.id, 'salary', slip.id);
        pushAccountLine(date, SYSTEM_ACCOUNT_IDS.employeePayable, 0, netSalary, `Salary payable for ${slip.employeeName} (${slip.month})`, slip.id, 'salary', slip.id);

        lines.push(line({
            id: `${slip.id}-employee`,
            date,
            accountId: slip.employeeId,
            accountName: slip.employeeName,
            accountType: 'liability',
            debit: 0,
            credit: netSalary,
            description: `Salary payable (${slip.month})`,
            refNumber: slip.id,
            source: 'salary',
            sourceId: slip.id,
        }));
    });

    return lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const buildLedgerSummaries = (input: {
    parties: Party[];
    employees: Employee[];
    config?: BusinessConfig | null;
    journal: JournalLine[];
}): LedgerSummary[] => {
    const chartAccounts = mergeChartAccounts(input.config);
    const summaries: LedgerSummary[] = chartAccounts.map(account => ({
        id: account.id,
        name: account.name,
        type: account.system ? 'system' : 'general',
        accountType: account.type,
        balance: getBalance(input.journal.filter(line => line.accountId === account.id), account.type),
        system: !!account.system,
    }));

    input.parties.forEach(party => {
        const accountType: LedgerAccount['type'] = party.type === 'supplier' ? 'liability' : 'asset';
        summaries.push({
            id: party.id,
            name: party.name,
            type: party.type,
            accountType,
            balance: getBalance(input.journal.filter(line => line.accountId === party.id), accountType),
            phone: party.phone,
        });
    });

    input.employees.forEach(employee => {
        const employeeLines = input.journal.filter(line => line.accountId === employee.id);
        summaries.push({
            id: employee.id,
            name: employee.name,
            type: 'employee',
            accountType: employee.balance >= 0 ? 'asset' : 'liability',
            balance: employeeLines.length ? getBalance(employeeLines, employee.balance >= 0 ? 'asset' : 'liability') : roundCurrency(employee.balance || 0),
            phone: employee.phone,
        });
    });

    return summaries.sort((a, b) => {
        const order: Record<LedgerType, number> = { system: 0, customer: 1, supplier: 2, employee: 3, general: 4 };
        return order[a.type] - order[b.type] || a.name.localeCompare(b.name);
    });
};
