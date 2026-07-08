import { Order } from '@/types';

export type OrderWorkType = 'transport' | 'installation';
export type OrderWorkStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface OrderWorkAssignment {
    id: string;
    type: OrderWorkType;
    assignedToId: string;
    assignedToName: string;
    scheduledDate: string;
    status: OrderWorkStatus;
    notes?: string;
    createdAt: string;
    completedAt?: string;
    completionNotes?: string;
    paymentRecordedAmount?: number;
    paymentMode?: 'cash' | 'bank';
}

const markerStart = '[ORDER_WORK_ASSIGNMENTS:';
const markerRegex = /\n?\[ORDER_WORK_ASSIGNMENTS:([\s\S]*?)\]/;

export function parseOrderWorkAssignments(notes?: string): OrderWorkAssignment[] {
    const match = notes?.match(markerRegex);
    if (!match?.[1]) return [];

    try {
        const parsed = JSON.parse(match[1]);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isValidAssignment);
    } catch {
        return [];
    }
}

export function setOrderWorkAssignments(notes: string | undefined, assignments: OrderWorkAssignment[]): string {
    const cleanNotes = (notes || '').replace(markerRegex, '').trim();
    const marker = `${markerStart}${JSON.stringify(assignments)}]`;
    return [cleanNotes, marker].filter(Boolean).join('\n');
}

export function getOrderWorkSummary(order: Order) {
    const assignments = parseOrderWorkAssignments(order.notes);
    const open = assignments.filter(task => task.status !== 'completed' && task.status !== 'cancelled');
    const completed = assignments.filter(task => task.status === 'completed');

    return {
        assignments,
        open,
        completed,
        hasOpenTransport: open.some(task => task.type === 'transport'),
        hasOpenInstallation: open.some(task => task.type === 'installation'),
    };
}

export function getWorkTypeLabel(type: OrderWorkType): string {
    return type === 'transport' ? 'Transport' : 'Installation';
}

export function getWorkStatusLabel(status: OrderWorkStatus): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function getWorkStatusColor(status: OrderWorkStatus): string {
    if (status === 'completed') return '#047857';
    if (status === 'in_progress') return '#2563eb';
    if (status === 'cancelled') return '#64748b';
    return '#b45309';
}

function isValidAssignment(value: any): value is OrderWorkAssignment {
    return value
        && typeof value.id === 'string'
        && (value.type === 'transport' || value.type === 'installation')
        && typeof value.assignedToId === 'string'
        && typeof value.assignedToName === 'string'
        && typeof value.scheduledDate === 'string'
        && ['pending', 'in_progress', 'completed', 'cancelled'].includes(value.status);
}
