'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Employee, Attendance } from '@/types';
import { Calendar, Save } from 'lucide-react';

export default function AttendancePage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [attendance, setAttendance] = useState<{ [key: string]: Attendance['status'] }>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, [date]);

    const loadData = async () => {
        const [emps, atts] = await Promise.all([
            db.employees.getAll(),
            db.attendance.getByDate(date)
        ]);
        setEmployees(emps.filter(e => e.status === 'active'));

        // Pre-fill attendance
        const attMap: { [key: string]: Attendance['status'] } = {};
        emps.forEach(e => {
            const record = atts.find(a => a.employeeId === e.id);
            attMap[e.id] = record ? record.status : 'present'; // Default to present
        });
        setAttendance(attMap);
    };

    const handleSave = async () => {
        setLoading(true);
        const promises = employees.map(emp => {
            const record: Attendance = {
                id: `${date}-${emp.id}`,
                employeeId: emp.id,
                date,
                status: attendance[emp.id] || 'present'
            };
            return db.attendance.add(record);
        });
        await Promise.all(promises);
        setLoading(false);
        alert('Attendance saved successfully!');
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Daily Attendance</h1>
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

            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Designation</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(emp => (
                            <tr key={emp.id}>
                                <td style={{ fontWeight: 500 }}>{emp.name}</td>
                                <td style={{ color: 'var(--color-text-muted)' }}>{emp.designation}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        {(['present', 'absent', 'half_day', 'leave'] as const).map(status => (
                                            <label key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name={`att-${emp.id}`}
                                                    checked={attendance[emp.id] === status}
                                                    onChange={() => setAttendance({ ...attendance, [emp.id]: status })}
                                                />
                                                <span style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
                                            </label>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
