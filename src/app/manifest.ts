import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Arjun Glass House',
        short_name: 'AGH',
        description: 'Shop glass, mirrors, custom sizes and architectural hardware from Arjun Glass House.',
        start_url: '/shop',
        scope: '/',
        display: 'standalone',
        background_color: '#eef7ff',
        theme_color: '#0f6ea8',
        categories: ['shopping', 'business'],
        icons: [
            {
                src: '/logo.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/logo.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
        shortcuts: [
            {
                name: 'Products',
                short_name: 'Products',
                description: 'Browse glass and hardware products',
                url: '/shop/products',
            },
            {
                name: 'Track Order',
                short_name: 'Track',
                description: 'Track an Arjun Glass House order',
                url: '/track',
            },
        ],
    };
}
