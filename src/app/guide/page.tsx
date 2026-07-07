'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Bath, Building2, CheckCircle2, Eye, Home, Layers3, Ruler, ShieldCheck, Sparkles, SunMedium } from 'lucide-react';
import CustomerHeader from '@/components/customer/CustomerHeader';
import styles from './guide.module.css';

type UseCase = 'bathroom' | 'window' | 'partition' | 'mirror' | 'railing' | 'shopfront';
type Priority = 'safety' | 'privacy' | 'light' | 'style' | 'budget';
type Finish = 'clear' | 'reflective' | 'tinted' | 'fluted' | 'mirror';

type Recommendation = {
    title: string;
    subtitle: string;
    image: string;
    href: string;
    reasons: string[];
    estimateHint: string;
};

const useCases: Array<{ id: UseCase; label: string; icon: React.ReactNode }> = [
    { id: 'bathroom', label: 'Bathroom / Shower', icon: <Bath size={18} /> },
    { id: 'window', label: 'Window', icon: <Home size={18} /> },
    { id: 'partition', label: 'Partition', icon: <Layers3 size={18} /> },
    { id: 'mirror', label: 'Mirror', icon: <Sparkles size={18} /> },
    { id: 'railing', label: 'Railing', icon: <ShieldCheck size={18} /> },
    { id: 'shopfront', label: 'Shopfront', icon: <Building2 size={18} /> },
];

const priorities: Array<{ id: Priority; label: string; icon: React.ReactNode }> = [
    { id: 'safety', label: 'Safety', icon: <ShieldCheck size={18} /> },
    { id: 'privacy', label: 'Privacy', icon: <Eye size={18} /> },
    { id: 'light', label: 'Natural Light', icon: <SunMedium size={18} /> },
    { id: 'style', label: 'Premium Look', icon: <Sparkles size={18} /> },
    { id: 'budget', label: 'Budget Friendly', icon: <CheckCircle2 size={18} /> },
];

const finishes: Array<{ id: Finish; label: string }> = [
    { id: 'clear', label: 'Clear' },
    { id: 'reflective', label: 'Reflective' },
    { id: 'tinted', label: 'Tinted' },
    { id: 'fluted', label: 'Fluted' },
    { id: 'mirror', label: 'Mirror' },
];

function buildRecommendation(useCase: UseCase, priority: Priority, finish: Finish): Recommendation {
    if (useCase === 'mirror' || finish === 'mirror') {
        return {
            title: priority === 'style' ? 'LED or Designer Mirror' : 'Mirror Glass',
            subtitle: 'Best for bathrooms, dressers and feature walls.',
            image: '/shop-products/photos/led-bathroom-mirror.png',
            href: '/shop/products?segment=glass&group=mirrors',
            reasons: ['Mirror category selected', 'Works well for vanity and wall decor', 'Available in round, LED and designer styles'],
            estimateHint: 'Use measurement booking for exact mirror cutouts, LED placement and wall fitting.',
        };
    }

    if (useCase === 'bathroom') {
        return {
            title: 'Toughened Shower Glass',
            subtitle: 'A safer default for shower doors and fixed bathroom panels.',
            image: '/shop-products/photos/shower-enclosure.png',
            href: '/shop/products?segment=glass&group=toughened',
            reasons: ['Safety is important in wet areas', 'Compatible with hinges, handles and locks', priority === 'privacy' ? 'Can be paired with fluted or frosted finish' : 'Clean modern bathroom look'],
            estimateHint: 'For shower enclosures, book site measurement so hardware positions and gaps are checked.',
        };
    }

    if (useCase === 'railing') {
        return {
            title: 'Toughened Railing Glass',
            subtitle: 'Recommended where strength and safety matter most.',
            image: '/shop-products/photos/glass-railing.png',
            href: '/shop/products?segment=glass&group=toughened',
            reasons: ['Safety-first application', 'Suitable for balcony and staircase panels', 'Often paired with brackets or railing hardware'],
            estimateHint: 'Use measurement booking for bracket placement, floor level and site conditions.',
        };
    }

    if (priority === 'privacy' || finish === 'fluted') {
        return {
            title: 'Fluted Privacy Glass',
            subtitle: 'A premium privacy finish for partitions, cabinets and interiors.',
            image: '/shop-products/photos/fluted-glass.png',
            href: '/shop/products?segment=glass&group=fluted',
            reasons: ['Soft privacy without making the space feel closed', 'Decorative vertical texture', 'Good for partitions and feature panels'],
            estimateHint: 'Estimate by size, then confirm orientation and pattern direction before ordering.',
        };
    }

    if (finish === 'reflective' || useCase === 'shopfront') {
        return {
            title: 'Reflective Glass',
            subtitle: 'Good for exterior-facing glass, privacy and a polished facade.',
            image: '/shop-products/photos/reflective-glass.png',
            href: '/shop/products?segment=glass&group=reflective',
            reasons: ['Reduces outside visibility in brighter conditions', 'Works well for shopfronts and windows', 'Available in blue, green and grey looks'],
            estimateHint: 'For large exterior panels, confirm thickness and installation support with staff.',
        };
    }

    if (finish === 'tinted' || priority === 'style') {
        return {
            title: 'Tinted Glass',
            subtitle: 'A stylish coloured option for windows and modern interiors.',
            image: '/shop-products/photos/tinted-bronze-glass.png',
            href: '/shop/products?segment=glass&group=tinted',
            reasons: ['Adds colour without heavy pattern', 'Available in bronze, green and grey', 'Suitable for windows and partitions'],
            estimateHint: 'Use instant estimate for size, then choose exact colour in products.',
        };
    }

    return {
        title: priority === 'safety' ? 'Toughened Clear Glass' : 'Clear Float Glass',
        subtitle: priority === 'safety' ? 'A stronger clear option for higher-risk use.' : 'The simplest everyday option for clear visibility.',
        image: priority === 'safety' ? '/shop-products/photos/toughened-glass-door.png' : '/shop-products/photos/clear-glass-panels.png',
        href: priority === 'safety' ? '/shop/products?segment=glass&group=toughened' : '/shop/products?segment=glass&group=clear-float',
        reasons: [priority === 'budget' ? 'Budget-friendly default' : 'Clear and versatile', 'Easy to estimate by size', priority === 'safety' ? 'Better for doors and exposed panels' : 'Works for shelves, windows and general use'],
        estimateHint: 'Use instant estimate when you already know width, height and thickness.',
    };
}

export default function GlassGuidePage() {
    const [useCase, setUseCase] = useState<UseCase>('bathroom');
    const [priority, setPriority] = useState<Priority>('safety');
    const [finish, setFinish] = useState<Finish>('clear');

    const recommendation = useMemo(() => buildRecommendation(useCase, priority, finish), [useCase, priority, finish]);

    return (
        <main className={styles.page}>
            <CustomerHeader />

            <section className={styles.hero}>
                <div>
                    <Link className={styles.backLink} href="/shop">
                        <ArrowLeft size={17} />
                        Back to shop
                    </Link>
                    <p className={styles.eyebrow}>Glass guide</p>
                    <h1>Find the right glass.</h1>
                    <p>Pick use, priority and finish. We will suggest a practical product group.</p>
                </div>
            </section>

            <section className={styles.workspace}>
                <div className={styles.quizCard}>
                    <div className={styles.questionBlock}>
                        <p className={styles.eyebrow}>Step 1</p>
                        <h2>Where will it be used?</h2>
                        <div className={styles.optionGrid}>
                            {useCases.map(option => (
                                <button
                                    className={useCase === option.id ? styles.activeOption : ''}
                                    key={option.id}
                                    type="button"
                                    onClick={() => setUseCase(option.id)}
                                >
                                    {option.icon}
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.questionBlock}>
                        <p className={styles.eyebrow}>Step 2</p>
                        <h2>What matters most?</h2>
                        <div className={styles.optionGrid}>
                            {priorities.map(option => (
                                <button
                                    className={priority === option.id ? styles.activeOption : ''}
                                    key={option.id}
                                    type="button"
                                    onClick={() => setPriority(option.id)}
                                >
                                    {option.icon}
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.questionBlock}>
                        <p className={styles.eyebrow}>Step 3</p>
                        <h2>Preferred finish</h2>
                        <div className={styles.finishGrid}>
                            {finishes.map(option => (
                                <button
                                    className={`${styles.finishOption} ${finish === option.id ? styles.activeOption : ''}`}
                                    key={option.id}
                                    type="button"
                                    onClick={() => setFinish(option.id)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <aside className={styles.resultCard}>
                    <div className={styles.resultImage} style={{ backgroundImage: `url(${recommendation.image})` }} />
                    <div className={styles.resultBody}>
                        <p className={styles.eyebrow}>Recommended</p>
                        <h2>{recommendation.title}</h2>
                        <p>{recommendation.subtitle}</p>
                        <ul>
                            {recommendation.reasons.map(reason => (
                                <li key={reason}>
                                    <CheckCircle2 size={17} />
                                    {reason}
                                </li>
                            ))}
                        </ul>
                        <div className={styles.hint}>
                            <Ruler size={18} />
                            <span>{recommendation.estimateHint}</span>
                        </div>
                        <div className={styles.actions}>
                            <Link href={recommendation.href}>View Products</Link>
                            <Link href="/estimate">Get Estimate</Link>
                            <Link href="/measure">Book Measurement</Link>
                        </div>
                    </div>
                </aside>
            </section>
        </main>
    );
}
