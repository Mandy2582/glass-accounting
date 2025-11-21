'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { Employee } from '@/types';
import { Plus, User, Phone, Briefcase } from 'lucide-react';
import Modal from '@/components/Modal';

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Employee>>({
        name: '',
        designation: '',
        phone: '',
        basicSalary: 0,
        status: 'active'
    });

    useEffect(() => {
        loadEmployees();
    }, []);

    const loadEmployees = async () => {
        const data = await db.employees.getAll();
        setEmployees(data);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newEmployee: Employee = {
            id: Math.random().toString(36).substr(2, 9),
            name: formData.name!,
            designation: formData.designation!,
            phone: formData.phone!,
            joiningDate: new Date().toISOString().split('T')[0],
            basicSalary: Number(formData.basicSalary),
            status: 'active'
        };
        await db.employees.add(newEmployee);
        await loadEmployees();
        setIsModalOpen(false);
        setFormData({ name: '', designation: '', phone: '', basicSalary: 0, status: 'active' });
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Employees</h1>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} />
                    Add Employee
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {employees.map(emp => (
                    <div key={emp.id} className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <User size={24} />
                            </div>
                            <div>
                                <h3 style={{ fontWeight: 600 }}>{emp.name}</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{emp.designation}</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Phone size={16} style={{ opacity: 0.5 }} />
                                <span>{emp.phone}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Briefcase size={16} style={{ opacity: 0.5 }} />
                                <span>Joined: {new Date(emp.joiningDate).toLocaleDateString()}</span>
                            </div>
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>Basic Salary</span>
                                <span style={{ fontWeight: 600 }}>₹{emp.basicSalary.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Employee">
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Name</label>
                        <input required className="input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Designation</label>
                        <input required className="input" value={formData.designation} onChange={e => setFormData({ ...formData, designation: e.target.value })} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Phone</label>
                        <input required className="input" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Basic Salary (₹)</label>
                        <input type="number" required className="input" value={formData.basicSalary} onChange={e => setFormData({ ...formData, basicSalary: Number(e.target.value) })} />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>Save Employee</button>
                </form>
            </Modal>
        </div>
    );
}
