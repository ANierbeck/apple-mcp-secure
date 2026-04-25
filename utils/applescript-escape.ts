/**
 * Security utilities for safe AppleScript integration.
 *
 * All user-supplied strings that are interpolated into AppleScript code
 * must go through escapeAppleScriptString(). Strings for shell commands
 * inside AppleScript must additionally use escapeShellArg().
 */

const MAX_STRING_LENGTH = 10_000;

/**
 * Escapes a string for safe use inside an AppleScript double-quoted string literal.
 * Handles: backslash, double-quote, null bytes, and enforces a max length.
 */
export function escapeAppleScriptString(input: string, maxLen = MAX_STRING_LENGTH): string {
    if (typeof input !== 'string') {
        throw new TypeError('escapeAppleScriptString: input must be a string');
    }
    const truncated = input.slice(0, maxLen);
    return truncated
        .replace(/\x00/g, '')        // strip null bytes
        .replace(/\\/g, '\\\\')      // backslash must come first
        .replace(/"/g, '\\"');       // double-quote
}

/**
 * Validates a phone number and returns it, or throws if invalid.
 * Accepts common formats: +1XXXXXXXXXX, 1XXXXXXXXXX, XXXXXXXXXX, with optional
 * spaces, dashes, and parentheses.
 */
export function validatePhoneNumber(phone: string): string {
    if (typeof phone !== 'string' || phone.trim().length === 0) {
        throw new Error('Phone number must be a non-empty string');
    }
    // Allow digits, +, spaces, dashes, parens — between 7 and 20 chars total
    if (!/^\+?[\d\s\-(). ]{7,20}$/.test(phone.trim())) {
        throw new Error(`Invalid phone number format: "${phone}"`);
    }
    return phone.trim();
}

/**
 * Validates an email address and returns it, or throws if invalid.
 * Uses a basic structural check — not RFC 5321 exhaustive.
 */
export function validateEmail(email: string): string {
    if (typeof email !== 'string' || email.trim().length === 0) {
        throw new Error('Email address must be a non-empty string');
    }
    const trimmed = email.trim();
    if (trimmed.length > 320) {
        throw new Error('Email address is too long');
    }
    // Minimal sanity: local@domain.tld
    if (!/^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>.]{2,}$/.test(trimmed)) {
        throw new Error(`Invalid email address format: "${email}"`);
    }
    return trimmed;
}

/**
 * Sanitizes a search term: strips null bytes, trims whitespace, enforces max length.
 * Safe for use in AppleScript after escapeAppleScriptString().
 */
export function sanitizeSearchTerm(input: string, maxLen = 200): string {
    if (typeof input !== 'string') {
        throw new TypeError('Search term must be a string');
    }
    return input.replace(/\x00/g, '').trim().slice(0, maxLen);
}

/**
 * Validates a folder/list name: no AppleScript-special characters, max length.
 */
export function validateName(input: string, label = 'Name', maxLen = 255): string {
    if (typeof input !== 'string' || input.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
    const trimmed = input.trim().slice(0, maxLen);
    // Disallow characters that have special meaning in AppleScript even when escaped
    if (/[«»\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(trimmed)) {
        throw new Error(`${label} contains invalid characters`);
    }
    return trimmed;
}

/**
 * Truncates text intelligently at sentence boundaries.
 * Tries to find the last sentence-ending character (.!?) before maxLen,
 * or falls back to the last newline.
 * This prevents cutting content in the middle of a sentence.
 * 
 * @param text - The text to truncate
 * @param maxLen - Maximum length of the output (excluding suffix)
 * @param suffix - Text to append when truncated (default: "...")
 * @returns Truncated text with suffix, or original if shorter than maxLen
 */
export function truncateSmart(text: string, maxLen: number, suffix = "..."): string {
    if (typeof text !== 'string') {
        throw new TypeError('truncateSmart: text must be a string');
    }
    
    if (text.length <= maxLen) {
        return text;
    }
    
    // Minimum length to preserve (ensure at least 50% of maxLen is used)
    const minKeep = Math.max(50, Math.floor(maxLen * 0.8));
    
    // Look for sentence boundaries in the text up to maxLen
    const searchText = text.slice(0, maxLen + 10); // +10 for buffer
    
    // Find the best boundary position
    let bestPos = -1;
    const boundaries = [
        { pos: searchText.lastIndexOf('. '), weight: 3 },
        { pos: searchText.lastIndexOf('? '), weight: 3 },
        { pos: searchText.lastIndexOf('! '), weight: 3 },
        { pos: searchText.lastIndexOf('\n'), weight: 2 },
        { pos: searchText.lastIndexOf('.'), weight: 2 },
        { pos: searchText.lastIndexOf('?'), weight: 2 },
        { pos: searchText.lastIndexOf('!'), weight: 2 },
    ];
    
    // Find the best boundary that's within our acceptable range
    for (const { pos, weight } of boundaries) {
        if (pos > minKeep && pos <= maxLen && (bestPos === -1 || pos > bestPos)) {
            bestPos = pos;
        }
    }
    
    // If we found a good boundary, use it
    if (bestPos > -1) {
        // +1 to include the boundary character
        return searchText.slice(0, bestPos + 1) + suffix;
    }
    
    // Fallback: hard truncate at maxLen
    return text.slice(0, maxLen) + suffix;
}
