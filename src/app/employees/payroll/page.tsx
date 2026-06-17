'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { getEmployeeConfig, saveEmployeeConfig } from '@/lib/employeeSettings';
import { Employee, SalarySlip, Voucher } from '@/types';
import { DollarSign, CheckCircle, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { formatIndianCurrency, roundCurrency } from '@/lib/utils';

function numberToWords(num: number): string {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if ((num = Math.round(num)) === 0) return 'Zero';
    
    let str = '';
    const n = ('000000000' + num).substr(-9);
    
    const crore = Number(n.substr(0, 2));
    const lakh = Number(n.substr(2, 2));
    const thousand = Number(n.substr(4, 2));
    const hundred = Number(n.substr(6, 1));
    const tens = Number(n.substr(7, 2));

    if (crore > 0) {
        str += (crore < 20 ? a[crore] : b[Math.floor(crore / 10)] + ' ' + a[crore % 10]) + 'Crore ';
    }
    if (lakh > 0) {
        str += (lakh < 20 ? a[lakh] : b[Math.floor(lakh / 10)] + ' ' + a[lakh % 10]) + 'Lakh ';
    }
    if (thousand > 0) {
        str += (thousand < 20 ? a[thousand] : b[Math.floor(thousand / 10)] + ' ' + a[thousand % 10]) + 'Thousand ';
    }
    if (hundred > 0) {
        str += a[hundred] + 'Hundred ';
    }
    if (tens > 0) {
        if (str !== '') str += 'and ';
        str += (tens < 20 ? a[tens] : b[Math.floor(tens / 10)] + ' ' + a[tens % 10]);
    }
    return str.trim() + ' Rupees Only';
}

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
        try {
            const [employees, allAttendance, businessConfig] = await Promise.all([
                db.employees.getAll(),
                db.attendance.getAll(),
                db.businessConfig.get()
            ]);

            // Filter attendance for selected month
            const monthAttendance = allAttendance.filter(a => a.date.startsWith(month));

            // Calculate days in month
            const [year, m] = month.split('-');
            const daysInMonth = new Date(Number(year), Number(m), 0).getDate();

            const newSlips: SalarySlip[] = [];
            const empConfigs = businessConfig.employeeConfigs || {};

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
                    if (a.status === 'leave') presentDays += 1; // paid leaves
                });

                const perDay = emp.basicSalary / daysInMonth;
                const basePay = roundCurrency(perDay * presentDays);

                // Fetch employee specific configuration
                const empConfig = empConfigs[emp.id] || { overtimeRate: 100, maxOvertimeCeiling: 0, overtimeLogs: [], advances: [] };
                const otRate = empConfig.overtimeRate ?? 100;
                const otCeiling = empConfig.maxOvertimeCeiling ?? 0;

                // Calculate Overtime Pay from daily attendance clock-in/out records
                let otHours = 0;
                empAtt.forEach(a => {
                    if (a.note) {
                        try {
                            const parsed = JSON.parse(a.note);
                            if (parsed.overtime) {
                                otHours += Number(parsed.overtime);
                            }
                        } catch (e) {}
                    }
                });
                const grossOtPay = roundCurrency(otHours * otRate);
                const otPay = roundCurrency(otCeiling > 0 ? Math.min(grossOtPay, otCeiling) : grossOtPay);

                // Calculate Advance Deductions
                const activeAdvances = (empConfig.advances || []).filter((a: any) => !a.paidOff);
                let deduction = 0;
                const grossEarnings = basePay + otPay;

                activeAdvances.forEach((adv: any) => {
                    if (deduction >= grossEarnings) return;

                    let amt = 0;
                    if (adv.deductionType === 'lump_sum') {
                        amt = adv.remaining;
                    } else if (adv.deductionType === 'emi') {
                        amt = adv.emiAmount || 0;
                    }

                    amt = Math.min(amt, adv.remaining);
                    // Cap total deductions at current gross earnings
                    if (deduction + amt > grossEarnings) {
                        amt = grossEarnings - deduction;
                    }

                    deduction += amt;
                });

                deduction = roundCurrency(deduction);
                const netSalary = roundCurrency(grossEarnings - deduction);

                newSlips.push({
                    id: crypto.randomUUID(),
                    employeeId: emp.id,
                    employeeName: emp.name,
                    month,
                    basicSalary: emp.basicSalary,
                    presentDays,
                    totalDays: daysInMonth,
                    deductions: deduction,
                    bonus: otPay, // Store overtime pay in bonus column
                    netSalary,
                    status: 'generated'
                });
            }

            // Save all new slips
            for (const slip of newSlips) {
                await db.payroll.add(slip);
            }

            await loadPayroll();
        } catch (error) {
            console.error('Error generating payroll:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePay = async (slip: SalarySlip) => {
        if (!confirm(`Confirm payment of ₹${slip.netSalary} to ${slip.employeeName}?`)) return;

        try {
            // 1. Update Slip Status
            const paymentDate = new Date().toISOString().split('T')[0];
            const updatedSlip: SalarySlip = { ...slip, status: 'paid', paymentDate };
            await db.payroll.update(updatedSlip);

            // 2. Create Expense Voucher
            const voucher: Voucher = {
                id: crypto.randomUUID(),
                number: `EXP-${Date.now().toString().slice(-6)}`,
                date: paymentDate,
                type: 'expense',
                amount: slip.netSalary,
                description: `Salary Payout for ${slip.employeeName} (${slip.month}) - Net: ₹${slip.netSalary} (OT: ₹${slip.bonus}, Deduct: ₹${slip.deductions})`,
                mode: 'cash',
                employeeId: slip.employeeId,
                employeeName: slip.employeeName
            };
            await db.vouchers.add(voucher);

            // 3. Update Employee Balance in DB (net effect of payment and deductions)
            const employee = await db.employees.getAll().then(es => es.find(e => e.id === slip.employeeId));
            if (employee) {
                const newBalance = roundCurrency(employee.balance + slip.netSalary - slip.deductions);
                await db.employees.update({ ...employee, balance: newBalance });
            }

            // 4. Update Employee Config: lock overtime logs and deduct advances
            const empConfig = await getEmployeeConfig(slip.employeeId);
            let configChanged = false;

            // Mark overtime logs as processed
            const otLogs = empConfig.overtimeLogs || [];
            otLogs.forEach((log: any) => {
                if (log.date.startsWith(slip.month) && !log.salarySlipId) {
                    log.salarySlipId = slip.id;
                    configChanged = true;
                }
            });

            // Deduct advance balances
            let remainingDeduction = slip.deductions;
            const activeAdvances = (empConfig.advances || []).filter((a: any) => !a.paidOff);

            activeAdvances.forEach((adv: any) => {
                if (remainingDeduction <= 0) return;

                let candidate = 0;
                if (adv.deductionType === 'lump_sum') {
                    candidate = adv.remaining;
                } else if (adv.deductionType === 'emi') {
                    candidate = adv.emiAmount || 0;
                }
                candidate = Math.min(candidate, adv.remaining);

                const actualDeduct = Math.min(candidate, remainingDeduction);
                if (actualDeduct > 0) {
                    adv.remaining -= actualDeduct;
                    remainingDeduction -= actualDeduct;
                    if (!adv.repayments) adv.repayments = [];
                    adv.repayments.push({
                        date: paymentDate,
                        amount: actualDeduct,
                        salarySlipId: slip.id
                    });
                    if (adv.remaining <= 0) {
                        adv.paidOff = true;
                    }
                    configChanged = true;
                }
            });

            if (configChanged) {
                await saveEmployeeConfig(slip.employeeId, empConfig);
            }

            await loadPayroll();
        } catch (error: any) {
            console.error('Error processing salary payment:', error);
            alert(`Error processing payment: ${error.message}`);
        }
    };

    const handlePrintStatement = async (slip: SalarySlip) => {
        try {
            const [employee, empConfig, allVouchers, allAttendance] = await Promise.all([
                db.employees.getAll().then(es => es.find(e => e.id === slip.employeeId)),
                getEmployeeConfig(slip.employeeId),
                db.vouchers.getAll(),
                db.attendance.getAll()
            ]);

            const empConfigSafe = empConfig || { overtimeRate: 100, maxOvertimeCeiling: 0, advances: [], overtimeLogs: [] };
            const otRate = empConfigSafe.overtimeRate ?? 100;

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth(); // 210
            const pageHeight = doc.internal.pageSize.getHeight(); // 297

            // Colors
            const primaryColor = [79, 70, 229]; // Indigo
            const textColor = [31, 41, 55]; // Gray-800
            const mutedTextColor = [107, 114, 128]; // Gray-500
            const borderColor = [226, 232, 240]; // Gray-200

            // Header Section
            doc.setFillColor(243, 244, 246);
            doc.rect(0, 0, pageWidth, 30, 'F');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text('ARJUN GLASS HOUSE', 15, 12);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.text('Premium Glass Solutions | Phone: +91 98765-43210', 15, 18);
            doc.text('A4 Portrait Monthly Salary Statement & Payslip', 15, 24);

            // Right side of Header
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.text(`STATEMENT MONTH: ${new Date(slip.month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase()}`, pageWidth - 15, 13, { align: 'right' });
            
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);
            doc.text(`Statement ID: SLIP-${slip.month}-${slip.employeeId.slice(0,4).toUpperCase()}`, pageWidth - 15, 19, { align: 'right' });
            doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 15, 25, { align: 'right' });

            let y = 38;

            // Employee Details block
            doc.setFillColor(249, 250, 251);
            doc.rect(15, y, pageWidth - 30, 28, 'F');
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.2);
            doc.rect(15, y, pageWidth - 30, 28, 'D');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.text('EMPLOYEE PROFILE', 20, y + 6);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text(`Name: ${slip.employeeName}`, 20, y + 13);
            doc.text(`Designation: ${employee?.designation || 'Staff'}`, 20, y + 20);
            doc.text(`Phone: ${employee?.phone || 'N/A'}`, 110, y + 13);
            doc.text(`Joining Date: ${employee?.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-IN') : 'N/A'}`, 110, y + 20);

            y += 34;

            // Attendance & Overtime Summary block
            const empAtt = allAttendance.filter(a => a.employeeId === slip.employeeId && a.date.startsWith(slip.month));
            let presentCount = 0;
            let halfDayCount = 0;
            let absentCount = 0;
            let leaveCount = 0;
            let totalWorkedHours = 0;
            let totalOtHours = 0;

            empAtt.forEach(a => {
                if (a.status === 'present') presentCount++;
                else if (a.status === 'half_day') halfDayCount++;
                else if (a.status === 'absent') absentCount++;
                else if (a.status === 'leave') leaveCount++;

                if (a.note) {
                    try {
                        const parsed = JSON.parse(a.note);
                        if (parsed.clockIn && parsed.clockOut) {
                            const [inH, inM] = parsed.clockIn.split(':').map(Number);
                            const [outH, outM] = parsed.clockOut.split(':').map(Number);
                            const totalHours = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;
                            totalWorkedHours += totalHours;
                        }
                        if (parsed.overtime) {
                            totalOtHours += parsed.overtime;
                        }
                    } catch (e) {}
                }
            });

            doc.setFillColor(249, 250, 251);
            doc.rect(15, y, pageWidth - 30, 22, 'F');
            doc.rect(15, y, pageWidth - 30, 22, 'D');

            doc.setFont('Helvetica', 'bold');
            doc.text('WORK PERFORMANCE & TIMINGS SUMMARY', 20, y + 6);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Present: ${presentCount} | Half-Days: ${halfDayCount} | Leave (Paid): ${leaveCount} | Absent: ${absentCount}  (Total Days in Month: ${slip.totalDays})`, 20, y + 14);
            
            y += 28;

            // Earnings & Deductions Tables
            // Header
            doc.setFillColor(79, 70, 229);
            doc.rect(15, y, (pageWidth - 30) / 2, 7, 'F');
            doc.setFillColor(15, 23, 42); // slate
            doc.rect(15 + (pageWidth - 30) / 2, y, (pageWidth - 30) / 2, 7, 'F');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(255, 255, 255);
            doc.text('EARNINGS & BASIC PAY', 20, y + 4.8);
            doc.text('DEDUCTIONS & RECOVERY', 20 + (pageWidth - 30) / 2, y + 4.8);

            y += 7;

            // Table Content Rows
            const basePay = Math.round((slip.basicSalary / slip.totalDays) * slip.presentDays);
            
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.2);

            // Row 1
            doc.setFillColor(255, 255, 255);
            doc.rect(15, y, (pageWidth - 30) / 2, 8, 'F');
            doc.rect(15 + (pageWidth - 30) / 2, y, (pageWidth - 30) / 2, 8, 'F');
            doc.rect(15, y, (pageWidth - 30) / 2, 8, 'D');
            doc.rect(15 + (pageWidth - 30) / 2, y, (pageWidth - 30) / 2, 8, 'D');

            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFont('Helvetica', 'normal');
            doc.text('Basic Pay (Pro-rated)', 20, y + 5);
            doc.text(`₹${basePay.toLocaleString()}`, 15 + (pageWidth - 30) / 2 - 5, y + 5, { align: 'right' });

            doc.text('Advance Salary Deduction', 20 + (pageWidth - 30) / 2, y + 5);
            doc.text(`₹${slip.deductions.toLocaleString()}`, pageWidth - 20, y + 5, { align: 'right' });

            y += 8;

            // Row 2
            doc.rect(15, y, (pageWidth - 30) / 2, 8, 'F');
            doc.rect(15 + (pageWidth - 30) / 2, y, (pageWidth - 30) / 2, 8, 'F');
            doc.rect(15, y, (pageWidth - 30) / 2, 8, 'D');
            doc.rect(15 + (pageWidth - 30) / 2, y, (pageWidth - 30) / 2, 8, 'D');

            doc.text(`Overtime Pay (${totalOtHours.toFixed(1)} hrs @ ₹${otRate}/hr)`, 20, y + 5);
            doc.text(`₹${slip.bonus.toLocaleString()}`, 15 + (pageWidth - 30) / 2 - 5, y + 5, { align: 'right' });

            doc.text('-', 20 + (pageWidth - 30) / 2, y + 5);
            doc.text('₹0', pageWidth - 20, y + 5, { align: 'right' });

            y += 8;

            // Row 3: Totals
            doc.setFillColor(249, 250, 251);
            doc.rect(15, y, (pageWidth - 30) / 2, 8, 'F');
            doc.rect(15 + (pageWidth - 30) / 2, y, (pageWidth - 30) / 2, 8, 'F');
            doc.rect(15, y, (pageWidth - 30) / 2, 8, 'D');
            doc.rect(15 + (pageWidth - 30) / 2, y, (pageWidth - 30) / 2, 8, 'D');

            doc.setFont('Helvetica', 'bold');
            doc.text('Gross Earnings', 20, y + 5);
            const grossEarnings = basePay + slip.bonus;
            doc.text(`₹${grossEarnings.toLocaleString()}`, 15 + (pageWidth - 30) / 2 - 5, y + 5, { align: 'right' });

            doc.text('Total Deductions', 20 + (pageWidth - 30) / 2, y + 5);
            doc.text(`₹${slip.deductions.toLocaleString()}`, pageWidth - 20, y + 5, { align: 'right' });

            y += 8;

            // Net Payout Box
            doc.setFillColor(239, 246, 255);
            doc.rect(15, y, pageWidth - 30, 10, 'F');
            doc.rect(15, y, pageWidth - 30, 10, 'D');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(30, 58, 138); // Dark Blue
            doc.text('NET SALARY PAYOUT', 20, y + 6.2);
            doc.text(`₹${slip.netSalary.toLocaleString()}`, pageWidth - 20, y + 6.2, { align: 'right' });

            y += 10;

            // Net salary in words
            doc.setFont('Helvetica', 'italic');
            doc.setFontSize(7.5);
            doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);
            doc.text(`Amount in Words: ${numberToWords(slip.netSalary)}`, 20, y + 4.5);

            y += 9;

            // ADVANCE STATEMENT SECTION
            let advancesTakenThisMonth = 0;
            let advanceDeductionsThisMonth = 0;

            empConfigSafe.advances.forEach(adv => {
                if (adv.date.startsWith(slip.month)) {
                    advancesTakenThisMonth += adv.amount;
                }
                if (adv.repayments) {
                    adv.repayments.forEach(rep => {
                        if (rep.salarySlipId === slip.id || rep.date.startsWith(slip.month)) {
                            advanceDeductionsThisMonth += rep.amount;
                        }
                    });
                }
            });

            let currentOutstanding = empConfigSafe.advances.reduce((sum, adv) => sum + adv.remaining, 0);
            let endingOutstanding = 0;
            let startingOutstanding = 0;

            if (slip.status === 'paid') {
                endingOutstanding = currentOutstanding;
                startingOutstanding = endingOutstanding + advanceDeductionsThisMonth - advancesTakenThisMonth;
            } else {
                endingOutstanding = Math.max(0, currentOutstanding - slip.deductions);
                startingOutstanding = currentOutstanding;
            }

            doc.setFillColor(249, 250, 251);
            doc.rect(15, y, pageWidth - 30, 28, 'F');
            doc.rect(15, y, pageWidth - 30, 28, 'D');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.text('ADVANCE LOAN ACCOUNT SUMMARY', 20, y + 6);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text(`Opening Outstanding Balance: ₹${startingOutstanding.toLocaleString()}`, 20, y + 13);
            doc.text(`New Advances Disbursed:  + ₹${advancesTakenThisMonth.toLocaleString()}`, 20, y + 20);

            doc.text(`Salary Deduction (EMI/Lump):  - ₹${advanceDeductionsThisMonth.toLocaleString()}`, 110, y + 13);
            
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(153, 27, 27); // Dark red
            doc.text(`Closing Outstanding Balance:   ₹${endingOutstanding.toLocaleString()}`, 110, y + 20);
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);

            y += 33;

            // DETAILED TIMINGS & OVERTIME LOGS
            const otTimings = empAtt.filter(a => {
                if (!a.note) return false;
                try {
                    const parsed = JSON.parse(a.note);
                    return parsed.clockIn && parsed.clockOut;
                } catch(e) {
                    return false;
                }
            });

            if (otTimings.length > 0) {
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(9);
                doc.text('DAILY ATTENDANCE TIMINGS & OVERTIME DETAIL LOGS', 15, y + 3);
                y += 6;

                // Headers
                doc.setFillColor(243, 244, 246);
                doc.rect(15, y, pageWidth - 30, 6, 'F');
                doc.rect(15, y, pageWidth - 30, 6, 'D');

                doc.setFontSize(7.5);
                doc.text('Date', 20, y + 4.2);
                doc.text('Clock In', 55, y + 4.2);
                doc.text('Clock Out', 90, y + 4.2);
                doc.text('Hours Worked', 125, y + 4.2);
                doc.text('Overtime', 160, y + 4.2);

                y += 6;
                doc.setFont('Helvetica', 'normal');

                otTimings.slice(0, 5).forEach((tRecord) => {
                    const parsed = JSON.parse(tRecord.note || '{}');
                    const [inH, inM] = parsed.clockIn.split(':').map(Number);
                    const [outH, outM] = parsed.clockOut.split(':').map(Number);
                    const duration = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;

                    doc.rect(15, y, pageWidth - 30, 5.5, 'D');
                    doc.text(new Date(tRecord.date).toLocaleDateString('en-IN'), 20, y + 3.8);
                    doc.text(parsed.clockIn || '-', 55, y + 3.8);
                    doc.text(parsed.clockOut || '-', 90, y + 3.8);
                    doc.text(`${duration.toFixed(1)} hrs`, 125, y + 3.8);
                    doc.text(parsed.overtime > 0 ? `+${parsed.overtime.toFixed(1)} hrs` : '-', 160, y + 3.8);
                    
                    y += 5.5;
                });

                if (otTimings.length > 5) {
                    doc.setFont('Helvetica', 'italic');
                    doc.text(`... and ${otTimings.length - 5} more timing logs (detailed logs available in full Monthly Register PDF report)`, 20, y + 3.5);
                    y += 6;
                }
            } else {
                y += 5;
            }

            // Excluded Reimbursements Disclaimer
            const employeeReimbursements = allVouchers.filter(v => 
                v.employeeId === slip.employeeId && 
                v.date.startsWith(slip.month) && 
                v.partyId === '12345678-5555-5555-5555-555555555555'
            );
            const totalReimbursements = employeeReimbursements.reduce((sum, v) => sum + v.amount, 0);

            doc.setFillColor(254, 243, 199); // yellow-100
            doc.rect(15, y, pageWidth - 30, 11, 'F');
            doc.setDrawColor(245, 158, 11);
            doc.rect(15, y, pageWidth - 30, 11, 'D');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(146, 64, 14); // amber-800
            doc.text('OFFICIAL DISCLAIMER / ACCOUNTING POLICY NOTE:', 20, y + 4);
            doc.setFont('Helvetica', 'normal');
            doc.text(`In accordance with double-entry policies, expense reimbursements of ₹${totalReimbursements.toLocaleString()} paid to this employee`, 20, y + 7.5);
            doc.text(`are processed separately under Expense Ledgers and are strictly EXCLUDED from this monthly salary statement.`, 20, y + 10);

            y += 20;

            // Signature Lines
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.5);
            doc.line(15, y, 70, y);
            doc.line(pageWidth - 70, y, pageWidth - 15, y);

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.text('Employee Signature', 42.5, y + 4.5, { align: 'center' });
            doc.text('For Arjun Glass House', pageWidth - 42.5, y + 4.5, { align: 'center' });

            doc.save(`Salary_Statement_${slip.employeeName.replace(/\s+/g, '_')}_${slip.month}.pdf`);
        } catch (error) {
            console.error('Error generating salary statement PDF:', error);
            alert('Failed to generate salary statement PDF.');
        }
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Employee Payroll</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Generate monthly salaries, process overtime, and apply loan deductions</p>
                </div>
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

            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', minWidth: '850px' }}>
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Present Days</th>
                            <th>Basic Salary</th>
                            <th>OT Pay (Bonus)</th>
                            <th>Deductions (Loans)</th>
                            <th>Net Salary</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slips.map(slip => (
                            <tr key={slip.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ fontWeight: 600 }}>{slip.employeeName}</td>
                                <td>{slip.presentDays} / {slip.totalDays} days</td>
                                <td>{formatIndianCurrency(slip.basicSalary)}</td>
                                <td style={{ color: '#166534', fontWeight: 600 }}>
                                    {slip.bonus > 0 ? `+${formatIndianCurrency(slip.bonus)}` : formatIndianCurrency(0)}
                                </td>
                                <td style={{ color: '#991b1b', fontWeight: 600 }}>
                                    {slip.deductions > 0 ? `-${formatIndianCurrency(slip.deductions)}` : formatIndianCurrency(0)}
                                </td>
                                <td style={{ fontWeight: 700 }}>{formatIndianCurrency(slip.netSalary)}</td>
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
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        {slip.status === 'generated' && (
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#dcfce7', color: '#166534', border: 'none', cursor: 'pointer' }}
                                                onClick={() => handlePay(slip)}
                                            >
                                                Pay Now
                                            </button>
                                        )}
                                        {slip.status === 'paid' && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                Paid on {new Date(slip.paymentDate!).toLocaleDateString('en-IN')}
                                            </span>
                                        )}
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                                            onClick={() => handlePrintStatement(slip)}
                                        >
                                            <FileText size={12} />
                                            Statement
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {slips.length === 0 && (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
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
