import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Glass & Hardware Products',
    description: 'Browse glass categories, mirrors, toughened glass, fluted glass, handles, locks, hinges and fittings.',
    alternates: {
        canonical: '/shop/products',
    },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
