'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/storage';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ProfitLossPage() {
    const [data, setData] = useState({
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        calculatePL();
    }, []);

    const calculatePL = async () => {
        const [invoices, vouchers, items] = await Promise.all([
            db.invoices.getAll(),
            db.vouchers.getAll(),
            db.items.getAll()
        ]);

        const sales = invoices.filter(i => i.type === 'sale');

        // 1. Revenue (Total Sales excluding Tax? Usually Revenue is Net Sales)
        // Let's use Subtotal for Revenue to be cleaner, or Total. 
        // Profit = Sales - Cost. Tax is liability.
        // Let's use Subtotal (Net Sales) for Revenue.
        const revenue = sales.reduce((sum, i) => sum + i.subtotal, 0);

        // 2. COGS (Cost of Goods Sold)
        // For each item sold, find its Purchase Rate.
        let cogs = 0;
        sales.forEach(sale => {
            sale.items.forEach(invItem => {
                const itemDef = items.find(i => i.id === invItem.itemId);
                // If purchaseRate is set, use it. Else use 70% of selling rate as estimate?
                // Or 0 if unknown. Let's use 0 but warn or use a fallback.
                // Better: Use purchaseRate if available, else 0.
                const costPrice = itemDef?.purchaseRate || 0;

                // Calculate cost for this line item
                // If unit is sqft, cost is per sqft * sqft
                // If unit is sheets/nos, cost is per piece * qty

                // Wait, purchaseRate in ItemModal is "Cost Price per unit".
                // Unit matches the item's unit.

                if (invItem.unit === 'sqft') {
                    cogs += costPrice * invItem.sqft;
                } else {
                    cogs += costPrice * invItem.quantity;
                }
            });
        });

        // 3. Expenses
        const expenseVouchers = vouchers.filter(v => v.type === 'expense');
        const expenses = expenseVouchers.reduce((sum, v) => sum + v.amount, 0);

        setData({
            revenue,
            cogs,
            grossProfit: revenue - cogs,
            expenses,
            netProfit: revenue - cogs - expenses
        });
        setLoading(false);
    };

    if (loading) return <div className="container">Loading...</div>;

    return (
        <div className="container">
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/reports" style={{ color: 'inherit' }}>
                    <ArrowLeft size={24} />
                </Link>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Profit & Loss Statement</h1>
            </div>

            <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontWeight: 600 }}>Revenue (Sales)</span>
                    <span style={{ fontWeight: 600 }}>₹{data.revenue.toLocaleString()}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid var(--color-border)', color: '#ef4444' }}>
                    <span>Less: Cost of Goods Sold (COGS)</span>
                    <span>(₹{data.cogs.toLocaleString()})</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '2px solid var(--color-border)', background: '#f9fafb' }}>
                    <span style={{ fontWeight: 700 }}>Gross Profit</span>
                    <span style={{ fontWeight: 700 }}>₹{data.grossProfit.toLocaleString()}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid var(--color-border)', color: '#ef4444' }}>
                    <span>Less: Operating Expenses</span>
                    <span>(₹{data.expenses.toLocaleString()})</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 0', marginTop: '0.5rem', background: data.netProfit >= 0 ? '#dcfce7' : '#fee2e2', borderRadius: '0.5rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>Net Profit</span>
                    <span style={{ fontWeight: 800, fontSize: '1.25rem', color: data.netProfit >= 0 ? '#166534' : '#991b1b' }}>
                        ₹{data.netProfit.toLocaleString()}
                    </span>
                </div>

                <div style={{ marginTop: '2rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    <p><strong>Note:</strong> COGS is calculated based on the "Purchase Rate" defined for each item in Inventory. Please ensure Purchase Rates are accurate for correct profit calculation.</p>
                </div>
            </div>
        </div>
    );
}
