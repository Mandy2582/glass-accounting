import type { MetadataRoute } from 'next';

const baseUrl = 'https://www.arjunglasshouse.com';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: [
                    '/',
                    '/shop',
                    '/shop/products',
                    '/estimate',
                    '/measure',
                    '/guide',
                    '/track',
                ],
                disallow: [
                    '/api/',
                    '/login',
                    '/dashboard',
                    '/orders',
                    '/inventory',
                    '/sales',
                    '/purchases',
                    '/financials',
                    '/reports',
                    '/parties',
                    '/employees',
                    '/settings',
                    '/vouchers',
                    '/daybook',
                    '/tally-sync',
                    '/notifications',
                ],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
        host: baseUrl,
    };
}
