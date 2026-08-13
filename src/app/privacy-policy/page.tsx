import type { Metadata } from 'next';
import Link from 'next/link';
import CustomerHeader from '@/components/customer/CustomerHeader';
import styles from './privacy-policy.module.css';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'Privacy policy for Arjun Glass House customer ordering and communication services.',
    alternates: { canonical: '/privacy-policy' },
};

export default function PrivacyPolicyPage() {
    return (
        <div className={styles.page}>
            <CustomerHeader />
            <main className={styles.content}>
                <header>
                    <h1>Privacy Policy</h1>
                    <p>Last updated: 13 August 2026</p>
                </header>

                <section>
                    <h2>Information we collect</h2>
                    <p>
                        Arjun Glass House collects information needed to answer enquiries, prepare estimates,
                        process orders and provide customer support. This may include your name, phone number,
                        email address, delivery details, order specifications, measurements, drawings, images,
                        payment references and messages sent through our website, email or WhatsApp.
                    </p>
                </section>

                <section>
                    <h2>How we use information</h2>
                    <p>
                        We use this information to understand your requirements, create drawings and estimates,
                        confirm orders, plan inventory and production, arrange delivery or installation, send
                        service updates, maintain business records and resolve support requests.
                    </p>
                </section>

                <section>
                    <h2>WhatsApp and email</h2>
                    <p>
                        Messages and attachments sent to our business WhatsApp number or email address may be
                        processed automatically to prepare an order draft. Staff review incomplete or uncertain
                        details before the order proceeds. We do not sell message content or customer details.
                    </p>
                </section>

                <section>
                    <h2>Sharing and service providers</h2>
                    <p>
                        Information is shared only when needed to operate the service, fulfil an order, comply
                        with law or protect our rights. Relevant providers may include website hosting, database,
                        email, WhatsApp, payment, delivery and installation services. Each provider receives only
                        the information needed for its role.
                    </p>
                </section>

                <section>
                    <h2>Storage and security</h2>
                    <p>
                        We retain customer and order information for as long as reasonably needed for fulfilment,
                        support, accounting, warranty and legal obligations. We use reasonable administrative and
                        technical safeguards, but no internet transmission or storage system is completely secure.
                    </p>
                </section>

                <section>
                    <h2>Your choices</h2>
                    <p>
                        You may ask us to correct your information or request deletion where retention is not
                        required by law or an active business obligation. You may also ask us to stop non-essential
                        communications.
                    </p>
                </section>

                <section>
                    <h2>Contact</h2>
                    <p>
                        For privacy questions or requests, email{' '}
                        <a href="mailto:iammandeepsingh2582@gmail.com">iammandeepsingh2582@gmail.com</a>.
                    </p>
                </section>

                <Link className={styles.backLink} href="/shop">Return to shop</Link>
            </main>
        </div>
    );
}
