import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Glass Estimate',
    description: 'Request a glass estimate with size, thickness, hardware and delivery preferences.',
    alternates: {
        canonical: '/estimate',
    },
};

export default function EstimateLayout({ children }: { children: React.ReactNode }) {
    return children;
}
