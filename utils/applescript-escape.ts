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
