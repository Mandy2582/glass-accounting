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
] as const;

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
