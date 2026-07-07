import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Track Order',
    description: 'Track your Arjun Glass House order and submit payment reference details.',
    alternates: {
        canonical: '/track',
    },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
    return children;
}
