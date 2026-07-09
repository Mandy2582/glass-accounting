// Structured, machine-readable markers that get appended to an order's free-text
// `notes` field (e.g. "[ESTIMATE_SENT:true]"). New marker prefixes must be added
// here so they stay hidden from customer-facing output and the manual notes editor.
export const INTERNAL_NOTE_MARKERS = [
    '[PO_REQUIRED:',
    '[ESTIMATE_SENT:',
    '[ESTIMATE_APPROVED:',
    '[ONLINE_ORDER_CONFIRMED:',
    '[PO_PLACED:',
    '[PREFERRED_SUPPLIER_ID:',
    '[CUSTOMER_ATTACHMENTS:',
    '[ORDER_WORK_ASSIGNMENTS_B64:',
    '[ORDER_SOURCE:',
    '[NEEDS_APPROVAL:',
] as const;

export type OrderSource = 'online' | 'whatsapp' | 'email' | 'manual';

// Where an order originated. Manual/online orders are trusted at creation
// time (a staff member typed it, or a customer paid through checkout);
// WhatsApp/email orders are auto-parsed guesses and get gated behind
// needsApproval() below until a human confirms them.
export function getOrderSource(notes: string | undefined): OrderSource {
    const match = (notes || '').match(/\[ORDER_SOURCE:(online|whatsapp|email|manual)\]/);
    if (match) return match[1] as OrderSource;

    // Fallback for orders created before this marker existed. Check the most
    // distinctive signals first -- a manual/online order can incidentally
    // contain the word "email" (e.g. a customer's email address in checkout
    // notes), so a bare includes('email') is not safe on its own.
    const text = (notes || '').toLowerCase();
    if (text.includes('whatsapp message id') || text.includes('whatsapp business webhook') || text.includes('whatsapp order text') || text.includes('whatsapp image')) return 'whatsapp';
    if (text.includes('email message id') || text.includes('email intake') || text.includes('emailed order') || text.includes('emailed image')) return 'email';
    if (text.includes('online')) return 'online';
    return 'manual';
}

export function withOrderSource(notes: string, source: OrderSource): string {
    return [notes, `[ORDER_SOURCE:${source}]`].filter(Boolean).join('\n');
}

export function needsApproval(notes: string | undefined): boolean {
    return (notes || '').includes('[NEEDS_APPROVAL:true]');
}

export function withNeedsApproval(notes: string): string {
    return [notes, '[NEEDS_APPROVAL:true]'].filter(Boolean).join('\n');
}

// Clears the approval gate (called when staff approves the order).
export function withApprovalCleared(notes: string | undefined): string {
    return (notes || '').replace(/\n?\[NEEDS_APPROVAL:(true|false)\]/g, '').trim();
}

export function estimateSent(notes: string | undefined): boolean {
    return (notes || '').includes('[ESTIMATE_SENT:true]');
}

export function withEstimateApproved(notes: string): string {
    return notes.includes('[ESTIMATE_APPROVED:true]') ? notes : [notes, '[ESTIMATE_APPROVED:true]'].filter(Boolean).join('\n');
}

// WhatsApp/email orders now require a quotation to be sent (and, in
// practice, a clear customer go-ahead) before they can be approved. Finds
// the most recent order still awaiting that confirmation from a given
// sender, matched via the raw "WhatsApp From:"/"Email From:" line already
// present in every intake-created order's notes -- avoids a separate party
// lookup and naturally scopes to the right conversation thread.
export function findPendingConfirmationOrder<T extends { notes?: string; date: string }>(
    orders: T[],
    source: OrderSource,
    senderIdentifierText: string
): T | undefined {
    if (!senderIdentifierText) return undefined;
    const candidates = orders.filter(order => {
        const notes = order.notes || '';
        return getOrderSource(notes) === source
            && needsApproval(notes)
            && estimateSent(notes)
            && notes.includes(senderIdentifierText);
    });
    return candidates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

// Markers are always appended after free-text notes, never interleaved, so the
// first marker's start position marks the boundary. We split there instead of
// stripping each marker with its own regex, since several carry embedded JSON/
// base64 payloads that can't be safely bracket-matched in isolation.
export function splitInternalNotes(rawNotes: string | undefined): { visible: string; internalBlock: string } {
    const notes = rawNotes || '';
    let earliestIndex = -1;
    for (const marker of INTERNAL_NOTE_MARKERS) {
        const idx = notes.indexOf(marker);
        if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
            earliestIndex = idx;
        }
    }
    if (earliestIndex === -1) {
        return { visible: notes.trim(), internalBlock: '' };
    }
    return {
        visible: notes.slice(0, earliestIndex).trim(),
        internalBlock: notes.slice(earliestIndex).trim(),
    };
}

// Human-facing notes only -- for PDFs, customer views, or anywhere the raw
// marker block must never leak.
export function getVisibleNotes(rawNotes: string | undefined): string {
    return splitInternalNotes(rawNotes).visible;
}

function getNoteLine(notes: string, label: string): string {
    const line = notes.split('\n').find(entry => entry.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    return line ? line.slice(line.indexOf(':') + 1).trim() : '';
}

function getNoteBlock(notes: string, label: string, untilLabel?: string): string {
    const start = notes.indexOf(label);
    if (start < 0) return '';
    const contentStart = start + label.length;
    const end = untilLabel ? notes.indexOf(untilLabel, contentStart) : -1;
    return notes.slice(contentStart, end >= 0 ? end : undefined).trim().slice(0, 2000);
}

export type OrderIntakeDetails = {
    source: OrderSource;
    from: string;
    subject: string;
    originalMessage: string;
    parsedRows: string;
    hasItems: boolean;
    visionClassification: string;
    visionConfidence: string;
    caption: string;
    extractedText: string;
    drawingNotes: string;
};

// Everything staff need to see about how a WhatsApp/email order was
// captured: the raw customer message, what matched the catalogue vs still
// needs review, and (for images) what the vision model read off the photo.
// Always parses the VISIBLE portion of notes -- the raw string also carries
// internal markers ([ORDER_SOURCE:...] etc.) appended right after the last
// labelled section, which would otherwise leak into whichever block happens
// to run to the end of the string (e.g. an unbounded "Parsed rows:").
export function getOrderIntakeDetails(order: { notes?: string; items?: unknown[] }): OrderIntakeDetails {
    const notes = getVisibleNotes(order.notes);
    const source = getOrderSource(order.notes);

    return {
        source,
        from: getNoteLine(notes, source === 'whatsapp' ? 'WhatsApp From' : 'Email From'),
        subject: getNoteLine(notes, 'Subject'),
        originalMessage: getNoteBlock(notes, 'Original message:', 'Parsed rows:') || getNoteBlock(notes, 'Caption:', 'Extracted text:'),
        parsedRows: getNoteBlock(notes, 'Parsed rows:'),
        hasItems: (order.items || []).length > 0,
        visionClassification: getNoteLine(notes, 'Vision Classification'),
        visionConfidence: getNoteLine(notes, 'Vision Confidence'),
        caption: getNoteBlock(notes, 'Caption:', 'Extracted text:'),
        extractedText: getNoteBlock(notes, 'Extracted text:', 'Drawing notes:'),
        drawingNotes: getNoteBlock(notes, 'Drawing notes:'),
    };
}
