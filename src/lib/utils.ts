export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments where crypto.randomUUID is not available
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function roundCurrency(amount: number): number {
    return Number((Number(amount) || 0).toFixed(2));
}

export function formatIndianCurrency(amount: number, maximumFractionDigits = 2): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: maximumFractionDigits,
        maximumFractionDigits
    }).format(roundCurrency(amount));
}

export function generateWhatsAppLink(phone: string, message: string): string {
    // Remove all non-numeric characters
    let cleanPhone = phone.replace(/\D/g, '');

    // Add country code if missing (assuming India +91 for now as default)
    if (cleanPhone.length === 10) {
        cleanPhone = '91' + cleanPhone;
    }

    // Encode message
    const encodedMessage = encodeURIComponent(message);

    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

export function formatInchesToFraction(inches: number): string {
    if (inches === undefined || inches === null || isNaN(inches)) return '';
    const snappedInches = Math.round(inches * 8) / 8;
    const whole = Math.floor(Math.abs(snappedInches));
    const fraction = Math.abs(snappedInches) - whole;
    const numerator = Math.round(fraction * 8);
    const sign = snappedInches < 0 ? '-' : '';
    
    let fracStr = '';
    if (numerator === 1) fracStr = '1/8';
    else if (numerator === 2) fracStr = '1/4';
    else if (numerator === 3) fracStr = '3/8';
    else if (numerator === 4) fracStr = '1/2';
    else if (numerator === 5) fracStr = '5/8';
    else if (numerator === 6) fracStr = '3/4';
    else if (numerator === 7) fracStr = '7/8';
    else if (numerator === 8) {
        return `${sign}${whole + 1}`;
    }

    if (whole === 0 && fracStr === '') {
        return '0';
    }
    if (whole === 0) {
        return `${sign}${fracStr}`;
    }
    if (fracStr === '') {
        return `${sign}${whole}`;
    }
    return `${sign}${whole} ${fracStr}`;
}

export function parseFractionToInches(input: string): number {
    const trimmed = input.trim();
    if (!trimmed) return 0;

    // Check if it has a space, e.g. "24 1/8" or "24 1"
    if (trimmed.includes(' ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length === 2) {
            const whole = parseFloat(parts[0]);
            const frac = parts[1];
            if (frac.includes('/')) {
                const fracParts = frac.split('/');
                if (fracParts.length === 2) {
                    const num = parseFloat(fracParts[0]);
                    const den = parseFloat(fracParts[1]);
                    if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) {
                        return whole + (num / den);
                    }
                }
            } else {
                const wholeVal = parseFloat(parts[0]);
                return isNaN(wholeVal) ? 0 : wholeVal;
            }
        }
    }

    // Check if it is a pure fraction, e.g., "1/8" or "3/4"
    if (trimmed.includes('/')) {
        const fracParts = trimmed.split('/');
        if (fracParts.length === 2) {
            const num = parseFloat(fracParts[0]);
            const den = parseFloat(fracParts[1]);
            if (!isNaN(num) && !isNaN(den) && den !== 0) {
                return num / den;
            }
        }
    }

    // Otherwise parse as decimal float
    const val = parseFloat(trimmed);
    return isNaN(val) ? 0 : val;
}
