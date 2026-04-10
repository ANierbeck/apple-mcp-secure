/**
 * Send guard: prevents Claude from sending messages or emails to recipients
 * that have not been explicitly allowed by the operator.
 *
 * Priority order:
 * 1. APPLE_MCP_ALLOW_UNKNOWN_RECIPIENTS=true  → bypass all checks (escape hatch)
 * 2. APPLE_MCP_SEND_WHITELIST=a,b,c           → explicit comma-separated allowlist
 * 3. Default for messages                      → recipient must be in Contacts app
 * 4. Default for emails                        → allowed (contacts email lookup not
 *                                                available without extra AppleScript)
 *
 * This is a key defence against Prompt Injection attacks where a malicious email
 * or message instructs Claude to forward data to an attacker-controlled address.
 */

type ContactsModule = {
    findContactByPhone: (phone: string) => Promise<string | null>;
};

export class SendNotAllowedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SendNotAllowedError";
    }
}

/**
 * Throws SendNotAllowedError if the recipient is not permitted.
 * Call this before every sendMessage / sendMail operation.
 *
 * @param type        - 'message' | 'email'
 * @param recipient   - phone number or email address
 * @param contacts    - loaded contacts module (for Contacts-app lookup)
 */
export async function assertSendAllowed(
    type: "message" | "email",
    recipient: string,
    contacts: ContactsModule,
): Promise<void> {
    // Escape hatch: operator explicitly allows all recipients
    if (process.env.APPLE_MCP_ALLOW_UNKNOWN_RECIPIENTS === "true") {
        return;
    }

    const whitelist = process.env.APPLE_MCP_SEND_WHITELIST;

    if (whitelist && whitelist.trim().length > 0) {
        // Explicit whitelist is set — recipient must be in it
        const allowed = whitelist.split(",").map((s) => s.trim().toLowerCase());
        if (allowed.includes(recipient.trim().toLowerCase())) {
            return;
        }
        throw new SendNotAllowedError(
            `Recipient "${recipient}" is not in the allowed send list. ` +
            `To permit this recipient, add them to the APPLE_MCP_SEND_WHITELIST ` +
            `environment variable (comma-separated), or set ` +
            `APPLE_MCP_ALLOW_UNKNOWN_RECIPIENTS=true to disable this check.`,
        );
    }

    // No explicit whitelist — apply per-type defaults
    if (type === "message") {
        // For iMessages: require the number to exist in Contacts
        const contactName = await contacts.findContactByPhone(recipient);
        if (!contactName) {
            throw new SendNotAllowedError(
                `Cannot send iMessage to "${recipient}" — no matching contact found in ` +
                `the Contacts app. To allow this, either add the contact or set ` +
                `APPLE_MCP_SEND_WHITELIST=${recipient} in the MCP server environment.`,
            );
        }
        return;
    }

    // For emails without an explicit whitelist: allow (log a warning)
    // Contacts email lookup requires additional AppleScript not yet implemented.
    console.error(
        `[send-guard] Warning: no APPLE_MCP_SEND_WHITELIST set. ` +
        `Email to "${recipient}" allowed by default. ` +
        `Set APPLE_MCP_SEND_WHITELIST to restrict outbound email.`,
    );
}
