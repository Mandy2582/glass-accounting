import type { MetadataRoute } from 'next';

const baseUrl = 'https://www.arjunglasshouse.com';

const publicPages = [
    { path: '/shop', priority: 1 },
    { path: '/shop/products', priority: 0.95 },
    { path: '/estimate', priority: 0.75 },
    { path: '/measure', priority: 0.65 },
    { path: '/guide', priority: 0.65 },
    { path: '/track', priority: 0.55 },
];

const catalogueViews = [
    '/shop/products?segment=glass',
    '/shop/products?segment=hardware',
    '/shop/products?segment=glass&group=clear-float',
    '/shop/products?segment=glass&group=toughened',
    '/shop/products?segment=glass&group=tinted',
    '/shop/products?segment=glass&group=reflective',
    '/shop/products?segment=glass&group=fluted',
    '/shop/products?segment=glass&group=mirrors',
    '/shop/products?segment=hardware&group=handles',
    '/shop/products?segment=hardware&group=locks',
    '/shop/products?segment=hardware&group=hinges',
    '/shop/products?collection=bathroom',
    '/shop/products?collection=doors',
    '/shop/products?collection=railings',
];

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();
    return [
        ...publicPages.map(page => ({
            url: `${baseUrl}${page.path}`,
            lastModified: now,
            changeFrequency: 'weekly' as const,
            priority: page.priority,
        })),
        ...catalogueViews.map(path => ({
            url: `${baseUrl}${path}`,
            lastModified: now,
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        })),
    ];
}
