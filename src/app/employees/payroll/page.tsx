'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Employee, SalarySlip, Voucher } from '@/types';
import { DollarSign, CheckCircle } from 'lucide-react';

export default function PayrollPage() {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [slips, setSlips] = useState<SalarySlip[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadPayroll();
    }, [month]);

    const loadPayroll = async () => {
        const allSlips = await db.payroll.getAll();
        setSlips(allSlips.filter(s => s.month === month));
    };

    const generatePayroll = async () => {
        setLoading(true);
        const [employees, allAttendance] = await Promise.all([
            db.employees.getAll(),
            db.attendance.getAll()
        ]);

        // Filter attendance for selected month
        const monthAttendance = allAttendance.filter(a => a.date.startsWith(month));

        // Calculate days in month
        const [year, m] = month.split('-');
        const daysInMonth = new Date(Number(year), Number(m), 0).getDate();

        const newSlips: SalarySlip[] = [];

        for (const emp of employees) {
            if (emp.status !== 'active') continue;

            // Check if slip already exists
            const existing = slips.find(s => s.employeeId === emp.id);
            if (existing) continue;

            const empAtt = monthAttendance.filter(a => a.employeeId === emp.id);

            let presentDays = 0;
            empAtt.forEach(a => {
                if (a.status === 'present') presentDays += 1;
                if (a.status === 'half_day') presentDays += 0.5;
                if (a.status === 'leave') presentDays += 1; // Paid leave assumed for simplicity? Or maybe not. Let's assume Paid Leave.
            });

            // Simple Calculation: (Basic / Total Days) * Present Days
            // Or usually: Basic - (Basic/30 * Absent)
            // Let's use: Pay for Present Days (including Leaves)
            // Actually, usually Sundays are paid. This simple logic might dock pay for weekends if not marked present.
            // For this MVP, let's assume we pay for Present + Leave. 
            // And let's assume a standard 30 day month for calculation to be safe or actual days.
            // Let's use actual days.

            // If no attendance marked, assume 0? Or full? 
            // Let's assume 0 to encourage marking attendance.

            const perDay = emp.basicSalary / daysInMonth;
            const netSalary = Math.round(perDay * presentDays);

            newSlips.push({
                id: crypto.randomUUID(),
                employeeId: emp.id,
                employeeName: emp.name,
                month,
                basicSalary: emp.basicSalary,
                presentDays,
                totalDays: daysInMonth,
                deductions: 0,
                bonus: 0,
                netSalary,
                status: 'generated'
            });
        }

        // Save all new slips
        for (const slip of newSlips) {
            await db.payroll.add(slip);
        }

        await loadPayroll();
        setLoading(false);
    };

    const handlePay = async (slip: SalarySlip) => {
        if (!confirm(`Confirm payment of ₹${slip.netSalary} to ${slip.employeeName}?`)) return;

        // 1. Update Slip Status
        const updatedSlip: SalarySlip = { ...slip, status: 'paid', paymentDate: new Date().toISOString().split('T')[0] };
        await db.payroll.update(updatedSlip);

        // 2. Create Expense Voucher
        const voucher: Voucher = {
            id: crypto.randomUUID(),
            number: `EXP-${Date.now().toString().substr(-6)}`,
            date: updatedSlip.paymentDate!,
            type: 'expense',
            amount: slip.netSalary,
            description: `Salary for ${slip.employeeName} (${slip.month})`,
            mode: 'cash',
            employeeId: slip.employeeId,
            employeeName: slip.employeeName
        };
        await db.vouchers.add(voucher);

        await loadPayroll();
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Payroll</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <input
                        type="month"
                        className="input"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        style={{ width: 'auto' }}
                    />
                    <button className="btn btn-primary" onClick={generatePayroll} disabled={loading}>
                        <DollarSign size={18} style={{ marginRight: '0.5rem' }} />
                        {loading ? 'Processing...' : 'Generate Payroll'}
                    </button>
                </div>
            </div>

            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Present Days</th>
                            <th>Basic Salary</th>
                            <th>Net Salary</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slips.map(slip => (
                            <tr key={slip.id}>
                                <td style={{ fontWeight: 500 }}>{slip.employeeName}</td>
                                <td>{slip.presentDays} / {slip.totalDays}</td>
                                <td>₹{slip.basicSalary.toLocaleString()}</td>
                                <td style={{ fontWeight: 600 }}>₹{slip.netSalary.toLocaleString()}</td>
                                <td>
                                    <span style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '999px',
                                        background: slip.status === 'paid' ? '#dcfce7' : '#fef9c3',
                                        color: slip.status === 'paid' ? '#166534' : '#854d0e',
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        {slip.status.toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    {slip.status === 'generated' && (
                                        <button
                                            className="btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#dcfce7', color: '#166534', border: 'none' }}
                                            onClick={() => handlePay(slip)}
                                        >
                                            Pay Now
                                        </button>
                                    )}
                                    {slip.status === 'paid' && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                            Paid on {new Date(slip.paymentDate!).toLocaleDateString()}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {slips.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                    No payroll generated for this month. Click "Generate Payroll" to calculate salaries.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
