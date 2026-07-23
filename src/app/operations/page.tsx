'use client';

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, CreditCard, IndianRupee, PackageCheck, RefreshCw, Route, Search } from 'lucide-react';
import { db } from '@/lib/storage';
import { BankAccount, Employee, InvoiceItem, Order, OrderDelivery } from '@/types';
import {
    getOrderWorkSummary,
    getWorkStatusColor,
    getWorkStatusLabel,
    getWorkTypeLabel,
    OrderWorkAssignment,
    OrderWorkStatus,
    OrderWorkType,
    setOrderWorkAssignments,
} from '@/lib/orderWork';
import { formatIndianCurrency, roundCurrency } from '@/lib/utils';

type OperationTask = {
    order: Order;
    assignment: OrderWorkAssignment;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function OperationsPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'open' | OrderWorkStatus | 'all'>('open');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'overdue'>('all');
    const [activeTask, setActiveTask] = useState<OperationTask | null>(null);
    const [assignTarget, setAssignTarget] = useState<{ order: Order; type: OrderWorkType } | null>(null);

    useEffect(() => {
        void loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [ordersData, employeesData, accountsData] = await Promise.all([
            db.orders.getAll(),
            db.employees.getAll(),
            db.bankAccounts.getAll(),
        ]);
        setOrders(ordersData);
        setEmployees(employeesData.filter(employee => employee.status === 'active'));
        setBankAccounts(accountsData);
        setLoading(false);
    }

    const allOperationTasks = useMemo(() => {
        return orders
            .filter(order => order.type === 'sale_order' && order.status !== 'cancelled')
            .flatMap(order => getOrderWorkSummary(order).assignments.map(assignment => ({ order, assignment })))
            .sort((a, b) => {
                const dateA = new Date(a.assignment.scheduledDate || a.order.deliveryDate || a.order.date).getTime();
                const dateB = new Date(b.assignment.scheduledDate || b.order.deliveryDate || b.order.date).getTime();
                return dateA - dateB;
            });
    }, [orders]);

    const tasks = useMemo(() => {
        return allOperationTasks
            .filter(task => {
                if (statusFilter === 'open') {
                    return task.assignment.status !== 'completed' && task.assignment.status !== 'cancelled';
                }
                if (statusFilter !== 'all') return task.assignment.status === statusFilter;
                return true;
            })
            .filter(task => {
                const todayKey = today();
                if (dateFilter === 'today') return task.assignment.scheduledDate === todayKey;
                if (dateFilter === 'overdue') return !!task.assignment.scheduledDate && task.assignment.scheduledDate < todayKey;
                return true;
            })
            .filter(task => {
                const needle = search.trim().toLowerCase();
                if (!needle) return true;
                return [
                    task.order.number,
                    task.order.generalNumber,
                    task.order.partyName,
                    task.assignment.assignedToName,
                    task.assignment.type,
                ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
            })
    }, [allOperationTasks, dateFilter, search, statusFilter]);

    const unassignedOrders = useMemo(() => {
        return orders
            .filter(order => (
                order.type === 'sale_order'
                // Exclude still-pending quotes -- nothing to dispatch until the
                // order is priced/confirmed. Online-shop checkouts skip 'pending'
                // and land on 'approved' immediately, so they show up right away.
                && !['pending', 'completed', 'cancelled'].includes(order.status)
                && (order.items || []).length > 0
            ))
            .map(order => {
                const summary = getOrderWorkSummary(order);
                // Once an order is already delivered/completed, stop asking for
                // transport/installation even if no assignment was ever recorded --
                // otherwise an order delivered outside Operations (e.g. via the
                // order page's own delivery modal) stays "Unassigned" forever.
                const alreadyHandled = ['customer_delivered', 'completed'].includes(order.status);
                // A completed transport task no longer guarantees full delivery --
                // partial trips leave some quantity outstanding, so check actual
                // remaining quantity/sqft rather than "a completed task exists".
                const hasRemainingToDeliver = order.items.some(item => {
                    const remaining = getRemainingCustomerDelivery(order, item);
                    return remaining.remainingQuantity > 0 || remaining.remainingSqft > 0;
                });
                return {
                    order,
                    needsTransport: !alreadyHandled && !summary.hasOpenTransport && hasRemainingToDeliver,
                    needsInstallation: !alreadyHandled && !summary.hasOpenInstallation && shouldSuggestInstallation(order),
                };
            })
            .filter(entry => entry.needsTransport || entry.needsInstallation)
            .filter(entry => {
                const needle = search.trim().toLowerCase();
                if (!needle) return true;
                return [
                    entry.order.number,
                    entry.order.generalNumber,
                    entry.order.partyName,
                    entry.order.status,
                ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
            })
            .sort((a, b) => new Date(a.order.deliveryDate || a.order.date).getTime() - new Date(b.order.deliveryDate || b.order.date).getTime());
    }, [orders, search]);

    const summary = useMemo(() => {
        const todayKey = today();
        const openTasks = allOperationTasks.filter(task => task.assignment.status !== 'completed' && task.assignment.status !== 'cancelled');
        const dueToday = openTasks.filter(task => task.assignment.scheduledDate === todayKey);
        const overdue = openTasks.filter(task => task.assignment.scheduledDate && task.assignment.scheduledDate < todayKey);
        // Dedupe by order before summing balances -- an order with both an
        // open transport and installation task would otherwise count its
        // balance due twice.
        const ordersWithOpenWork = new Map(openTasks.map(task => [task.order.id, task.order]));
        const pendingCollection = Array.from(ordersWithOpenWork.values()).reduce((sum, order) => (
            sum + Math.max(0, roundCurrency(order.total - (order.paidAmount || 0)))
        ), 0);
        const completedToday = allOperationTasks.filter(task => task.assignment.completedAt === todayKey);

        return {
            openTasks: openTasks.length,
            dueToday: dueToday.length,
            overdue: overdue.length,
            unassigned: unassignedOrders.length,
            pendingCollection,
            completedToday: completedToday.length,
        };
    }, [allOperationTasks, unassignedOrders.length]);

    async function updateAssignment(order: Order, assignmentId: string, patch: Partial<OrderWorkAssignment>) {
        try {
            const assignments = getOrderWorkSummary(order).assignments.map(assignment => (
                assignment.id === assignmentId ? { ...assignment, ...patch } : assignment
            ));
            const updatedOrder = {
                ...order,
                notes: setOrderWorkAssignments(order.notes, assignments),
            };
            await db.orders.update(updatedOrder);
            await loadData();
        } catch (error) {
            console.error('Failed to update assignment:', error);
            alert('Failed to update this work item. Please try again.');
        }
    }

    async function cancelAssignment(order: Order, assignmentId: string) {
        if (!confirm('Cancel this work assignment? This cannot be undone.')) return;
        await updateAssignment(order, assignmentId, { status: 'cancelled' });
    }

    async function assignWork(input: {
        order: Order;
        type: OrderWorkType;
        employeeId: string;
        scheduledDate: string;
        notes: string;
    }) {
        const employee = employees.find(entry => entry.id === input.employeeId);
        if (!employee) {
            alert('Select an active employee.');
            return;
        }

        try {
            const assignments = getOrderWorkSummary(input.order).assignments;
            const assignment: OrderWorkAssignment = {
                id: crypto.randomUUID(),
                type: input.type,
                assignedToId: employee.id,
                assignedToName: employee.name,
                scheduledDate: input.scheduledDate,
                status: 'pending',
                notes: input.notes,
                createdAt: new Date().toISOString(),
            };

            await db.orders.update({
                ...input.order,
                notes: setOrderWorkAssignments(input.order.notes, [...assignments, assignment]),
            });
            setAssignTarget(null);
            await loadData();
        } catch (error) {
            console.error('Failed to assign work:', error);
            alert('Failed to assign this work. Please try again.');
        }
    }

    async function completeTask(input: {
        task: OperationTask;
        notes: string;
        paymentAmount: number;
        paymentMode: 'cash' | 'bank';
        bankAccountId?: string;
        deliveryQuantities?: Record<string, number>;
    }) {
        const { task } = input;
        let updatedOrder = task.order;

        try {
            if (task.assignment.type === 'transport') {
                updatedOrder = buildDeliveredOrder(task.order, input.notes, input.deliveryQuantities);
                await db.orders.update(updatedOrder);
            }

            const paymentAmount = roundCurrency(input.paymentAmount);
            if (paymentAmount > 0) {
                await db.orders.recordPayment(task.order.id, {
                    amount: paymentAmount,
                    mode: input.paymentMode,
                    bankAccountId: input.paymentMode === 'bank' ? input.bankAccountId : undefined,
                    date: today(),
                    notes: `${getWorkTypeLabel(task.assignment.type)} completion by ${task.assignment.assignedToName}. ${input.notes}`.trim(),
                });
            }

            const assignments = getOrderWorkSummary(updatedOrder).assignments.map(assignment => (
                assignment.id === task.assignment.id
                    ? {
                        ...assignment,
                        status: 'completed' as const,
                        completedAt: today(),
                        completionNotes: input.notes,
                        paymentRecordedAmount: paymentAmount || assignment.paymentRecordedAmount,
                        paymentMode: paymentAmount > 0 ? input.paymentMode : assignment.paymentMode,
                    }
                    : assignment
            ));

            await db.orders.update({
                ...updatedOrder,
                notes: setOrderWorkAssignments(updatedOrder.notes, assignments),
            });

            setActiveTask(null);
            await loadData();
        } catch (error) {
            console.error('Failed to complete work item:', error);
            alert('Failed to save this completion. Please check and try again.');
        }
    }

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Route size={22} />
                        Operations
                    </h1>
                </div>
                <button className="btn" onClick={loadData} disabled={loading} style={{ background: 'white', border: '1px solid var(--color-border)' }}>
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                <OperationMetricCard
                    icon={<Route size={18} />}
                    label="Open Work"
                    value={summary.openTasks}
                    tone="#2563eb"
                    onClick={() => {
                        setStatusFilter('open');
                        setDateFilter('all');
                    }}
                />
                <OperationMetricCard
                    icon={<CheckCircle size={18} />}
                    label="Due Today"
                    value={summary.dueToday}
                    tone="#0f766e"
                    onClick={() => {
                        setStatusFilter('open');
                        setDateFilter('today');
                        setSearch('');
                    }}
                />
                <OperationMetricCard
                    icon={<AlertTriangle size={18} />}
                    label="Overdue"
                    value={summary.overdue}
                    tone="#dc2626"
                    onClick={() => {
                        setStatusFilter('open');
                        setDateFilter('overdue');
                    }}
                />
                <OperationMetricCard
                    icon={<PackageCheck size={18} />}
                    label="Unassigned"
                    value={summary.unassigned}
                    tone="#b45309"
                />
                <OperationMetricCard
                    icon={<IndianRupee size={18} />}
                    label="Pending Collection"
                    value={formatIndianCurrency(summary.pendingCollection)}
                    tone="#7c3aed"
                />
                <OperationMetricCard
                    icon={<CheckCircle size={18} />}
                    label="Completed Today"
                    value={summary.completedToday}
                    tone="#047857"
                    onClick={() => {
                        setStatusFilter('completed');
                        setDateFilter('today');
                    }}
                />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '280px' }}>
                    <Search size={17} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search work..." style={{ paddingLeft: '2.4rem' }} />
                </div>
                <select className="input" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} style={{ width: '180px' }}>
                    <option value="open">Open work</option>
                    <option value="all">All work</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <select className="input" value={dateFilter} onChange={event => setDateFilter(event.target.value as typeof dateFilter)} style={{ width: '160px' }}>
                    <option value="all">All dates</option>
                    <option value="today">Due today</option>
                    <option value="overdue">Overdue</option>
                </select>
            </div>

            <div className="card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Unassigned Orders</h2>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{unassignedOrders.length} waiting</span>
                </div>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading dispatch queue...</div>
                ) : unassignedOrders.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No unassigned order work found.</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th>Customer</th>
                                <th>Expected</th>
                                <th>Status</th>
                                <th>Needed</th>
                                <th>Assign</th>
                            </tr>
                        </thead>
                        <tbody>
                            {unassignedOrders.map(({ order, needsTransport, needsInstallation }) => (
                                <tr key={order.id}>
                                    <td>
                                        <Link href={`/orders/${order.id}`} style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                                            {order.generalNumber || order.number}
                                        </Link>
                                    </td>
                                    <td>{order.partyName}</td>
                                    <td>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : '-'}</td>
                                    <td>{order.status.replace(/_/g, ' ')}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                            {needsTransport && <WorkNeedLabel label="Transport" />}
                                            {needsInstallation && <WorkNeedLabel label="Installation" />}
                                        </div>
                                    </td>
                                    <td>
                                        {needsTransport && (
                                            <button className="btn" onClick={() => setAssignTarget({ order, type: 'transport' })} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', marginRight: '0.35rem' }}>
                                                Assign Transport
                                            </button>
                                        )}
                                        {needsInstallation && (
                                            <button className="btn btn-primary" onClick={() => setAssignTarget({ order, type: 'installation' })} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}>
                                                Assign Installation
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading operations...</div>
                ) : tasks.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No assigned work found.</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Work</th>
                                <th>Order</th>
                                <th>Customer</th>
                                <th>Assigned To</th>
                                <th>Scheduled</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => {
                                const balanceDue = Math.max(0, roundCurrency(task.order.total - (task.order.paidAmount || 0)));
                                return (
                                    <tr key={`${task.order.id}-${task.assignment.id}`}>
                                        <td style={{ fontWeight: 700 }}>{getWorkTypeLabel(task.assignment.type)}</td>
                                        <td>
                                            <Link href={`/orders/${task.order.id}`} style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                                                {task.order.generalNumber || task.order.number}
                                            </Link>
                                        </td>
                                        <td>{task.order.partyName}</td>
                                        <td>{task.assignment.assignedToName}</td>
                                        <td>{task.assignment.scheduledDate ? new Date(task.assignment.scheduledDate).toLocaleDateString() : '-'}</td>
                                        <td>
                                            <span style={{ padding: '0.25rem 0.55rem', borderRadius: '999px', background: `${getWorkStatusColor(task.assignment.status)}18`, color: getWorkStatusColor(task.assignment.status), fontSize: '0.75rem', fontWeight: 700 }}>
                                                {getWorkStatusLabel(task.assignment.status)}
                                            </span>
                                        </td>
                                        <td>{balanceDue > 0 ? `${formatIndianCurrency(balanceDue)} due` : 'Paid'}</td>
                                        <td>
                                            {task.assignment.status === 'pending' && (
                                                <button className="btn" onClick={() => updateAssignment(task.order, task.assignment.id, { status: 'in_progress' })} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', marginRight: '0.35rem' }}>
                                                    Start
                                                </button>
                                            )}
                                            {task.assignment.status !== 'completed' && task.assignment.status !== 'cancelled' && (
                                                <button className="btn btn-primary" onClick={() => setActiveTask(task)} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', marginRight: '0.35rem' }}>
                                                    Complete
                                                </button>
                                            )}
                                            {task.assignment.status !== 'completed' && task.assignment.status !== 'cancelled' && (
                                                <button className="btn" onClick={() => cancelAssignment(task.order, task.assignment.id)} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', color: '#dc2626' }}>
                                                    Cancel
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {activeTask && (
                <CompleteWorkModal
                    task={activeTask}
                    bankAccounts={bankAccounts}
                    onClose={() => setActiveTask(null)}
                    onSubmit={completeTask}
                />
            )}

            {assignTarget && (
                <AssignOperationModal
                    order={assignTarget.order}
                    type={assignTarget.type}
                    employees={employees}
                    onClose={() => setAssignTarget(null)}
                    onSubmit={assignWork}
                />
            )}

            {employees.length === 0 && !loading && (
                <div style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    Add active employees before assigning installation or transport work from an order.
                </div>
            )}
        </div>
    );
}

function OperationMetricCard({
    icon,
    label,
    value,
    tone,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    tone: string;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="card"
            style={{
                border: '1px solid var(--color-border)',
                textAlign: 'left',
                cursor: onClick ? 'pointer' : 'default',
                padding: '1rem',
                background: 'var(--color-surface)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={{ color: tone, display: 'inline-flex' }}>{icon}</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: tone }}>{value}</span>
            </div>
            <div style={{ marginTop: '0.45rem', color: 'var(--color-text-muted)', fontSize: '0.78rem', fontWeight: 700 }}>
                {label}
            </div>
        </button>
    );
}

function shouldSuggestInstallation(order: Order): boolean {
    const notes = (order.notes || '').toLowerCase();
    if (notes.includes('installation: yes') || notes.includes('wants installation: yes')) return true;
    if (notes.includes('installation required') || notes.includes('requires installation')) return true;

    return (order.items || []).some(item => {
        const text = `${item.itemName || ''} ${item.description || ''} ${item.type || ''}`.toLowerCase();
        return ['shower', 'door', 'partition', 'railing', 'canopy', 'hardware', 'fitting'].some(term => text.includes(term));
    });
}

function WorkNeedLabel({ label }: { label: string }) {
    return (
        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'rgba(15,118,110,0.1)', color: '#0f766e', fontSize: '0.72rem', fontWeight: 700 }}>
            {label}
        </span>
    );
}

function AssignOperationModal({
    order,
    type,
    employees,
    onClose,
    onSubmit,
}: {
    order: Order;
    type: OrderWorkType;
    employees: Employee[];
    onClose: () => void;
    onSubmit: (input: { order: Order; type: OrderWorkType; employeeId: string; scheduledDate: string; notes: string }) => void;
}) {
    const [employeeId, setEmployeeId] = useState(employees[0]?.id || '');
    const [scheduledDate, setScheduledDate] = useState(order.deliveryDate || today());
    const [notes, setNotes] = useState('');

    const submit = () => {
        if (!employeeId) {
            alert('Select an active employee.');
            return;
        }
        onSubmit({ order, type, employeeId, scheduledDate, notes });
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>
                    Assign {getWorkTypeLabel(type)}
                </h2>
                <div style={{ padding: '0.85rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700 }}>{order.partyName}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Order {order.generalNumber || order.number}</div>
                </div>
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Assigned To</label>
                        <select className="input" value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
                            <option value="">Select employee</option>
                            {employees.map(employee => (
                                <option key={employee.id} value={employee.id}>{employee.name} - {employee.designation}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Scheduled Date</label>
                        <input className="input" type="date" value={scheduledDate} onChange={event => setScheduledDate(event.target.value)} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Notes</label>
                        <textarea className="input" rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Address, timing, material, collection or site instruction" />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={submit}>Assign</button>
                </div>
            </div>
        </div>
    );
}

function getRemainingCustomerDelivery(order: Order, item: InvoiceItem) {
    const orderItemId = item.id || item.designPieceId || item.itemId || item.itemName;
    const alreadyDelivered = (order.deliveries || [])
        .filter(delivery => delivery.type === 'customer')
        .flatMap(delivery => delivery.items || [])
        .filter(deliveredItem => (deliveredItem.orderItemId || deliveredItem.itemId || deliveredItem.itemName) === orderItemId)
        .reduce((total, deliveredItem) => ({
            quantity: total.quantity + (Number(deliveredItem.quantity) || 0),
            sqft: total.sqft + (Number(deliveredItem.sqft) || 0),
        }), { quantity: 0, sqft: 0 });

    return {
        orderItemId,
        remainingQuantity: Math.max(0, (Number(item.quantity) || 0) - alreadyDelivered.quantity),
        remainingSqft: Math.max(0, (Number(item.sqft) || 0) - alreadyDelivered.sqft),
    };
}

// deliveryQuantities maps orderItemId -> fraction (0-1) of the remaining
// quantity being delivered on this trip. Defaults to 1 (full remaining) for
// any item not present in the map, preserving old full-delivery behavior.
function buildDeliveredOrder(order: Order, notes: string, deliveryQuantities?: Record<string, number>): Order {
    let allFullyDelivered = true;

    const deliveryItems = order.items.map(item => {
        const { orderItemId, remainingQuantity, remainingSqft } = getRemainingCustomerDelivery(order, item);
        const fraction = deliveryQuantities && orderItemId in deliveryQuantities
            ? Math.min(1, Math.max(0, deliveryQuantities[orderItemId]))
            : 1;

        if (fraction < 1 && (remainingQuantity > 0 || remainingSqft > 0)) {
            allFullyDelivered = false;
        }

        return {
            orderItemId,
            itemId: item.itemId,
            itemName: item.description || item.itemName,
            quantity: roundCurrency(remainingQuantity * fraction),
            sqft: roundCurrency(remainingSqft * fraction),
        };
    }).filter(item => item.quantity > 0 || item.sqft > 0);

    if (deliveryItems.length === 0) return order;

    const delivery: OrderDelivery = {
        id: crypto.randomUUID(),
        date: today(),
        type: 'customer',
        items: deliveryItems,
        notes: notes || 'Recorded from Operations module.',
    };
    const deliveredToCustomer = deliveryItems.reduce((sum, item) => sum + item.sqft, Number(order.deliveredToCustomer || 0));

    return {
        ...order,
        deliveries: [...(order.deliveries || []), delivery],
        deliveredToCustomer,
        customerDeliveryDate: delivery.date,
        // Only flip to fully delivered once every item's remaining quantity has
        // actually gone out -- a partial trip keeps the order eligible for
        // another transport assignment for what's left.
        status: allFullyDelivered ? 'customer_delivered' : order.status,
    };
}

function CompleteWorkModal({
    task,
    bankAccounts,
    onClose,
    onSubmit,
}: {
    task: OperationTask;
    bankAccounts: BankAccount[];
    onClose: () => void;
    onSubmit: (input: { task: OperationTask; notes: string; paymentAmount: number; paymentMode: 'cash' | 'bank'; bankAccountId?: string; deliveryQuantities?: Record<string, number> }) => void;
}) {
    const balanceDue = Math.max(0, roundCurrency(task.order.total - (task.order.paidAmount || 0)));
    const [notes, setNotes] = useState('');
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentMode, setPaymentMode] = useState<'cash' | 'bank'>('cash');
    const [bankAccountId, setBankAccountId] = useState('');

    const remainingItems = useMemo(() => {
        if (task.assignment.type !== 'transport') return [];
        return task.order.items
            .map(item => ({ item, ...getRemainingCustomerDelivery(task.order, item) }))
            .filter(entry => entry.remainingQuantity > 0 || entry.remainingSqft > 0);
    }, [task]);

    const [quantities, setQuantities] = useState<Record<string, number>>(() => (
        Object.fromEntries(remainingItems.map(entry => [entry.orderItemId, entry.remainingQuantity]))
    ));

    const submit = () => {
        if (paymentAmount > balanceDue) {
            alert('Payment cannot exceed balance due.');
            return;
        }
        if (paymentMode === 'bank' && paymentAmount > 0 && !bankAccountId) {
            alert('Select bank account for bank payment.');
            return;
        }
        const deliveryQuantities = remainingItems.length > 0
            ? Object.fromEntries(remainingItems.map(entry => {
                const enteredQty = Math.max(0, Math.min(entry.remainingQuantity, Number(quantities[entry.orderItemId] ?? entry.remainingQuantity)));
                const fraction = entry.remainingQuantity > 0 ? enteredQty / entry.remainingQuantity : 1;
                return [entry.orderItemId, fraction];
            }))
            : undefined;
        onSubmit({ task, notes, paymentAmount: roundCurrency(paymentAmount), paymentMode, bankAccountId, deliveryQuantities });
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {task.assignment.type === 'transport' ? <PackageCheck size={19} /> : <CheckCircle size={19} />}
                    Complete {getWorkTypeLabel(task.assignment.type)}
                </h2>
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ padding: '0.85rem', background: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <div style={{ fontWeight: 700 }}>{task.order.partyName}</div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Order {task.order.generalNumber || task.order.number} • Assigned to {task.assignment.assignedToName}</div>
                    </div>
                    {remainingItems.length > 0 && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Quantity Delivered This Trip</label>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {remainingItems.map(entry => (
                                    <div key={entry.orderItemId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ flex: 1, fontSize: '0.82rem' }}>{entry.item.description || entry.item.itemName}</span>
                                        <input
                                            className="input"
                                            type="number"
                                            min="0"
                                            max={entry.remainingQuantity}
                                            step="0.01"
                                            value={quantities[entry.orderItemId] ?? entry.remainingQuantity}
                                            onChange={event => setQuantities(prev => ({ ...prev, [entry.orderItemId]: Number(event.target.value) }))}
                                            style={{ width: '110px' }}
                                        />
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>of {entry.remainingQuantity} left</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Completion Notes</label>
                        <textarea className="input" rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Delivery/installation remarks" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Payment Collected</label>
                            <input className="input money-input" type="number" min="0" max={balanceDue} step="0.01" value={paymentAmount} onChange={event => setPaymentAmount(Number(event.target.value))} />
                            <div style={{ marginTop: '0.25rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{formatIndianCurrency(balanceDue)} balance</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Mode</label>
                            <select className="input" value={paymentMode} onChange={event => setPaymentMode(event.target.value as 'cash' | 'bank')}>
                                <option value="cash">Cash</option>
                                <option value="bank">Bank</option>
                            </select>
                        </div>
                    </div>
                    {paymentMode === 'bank' && paymentAmount > 0 && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem' }}>Bank Account</label>
                            <select className="input" value={bankAccountId} onChange={event => setBankAccountId(event.target.value)}>
                                <option value="">Select account</option>
                                {bankAccounts.map(account => (
                                    <option key={account.id} value={account.id}>{account.name} - {account.accountNumber}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={submit}>
                        <CreditCard size={16} />
                        Save Completion
                    </button>
                </div>
            </div>
        </div>
    );
}
