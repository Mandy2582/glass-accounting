'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, BookOpen, Users, Briefcase } from 'lucide-react';

export default function FinancialsPage() {
    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Financials</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>Manage vouchers, ledgers, and accounts.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {/* Vouchers Card */}
                <Link href="/vouchers" className="card" style={{ padding: '2rem', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '12px', color: '#2563eb' }}>
                            <FileText size={32} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>Vouchers</h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Record payments, receipts, and expenses</p>
                        </div>
                    </div>
                </Link>

                {/* Cash Book Card */}
                <Link href="/financials/cash-book" className="card" style={{ padding: '2rem', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '12px', color: '#16a34a' }}>
                            <BookOpen size={32} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>Cash Book</h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Daily cash register</p>
                        </div>
                    </div>
                </Link>

                {/* Bank Book Card */}
                <Link href="/financials/bank-book" className="card" style={{ padding: '2rem', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '12px', color: '#2563eb' }}>
                            <Briefcase size={32} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>Bank Book</h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Transfers & OD Accounts</p>
                        </div>
                    </div>
                </Link>

                {/* Ledgers Card */}
                <Link href="/financials/ledgers" className="card" style={{ padding: '2rem', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '12px', color: '#4b5563' }}>
                            <Users size={32} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>Party Ledgers</h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Customer, Supplier & Employee Accounts</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
