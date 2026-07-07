import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Glass Buying Guide',
    description: 'Compare clear, tinted, reflective, fluted, toughened and mirror glass for homes and offices.',
    alternates: {
        canonical: '/guide',
    },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
    return children;
}
