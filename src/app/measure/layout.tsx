import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Site Measurement',
    description: 'Book site measurement support for custom glass, mirrors, partitions and enclosures.',
    alternates: {
        canonical: '/measure',
    },
};

export default function MeasureLayout({ children }: { children: React.ReactNode }) {
    return children;
}
