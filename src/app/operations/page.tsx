'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, CreditCard, PackageCheck, RefreshCw, Route, Search } from 'lucide-react';
import { db } from '@/lib/storage';
import { BankAccount, Employee, Order, OrderDelivery } from '@/types';
import {
    getOrderWorkSummary,
    getWorkStatusColor,
    getWorkStatusLabel,
    getWorkTypeLabel,
    OrderWorkAssignment,
    OrderWorkStatus,
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
    const [activeTask, setActiveTask] = useState<OperationTask | null>(null);

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

    const tasks = useMemo(() => {
        return orders
            .filter(order => order.type === 'sale_order' && order.status !== 'cancelled')
            .flatMap(order => getOrderWorkSummary(order).assignments.map(assignment => ({ order, assignment })))
            .filter(task => {
                if (statusFilter === 'open') {
                    return task.assignment.status !== 'completed' && task.assignment.status !== 'cancelled';
                }
                if (statusFilter !== 'all') return task.assignment.status === statusFilter;
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
            .sort((a, b) => {
                const dateA = new Date(a.assignment.scheduledDate || a.order.deliveryDate || a.order.date).getTime();
                const dateB = new Date(b.assignment.scheduledDate || b.order.deliveryDate || b.order.date).getTime();
                return dateA - dateB;
            });
    }, [orders, search, statusFilter]);

    async function updateAssignment(order: Order, assignmentId: string, patch: Partial<OrderWorkAssignment>) {
        const assignments = getOrderWorkSummary(order).assignments.map(assignment => (
            assignment.id === assignmentId ? { ...assignment, ...patch } : assignment
        ));
        const updatedOrder = {
            ...order,
            notes: setOrderWorkAssignments(order.notes, assignments),
        };
        await db.orders.update(updatedOrder);
        await loadData();
    }

    async function completeTask(input: {
        task: OperationTask;
        notes: string;
        paymentAmount: number;
        paymentMode: 'cash' | 'bank';
        bankAccountId?: string;
    }) {
        const { task } = input;
        let updatedOrder = task.order;

        if (task.assignment.type === 'transport') {
            updatedOrder = buildDeliveredOrder(task.order, input.notes);
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
                                                <button className="btn btn-primary" onClick={() => setActiveTask(task)} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}>
                                                    Complete
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

            {employees.length === 0 && !loading && (
                <div style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    Add active employees before assigning installation or transport work from an order.
                </div>
            )}
        </div>
    );
}

function buildDeliveredOrder(order: Order, notes: string): Order {
    const deliveryItems = order.items.map(item => {
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
            itemId: item.itemId,
            itemName: item.description || item.itemName,
            quantity: Math.max(0, (Number(item.quantity) || 0) - alreadyDelivered.quantity),
            sqft: Math.max(0, (Number(item.sqft) || 0) - alreadyDelivered.sqft),
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
        status: 'customer_delivered',
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
    onSubmit: (input: { task: OperationTask; notes: string; paymentAmount: number; paymentMode: 'cash' | 'bank'; bankAccountId?: string }) => void;
}) {
    const balanceDue = Math.max(0, roundCurrency(task.order.total - (task.order.paidAmount || 0)));
    const [notes, setNotes] = useState('');
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentMode, setPaymentMode] = useState<'cash' | 'bank'>('cash');
    const [bankAccountId, setBankAccountId] = useState('');

    const submit = () => {
        if (paymentAmount > balanceDue) {
            alert('Payment cannot exceed balance due.');
            return;
        }
        if (paymentMode === 'bank' && paymentAmount > 0 && !bankAccountId) {
            alert('Select bank account for bank payment.');
            return;
        }
        onSubmit({ task, notes, paymentAmount: roundCurrency(paymentAmount), paymentMode, bankAccountId });
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: '560px', padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {task.assignment.type === 'transport' ? <PackageCheck size={19} /> : <CheckCircle size={19} />}
                    Complete {getWorkTypeLabel(task.assignment.type)}
                </h2>
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ padding: '0.85rem', background: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <div style={{ fontWeight: 700 }}>{task.order.partyName}</div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Order {task.order.generalNumber || task.order.number} • Assigned to {task.assignment.assignedToName}</div>
                    </div>
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
