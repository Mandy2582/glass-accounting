import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Online Glass Shop',
    description: 'Shop glass, mirrors, custom sizes and hardware from Arjun Glass House.',
    alternates: {
        canonical: '/shop',
    },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
    return children;
}
