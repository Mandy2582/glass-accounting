'use client';

import { useState, useEffect, Fragment, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/storage';
import { getEmployeeConfig, saveEmployeeConfig } from '@/lib/employeeSettings';
import { Employee, EmployeeConfig, EmployeeAdvance, EmployeeOvertimeLog, BankAccount, Voucher, SalarySlip, Order } from '@/types';
import { ArrowLeft, User, Calendar, Plus, DollarSign, Clock, Landmark, FileText, Settings, ShieldCheck, ArrowUpRight, ArrowDownLeft, Route, Truck, Wrench } from 'lucide-react';
import Modal from '@/components/Modal';
import { formatIndianCurrency, roundCurrency } from '@/lib/utils';
import { getOrderWorkSummary, getWorkStatusColor, getWorkStatusLabel, getWorkTypeLabel } from '@/lib/orderWork';

export default function EmployeeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const employeeId = params.id as string;

    const [employee, setEmployee] = useState<Employee | null>(null);
    const [config, setConfig] = useState<EmployeeConfig | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<'overview' | 'operations' | 'advances' | 'overtime' | 'ledger'>('overview');

    // Configuration Edit State
    const [overtimeRate, setOvertimeRate] = useState(100);
    const [maxCeiling, setMaxCeiling] = useState(0);
    const [editingConfig, setEditingConfig] = useState(false);

    // Modals
    const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
    const [isOvertimeModalOpen, setIsOvertimeModalOpen] = useState(false);

    // Form inputs: Advance
    const [advAmount, setAdvAmount] = useState('');
    const [advDate, setAdvDate] = useState(new Date().toISOString().split('T')[0]);
    const [advType, setAdvType] = useState<'emi' | 'lump_sum'>('lump_sum');
    const [advEmiAmount, setAdvEmiAmount] = useState('');
    const [advPayMode, setAdvPayMode] = useState<'cash' | 'bank'>('cash');
    const [advBankId, setAdvBankId] = useState('');

    // Form inputs: Overtime
    const [otHours, setOtHours] = useState('');
    const [otDate, setOtDate] = useState(new Date().toISOString().split('T')[0]);
    const [otDesc, setOtDesc] = useState('');

    useEffect(() => {
        if (employeeId) {
            loadData();
        }
    }, [employeeId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [emp, empConfig, allVouchers, allSlips, banks, allOrders] = await Promise.all([
                db.employees.getAll().then(es => es.find(e => e.id === employeeId)),
                getEmployeeConfig(employeeId),
                db.vouchers.getAll(),
                db.payroll.getAll(),
                db.bankAccounts.getAll(),
                db.orders.getAll()
            ]);

            if (emp) {
                setEmployee(emp);
                setConfig(empConfig);
                setOvertimeRate(empConfig.overtimeRate);
                setMaxCeiling(empConfig.maxOvertimeCeiling);
                setBankAccounts(banks);
                setOrders(allOrders);
                if (banks.length > 0) setAdvBankId(banks[0].id);

                // Build unified ledger
                const empVouchers = allVouchers.filter(v => v.employeeId === employeeId);
                const empSlips = allSlips.filter(s => s.employeeId === employeeId);

                const list: any[] = [];

                empVouchers.forEach(v => {
                    list.push({
                        id: v.id,
                        date: v.date,
                        refNo: v.number,
                        type: v.type === 'payment' ? 'Payment (Advance/Salary)' : 'Refund/Receipt',
                        description: v.description,
                        debit: v.type === 'payment' ? v.amount : 0,
                        credit: v.type === 'receipt' ? v.amount : 0,
                        runningBalance: 0,
                        timestamp: new Date(v.date).getTime()
                    });
                });

                empSlips.forEach(s => {
                    list.push({
                        id: s.id,
                        date: s.paymentDate || `${s.month}-28`, // fallback to salary date
                        refNo: `SLIP-${s.month}`,
                        type: 'Salary Accrued',
                        description: `Salary Slip for ${s.month} (Basic: ₹${s.basicSalary}, Deductions: ₹${s.deductions}, OT/Bonus: ₹${s.bonus})`,
                        debit: 0,
                        credit: s.netSalary,
                        runningBalance: 0,
                        timestamp: new Date(s.paymentDate || `${s.month}-28`).getTime()
                    });
                });

                // Sort chronologically
                list.sort((a, b) => a.timestamp - b.timestamp);

                // Calculate running balance: Payment debits, Salary slip credits, Refund credits
                // Wait! A positive balance means the company has given more money to the employee (Advance given).
                // A negative balance means the company owes the employee salary.
                let bal = emp.balance || 0; // Current balance
                // Compute starting balance and recalculate running
                let currentRunning = 0;
                const computed = list.map(item => {
                    if (item.type.includes('Payment')) {
                        currentRunning += item.debit;
                    } else if (item.type === 'Refund/Receipt') {
                        currentRunning -= item.credit;
                    } else if (item.type === 'Salary Accrued') {
                        currentRunning -= item.credit;
                    }
                    return {
                        ...item,
                        runningBalance: currentRunning
                    };
                });

                setTransactions(computed.reverse()); // Latest first in UI
            }
        } catch (error) {
            console.error('Error loading employee details:', error);
        } finally {
            setLoading(false);
        }
    };

    const assignedWork = useMemo(() => {
        return orders
            .flatMap(order => getOrderWorkSummary(order).assignments
                .filter(task => task.assignedToId === employeeId)
                .map(task => ({ order, task })))
            .sort((a, b) => {
                const statusWeight = (status: string) => status === 'completed' || status === 'cancelled' ? 1 : 0;
                const weightA = statusWeight(a.task.status);
                const weightB = statusWeight(b.task.status);
                if (weightA !== weightB) return weightA - weightB;
                return new Date(a.task.scheduledDate || a.order.date).getTime() - new Date(b.task.scheduledDate || b.order.date).getTime();
            });
    }, [employeeId, orders]);

    const handleSaveConfig = async () => {
        if (!employee || !config) return;
        try {
            const updated: EmployeeConfig = {
                ...config,
                overtimeRate,
                maxOvertimeCeiling: maxCeiling
            };
            await saveEmployeeConfig(employeeId, updated);
            setConfig(updated);
            setEditingConfig(false);
            alert('Settings saved successfully!');
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        }
    };

    const handleAddAdvance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!employee || !config) return;

        const amount = roundCurrency(Number(advAmount));
        if (!amount || amount <= 0) {
            alert('Please enter a valid amount.');
            return;
        }

        const emiVal = advType === 'emi' ? roundCurrency(Number(advEmiAmount)) : 0;
        if (advType === 'emi' && (!emiVal || emiVal <= 0)) {
            alert('Please enter a valid EMI amount.');
            return;
        }

        try {
            // 1. Create payment voucher
            const voucherNum = `PAY-${Date.now().toString().slice(-6)}`;
            const voucher: Voucher = {
                id: crypto.randomUUID(),
                number: voucherNum,
                date: advDate,
                type: 'payment',
                amount: amount,
                description: `Advance Salary Paid to ${employee.name} (${advType === 'emi' ? `EMI: ₹${emiVal}/month` : 'Lump-sum deduction'})`,
                mode: advPayMode,
                bankAccountId: advPayMode === 'bank' ? advBankId : undefined,
                employeeId: employeeId,
                employeeName: employee.name
            };

            await db.vouchers.add(voucher);

            // 2. Append to config advances array
            const newAdvance: EmployeeAdvance = {
                id: crypto.randomUUID(),
                date: advDate,
                amount,
                deductionType: advType,
                emiAmount: advType === 'emi' ? emiVal : undefined,
                remaining: amount,
                paidOff: false,
                repayments: []
            };

            const updated: EmployeeConfig = {
                ...config,
                advances: [...config.advances, newAdvance]
            };

            await saveEmployeeConfig(employeeId, updated);
            
            // Reset form
            setAdvAmount('');
            setAdvEmiAmount('');
            setAdvType('lump_sum');
            setIsAdvanceModalOpen(false);
            await loadData();
            alert('Advance disbursed and payment voucher generated successfully!');
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleLogOvertime = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!employee || !config) return;

        const hours = Number(otHours);
        if (!hours || hours <= 0) {
            alert('Please enter valid hours.');
            return;
        }

        try {
            const calculatedAmount = roundCurrency(hours * config.overtimeRate);
            const newLog: EmployeeOvertimeLog = {
                id: crypto.randomUUID(),
                date: otDate,
                hours,
                description: otDesc,
                rateApplied: config.overtimeRate,
                amount: calculatedAmount
            };

            const updated: EmployeeConfig = {
                ...config,
                overtimeLogs: [...config.overtimeLogs, newLog]
            };

            await saveEmployeeConfig(employeeId, updated);

            setOtHours('');
            setOtDesc('');
            setIsOvertimeModalOpen(false);
            await loadData();
            alert('Overtime logged successfully!');
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    if (loading) return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>Loading employee profile...</div>;
    if (!employee || !config) return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>Employee not found</div>;

    return (
        <div className="container">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button onClick={() => router.back()} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                    <ArrowLeft size={16} />
                    Back
                </button>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Employee Profile Dashboard</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Overtime, advance tracking, and payroll history</p>
                </div>
            </div>

            {/* Profile Brief Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Employee Details Card */}
                <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={30} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{employee.name}</h2>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>{employee.designation}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>Joined: {new Date(employee.joiningDate).toLocaleDateString('en-IN')}</p>
                    </div>
                </div>

                {/* Overtime Settings Summary Card */}
                <div className="card" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>OVERTIME PREFERENCES</span>
                        <button 
                            onClick={() => setEditingConfig(!editingConfig)}
                            style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                            <Settings size={12} />
                            {editingConfig ? 'Cancel' : 'Edit'}
                        </button>
                    </div>
                    {editingConfig ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.7rem', display: 'block' }}>Rate (₹/hr)</label>
                                    <input type="number" className="input" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} value={overtimeRate} onChange={e => setOvertimeRate(Number(e.target.value))} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.7rem', display: 'block' }}>Ceiling (₹/mo)</label>
                                    <input type="number" className="input" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} value={maxCeiling} onChange={e => setMaxCeiling(Number(e.target.value))} placeholder="0 = None" />
                                </div>
                            </div>
                            <button onClick={handleSaveConfig} className="btn btn-primary" style={{ padding: '0.25rem', fontSize: '0.75rem', width: '100%', justifyContent: 'center' }}>
                                Save Config
                            </button>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>Hourly OT Rate</span>
                                <span style={{ fontWeight: 600 }}>₹{config.overtimeRate}/hr</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>Max OT Ceiling</span>
                                <span style={{ fontWeight: 600 }}>{config.maxOvertimeCeiling > 0 ? `₹${config.maxOvertimeCeiling}/mo` : 'No Limit'}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Salary & Balance Summary Card */}
                <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>PAYROLL LEDGER STATUS</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>Basic Salary</span>
                        <span style={{ fontWeight: 600 }}>{formatIndianCurrency(employee.basicSalary)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>Net Running Balance</span>
                        <span style={{ 
                            fontWeight: 700, 
                            color: employee.balance > 0 ? '#b45309' : employee.balance < 0 ? '#ef4444' : '#166534' 
                        }}>
                            {employee.balance > 0 
                                ? `₹${employee.balance.toLocaleString()} (Advance Given)` 
                                : employee.balance < 0 
                                    ? `₹${Math.abs(employee.balance).toLocaleString()} (Salary Due)` 
                                    : '₹0 (Settled)'
                            }
                        </span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '8px', gap: '4px', marginBottom: '1.5rem', maxWidth: '680px', flexWrap: 'wrap' }}>
                {(['overview', 'operations', 'advances', 'overtime', 'ledger'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            flex: 1,
                            padding: '0.5rem',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === tab ? 'white' : 'transparent',
                            color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textTransform: 'capitalize'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                    {/* Active Advances */}
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Active Dues & Advances</h3>
                            <button onClick={() => setIsAdvanceModalOpen(true)} className="btn btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', gap: '0.25rem' }}>
                                <Plus size={14} /> Add Advance
                            </button>
                        </div>
                        {config.advances.filter(a => !a.paidOff).length > 0 ? (
                            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Advance Amount</th>
                                        <th>Deduction Mode</th>
                                        <th>Remaining Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.advances.filter(a => !a.paidOff).map(adv => (
                                        <tr key={adv.id}>
                                            <td>{new Date(adv.date).toLocaleDateString('en-IN')}</td>
                                            <td style={{ fontWeight: 500 }}>₹{adv.amount.toLocaleString()}</td>
                                            <td>
                                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: '#1e40af', fontSize: '0.75rem', fontWeight: 600 }}>
                                                    {adv.deductionType === 'emi' ? `EMI (₹${adv.emiAmount}/mo)` : 'Lump-sum'}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 600, color: '#b45309' }}>₹{adv.remaining.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: 0, textAlign: 'center', padding: '1rem' }}>No active advances recorded.</p>
                        )}
                    </div>

                    {/* Pending Overtime */}
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Overtime Log</h3>
                            <button onClick={() => setIsOvertimeModalOpen(true)} className="btn btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', gap: '0.25rem' }}>
                                <Plus size={14} /> Log hours
                            </button>
                        </div>
                        {config.overtimeLogs.slice(-5).reverse().length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {config.overtimeLogs.slice(-5).reverse().map(log => (
                                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', fontSize: '0.85rem' }}>
                                        <div>
                                            <span style={{ fontWeight: 600 }}>{log.hours} Hours</span>
                                            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{new Date(log.date).toLocaleDateString('en-IN')} - {log.description || 'OT work'}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontWeight: 600 }}>₹{log.amount.toLocaleString()}</span>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: log.salarySlipId ? '#166534' : '#b45309', fontWeight: 600 }}>
                                                {log.salarySlipId ? 'Processed' : 'Accruing'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: 0, textAlign: 'center', padding: '1rem' }}>No overtime hours logged recently.</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'operations' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Route size={18} />
                            Assigned Operations
                        </h3>
                        <Link href="/operations" className="btn" style={{ background: 'white', border: '1px solid var(--color-border)' }}>
                            Open Operations
                        </Link>
                    </div>

                    {assignedWork.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            No transport or installation work is assigned to this employee.
                        </div>
                    ) : (
                        <table className="table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Work</th>
                                    <th>Order</th>
                                    <th>Customer</th>
                                    <th>Scheduled</th>
                                    <th>Status</th>
                                    <th>Payment Recorded</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assignedWork.map(({ order, task }) => (
                                    <tr key={`${order.id}-${task.id}`}>
                                        <td style={{ fontWeight: 700 }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                {task.type === 'transport' ? <Truck size={15} /> : <Wrench size={15} />}
                                                {getWorkTypeLabel(task.type)}
                                            </span>
                                        </td>
                                        <td>
                                            <Link href={`/orders/${order.id}`} style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                                                {order.generalNumber || order.number}
                                            </Link>
                                        </td>
                                        <td>{order.partyName}</td>
                                        <td>{task.scheduledDate ? new Date(task.scheduledDate).toLocaleDateString('en-IN') : '-'}</td>
                                        <td>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '999px',
                                                background: `${getWorkStatusColor(task.status)}18`,
                                                color: getWorkStatusColor(task.status),
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                            }}>
                                                {getWorkStatusLabel(task.status)}
                                            </span>
                                        </td>
                                        <td>{task.paymentRecordedAmount ? formatIndianCurrency(task.paymentRecordedAmount) : '-'}</td>
                                        <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', maxWidth: '260px' }}>
                                            {task.completionNotes || task.notes || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === 'advances' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Advance Disbursements & Repayments</h3>
                        <button onClick={() => setIsAdvanceModalOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Plus size={16} /> Disburse Advance
                        </button>
                    </div>

                    <table className="table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Disbursed Date</th>
                                <th>Total Loan Amount</th>
                                <th>Deduction Type</th>
                                <th>Deducted so far</th>
                                <th>Outstanding Balance</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {config.advances.map(adv => {
                                const deducted = adv.amount - adv.remaining;
                                return (
                                    <Fragment key={adv.id}>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>
                                            <td>{new Date(adv.date).toLocaleDateString('en-IN')}</td>
                                            <td>₹{adv.amount.toLocaleString()}</td>
                                            <td>
                                                <span style={{ textTransform: 'capitalize', padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    {adv.deductionType === 'emi' ? `EMI: ₹${adv.emiAmount}/mo` : 'Lump Sum'}
                                                </span>
                                            </td>
                                            <td>₹{deducted.toLocaleString()}</td>
                                            <td style={{ fontWeight: 600, color: adv.paidOff ? '#166534' : '#b45309' }}>₹{adv.remaining.toLocaleString()}</td>
                                            <td>
                                                <span style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '999px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: adv.paidOff ? '#dcfce7' : '#fee2e2',
                                                    color: adv.paidOff ? '#166534' : '#991b1b'
                                                }}>
                                                    {adv.paidOff ? 'PAID OFF' : 'ACTIVE'}
                                                </span>
                                            </td>
                                        </tr>
                                        {/* Repayments log sub-row */}
                                        {adv.repayments && adv.repayments.length > 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '0.5rem 1rem 1rem 1rem', background: '#fafafa' }}>
                                                    <div style={{ padding: '0.5rem', borderLeft: '3px solid #cbd5e1', fontSize: '0.8rem' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>DEDUCTION LOGS</span>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                            {adv.repayments.map((rep, idx) => (
                                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '400px' }}>
                                                                    <span>• Deducted ₹{rep.amount.toLocaleString()} on {new Date(rep.date).toLocaleDateString('en-IN')}</span>
                                                                    <span style={{ color: 'var(--color-text-muted)' }}>Ref: {rep.salarySlipId ? `Payroll Slip (${rep.salarySlipId.slice(-6)})` : 'Manual deduction'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                            {config.advances.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No loan or advance records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'overtime' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Overtime Log Register</h3>
                        <button onClick={() => setIsOvertimeModalOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Plus size={16} /> Log Overtime Hours
                        </button>
                    </div>

                    <table className="table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Hours Worked</th>
                                <th>Hourly Rate</th>
                                <th>Total Earned</th>
                                <th>Description</th>
                                <th>Processing Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {config.overtimeLogs.map(log => (
                                <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>
                                    <td>{new Date(log.date).toLocaleDateString('en-IN')}</td>
                                    <td>{log.hours} hrs</td>
                                    <td>₹{log.rateApplied}/hr</td>
                                    <td style={{ fontWeight: 600 }}>₹{log.amount.toLocaleString()}</td>
                                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{log.description || 'N/A'}</td>
                                    <td>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '999px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            background: log.salarySlipId ? '#dcfce7' : '#fee2e2',
                                            color: log.salarySlipId ? '#166534' : '#991b1b'
                                        }}>
                                            {log.salarySlipId ? `PROCESSED (${log.salarySlipId.slice(-6)})` : 'ACCRUING / UNPAID'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {config.overtimeLogs.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No overtime logs recorded for this employee.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'ledger' && (
                <div className="card">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Employee Payroll Ledger</h3>
                    <table className="table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Reference Number</th>
                                <th>Transaction Type</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right' }}>Debit (Paid Out)</th>
                                <th style={{ textAlign: 'right' }}>Credit (Accrued)</th>
                                <th style={{ textAlign: 'right' }}>Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <td>{new Date(item.date).toLocaleDateString('en-IN')}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{item.refNo}</td>
                                    <td>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            background: item.type.includes('Payment') ? '#fef3c7' : item.type.includes('Refund') ? '#dcfce7' : '#eff6ff',
                                            color: item.type.includes('Payment') ? '#b45309' : item.type.includes('Refund') ? '#166534' : '#1e40af'
                                        }}>
                                            {item.type}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.description}>
                                        {item.description}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 500, color: item.debit > 0 ? '#991b1b' : 'inherit' }}>
                                        {item.debit > 0 ? `₹${item.debit.toLocaleString()}` : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 500, color: item.credit > 0 ? '#166534' : 'inherit' }}>
                                        {item.credit > 0 ? `₹${item.credit.toLocaleString()}` : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: item.runningBalance > 0 ? '#b45309' : item.runningBalance < 0 ? '#ef4444' : 'inherit' }}>
                                        {item.runningBalance > 0 
                                            ? `₹${item.runningBalance.toLocaleString()} Dr` 
                                            : item.runningBalance < 0 
                                                ? `₹${Math.abs(item.runningBalance).toLocaleString()} Cr` 
                                                : '₹0'
                                        }
                                    </td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No ledger transactions generated yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal: Advance Disbursement */}
            <Modal isOpen={isAdvanceModalOpen} onClose={() => setIsAdvanceModalOpen(false)} title={`Disburse Advance Salary: ${employee.name}`}>
                <form onSubmit={handleAddAdvance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Advance Amount (₹)</label>
                        <input type="number" required min="0.01" step="0.01" className="input money-input" value={advAmount} onChange={e => setAdvAmount(e.target.value)} placeholder="Enter amount to pay" />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Disbursement Date</label>
                        <input type="date" required className="input" value={advDate} onChange={e => setAdvDate(e.target.value)} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Deduction Schedule</label>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input type="radio" name="advType" checked={advType === 'lump_sum'} onChange={() => setAdvType('lump_sum')} />
                                <span>Lump-sum from next salary</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input type="radio" name="advType" checked={advType === 'emi'} onChange={() => setAdvType('emi')} />
                                <span>Monthly EMI deduction</span>
                            </label>
                        </div>
                    </div>

                    {advType === 'emi' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Monthly EMI Amount (₹)</label>
                            <input type="number" required min="0.01" step="0.01" className="input money-input" value={advEmiAmount} onChange={e => setAdvEmiAmount(e.target.value)} placeholder="Deduction per month" />
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>PAYOUT DETAILS</h4>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input type="radio" name="payMode" checked={advPayMode === 'cash'} onChange={() => setAdvPayMode('cash')} />
                                <span>Cash payment</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input type="radio" name="payMode" checked={advPayMode === 'bank'} onChange={() => setAdvPayMode('bank')} />
                                <span>Bank transfer</span>
                            </label>
                        </div>
                        {advPayMode === 'bank' && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Source Bank Account</label>
                                <select className="input" value={advBankId} onChange={e => setAdvBankId(e.target.value)}>
                                    {bankAccounts.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} - A/c: ...{b.accountNumber.slice(-4)}</option>
                                    ))}
                                    {bankAccounts.length === 0 && (
                                        <option value="">No bank accounts available</option>
                                    )}
                                </select>
                            </div>
                        )}
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}>
                        Confirm & Disburse Advance
                    </button>
                </form>
            </Modal>

            {/* Modal: Log Overtime */}
            <Modal isOpen={isOvertimeModalOpen} onClose={() => setIsOvertimeModalOpen(false)} title={`Log Overtime Hours: ${employee.name}`}>
                <form onSubmit={handleLogOvertime} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Overtime Hours</label>
                        <input type="number" step="0.5" required className="input" value={otHours} onChange={e => setOtHours(e.target.value)} placeholder="e.g. 2.5 hours" />
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Overtime rate: {formatIndianCurrency(config.overtimeRate)}/hr. Amount calculated: {formatIndianCurrency(Number(otHours) ? Number(otHours) * config.overtimeRate : 0)}</p>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Date Work Done</label>
                        <input type="date" required className="input" value={otDate} onChange={e => setOtDate(e.target.value)} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Task/Description</label>
                        <input className="input" value={otDesc} onChange={e => setOtDesc(e.target.value)} placeholder="e.g. Late production cutting shift" />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}>
                        Log Overtime Hours
                    </button>
                </form>
            </Modal>
        </div>
    );
}
