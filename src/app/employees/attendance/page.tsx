'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Employee, Attendance } from '@/types';
import { Calendar, Save, FileText, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';

export default function AttendancePage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    
    const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
    const [attendance, setAttendance] = useState<{ [key: string]: Attendance['status'] }>({});
    const [timings, setTimings] = useState<{ [empId: string]: { clockIn: string; clockOut: string } }>({});
    const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadDailyData();
    }, [date]);

    useEffect(() => {
        loadMonthlyData();
    }, [month]);

    const loadDailyData = async () => {
        const [emps, atts] = await Promise.all([
            db.employees.getAll(),
            db.attendance.getByDate(date)
        ]);
        const activeEmps = emps.filter(e => e.status === 'active');
        setEmployees(activeEmps);

        // Pre-fill attendance and timings
        const attMap: { [key: string]: Attendance['status'] } = {};
        const timeMap: { [key: string]: { clockIn: string; clockOut: string } } = {};
        
        activeEmps.forEach(e => {
            const record = atts.find(a => a.employeeId === e.id);
            attMap[e.id] = record ? record.status : 'present'; // Default to present
            
            let parsed = { clockIn: '', clockOut: '' };
            if (record && record.note) {
                try {
                    const parsedNote = JSON.parse(record.note);
                    if (parsedNote.clockIn || parsedNote.clockOut) {
                        parsed = { clockIn: parsedNote.clockIn || '', clockOut: parsedNote.clockOut || '' };
                    }
                } catch (err) {
                    // Not JSON, ignore
                }
            }
            timeMap[e.id] = parsed;
        });
        
        setAttendance(attMap);
        setTimings(timeMap);
    };

    const loadMonthlyData = async () => {
        const [emps, allAtts] = await Promise.all([
            db.employees.getAll(),
            db.attendance.getAll()
        ]);
        setEmployees(emps.filter(e => e.status === 'active'));
        setAttendanceRecords(allAtts.filter(a => a.date.startsWith(month)));
    };

    const handleTimeChange = (empId: string, type: 'clockIn' | 'clockOut', value: string) => {
        const empTimings = timings[empId] || { clockIn: '', clockOut: '' };
        const updatedTimings = { ...empTimings, [type]: value };
        setTimings(prev => ({ ...prev, [empId]: updatedTimings }));
        
        // Auto calculate status if both times are set
        if (updatedTimings.clockIn && updatedTimings.clockOut) {
            const [inH, inM] = updatedTimings.clockIn.split(':').map(Number);
            const [outH, outM] = updatedTimings.clockOut.split(':').map(Number);
            const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
            const totalHours = totalMinutes / 60;
            
            let autoStatus: Attendance['status'] = 'present';
            if (totalHours < 4) {
                autoStatus = 'absent';
            } else if (totalHours >= 4 && totalHours < 8) {
                autoStatus = 'half_day';
            }
            
            setAttendance(prev => ({ ...prev, [empId]: autoStatus }));
        }
    };

    const handleSave = async () => {
        setLoading(true);
        const promises = employees.map(emp => {
            const status = attendance[emp.id] || 'present';
            const time = timings[emp.id] || { clockIn: '', clockOut: '' };
            
            let computedOvertime = 0;
            if (time.clockIn && time.clockOut && status !== 'leave') {
                const [inH, inM] = time.clockIn.split(':').map(Number);
                const [outH, outM] = time.clockOut.split(':').map(Number);
                const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
                const totalHours = totalMinutes / 60;
                computedOvertime = Math.max(0, totalHours - 9); // standard shift 9 hours
            }

            const noteObj = {
                clockIn: time.clockIn,
                clockOut: time.clockOut,
                overtime: Number(computedOvertime.toFixed(2))
            };

            const record: Attendance = {
                id: `${date}-${emp.id}`,
                employeeId: emp.id,
                date,
                status,
                note: JSON.stringify(noteObj)
            };
            return db.attendance.add(record);
        });
        await Promise.all(promises);
        setLoading(false);
        alert('Attendance and check-in timings saved successfully!');
    };

    const [yearStr, monthStr] = month.split('-');
    const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const handleExportPDF = () => {
        const year = Number(yearStr);
        const m = Number(monthStr);
        const doc = new jsPDF('l', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth(); // 297

        // Theme Colors
        const primaryColor = [79, 70, 229]; // #4f46e5
        const textColor = [31, 41, 55]; // #1f2937
        const mutedTextColor = [107, 114, 128]; // #6b7280
        const borderColor = [226, 232, 240]; // #e2e8f0

        // Page 1 Header Section
        doc.setFillColor(243, 244, 246);
        doc.rect(0, 0, pageWidth, 32, 'F');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('ARJUN GLASS HOUSE', 12, 12);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(`Monthly Attendance Register - ${new Date(year, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`, 12, 19);

        doc.setFontSize(8);
        doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);
        doc.text(`Exported on: ${new Date().toLocaleDateString('en-IN')} | Time: ${new Date().toLocaleTimeString('en-IN')}`, 12, 26);

        // Layout Parameters
        let startY = 40;
        const leftMargin = 8;
        const nameWidth = 35;
        const desigWidth = 22;
        const sumWidth = 6; 

        const remainingWidth = pageWidth - leftMargin - leftMargin - nameWidth - desigWidth - (sumWidth * 4); // 200
        const colWidth = remainingWidth / daysInMonth;

        // Table Header
        doc.setFillColor(79, 70, 229);
        doc.rect(leftMargin, startY, pageWidth - leftMargin - leftMargin, 8, 'F');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);

        doc.text('Employee Name', leftMargin + 2, startY + 5.5);
        doc.text('Designation', leftMargin + nameWidth + 2, startY + 5.5);

        // Day numbers
        for (let day = 1; day <= daysInMonth; day++) {
            const x = leftMargin + nameWidth + desigWidth + (day - 1) * colWidth;
            doc.text(String(day), x + (colWidth / 2) - 1, startY + 5.5);
        }

        // Summary header abbreviations
        const sumStart = leftMargin + nameWidth + desigWidth + (daysInMonth * colWidth);
        doc.text('P', sumStart + (sumWidth * 0) + 1.5, startY + 5.5);
        doc.text('A', sumStart + (sumWidth * 1) + 1.5, startY + 5.5);
        doc.text('HD', sumStart + (sumWidth * 2) + 0.5, startY + 5.5);
        doc.text('L', sumStart + (sumWidth * 3) + 1.5, startY + 5.5);

        startY += 8;

        // Rows
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);

        employees.forEach((emp, empIdx) => {
            if (empIdx % 2 === 1) {
                doc.setFillColor(249, 250, 251);
                doc.rect(leftMargin, startY, pageWidth - leftMargin - leftMargin, 7, 'F');
            }

            doc.setFont('Helvetica', 'bold');
            doc.text(emp.name, leftMargin + 2, startY + 4.5);
            doc.setFont('Helvetica', 'normal');
            doc.text(emp.designation, leftMargin + nameWidth + 2, startY + 4.5);

            let pCount = 0, aCount = 0, hdCount = 0, lCount = 0;
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${month}-${String(day).padStart(2, '0')}`;
                const record = attendanceRecords.find(r => r.employeeId === emp.id && r.date === dateStr);

                let char = '-';
                if (record) {
                    if (record.status === 'present') { char = 'P'; pCount++; }
                    else if (record.status === 'absent') { char = 'A'; aCount++; }
                    else if (record.status === 'half_day') { char = 'HD'; hdCount += 0.5; pCount += 0.5; }
                    else if (record.status === 'leave') { char = 'L'; lCount++; }
                }

                if (char === 'P') doc.setTextColor(22, 163, 74);
                else if (char === 'A') doc.setTextColor(220, 38, 38);
                else if (char === 'HD') doc.setTextColor(217, 119, 6);
                else if (char === 'L') doc.setTextColor(37, 99, 235);
                else doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);

                const x = leftMargin + nameWidth + desigWidth + (day - 1) * colWidth;
                doc.text(char, x + (colWidth / 2) - 1, startY + 4.5);
            }

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(22, 163, 74);
            doc.text(String(pCount), sumStart + (sumWidth * 0) + 1.5, startY + 4.5);
            doc.setTextColor(220, 38, 38);
            doc.text(String(aCount), sumStart + (sumWidth * 1) + 1.5, startY + 4.5);
            doc.setTextColor(217, 119, 6);
            doc.text(String(hdCount), sumStart + (sumWidth * 2) + 0.5, startY + 4.5);
            doc.setTextColor(37, 99, 235);
            doc.text(String(lCount), sumStart + (sumWidth * 3) + 1.5, startY + 4.5);

            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.1);
            doc.line(leftMargin, startY + 7, pageWidth - leftMargin, startY + 7);

            startY += 7;
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        });

        // PAGE 2: Daily Check-In/Out Timings Log
        doc.addPage();
        
        doc.setFillColor(243, 244, 246);
        doc.rect(0, 0, pageWidth, 25, 'F');
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Daily Employee Check-In/Out Logs', 12, 10);
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(`Detailed daily timings and calculated overtime for ${new Date(year, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`, 12, 16);
        
        let otStartY = 33;
        
        // Draw Header
        doc.setFillColor(79, 70, 229);
        doc.rect(leftMargin, otStartY, pageWidth - leftMargin - leftMargin, 6, 'F');
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        
        doc.text('Date', leftMargin + 2, otStartY + 4.5);
        doc.text('Employee Name', leftMargin + 28, otStartY + 4.5);
        doc.text('Designation', leftMargin + 75, otStartY + 4.5);
        doc.text('Clock In', leftMargin + 115, otStartY + 4.5);
        doc.text('Clock Out', leftMargin + 145, otStartY + 4.5);
        doc.text('Overtime (Hours)', leftMargin + 185, otStartY + 4.5);
        doc.text('Computed Status', leftMargin + 225, otStartY + 4.5);
        
        otStartY += 6;
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        
        let timingRows = 0;
        const sortedAtts = [...attendanceRecords].sort((a, b) => a.date.localeCompare(b.date));
        
        sortedAtts.forEach(att => {
            if (!att.note) return;
            let parsedNote: any = null;
            try {
                parsedNote = JSON.parse(att.note);
            } catch (e) {
                return;
            }
            
            if (!parsedNote || (!parsedNote.clockIn && !parsedNote.clockOut)) return;
            
            const emp = employees.find(e => e.id === att.employeeId);
            if (!emp) return;
            
            timingRows++;
            
            if (otStartY > 190) {
                doc.addPage();
                otStartY = 15;
                // Draw headers again
                doc.setFillColor(79, 70, 229);
                doc.rect(leftMargin, otStartY, pageWidth - leftMargin - leftMargin, 6, 'F');
                doc.setFont('Helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text('Date', leftMargin + 2, otStartY + 4.5);
                doc.text('Employee Name', leftMargin + 28, otStartY + 4.5);
                doc.text('Designation', leftMargin + 75, otStartY + 4.5);
                doc.text('Clock In', leftMargin + 115, otStartY + 4.5);
                doc.text('Clock Out', leftMargin + 145, otStartY + 4.5);
                doc.text('Overtime (Hours)', leftMargin + 185, otStartY + 4.5);
                doc.text('Computed Status', leftMargin + 225, otStartY + 4.5);
                otStartY += 6;
                doc.setFont('Helvetica', 'normal');
                doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            }
            
            if (timingRows % 2 === 1) {
                doc.setFillColor(249, 250, 251);
                doc.rect(leftMargin, otStartY, pageWidth - leftMargin - leftMargin, 5.5, 'F');
            }
            
            doc.text(new Date(att.date).toLocaleDateString('en-IN'), leftMargin + 2, otStartY + 4.0);
            doc.text(emp.name, leftMargin + 28, otStartY + 4.0);
            doc.text(emp.designation, leftMargin + 75, otStartY + 4.0);
            doc.text(parsedNote.clockIn || '-', leftMargin + 115, otStartY + 4.0);
            doc.text(parsedNote.clockOut || '-', leftMargin + 145, otStartY + 4.0);
            doc.text(parsedNote.overtime > 0 ? `${parsedNote.overtime.toFixed(1)} hrs` : '-', leftMargin + 185, otStartY + 4.0);
            doc.text(att.status.replace('_', ' ').toUpperCase(), leftMargin + 225, otStartY + 4.0);
            
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.05);
            doc.line(leftMargin, otStartY + 5.5, pageWidth - leftMargin, otStartY + 5.5);
            
            otStartY += 5.5;
        });
        
        if (timingRows === 0) {
            doc.text('No detailed check-in or check-out times logged for this month.', leftMargin + 2, otStartY + 5);
        }

        // Save PDF
        doc.save(`Attendance_Register_${month}.pdf`);
    };

    return (
        <div className="container">
            {/* Header section with Tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Employee Attendance</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Track attendance daily or view monthly registers</p>
                </div>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '8px', gap: '4px' }}>
                    <button
                        onClick={() => setActiveTab('daily')}
                        style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === 'daily' ? 'white' : 'transparent',
                            color: activeTab === 'daily' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Daily Attendance
                    </button>
                    <button
                        onClick={() => setActiveTab('monthly')}
                        style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === 'monthly' ? 'white' : 'transparent',
                            color: activeTab === 'monthly' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Monthly Register
                    </button>
                </div>
            </div>

            {activeTab === 'daily' ? (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={18} style={{ color: 'var(--color-primary)' }} />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Select Date</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                                type="date"
                                className="input"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                style={{ width: 'auto' }}
                            />
                            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                                <Save size={18} style={{ marginRight: '0.5rem' }} />
                                {loading ? 'Saving...' : 'Save Attendance'}
                            </button>
                        </div>
                    </div>

                    <table className="table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Designation</th>
                                <th>Clock In</th>
                                <th>Clock Out</th>
                                <th>Status</th>
                                <th>Calculated Info</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map(emp => {
                                const time = timings[emp.id] || { clockIn: '', clockOut: '' };
                                const status = attendance[emp.id] || 'present';
                                
                                let hrs = 0;
                                let ot = 0;
                                if (time.clockIn && time.clockOut && status !== 'leave') {
                                    const [inH, inM] = time.clockIn.split(':').map(Number);
                                    const [outH, outM] = time.clockOut.split(':').map(Number);
                                    const mins = (outH * 60 + outM) - (inH * 60 + inM);
                                    hrs = Number((mins / 60).toFixed(1));
                                    ot = Number(Math.max(0, hrs - 9).toFixed(1));
                                }

                                return (
                                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ fontWeight: 600 }}>{emp.name}</td>
                                        <td style={{ color: 'var(--color-text-muted)' }}>{emp.designation}</td>
                                        <td>
                                            <input 
                                                type="time" 
                                                className="input" 
                                                value={time.clockIn} 
                                                onChange={e => handleTimeChange(emp.id, 'clockIn', e.target.value)} 
                                                disabled={status === 'leave'} 
                                                style={{ width: '120px', padding: '0.25rem 0.5rem' }} 
                                            />
                                        </td>
                                        <td>
                                            <input 
                                                type="time" 
                                                className="input" 
                                                value={time.clockOut} 
                                                onChange={e => handleTimeChange(emp.id, 'clockOut', e.target.value)} 
                                                disabled={status === 'leave'} 
                                                style={{ width: '120px', padding: '0.25rem 0.5rem' }} 
                                            />
                                        </td>
                                        <td>
                                            <select 
                                                className="input" 
                                                value={status} 
                                                onChange={e => {
                                                    const newStatus = e.target.value as Attendance['status'];
                                                    setAttendance({ ...attendance, [emp.id]: newStatus });
                                                    if (newStatus === 'leave' || newStatus === 'absent') {
                                                        setTimings(prev => ({ ...prev, [emp.id]: { clockIn: '', clockOut: '' } }));
                                                    }
                                                }}
                                                style={{ width: '130px', padding: '0.25rem 0.5rem' }}
                                            >
                                                <option value="present">Present</option>
                                                <option value="half_day">Half Day</option>
                                                <option value="absent">Absent</option>
                                                <option value="leave">On Leave</option>
                                            </select>
                                        </td>
                                        <td>
                                            {status !== 'leave' && time.clockIn && time.clockOut ? (
                                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                                                    Worked: {hrs} hrs {ot > 0 ? `(OT: +${ot} hrs)` : ''}
                                                </span>
                                            ) : status === 'leave' ? (
                                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3b82f6' }}>Paid Leave</span>
                                            ) : (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="card" style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', minWidth: '900px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={18} style={{ color: 'var(--color-primary)' }} />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Select Month</span>
                            <input
                                type="month"
                                className="input"
                                value={month}
                                onChange={e => setMonth(e.target.value)}
                                style={{ width: 'auto', marginLeft: '0.5rem' }}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={handleExportPDF} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Download size={18} />
                            Export PDF Report
                        </button>
                    </div>

                    <table className="table" style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--color-border)' }}>
                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px' }}>Employee</th>
                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '100px' }}>Designation</th>
                                {daysArray.map(day => (
                                    <th key={day} style={{ padding: '0.75rem 0.25rem', textAlign: 'center', width: '24px' }}>{day}</th>
                                ))}
                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '28px', color: '#166534' }}>P</th>
                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '28px', color: '#991b1b' }}>A</th>
                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '28px', color: '#b45309' }}>HD</th>
                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '28px', color: '#1e40af' }}>L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map(emp => {
                                let pCount = 0;
                                let aCount = 0;
                                let hdCount = 0;
                                let lCount = 0;

                                return (
                                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{emp.name}</td>
                                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>{emp.designation}</td>
                                        {daysArray.map(day => {
                                            const dateStr = `${month}-${String(day).padStart(2, '0')}`;
                                            const record = attendanceRecords.find(r => r.employeeId === emp.id && r.date === dateStr);

                                            let displayChar = '-';
                                            let cellColor = 'var(--color-text-muted)';
                                            let tooltip = 'No timings logged';
                                            
                                            if (record) {
                                                if (record.note) {
                                                    try {
                                                        const parsedNote = JSON.parse(record.note);
                                                        if (parsedNote.clockIn && parsedNote.clockOut) {
                                                            tooltip = `In: ${parsedNote.clockIn} | Out: ${parsedNote.clockOut}${parsedNote.overtime > 0 ? ` | OT: ${parsedNote.overtime}h` : ''}`;
                                                        }
                                                    } catch (e) {}
                                                }

                                                if (record.status === 'present') {
                                                    displayChar = 'P';
                                                    cellColor = '#22c55e';
                                                    pCount += 1;
                                                } else if (record.status === 'absent') {
                                                    displayChar = 'A';
                                                    cellColor = '#ef4444';
                                                    aCount += 1;
                                                } else if (record.status === 'half_day') {
                                                    displayChar = 'HD';
                                                    cellColor = '#f59e0b';
                                                    hdCount += 1;
                                                } else if (record.status === 'leave') {
                                                    displayChar = 'L';
                                                    cellColor = '#3b82f6';
                                                    lCount += 1;
                                                    tooltip = 'Approved Paid Leave';
                                                }
                                            }

                                            return (
                                                <td key={day} title={tooltip} style={{ padding: '0.75rem 0.1rem', textAlign: 'center', fontWeight: 700, color: cellColor, cursor: 'help' }}>
                                                    {displayChar}
                                                </td>
                                            );
                                        })}
                                        <td style={{ padding: '0.75rem 0.25rem', textAlign: 'center', fontWeight: 700, color: '#166534', background: 'rgba(34, 197, 94, 0.05)' }}>
                                            {pCount + (hdCount * 0.5)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.25rem', textAlign: 'center', fontWeight: 700, color: '#991b1b', background: 'rgba(239, 68, 68, 0.05)' }}>
                                            {aCount + (hdCount * 0.5)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.25rem', textAlign: 'center', fontWeight: 700, color: '#b45309', background: 'rgba(245, 158, 11, 0.05)' }}>
                                            {hdCount}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.25rem', textAlign: 'center', fontWeight: 700, color: '#1e40af', background: 'rgba(59, 130, 246, 0.05)' }}>
                                            {lCount}
                                        </td>
                                    </tr>
                                );
                            })}
                            {employees.length === 0 && (
                                <tr>
                                    <td colSpan={daysInMonth + 6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                        No active employee profiles found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
