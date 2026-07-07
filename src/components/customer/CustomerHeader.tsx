'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { LogIn, UserRound } from 'lucide-react';

type CustomerHeaderProps = {
    actions?: ReactNode;
};

const navItems = [
    { href: '/shop', label: 'Home' },
    { href: '/shop/products', label: 'Products' },
    { href: '/estimate', label: 'Estimate' },
    { href: '/measure', label: 'Measurement' },
    { href: '/guide', label: 'Guide' },
    { href: '/track', label: 'Track' },
];

type SavedCustomer = {
    name?: string;
    phone?: string;
    email?: string;
};

const customerStorageKey = 'agh_shop_customer';

function readSavedCustomer(): SavedCustomer | null {
    if (typeof window === 'undefined') return null;

    try {
        const saved = window.localStorage.getItem(customerStorageKey);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as SavedCustomer;
        return parsed && (parsed.name || parsed.phone || parsed.email) ? parsed : null;
    } catch {
        return null;
    }
}

export default function CustomerHeader({ actions }: CustomerHeaderProps) {
    const pathname = usePathname();
    const [customer, setCustomer] = useState<SavedCustomer | null>(null);

    useEffect(() => {
        const syncCustomer = () => setCustomer(readSavedCustomer());
        syncCustomer();
        window.addEventListener('storage', syncCustomer);
        window.addEventListener('focus', syncCustomer);
        return () => {
            window.removeEventListener('storage', syncCustomer);
            window.removeEventListener('focus', syncCustomer);
        };
    }, []);

    const fallbackActions = customer ? (
        <>
            <Link className="customerBtn" href="/shop/products?account=orders">
                Orders
            </Link>
            <Link className="customerBtn" href="/track">
                Track
            </Link>
            <Link className="customerBtn" href="/shop/products?account=profile">
                <UserRound size={17} />
                {customer.name || customer.phone || 'Account'}
            </Link>
        </>
    ) : (
        <Link className="customerBtn" href="/shop/products?account=login">
            <LogIn size={17} />
            Customer Login
        </Link>
    );

    return (
        <header className="customerHeader">
            <Link className="customerBrand" href="/shop">
                <span className="customerBrandMark">AGH</span>
                <span>Arjun Glass House</span>
            </Link>
            <nav className="customerNav" aria-label="Customer navigation">
                {navItems.map(item => {
                    const active = item.href === '/shop'
                        ? pathname === '/shop'
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                        <Link key={item.href} className={active ? 'customerNavActive' : ''} href={item.href}>
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="customerHeaderActions">{actions ?? fallbackActions}</div>
        </header>
    );
}
