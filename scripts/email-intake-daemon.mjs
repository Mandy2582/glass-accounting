// Long-running daemon (managed by PM2, not part of the Next.js request cycle).
// Watches the business mailbox over IMAP IDLE (push-based, not polling) and
// forwards each new message to the app's /api/email-intake/webhook route,
// which does the actual order parsing / vision analysis / order creation.
import dotenv from 'dotenv';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const REQUIRED = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_INTAKE_SECRET'];
const missing = REQUIRED.filter(key => !process.env[key]);
if (missing.length) {
    console.error(`[email-intake] Missing required env vars: ${missing.join(', ')}. Exiting.`);
    process.exit(1);
}

const IMAP_HOST = process.env.EMAIL_IMAP_HOST || 'imap.titan.email';
const IMAP_PORT = Number(process.env.EMAIL_IMAP_PORT || 993);
const WEBHOOK_URL = process.env.EMAIL_INTAKE_WEBHOOK_URL || 'http://127.0.0.1:3000/api/email-intake/webhook';

async function processUnseenMessages(client) {
    // IMAP only allows one command in flight per connection. Draining the
    // whole fetch() stream into memory first, then issuing the \Seen flag
    // update as a separate command afterwards, avoids interleaving a STORE
    // command into an in-progress FETCH response (which otherwise silently
    // truncates the stream after the first message).
    const messages = [];
    const lock = await client.getMailboxLock('INBOX');
    try {
        for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
            messages.push(message);
        }
    } finally {
        lock.release();
    }

    if (!messages.length) return;

    const processedUids = [];
    for (const message of messages) {
        try {
            const parsed = await simpleParser(message.source);
            await forwardToWebhook(parsed);
        } catch (err) {
            console.error(`[email-intake] Failed to process message uid=${message.uid}:`, err.message);
        } finally {
            // Mark seen regardless of outcome -- the webhook itself dedupes by
            // Message-ID, so a failed forward won't silently retry forever
            // and spam the same broken message on every reconnect.
            processedUids.push(message.uid);
        }
    }

    const markLock = await client.getMailboxLock('INBOX');
    try {
        await client.messageFlagsAdd(processedUids, ['\\Seen'], { uid: true });
    } catch (err) {
        console.error('[email-intake] Failed to mark messages seen:', err.message);
    } finally {
        markLock.release();
    }
}

async function forwardToWebhook(parsed) {
    const attachments = (parsed.attachments || [])
        .filter(attachment => attachment.contentType?.startsWith('image/'))
        .map(attachment => ({
            filename: attachment.filename,
            mimeType: attachment.contentType,
            base64: attachment.content.toString('base64'),
        }));

    const body = {
        messageId: parsed.messageId || `no-id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fromAddress: parsed.from?.value?.[0]?.address || '',
        fromName: parsed.from?.value?.[0]?.name || '',
        subject: parsed.subject || '',
        text: (parsed.text || '').trim(),
        attachments,
    };

    if (!body.fromAddress) {
        console.warn('[email-intake] Skipping message with no sender address:', body.messageId);
        return;
    }

    const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-email-intake-secret': process.env.EMAIL_INTAKE_SECRET,
        },
        body: JSON.stringify(body),
    });

    const resultText = await res.text();
    if (!res.ok) {
        console.error(`[email-intake] Webhook rejected message ${body.messageId}: ${res.status} ${resultText}`);
    } else {
        console.log(`[email-intake] Processed message from ${body.fromAddress}: ${resultText}`);
    }
}

async function watchMailbox() {
    const client = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
        logger: false,
    });

    client.on('error', err => {
        console.error('[email-intake] IMAP client error:', err.message);
    });

    await client.connect();
    console.log(`[email-intake] Connected to ${IMAP_HOST} as ${process.env.EMAIL_USER}. Watching INBOX...`);
    await client.mailboxOpen('INBOX');

    await processUnseenMessages(client); // catch up on anything unseen from before we started

    // client.idle() resolves as soon as the server pushes any mailbox change
    // (new mail, deletion, etc.), or after its own internal keepalive
    // interval. Only check for unseen messages *after* it resolves --
    // never run another command while idle() is still pending, or the
    // connection ends up with two commands in flight at once.
    while (client.usable) {
        await client.idle();
        await processUnseenMessages(client);
    }
}

async function main() {
    for (;;) {
        try {
            await watchMailbox();
            console.warn('[email-intake] IMAP connection closed, reconnecting in 10s...');
        } catch (err) {
            console.error('[email-intake] Connection failed, retrying in 10s:', err.message);
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

main();
