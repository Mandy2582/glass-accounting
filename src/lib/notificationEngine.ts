import { db, designsDb } from './storage';
import { AppNotification, CustomDesign, Invoice, Order, Party, Voucher } from '@/types';
import { getOrderWorkSummary, getWorkTypeLabel } from './orderWork';
import { getOrderSource, needsApproval } from './orderNotes';

/**
 * Evaluate all business rules and generate actionable alerts & insights
 */
export async function evaluateNotifications(): Promise<AppNotification[]> {
    const notifications: AppNotification[] = [];
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    try {
        const [parties, invoices, vouchers, orders, lowStockItems] = await Promise.all([
            db.parties.getAll(),
            db.invoices.getAll(),
            db.vouchers.getAll(),
            db.orders.getAll(),
            db.reports.getLowStockItems()
        ]);

        const customers = parties.filter(p => p.type === 'customer');

        // 1. Pending Orders Check
        const todayKey = now.toISOString().slice(0, 10);
        orders.forEach(order => {
            const workSummary = getOrderWorkSummary(order);

            workSummary.open.forEach(task => {
                const scheduledDate = new Date(task.scheduledDate);
                const daysLate = Math.floor((now.getTime() - scheduledDate.getTime()) / oneDayMs);
                const isDueToday = scheduledDate.toISOString().slice(0, 10) === todayKey;
                if (daysLate >= 1 || isDueToday) {
                    notifications.push({
                        id: `operation-${order.id}-${task.id}`,
                        title: daysLate >= 1 ? `${getWorkTypeLabel(task.type)} Overdue` : `${getWorkTypeLabel(task.type)} Due Today`,
                        message: `${task.assignedToName} has ${getWorkTypeLabel(task.type).toLowerCase()} work for order #${order.number} (${order.partyName})${daysLate >= 1 ? ` overdue by ${daysLate} day${daysLate === 1 ? '' : 's'}` : ' scheduled today'}.`,
                        type: 'operation',
                        severity: daysLate >= 1 ? 'error' : 'warning',
                        timestamp: task.scheduledDate,
                        read: false,
                        link: '/operations',
                        actionLabel: 'Open Operations',
                        secondaryLink: `/orders/${order.id}`,
                        secondaryActionLabel: 'View Order',
                        details: [
                            { label: 'Work', value: getWorkTypeLabel(task.type) },
                            { label: 'Assigned To', value: task.assignedToName },
                            { label: 'Scheduled', value: task.scheduledDate },
                            { label: 'Customer', value: order.partyName },
                            { label: 'Order', value: order.generalNumber || order.number },
                            { label: 'Notes', value: task.notes || '-' },
                        ].filter(detail => detail.value && detail.value !== '-')
                    });
                } else if (task.status === 'pending') {
                    // Newly assigned work that isn't due/overdue yet -- a quiet
                    // heads-up so staff see it was booked, not just when it's late.
                    notifications.push({
                        id: `work-assigned-${order.id}-${task.id}`,
                        title: `${getWorkTypeLabel(task.type)} Assigned`,
                        message: `${task.assignedToName} was assigned ${getWorkTypeLabel(task.type).toLowerCase()} for order #${order.number} (${order.partyName}), scheduled ${task.scheduledDate}.`,
                        type: 'operation',
                        severity: 'info',
                        timestamp: task.createdAt,
                        read: false,
                        link: '/operations',
                        actionLabel: 'Open Operations',
                        secondaryLink: `/orders/${order.id}`,
                        secondaryActionLabel: 'View Order',
                        details: [
                            { label: 'Work', value: getWorkTypeLabel(task.type) },
                            { label: 'Assigned To', value: task.assignedToName },
                            { label: 'Scheduled', value: task.scheduledDate },
                            { label: 'Customer', value: order.partyName },
                            { label: 'Order', value: order.generalNumber || order.number },
                        ].filter(detail => detail.value && detail.value !== '-')
                    });
                }
            });

            workSummary.completed.forEach(task => {
                if (task.completedAt !== todayKey) return;
                notifications.push({
                    id: `work-completed-${order.id}-${task.id}`,
                    title: `${getWorkTypeLabel(task.type)} Completed`,
                    message: `${task.assignedToName} completed ${getWorkTypeLabel(task.type).toLowerCase()} for order #${order.number} (${order.partyName}).${task.paymentRecordedAmount ? ` Collected ₹${Number(task.paymentRecordedAmount).toLocaleString('en-IN')}.` : ''}`,
                    type: 'operation',
                    severity: 'info',
                    timestamp: task.completedAt,
                    read: false,
                    link: '/operations',
                    actionLabel: 'Open Operations',
                    secondaryLink: `/orders/${order.id}`,
                    secondaryActionLabel: 'View Order',
                    details: [
                        { label: 'Work', value: getWorkTypeLabel(task.type) },
                        { label: 'Completed By', value: task.assignedToName },
                        { label: 'Customer', value: order.partyName },
                        { label: 'Order', value: order.generalNumber || order.number },
                        { label: 'Payment Collected', value: task.paymentRecordedAmount ? `₹${Number(task.paymentRecordedAmount).toLocaleString('en-IN')}` : '-' },
                        { label: 'Notes', value: task.completionNotes || '-' },
                    ].filter(detail => detail.value && detail.value !== '-')
                });
            });

            const orderNeedsApproval = needsApproval(order.notes);
            if (orderNeedsApproval) {
                const intake = getOrderApprovalDetails(order);
                const sourceLabel = intake.source === 'whatsapp' ? 'WhatsApp' : intake.source === 'email' ? 'Email' : 'Online';
                notifications.push({
                    id: `order-approval-${order.id}`,
                    title: intake.hasItems ? `New ${sourceLabel} Order Ready to Review` : `New ${sourceLabel} Order Needs Item Review`,
                    message: intake.hasItems
                        ? `${intake.from || order.partyName} sent an order via ${sourceLabel}. ${order.items.length} item${order.items.length === 1 ? '' : 's'} were filled automatically. Approve to add it to Orders, or reject to discard.`
                        : `${intake.from || order.partyName} sent an order via ${sourceLabel}, but items need staff review. Approve to add it to Orders, or reject to discard.`,
                    type: 'order_approval',
                    severity: intake.hasItems ? 'warning' : 'error',
                    timestamp: order.date,
                    read: false,
                    orderId: order.id,
                    link: '/notifications',
                    secondaryLink: `/orders/${order.id}/edit`,
                    secondaryActionLabel: 'Review & Edit First',
                    details: [
                        { label: 'Customer', value: order.partyName },
                        { label: 'Order', value: order.number },
                        { label: 'General No.', value: String(order.generalNumber || '-') },
                        { label: 'Source', value: sourceLabel },
                        { label: 'From', value: intake.from || '-' },
                        { label: 'Subject', value: intake.subject || '-' },
                        { label: 'Items Filled', value: `${order.items.length}` },
                        { label: 'Total', value: `₹${Number(order.total || 0).toLocaleString('en-IN')}` },
                        { label: 'Message', value: intake.originalMessage || '-' },
                        { label: 'Parsed Rows', value: intake.parsedRows || '-' },
                    ].filter(detail => detail.value && detail.value !== '-')
                });
            }

            if (order.status !== 'completed' && order.status !== 'cancelled') {
                const orderDate = new Date(order.date);
                const daysPending = (now.getTime() - orderDate.getTime()) / oneDayMs;
                const orderNotes = order.notes || '';
                const isOnlineOrder = orderNotes.includes('Online shop order') || orderNotes.includes('Source: Online shop');
                const isOnlineRequest = orderNotes.includes('Online bulk/project quote request')
                    || orderNotes.includes('Online custom glass quote request')
                    || orderNotes.includes('Online product enquiry')
                    || orderNotes.includes('Online estimate request')
                    || orderNotes.includes('Online instant estimate quote request')
                    || orderNotes.includes('Online site measurement request');

                // Any order that is not completed or cancelled is pending
                // (orders still awaiting approval get their own notification
                // above instead, and are hidden from Orders until approved).
                if (daysPending >= 0 && !orderNeedsApproval) {
                    const roundedDays = Math.round(daysPending);
                    notifications.push({
                        id: `pending-order-${order.id}`,
                        title: isOnlineOrder ? 'Online Customer Order' : isOnlineRequest ? 'Online Customer Request' : 'Pending Order Active',
                        message: `${isOnlineOrder ? 'New online order' : isOnlineRequest ? 'New online request' : 'Order'} #${order.number} for ${order.partyName} is active in stage '${order.status}'${roundedDays > 0 ? ` for ${roundedDays} days` : ''}.`,
                        type: 'pending_order',
                        severity: daysPending > 10 ? 'error' : 'warning',
                        timestamp: order.date,
                        read: false,
                        link: `/orders/${order.id}`
                    });
                }
            }

            if ((order.notes || '').includes('Customer support request') || (order.notes || '').includes('Cancellation request')) {
                const isCancelRequest = (order.notes || '').includes('Cancellation request');
                notifications.push({
                    id: `customer-request-${order.id}-${isCancelRequest ? 'cancel' : 'support'}`,
                    title: isCancelRequest ? 'Customer Requested Cancellation' : 'Customer Requested Support',
                    message: `${order.partyName} sent a ${isCancelRequest ? 'cancellation' : 'support'} request for order #${order.number}. Review order notes.`,
                    type: 'pending_order',
                    severity: 'warning',
                    timestamp: order.date,
                    read: false,
                    link: `/orders/${order.id}`
                });
            }

            if ((order.notes || '').includes('[Payment confirmation')) {
                notifications.push({
                    id: `payment-confirmation-${order.id}`,
                    title: 'Customer Submitted Payment Reference',
                    message: `${order.partyName} submitted a payment reference for order #${order.number}. Verify receipt before marking paid.`,
                    type: 'pending_order',
                    severity: 'warning',
                    timestamp: now.toISOString(),
                    read: false,
                    link: `/orders/${order.id}`
                });
            }
        });

        // 2. Pending Payments Check (Overdue Receivables/Payables)
        invoices.forEach(inv => {
            if (inv.status === 'unpaid' || inv.status === 'partially_paid') {
                const invDate = new Date(inv.date);
                const daysOverdue = (now.getTime() - invDate.getTime()) / oneDayMs;

                if (daysOverdue > 15) {
                    const balanceDue = inv.total - (inv.paidAmount || 0);
                    notifications.push({
                        id: `overdue-inv-${inv.id}`,
                        title: inv.type === 'sale' ? 'Overdue Sales Invoice' : 'Overdue Purchase Invoice',
                        message: `${inv.type === 'sale' ? 'Customer' : 'Supplier'} ${inv.partyName} has ₹${balanceDue.toLocaleString('en-IN')} pending on Invoice #${inv.number} for ${Math.round(daysOverdue)} days.`,
                        type: 'overdue_payment',
                        severity: daysOverdue > 30 ? 'error' : 'warning',
                        timestamp: inv.date,
                        read: false,
                        link: inv.type === 'sale' ? `/sales` : `/purchases`
                    });
                }
            }
        });

        // 3. Low Stock Alerts
        lowStockItems.forEach(item => {
            notifications.push({
                id: `low-stock-${item.id}`,
                title: 'Low Stock Alert',
                message: `Item '${item.name}' has low stock (${item.stock} ${item.unit} remaining, Min: ${item.min_stock || 0}).`,
                type: 'low_stock',
                severity: item.stock <= 0 ? 'error' : 'warning',
                timestamp: now.toISOString(),
                read: false,
                link: '/inventory'
            });
        });

        // 4. Customer Buying Patterns & Insights
        customers.forEach(customer => {
            const customerInvoices = invoices.filter(i => i.partyId === customer.id && i.type === 'sale');
            
            // Skip analysis if customer has never bought anything
            if (customerInvoices.length === 0) return;

            // Sort invoices chronologically
            customerInvoices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // A. Calculate average buying frequency in days
            let avgFrequencyDays = 30; // default assumption
            if (customerInvoices.length >= 2) {
                let totalGaps = 0;
                for (let i = 1; i < customerInvoices.length; i++) {
                    const d1 = new Date(customerInvoices[i - 1].date);
                    const d2 = new Date(customerInvoices[i].date);
                    totalGaps += (d2.getTime() - d1.getTime()) / oneDayMs;
                }
                avgFrequencyDays = Math.max(7, totalGaps / (customerInvoices.length - 1));
            }

            // B. Days since last purchase
            const lastInvoice = customerInvoices[customerInvoices.length - 1];
            const lastInvoiceDate = new Date(lastInvoice.date);
            const daysSinceLastPurchase = (now.getTime() - lastInvoiceDate.getTime()) / oneDayMs;

            // C. Outstanding balance and aging (due amounts)
            const outstandingBalance = customer.balance; // Positive = Receivable
            
            // Calculate aging buckets
            let dues30Plus = 0;
            customerInvoices.forEach(inv => {
                if (inv.status === 'unpaid' || inv.status === 'partially_paid') {
                    const days = (now.getTime() - new Date(inv.date).getTime()) / oneDayMs;
                    if (days > 30) {
                        dues30Plus += (inv.total - (inv.paidAmount || 0));
                    }
                }
            });

            // D. Time of month buying trend (which week they buy the most)
            // Week 1: 1-7, Week 2: 8-14, Week 3: 15-21, Week 4: 22+
            const weekCounts = [0, 0, 0, 0];
            customerInvoices.forEach(inv => {
                const day = new Date(inv.date).getDate();
                if (day <= 7) weekCounts[0]++;
                else if (day <= 14) weekCounts[1]++;
                else if (day <= 21) weekCounts[2]++;
                else weekCounts[3]++;
            });

            const maxInvoices = Math.max(...weekCounts);
            const peakWeek = weekCounts.indexOf(maxInvoices) + 1;

            // E. Rule Checks & Notification Generation
            
            // Rule 1: Urge to Buy (Check-in)
            if (daysSinceLastPurchase > (avgFrequencyDays * 1.5) && daysSinceLastPurchase >= 30) {
                notifications.push({
                    id: `insight-urge-${customer.id}`,
                    title: 'Urge Customer to Purchase',
                    message: `${customer.name} hasn't placed an order in ${Math.round(daysSinceLastPurchase)} days (usual pattern: every ${Math.round(avgFrequencyDays)} days). Send check-in.`,
                    type: 'insight',
                    severity: 'info',
                    timestamp: now.toISOString(),
                    read: false,
                    link: `/parties/${customer.id}`
                });
            }

            // Rule 2: Payment follow-up & restricting orders (High Risk)
            if (outstandingBalance > 50000 && dues30Plus > 10000) {
                notifications.push({
                    id: `insight-restrict-${customer.id}`,
                    title: 'Risk Flag: Restrict Credit',
                    message: `${customer.name} has ₹${outstandingBalance.toLocaleString('en-IN')} outstanding, with ₹${dues30Plus.toLocaleString('en-IN')} overdue for 30+ days. Collect payment.`,
                    type: 'insight',
                    severity: 'error',
                    timestamp: now.toISOString(),
                    read: false,
                    link: `/parties/${customer.id}`
                });
            }

            // Rule 3: Sales Opportunity (Peak buying period prompt)
            const currentDay = now.getDate();
            let currentWeek = 4;
            if (currentDay <= 7) currentWeek = 1;
            else if (currentDay <= 14) currentWeek = 2;
            else if (currentDay <= 21) currentWeek = 3;

            if (currentWeek === peakWeek && daysSinceLastPurchase > 10) {
                notifications.push({
                    id: `insight-prompt-${customer.id}`,
                    title: 'Buying Pattern Sales Alert',
                    message: `${customer.name} usually makes purchases in Week ${peakWeek} of the month (which is this week!). Reach out.`,
                    type: 'insight',
                    severity: 'info',
                    timestamp: now.toISOString(),
                    read: false,
                    link: `/parties/${customer.id}`
                });
            }
        });

        // Sort notifications: errors first, then warnings, then info, then by date desc
        const severityWeight = { error: 3, warning: 2, info: 1 };
        notifications.sort((a, b) => {
            const weightA = severityWeight[a.severity] || 0;
            const weightB = severityWeight[b.severity] || 0;
            if (weightA !== weightB) return weightB - weightA;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

    } catch (error) {
        console.error('Error generating notifications:', error);
    }

    return notifications;
}

function getOrderApprovalDetails(order: Order): {
    source: 'whatsapp' | 'email' | 'online' | 'manual';
    from: string;
    subject: string;
    originalMessage: string;
    parsedRows: string;
    hasItems: boolean;
} {
    const notes = order.notes || '';
    const source = getOrderSource(notes);

    return {
        source,
        from: getNoteLine(notes, source === 'whatsapp' ? 'WhatsApp From' : 'Email From'),
        subject: getNoteLine(notes, 'Subject'),
        originalMessage: getNoteBlock(notes, 'Original message:', 'Parsed rows:') || getNoteBlock(notes, 'Caption:', 'Extracted text:') || getNoteBlock(notes, 'Extracted text:', 'Drawing notes:'),
        parsedRows: getNoteBlock(notes, 'Parsed rows:'),
        hasItems: order.items.length > 0,
    };
}

function getNoteLine(notes: string, label: string): string {
    const line = notes.split('\n').find(entry => entry.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    return line ? line.slice(line.indexOf(':') + 1).trim() : '';
}

function getNoteBlock(notes: string, label: string, untilLabel?: string): string {
    const start = notes.indexOf(label);
    if (start < 0) return '';

    const contentStart = start + label.length;
    const end = untilLabel ? notes.indexOf(untilLabel, contentStart) : -1;
    return notes
        .slice(contentStart, end >= 0 ? end : undefined)
        .trim()
        .slice(0, 900);
}

/**
 * Perform detailed buying analytics on all customers
 */
export async function getCustomerAnalytics() {
    const parties = await db.parties.getAll();
    const invoices = await db.invoices.getAll();
    const vouchers = await db.vouchers.getAll();
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const customers = parties.filter(p => p.type === 'customer');

    return customers.map(customer => {
        const customerInvoices = invoices.filter(i => i.partyId === customer.id && i.type === 'sale');
        const customerReceipts = vouchers.filter(v => v.partyId === customer.id && v.type === 'receipt');

        // Total sales volume & items
        let totalSalesVal = 0;
        const itemQuantityMap: Record<string, { qty: number; unit: string; totalArea: number }> = {};
        
        customerInvoices.forEach(inv => {
            totalSalesVal += inv.total;
            inv.items.forEach(item => {
                const key = `${item.itemName} (${item.type || 'Glass'})`;
                if (!itemQuantityMap[key]) {
                    itemQuantityMap[key] = { qty: 0, unit: item.unit, totalArea: 0 };
                }
                itemQuantityMap[key].qty += item.quantity;
                itemQuantityMap[key].totalArea += item.sqft || 0;
            });
        });

        // Top bought item
        let topBoughtItem = 'N/A';
        let topBoughtQty = 0;
        let topBoughtArea = 0;
        Object.entries(itemQuantityMap).forEach(([name, data]) => {
            if (data.totalArea > topBoughtArea || (data.totalArea === 0 && data.qty > topBoughtQty)) {
                topBoughtItem = name;
                topBoughtQty = data.qty;
                topBoughtArea = data.totalArea;
            }
        });

        // Frequency & Gap
        let avgFrequencyDays = 30;
        let lastPurchaseDateStr = 'N/A';
        let daysSinceLastPurchase = 999;
        
        if (customerInvoices.length > 0) {
            customerInvoices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            if (customerInvoices.length >= 2) {
                let totalGaps = 0;
                for (let i = 1; i < customerInvoices.length; i++) {
                    const d1 = new Date(customerInvoices[i - 1].date);
                    const d2 = new Date(customerInvoices[i].date);
                    totalGaps += (d2.getTime() - d1.getTime()) / oneDayMs;
                }
                avgFrequencyDays = totalGaps / (customerInvoices.length - 1);
            }
            
            const lastInvoice = customerInvoices[customerInvoices.length - 1];
            lastPurchaseDateStr = new Date(lastInvoice.date).toLocaleDateString('en-IN');
            daysSinceLastPurchase = (now.getTime() - new Date(lastInvoice.date).getTime()) / oneDayMs;
        }

        // Time of month: Week 1, 2, 3, 4 distribution
        const weekDistribution = [0, 0, 0, 0];
        customerInvoices.forEach(inv => {
            const day = new Date(inv.date).getDate();
            if (day <= 7) weekDistribution[0]++;
            else if (day <= 14) weekDistribution[1]++;
            else if (day <= 21) weekDistribution[2]++;
            else weekDistribution[3]++;
        });

        const totalOrders = customerInvoices.length;
        const weekPercentages = weekDistribution.map(cnt => totalOrders > 0 ? Math.round((cnt / totalOrders) * 100) : 0);

        // Find peak week
        const maxPct = Math.max(...weekPercentages);
        const peakWeek = totalOrders > 0 ? (weekPercentages.indexOf(maxPct) + 1) : 0;

        // Payment delay calculation (standard DSO = Outstanding Balance * 365 / Total Sales)
        // Or if total sales is 0, delay is 0.
        const balance = customer.balance; // Positive is receivable
        const dso = totalSalesVal > 0 ? Math.max(0, (balance * 365) / totalSalesVal) : 0;

        // Calculate aging buckets
        let age0to15 = 0;
        let age16to30 = 0;
        let age31to45 = 0;
        let age45Plus = 0;

        customerInvoices.forEach(inv => {
            if (inv.status === 'unpaid' || inv.status === 'partially_paid') {
                const due = inv.total - (inv.paidAmount || 0);
                const ageDays = (now.getTime() - new Date(inv.date).getTime()) / oneDayMs;

                if (ageDays <= 15) age0to15 += due;
                else if (ageDays <= 30) age16to30 += due;
                else if (ageDays <= 45) age31to45 += due;
                else age45Plus += due;
            }
        });

        // Determine action advice
        let recommendation = 'No action required';
        let recommendationType: 'neutral' | 'urge' | 'risk' = 'neutral';

        if (balance > 50000 && age45Plus > 0) {
            recommendation = 'RESTRICT CREDIT: High outstanding dues older than 45 days. Collect payments immediately.';
            recommendationType = 'risk';
        } else if (balance > 50000 && age31to45 > 0) {
            recommendation = 'FOLLOW UP PAYMENT: Dues aging past 30 days. Send payment reminders.';
            recommendationType = 'risk';
        } else if (daysSinceLastPurchase > (avgFrequencyDays * 1.5) && daysSinceLastPurchase >= 30) {
            recommendation = `URGE ORDER: Has not ordered in ${Math.round(daysSinceLastPurchase)} days (usually orders every ${Math.round(avgFrequencyDays)} days). Contact them.`;
            recommendationType = 'urge';
        } else if (totalOrders > 0) {
            recommendation = `KEEP ENGAGED: Next peak order period is expected in Week ${peakWeek} of the month.`;
            recommendationType = 'neutral';
        }

        return {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            totalSales: totalSalesVal,
            orderCount: totalOrders,
            topItem: topBoughtItem,
            topItemArea: topBoughtArea,
            topItemQty: topBoughtQty,
            frequencyDays: avgFrequencyDays,
            daysSinceLast: daysSinceLastPurchase,
            lastPurchaseDate: lastPurchaseDateStr,
            outstandingBalance: balance,
            dsoDays: dso,
            weekPattern: weekPercentages,
            peakWeek,
            aging: {
                '0_15': age0to15,
                '16_30': age16to30,
                '31_45': age31to45,
                '45_plus': age45Plus
            },
            recommendation,
            recommendationType,
            purchaseHistory: [...customerInvoices].reverse().map(inv => ({
                id: inv.id,
                number: inv.number,
                date: new Date(inv.date).toLocaleDateString('en-IN'),
                total: inv.total,
                status: inv.status,
                items: inv.items.map(it => `${it.itemName} (${it.quantity} ${it.unit})`).join(', ')
            }))
        };
    });
}

/**
 * Seed mock analytics and notification data for testing
 */
export async function seedAnalyticsTestData(): Promise<void> {
    const { supabase } = await import('./supabase');
    const custActiveId = crypto.randomUUID();
    const custUrgeId = crypto.randomUUID();
    const custRiskId = crypto.randomUUID();
    const itemId = crypto.randomUUID();

    // 1. Insert Parties (Customers)
    const parties = [
        {
            id: custActiveId,
            name: 'Test Customer 1 (Active)',
            type: 'customer',
            phone: '9999911111',
            address: '123 active lane, Delhi',
            balance: 0
        },
        {
            id: custUrgeId,
            name: 'Test Customer 2 (Urge check-in)',
            type: 'customer',
            phone: '9999922222',
            address: '456 passive avenue, Mumbai',
            balance: 0
        },
        {
            id: custRiskId,
            name: 'Test Customer 3 (Credit Risk)',
            type: 'customer',
            phone: '9999933333',
            address: '789 delay street, Bangalore',
            balance: 135000
        }
    ];

    const { error: partyError } = await supabase.from('parties').insert(parties);
    if (partyError) throw new Error(`Failed to insert parties: ${partyError.message}`);

    // 2. Insert Glass Item
    const testItem = {
        id: itemId,
        name: 'Toughened Clear Glass 12mm',
        type: 'Toughened',
        unit: 'sqft',
        stock: 500,
        rate: 150
    };
    await supabase.from('items').insert(testItem);

    // 3. Insert Invoices representing buying patterns
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const invoices = [
        // Active Customer: weekly paid purchases
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-ACT-001',
            date: new Date(now.getTime() - 28 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 10000,
            tax_rate: 18,
            tax_amount: 1800,
            total: 11800,
            paid_amount: 11800,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 5, unit: 'sqft', sqft: 80, rate: 150, amount: 11800 }]
        },
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-ACT-002',
            date: new Date(now.getTime() - 21 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 12000,
            tax_rate: 18,
            tax_amount: 2160,
            total: 14160,
            paid_amount: 14160,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 6, unit: 'sqft', sqft: 96, rate: 150, amount: 14160 }]
        },
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-ACT-003',
            date: new Date(now.getTime() - 14 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 9000,
            tax_rate: 18,
            tax_amount: 1620,
            total: 10620,
            paid_amount: 10620,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 10620 }]
        },
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-ACT-004',
            date: new Date(now.getTime() - 7 * oneDayMs).toISOString(),
            party_id: custActiveId,
            party_name: 'Test Customer 1 (Active)',
            subtotal: 15000,
            tax_rate: 18,
            tax_amount: 2700,
            total: 17700,
            paid_amount: 17700,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 8, unit: 'sqft', sqft: 128, rate: 150, amount: 17700 }]
        },

        // Urge Check-in Customer: last ordered 45 days ago
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-URG-001',
            date: new Date(now.getTime() - 75 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 8000,
            tax_rate: 18,
            tax_amount: 1440,
            total: 9440,
            paid_amount: 9440,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 9440 }]
        },
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-URG-002',
            date: new Date(now.getTime() - 65 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 8500,
            tax_rate: 18,
            tax_amount: 1530,
            total: 10030,
            paid_amount: 10030,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 10030 }]
        },
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-URG-003',
            date: new Date(now.getTime() - 55 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 9000,
            tax_rate: 18,
            tax_amount: 1620,
            total: 10620,
            paid_amount: 10620,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 4, unit: 'sqft', sqft: 64, rate: 150, amount: 10620 }]
        },
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-URG-004',
            date: new Date(now.getTime() - 45 * oneDayMs).toISOString(),
            party_id: custUrgeId,
            party_name: 'Test Customer 2 (Urge check-in)',
            subtotal: 7500,
            tax_rate: 18,
            tax_amount: 1350,
            total: 8850,
            paid_amount: 8850,
            status: 'paid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 3, unit: 'sqft', sqft: 48, rate: 150, amount: 8850 }]
        },

        // Credit Risk Customer: backdated unpaid invoices
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-RSK-001',
            date: new Date(now.getTime() - 50 * oneDayMs).toISOString(),
            party_id: custRiskId,
            party_name: 'Test Customer 3 (Credit Risk)',
            subtotal: 50000,
            tax_rate: 18,
            tax_amount: 9000,
            total: 59000,
            paid_amount: 0,
            status: 'unpaid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 20, unit: 'sqft', sqft: 320, rate: 150, amount: 59000 }]
        },
        {
            id: crypto.randomUUID(),
            type: 'sale',
            number: 'INV-RSK-002',
            date: new Date(now.getTime() - 35 * oneDayMs).toISOString(),
            party_id: custRiskId,
            party_name: 'Test Customer 3 (Credit Risk)',
            subtotal: 65000,
            tax_rate: 18,
            tax_amount: 11700,
            total: 76000,
            paid_amount: 0,
            status: 'unpaid',
            items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 25, unit: 'sqft', sqft: 400, rate: 150, amount: 76000 }]
        }
    ];

    const { error: invError } = await supabase.from('invoices').insert(invoices);
    if (invError) throw new Error(`Failed to insert invoices: ${invError.message}`);

    // 4. Insert Stuck Pending Order (stuck for 8 days)
    const stuckOrder = {
        id: crypto.randomUUID(),
        type: 'sale_order',
        number: 'SO-STUCK-101',
        date: new Date(now.getTime() - 8 * oneDayMs).toISOString(),
        party_id: custActiveId,
        party_name: 'Test Customer 1 (Active)',
        subtotal: 15000,
        tax_rate: 18,
        tax_amount: 2700,
        total: 17700,
        status: 'supplier_ordered',
        items: [{ itemId, itemName: 'Toughened Clear Glass 12mm', width: 48, height: 48, quantity: 8, unit: 'sqft', sqft: 128, rate: 150, amount: 17700 }]
    };

    const { error: orderError } = await supabase.from('orders').insert(stuckOrder);
    if (orderError) throw new Error(`Failed to insert stuck order: ${orderError.message}`);
}
