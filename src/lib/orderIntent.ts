// Decides whether an inbound email/WhatsApp message is actually a customer
// trying to place or discuss an order, before we create a Party + Order for
// it. Without this, a general business inbox (marketing mail, supplier
// invoices, spam, plain correspondence) would spawn a blank "review" order
// for every single message, since the catalogue-line parser has no concept
// of "this isn't an order at all" -- it just reports zero matched lines.
export type OrderIntentResult = {
    isOrderRelated: boolean;
    reason: string;
};

const NOT_ORDER_SIGNALS = [
    'unsubscribe',
    'newsletter',
    'no-reply',
    'noreply',
    'automated message',
    'this is an automated',
    'out of office',
    'auto-reply',
    'autoreply',
    'delivery status notification',
    'undelivered mail',
    'mailer-daemon',
    'payment receipt',
    'view in browser',
    'privacy policy',
    'unsubscribe from this list',
];

const ORDER_SIGNALS = [
    'order', 'quote', 'quotation', 'estimate', 'glass', 'mirror', 'sheet', 'sheets',
    'sqft', 'sq ft', 'sq.ft', 'toughened', 'tempered', 'hardware', 'fitting', 'fittings',
    'window', 'door', 'partition', 'shower', 'railing', 'canopy', 'mm', 'price', 'rate',
    'delivery', 'installation', 'pcs', 'nos', 'pieces', 'thickness',
];

// Cheap, always-on pre-filter. Only returns a decision for clear-cut cases;
// genuinely ambiguous text is left undecided so the caller can defer to AI
// classification (or fail open) instead of guessing.
function heuristicOrderIntent(text: string, subject = ''): { decided: boolean } & OrderIntentResult {
    const haystack = `${subject} ${text}`.toLowerCase();

    if (!text.trim()) {
        return { decided: true, isOrderRelated: false, reason: 'Empty message body.' };
    }

    if (NOT_ORDER_SIGNALS.some(signal => haystack.includes(signal))) {
        return { decided: true, isOrderRelated: false, reason: 'Looks like automated, bulk, or unsubscribe-type mail.' };
    }

    const hasOrderSignal = ORDER_SIGNALS.some(signal => haystack.includes(signal));
    const hasDigit = /\d/.test(text);

    if (hasOrderSignal && hasDigit) {
        return { decided: true, isOrderRelated: true, reason: 'Contains order-related keywords and quantities/numbers.' };
    }

    return { decided: false, isOrderRelated: false, reason: '' };
}

async function classifyTextWithAI(text: string, subject = ''): Promise<OrderIntentResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        // Can't classify further -- fail open so a real order is never silently dropped.
        return { isOrderRelated: true, reason: 'OPENAI_API_KEY not configured; defaulting to review for safety.' };
    }

    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';

    try {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: [
                                    'A message arrived in a glass/hardware shop\'s general inbox.',
                                    'Decide whether it is a customer trying to place, discuss, or ask about an order/quote for glass, mirrors, or hardware.',
                                    'Answer isOrderRelated=false for: marketing/newsletters, supplier invoices or payment receipts, spam, personal correspondence unrelated to ordering, automated notifications, job applications, or general chit-chat with no order intent.',
                                    'Answer isOrderRelated=true for: order requests, quote requests, questions about products/pricing/sizes/delivery, or replies continuing an order conversation.',
                                    `Subject: ${subject || '(none)'}`,
                                    `Body:\n${text.slice(0, 4000)}`,
                                ].join('\n'),
                            },
                        ],
                    },
                ],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'order_intent_classification',
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['isOrderRelated', 'reason'],
                            properties: {
                                isOrderRelated: { type: 'boolean' },
                                reason: { type: 'string' },
                            },
                        },
                        strict: true,
                    },
                },
            }),
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`OpenAI classification request failed: ${detail}`);
        }

        const data = await response.json();
        const outputText = data.output_text || data.output?.flatMap((item: any) => item.content || [])
            .find((content: any) => content.type === 'output_text')?.text;

        if (!outputText) throw new Error('No output text from OpenAI classification.');

        const parsed = JSON.parse(outputText) as OrderIntentResult;
        return parsed;
    } catch (error) {
        console.error('[order-intent] AI classification failed, defaulting to review:', error);
        return { isOrderRelated: true, reason: 'Classification failed; defaulting to review for safety.' };
    }
}

// Full text-intent resolution: heuristic first (free, instant), AI only for
// genuinely ambiguous cases (no catalogue match yet and not clearly spam).
export async function resolveOrderIntent(text: string, subject?: string): Promise<OrderIntentResult> {
    const heuristic = heuristicOrderIntent(text, subject);
    if (heuristic.decided) {
        return { isOrderRelated: heuristic.isOrderRelated, reason: heuristic.reason };
    }

    return classifyTextWithAI(text, subject);
}

// For images that didn't yield a matched catalogue order line: use the vision
// model's own classification/confidence plus any caption text instead of
// making a second AI call. "unknown" is the vision model's own explicit
// "doesn't look order-related" signal.
export function resolveImageOrderIntent(input: {
    classification: 'text_order' | 'drawing' | 'mixed' | 'unknown';
    confidence: number;
    caption?: string;
    extractedText?: string;
}): OrderIntentResult {
    if (input.classification === 'drawing' || input.classification === 'mixed' || input.classification === 'text_order') {
        return { isOrderRelated: true, reason: `Vision model classified image as ${input.classification}.` };
    }

    const captionSignals = `${input.caption || ''} ${input.extractedText || ''}`.toLowerCase();
    if (ORDER_SIGNALS.some(signal => captionSignals.includes(signal))) {
        return { isOrderRelated: true, reason: 'Caption/extracted text suggests an order despite low vision confidence.' };
    }

    if (input.confidence >= 0.5) {
        return { isOrderRelated: true, reason: 'Vision model confidence high enough to keep for review.' };
    }

    return { isOrderRelated: false, reason: 'Vision model could not classify the image as order-related.' };
}
