import nodemailer from 'nodemailer';

/**
 * Builds an SMTP transporter from env vars. Supports any SMTP provider
 * (Titan Email, Zoho, custom domain mail, etc.) via EMAIL_HOST/EMAIL_PORT,
 * and falls back to Gmail via GMAIL_USER/GMAIL_APP_PASSWORD for existing setups.
 */
export function getMailCredentials() {
    const host = process.env.EMAIL_HOST;
    const user = host ? process.env.EMAIL_USER : process.env.GMAIL_USER;
    const pass = host ? process.env.EMAIL_PASSWORD : process.env.GMAIL_APP_PASSWORD;
    return { host, user, pass };
}

export function createMailTransport() {
    const host = process.env.EMAIL_HOST;

    if (host) {
        const port = Number(process.env.EMAIL_PORT || 465);
        return nodemailer.createTransport({
            host,
            port,
            secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : port === 465,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
    }

    // Legacy default: Gmail
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
        },
    });
}

export function getFromAddress() {
    const { user } = getMailCredentials();
    const companyName = process.env.COMPANY_NAME || 'Arjun Glass House';
    return `"${companyName}" <${process.env.EMAIL_FROM || user}>`;
}
