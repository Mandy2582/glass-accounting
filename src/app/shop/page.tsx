import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Building2, Home, Ruler, ShieldCheck, Sparkles } from 'lucide-react';
import CustomerHeader from '@/components/customer/CustomerHeader';
import styles from './shop.module.css';

const projectLinks = [
    {
        title: 'Bathroom & Shower',
        description: 'Toughened glass with shower hinges, brackets and enclosure fittings.',
        href: '/shop/products?collection=bathroom',
        icon: Home,
    },
    {
        title: 'Glass Doors',
        description: 'Door glass with handles, locks, floor springs and patch fittings.',
        href: '/shop/products?collection=doors',
        icon: Building2,
    },
    {
        title: 'Railings & Partitions',
        description: 'Toughened panels with matching brackets, clamps and supports.',
        href: '/shop/products?collection=railings',
        icon: ShieldCheck,
    },
];

const storyPanels = [
    {
        title: 'Clear, bronze, grey, fluted.',
        highlight: 'Pick the mood.',
        description: 'Explore finishes for privacy, daylight, reflection and interior character.',
        href: '/shop/products?segment=glass',
        images: ['/shop-products/photos/reflective-glass.png', '/shop-products/photos/tinted-glass.png', '/shop-products/photos/fluted-glass.png'],
        tone: 'sky',
    },
    {
        title: 'Hardware that completes the glass.',
        highlight: 'Small details. Big finish.',
        description: 'Handles, locks, hinges and patch fittings selected by application.',
        href: '/shop/products?segment=hardware',
        images: ['/shop-products/photos/hardware-handles.png', '/shop-products/photos/hardware-locks.png', '/shop-products/photos/hardware-patch-fittings.png'],
        tone: 'dark',
    },
];

export default function ShopHomePage() {
    return (
        <div className={styles.shopShell}>
            <CustomerHeader />

            <section className={styles.homeHero}>
                <div>
                    <div className={styles.heroEyebrow}>Arjun Glass House Online</div>
                    <h1>Architectural glass, curated for modern spaces.</h1>
                    <p>
                        A cleaner way to choose glass, mirrors and fittings. Start from a category,
                        project style or finish, then move into the product catalogue when you are ready.
                    </p>
                    <div className={styles.heroActions}>
                        <Link className="btn btn-primary" href="/shop/products">View All Products</Link>
                        <Link className="btn btn-secondary" href="/guide">Find the Right Glass</Link>
                    </div>
                </div>
                <div className={styles.signatureStage} aria-label="Premium glass showcase">
                    <div className={styles.signaturePane}>
                        <Image src="/shop-products/photos/shower-enclosure.png" alt="" width={520} height={390} priority />
                    </div>
                    <div className={styles.signatureCard}>
                        <Sparkles size={22} />
                        <span>Made for homes, offices and enclosures</span>
                        <strong>Glass. Hardware. Custom sizes.</strong>
                    </div>
                    <div className={styles.signatureSpec}>
                        <span>Shop by</span>
                        <strong>Category</strong>
                    </div>
                </div>
            </section>

            <section className={styles.experienceStrip} aria-label="Shopping experience">
                <div><strong>01</strong><span>Select category</span></div>
                <div><strong>02</strong><span>Compare finishes</span></div>
                <div><strong>03</strong><span>Add size or hardware</span></div>
                <div><strong>04</strong><span>Confirm order locally</span></div>
            </section>

            <section className={styles.storyGrid} aria-label="Product stories">
                {storyPanels.map(panel => (
                    <Link
                        key={panel.title}
                        href={panel.href}
                        className={`${styles.storyPanel} ${panel.tone === 'dark' ? styles.storyPanelDark : styles.storyPanelSky}`}
                    >
                        <div className={styles.storyCopy}>
                            <span>Featured story</span>
                            <h2>
                                {panel.title}
                                <strong>{panel.highlight}</strong>
                            </h2>
                            <p>{panel.description}</p>
                        </div>
                        <div className={styles.storyVisual}>
                            {panel.images.map((image, index) => (
                                <Image
                                    key={image}
                                    src={image}
                                    alt=""
                                    width={190}
                                    height={145}
                                    className={styles[`storyImage${index + 1}`]}
                                />
                            ))}
                        </div>
                        <div className={styles.storyColourText}>
                            <span>Blue</span>
                            <span>Bronze</span>
                            <span>Clear</span>
                            <span>Mirror</span>
                        </div>
                    </Link>
                ))}
            </section>

            <section className={styles.homeQuickActions} aria-label="Quick shopping options">
                {projectLinks.map(project => {
                    const Icon = project.icon;
                    return (
                        <Link key={project.title} href={project.href} className={styles.projectTile}>
                            <Icon size={24} />
                            <div>
                                <h2>{project.title}</h2>
                                <p>{project.description}</p>
                            </div>
                            <ArrowRight size={18} />
                        </Link>
                    );
                })}
            </section>

            <section className={styles.premiumFeature}>
                <div>
                    <span>Product catalogue</span>
                    <h2>All glass and hardware are on one clean product page.</h2>
                    <p>
                        Use search and category filters to find clear, tinted, reflective, fluted, mirrors,
                        handles, locks and fittings without crowding this homepage.
                    </p>
                    <Link href="/shop/products" className={styles.premiumFeatureLink}>
                        Open product catalogue <ArrowRight size={17} />
                    </Link>
                </div>
                <div className={styles.premiumFeatureVisual}>
                    <Image src="/shop-products/photos/fluted-glass.png" alt="" width={420} height={315} />
                    <Image src="/shop-products/photos/hardware-handles.png" alt="" width={280} height={210} />
                </div>
            </section>

            <section className={styles.measureCta}>
                <div>
                    <Ruler size={28} />
                    <h2>Need custom size or project guidance?</h2>
                    <p>Use custom size on glass items, request measurement, or send a project quote.</p>
                </div>
                <Link className={styles.finderButton} href="/shop/products">
                    Go to Product Page
                </Link>
            </section>
        </div>
    );
}
