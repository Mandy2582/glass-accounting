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
