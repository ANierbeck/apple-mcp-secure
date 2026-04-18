import { runAppleScript } from "run-applescript";
import { randomBytes } from "node:crypto";
import { escapeAppleScriptString, sanitizeSearchTerm, validateEmail, validateName } from "./applescript-escape.js";
import { ensureAppRunning } from "./app-launcher.js";

// Configuration
const CONFIG = {
	// Maximum emails to process (to avoid performance issues)
	MAX_EMAILS: 50,
	// Maximum content length for unread/latest previews
	MAX_CONTENT_PREVIEW: 300,
	// Maximum content length for search results (full content)
	MAX_SEARCH_CONTENT: 50000,
	// Timeout for operations
	TIMEOUT_MS: 10000,
};

/**
 * Returns the set of allowed account names from APPLE_MCP_MAIL_ACCOUNT_WHITELIST.
 * If the env var is not set or empty, all accounts are allowed.
 * Usage: APPLE_MCP_MAIL_ACCOUNT_WHITELIST=Work Account,Personal
 */
function getAllowedAccounts(): Set<string> | null {
	const raw = process.env.APPLE_MCP_MAIL_ACCOUNT_WHITELIST;
	if (!raw || !raw.trim()) return null; // no filter → all allowed
	return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function isAccountAllowed(accountName: string): boolean {
	const allowed = getAllowedAccounts();
	if (!allowed) return true;
	return allowed.has(accountName.trim().toLowerCase());
}

interface EmailMessage {
	subject: string;
	sender: string;
	dateSent: string;
	epoch?: number;
	content: string;
	isRead: boolean;
	mailbox: string;
}

/**
 * Check if Mail app is accessible
 */
async function checkMailAccess(): Promise<boolean> {
	try {
		const script = `
tell application "Mail"
    return name
end tell`;

		await runAppleScript(script);
		return true;
	} catch (error) {
		console.error(
			`Cannot access Mail app: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

/**
 * Request Mail app access and provide instructions if not available
 */
async function requestMailAccess(): Promise<{ hasAccess: boolean; message: string }> {
	try {
		// Ensure Mail is running before we try to talk to it
		await ensureAppRunning("Mail", "return name");

		// First check if we already have access
		const hasAccess = await checkMailAccess();
		if (hasAccess) {
			return {
				hasAccess: true,
				message: "Mail access is already granted."
			};
		}

		// If no access, provide clear instructions
		return {
			hasAccess: false,
			message: "Mail access is required but not granted. Please:\n1. Open System Settings > Privacy & Security > Automation\n2. Find your terminal/app in the list and enable 'Mail'\n3. Make sure Mail app is running and configured with at least one account\n4. Restart your terminal and try again"
		};
	} catch (error) {
		return {
			hasAccess: false,
			message: `Error checking Mail access: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}

/**
 * Get unread emails from Mail app (limited for performance).
 * If `account` is provided, only that account (matched by name or email address,
 * case-insensitively) is searched; the global whitelist is still respected.
 */
async function getUnreadMails(limit = 10, account?: string): Promise<EmailMessage[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		// Collect up to MAX_EMAILS — TypeScript sorts and slices to limit afterwards.
		// Using limit as the AppleScript cap would stop collection early (Mail returns
		// messages in mailbox order = oldest first), yielding the oldest N, not the newest N.
		const maxEmails = CONFIG.MAX_EMAILS;
		const maxLimit = Math.min(limit, CONFIG.MAX_EMAILS);
		const allowedAccounts = getAllowedAccounts();
		const accountFilter = allowedAccounts
			? `set allowedAccounts to {${[...allowedAccounts].map((a) => `"${a}"`).join(",")}}`
			: `set allowedAccounts to {}`;
		// Use an ignoring-case loop instead of "does not contain" — AppleScript list
		// containment is case-sensitive, but the whitelist stores lowercased names.
		const accountCheck = allowedAccounts
			? `set acctAllowed to false
repeat with allowedName in allowedAccounts
    ignoring case
        if (accountName as text) is (allowedName as text) then
            set acctAllowed to true
            exit repeat
        end if
    end ignoring
end repeat
if not acctAllowed then`
			: `if false then`; // never skip when no whitelist

		// If a specific account was requested, build a pre-filter so we only iterate
		// the matching account.  The whitelist check still applies inside.
		const escapedAccount = account ? escapeAppleScriptString(account) : "";
		const accountPreFilter = account
			? `-- Filter to the requested account (case-insensitive, name or email)
set requestedAccount to "${escapedAccount}"
set targetAccount to missing value
repeat with acct in accounts
    ignoring case
        if (name of acct) is equal to requestedAccount then
            set targetAccount to acct
            exit repeat
        end if
    end ignoring
    try
        repeat with emailAddr in (email addresses of acct)
            ignoring case
                if (emailAddr as text) is equal to requestedAccount then
                    set targetAccount to acct
                end if
            end ignoring
        end repeat
    end try
    if targetAccount is not missing value then exit repeat
end repeat
if targetAccount is missing value then return ""
set accountsToSearch to {targetAccount}`
			: `set accountsToSearch to accounts`;

		const script = `
tell application "Mail"
    set emailData to ""
    set emailCount to 0
    ${accountFilter}
    ${accountPreFilter}
    -- Locale-independent sort key: seconds since 2000-01-01 00:00:00.
    -- JS Date can't parse German locale date strings, so we pass a numeric key.
    set refDate to current date
    set year of refDate to 2000
    set month of refDate to January
    set day of refDate to 1
    set time of refDate to 0

    repeat with acct in accountsToSearch
        if emailCount >= ${maxEmails} then exit repeat
        try
            set accountName to name of acct
            ${accountCheck}
                -- not whitelisted, skip
            else
                repeat with mb in (mailboxes of acct)
                    if emailCount >= ${maxEmails} then exit repeat
                    try
                        set mbName to name of mb
                        -- Only check inbox-type mailboxes. Fetching messages from
                        -- Archive/Sent/Drafts/etc. triggers expensive IMAP syncs and
                        -- freezes Mail. Unread mail is almost always in INBOX.
                        -- "unread count" is unreliable for IMAP — don't use it.
                        set isInbox to false
                        ignoring case
                            if mbName is "inbox" or mbName is "all mail" or mbName is "INBOX" then
                                set isInbox to true
                            end if
                        end ignoring
                        if isInbox then
                            set mailboxName to mbName & " [" & accountName & "]"
                            -- Use whose-filter: Mail translates this to IMAP SEARCH UNSEEN
                            -- server-side, so flags are authoritative and we never load
                            -- all messages into memory.
                            with timeout of 30 seconds
                                set unreadMsgs to (messages of mb whose read status is false)
                            end timeout
                            repeat with currentMsg in unreadMsgs
                                if emailCount >= ${maxEmails} then exit repeat
                                try
                                    set emailSubject to subject of currentMsg
                                    set emailSender to sender of currentMsg
                                    set emailDate to (date sent of currentMsg) as string
                                    set epochSecs to ((date sent of currentMsg) - refDate) as integer
                                    set emailContent to ""
                                    try
                                        with timeout of 10 seconds
                                            set fullContent to content of currentMsg
                                        end timeout
                                        if (length of fullContent) > ${CONFIG.MAX_CONTENT_PREVIEW} then
                                            set emailContent to (characters 1 thru ${CONFIG.MAX_CONTENT_PREVIEW} of fullContent) as string
                                            set emailContent to emailContent & "..."
                                        else
                                            set emailContent to fullContent
                                        end if
                                    on error
                                        set emailContent to "[Content not available]"
                                    end try
                                    set emailData to emailData & "SUBJECT:" & emailSubject & "|SENDER:" & emailSender & "|DATE:" & emailDate & "|EPOCH:" & epochSecs & "|CONTENT:" & emailContent & "|MAILBOX:" & mailboxName & "||"
                                    set emailCount to emailCount + 1
                                on error
                                end try
                            end repeat
                        end if
                    on error
                    end try
                end repeat
            end if
        on error
        end try
    end repeat

    return emailData
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (!result) return [];

		return result.split("||").filter(Boolean).map((entry) => {
			const fields: Record<string, string> = {};
			entry.split("|").forEach((part) => {
				const idx = part.indexOf(":");
				if (idx > -1) {
					fields[part.slice(0, idx)] = part.slice(idx + 1);
				}
			});
			return {
				subject: fields["SUBJECT"] || "No subject",
				sender: fields["SENDER"] || "Unknown sender",
				dateSent: fields["DATE"] || new Date().toString(),
				epoch: parseInt(fields["EPOCH"] || "0", 10),
				content: fields["CONTENT"] || "[Content not available]",
				isRead: false,
				mailbox: fields["MAILBOX"] || "Unknown",
			};
		})
		// Sort newest-first using the numeric epoch key (locale-independent)
		.sort((a, b) => b.epoch - a.epoch)
		.slice(0, maxLimit);
	} catch (error) {
		console.error(
			`Error getting unread emails: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Search for emails by search term
 */
async function searchMails(
	searchTerm: string,
	limit = 10,
): Promise<EmailMessage[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		if (!searchTerm || searchTerm.trim() === "") {
			return [];
		}

		const maxEmails = Math.min(limit, CONFIG.MAX_EMAILS);
		const cleanSearchTerm = escapeAppleScriptString(sanitizeSearchTerm(searchTerm.toLowerCase()));

		const allowedAccounts = getAllowedAccounts();
		const accountFilter = allowedAccounts
			? `set allowedAccounts to {${[...allowedAccounts].map((a) => `"${a}"`).join(",")}}`
			: `set allowedAccounts to {}`;
		const accountCheck = allowedAccounts
			? `set acctAllowed to false
repeat with allowedName in allowedAccounts
    ignoring case
        if (accountName as text) is (allowedName as text) then
            set acctAllowed to true
            exit repeat
        end if
    end ignoring
end repeat
if not acctAllowed then`
			: `if false then`;

		const script = `
tell application "Mail"
    set emailData to ""
    set emailCount to 0
    set searchTerm to "${cleanSearchTerm}"
    ${accountFilter}

    repeat with acct in accounts
        if emailCount >= ${maxEmails} then exit repeat
        try
            set accountName to name of acct
            ${accountCheck}
                -- not whitelisted, skip
            else
                repeat with mb in (mailboxes of acct)
                    if emailCount >= ${maxEmails} then exit repeat
                    try
                        set mailboxName to (name of mb) & " [" & accountName & "]"
                        -- Use whose-filter: Mail sends this as IMAP SEARCH server-side,
                        -- so we never load all messages into memory.
                        with timeout of 20 seconds
                            set matchedMsgs to (messages of mb whose subject contains searchTerm)
                        end timeout
                        set matchCount to count of matchedMsgs
                        repeat with j from 1 to matchCount
                            if emailCount >= ${maxEmails} then exit repeat
                            try
                                set currentMsg to item j of matchedMsgs
                                set emailSubject to subject of currentMsg
                                set emailSender to sender of currentMsg
                                set emailDate to (date sent of currentMsg) as string
                                set emailRead to read status of currentMsg
                                set emailContent to ""
                                try
                                    with timeout of 10 seconds
                                        set fullContent to content of currentMsg
                                    end timeout
                                    if (length of fullContent) > ${CONFIG.MAX_SEARCH_CONTENT} then
                                        set emailContent to (characters 1 thru ${CONFIG.MAX_SEARCH_CONTENT} of fullContent) as string
                                        set emailContent to emailContent & "..."
                                    else
                                        set emailContent to fullContent
                                    end if
                                on error
                                    set emailContent to "[Content not available]"
                                end try
                                set readStr to "false"
                                if emailRead then set readStr to "true"
                                set emailData to emailData & "SUBJECT:" & emailSubject & "|SENDER:" & emailSender & "|DATE:" & emailDate & "|CONTENT:" & emailContent & "|READ:" & readStr & "|MAILBOX:" & mailboxName & "||"
                                set emailCount to emailCount + 1
                            on error
                            end try
                        end repeat
                    on error
                        -- Mailbox timed out or inaccessible, skip it
                    end try
                end repeat
            end if
        on error
        end try
    end repeat

    return emailData
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (!result) return [];

		return result.split("||").filter(Boolean).map((entry) => {
			const fields: Record<string, string> = {};
			entry.split("|").forEach((part) => {
				const idx = part.indexOf(":");
				if (idx > -1) {
					fields[part.slice(0, idx)] = part.slice(idx + 1);
				}
			});
			return {
				subject: fields["SUBJECT"] || "No subject",
				sender: fields["SENDER"] || "Unknown sender",
				dateSent: fields["DATE"] || new Date().toString(),
				content: fields["CONTENT"] || "[Content not available]",
				isRead: fields["READ"] === "true",
				mailbox: fields["MAILBOX"] || "Unknown",
			};
		});
	} catch (error) {
		console.error(
			`Error searching emails: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Send an email
 */
async function sendMail(
	to: string,
	subject: string,
	body: string,
	cc?: string,
	bcc?: string,
): Promise<string | undefined> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		// Validate inputs
		if (!to || !to.trim()) {
			throw new Error("To address is required");
		}
		if (!subject || !subject.trim()) {
			throw new Error("Subject is required");
		}
		if (!body || !body.trim()) {
			throw new Error("Email body is required");
		}

		// Validate and escape all user inputs
		const safeSubject = escapeAppleScriptString(validateName(subject, 'Subject', 998));
		const safeTo = escapeAppleScriptString(validateEmail(to));
		const safeCc = cc ? escapeAppleScriptString(validateEmail(cc)) : null;
		const safeBcc = bcc ? escapeAppleScriptString(validateEmail(bcc)) : null;

		// Use file-based approach for email body to avoid AppleScript escaping issues
		// randomBytes gives an unpredictable name — prevents symlink race attacks
		const tmpFile = `/tmp/email-${randomBytes(16).toString("hex")}.txt`;
		const fs = require("fs");

		// mode 0o600: only the current user can read/write this file
		fs.writeFileSync(tmpFile, body.trim(), { encoding: "utf8", mode: 0o600 });

		const script = `
tell application "Mail"
    activate

    -- Read email body from file to preserve formatting
    set emailBody to read file POSIX file "${tmpFile}" as «class utf8»

    -- Create new message
    set newMessage to make new outgoing message with properties {subject:"${safeSubject}", content:emailBody, visible:true}

    tell newMessage
        make new to recipient with properties {address:"${safeTo}"}
        ${safeCc ? `make new cc recipient with properties {address:"${safeCc}"}` : ""}
        ${safeBcc ? `make new bcc recipient with properties {address:"${safeBcc}"}` : ""}
    end tell

    send newMessage
    return "SUCCESS"
end tell`;

		const result = (await runAppleScript(script)) as string;

		// Clean up temporary file
		try {
			fs.unlinkSync(tmpFile);
		} catch (e) {
			// Ignore cleanup errors
		}

		if (result === "SUCCESS") {
			return `Email sent to ${to} with subject "${subject}"`;
		} else {
			throw new Error("Failed to send email");
		}
	} catch (error) {
		console.error(
			`Error sending email: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw new Error(
			`Error sending email: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Get list of mailboxes (simplified for performance)
 */
async function getMailboxes(): Promise<string[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const script = `
tell application "Mail"
    set boxNames to ""
    try
        set allBoxes to mailboxes
        repeat with i from 1 to count of allBoxes
            try
                set boxNames to boxNames & (name of item i of allBoxes) & "||"
            end try
        end repeat
    on error
    end try
    return boxNames
end tell`;

		const result = (await runAppleScript(script)) as string;
		if (!result) return [];
		return result.split("||").map((s) => s.trim()).filter(Boolean);
	} catch (error) {
		console.error(
			`Error getting mailboxes: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Get list of email accounts, filtered by APPLE_MCP_MAIL_ACCOUNT_WHITELIST if set.
 */
async function getAccounts(): Promise<string[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const script = `
tell application "Mail"
    set accountNames to ""
    try
        set allAccounts to accounts
        repeat with i from 1 to count of allAccounts
            try
                set accountNames to accountNames & (name of item i of allAccounts) & "||"
            end try
        end repeat
    on error
    end try
    return accountNames
end tell`;

		const result = (await runAppleScript(script)) as string;
		if (!result) return [];
		const all = result.split("||").map((s) => s.trim()).filter(Boolean);
		return all.filter(isAccountAllowed);
	} catch (error) {
		console.error(
			`Error getting accounts: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Get mailboxes for a specific account
 */
async function getMailboxesForAccount(accountName: string): Promise<string[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		if (!accountName || !accountName.trim()) {
			return [];
		}

		const escapedAccountName = escapeAppleScriptString(validateName(accountName, 'Account name'));
		const script = `
tell application "Mail"
    set boxList to ""

    try
        -- Find account by name or email address (case-insensitive)
        set searchQuery to "${escapedAccountName}"
        set targetAccount to missing value
        repeat with acct in accounts
            ignoring case
                if (name of acct) is equal to searchQuery then
                    set targetAccount to acct
                    exit repeat
                end if
            end ignoring
            try
                repeat with emailAddr in (email addresses of acct)
                    ignoring case
                        if (emailAddr as text) is equal to searchQuery then
                            set targetAccount to acct
                        end if
                    end ignoring
                end repeat
            end try
            if targetAccount is not missing value then exit repeat
        end repeat
        if targetAccount is missing value then
            return ""
        end if

        set accountMailboxes to mailboxes of targetAccount
        repeat with i from 1 to (count of accountMailboxes)
            try
                set currentMailbox to item i of accountMailboxes
                set boxList to boxList & (name of currentMailbox) & "||"
            on error
                -- Skip problematic mailboxes
            end try
        end repeat
    on error
        return ""
    end try

    return boxList
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (!result) return [];
		return result.split("||").map((s) => s.trim()).filter(Boolean);
	} catch (error) {
		console.error(
			`Error getting mailboxes for account: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Get latest emails from a specific account
 */
async function getLatestMails(
	account: string,
	limit = 5,
): Promise<EmailMessage[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const escapedAccount = escapeAppleScriptString(validateName(account, 'Account name'));
		const maxLimit = Math.min(limit, CONFIG.MAX_EMAILS);
		const script = `
tell application "Mail"
    set emailData to ""
    set emailCount to 0
    try
        -- Find account by name or email address (case-insensitive)
        set searchQuery to "${escapedAccount}"
        set targetAccount to missing value
        repeat with acct in accounts
            ignoring case
                if (name of acct) is equal to searchQuery then
                    set targetAccount to acct
                    exit repeat
                end if
            end ignoring
            try
                repeat with emailAddr in (email addresses of acct)
                    ignoring case
                        if (emailAddr as text) is equal to searchQuery then
                            set targetAccount to acct
                        end if
                    end ignoring
                end repeat
            end try
            if targetAccount is not missing value then exit repeat
        end repeat
        if targetAccount is missing value then
            error "Account not found: " & searchQuery
        end if

        -- Only search INBOX — avoids pulling old Sent/Archive emails
        set acctMailboxes to every mailbox of targetAccount
        set targetMailbox to missing value
        repeat with mb in acctMailboxes
            ignoring case
                if (name of mb) is "inbox" then
                    set targetMailbox to mb
                    exit repeat
                end if
            end ignoring
        end repeat
        if targetMailbox is missing value then error "INBOX not found"

        -- Date filter: Mail translates this to IMAP SEARCH server-side,
        -- so we never load all 2000+ messages into memory.
        -- 90-day window gives a good candidate pool; TS sorts and slices to limit.
        set cutoffDate to (current date) - (90 * days)
        with timeout of 30 seconds
            set candidateMsgs to (messages of targetMailbox whose date sent >= cutoffDate)
        end timeout
        set candidateCount to count of candidateMsgs
        repeat with i from 1 to candidateCount
            try
                set currentMsg to item i of candidateMsgs
                set msgSubject to subject of currentMsg
                set msgSender to sender of currentMsg
                set msgDate to (date sent of currentMsg) as string
                set emailData to emailData & "SUBJECT:" & msgSubject & "|SENDER:" & msgSender & "|DATE:" & msgDate & "|MAILBOX:" & (name of targetMailbox) & "||"
            on error
                -- Skip problematic messages
            end try
        end repeat
    on error errMsg
        return "Error: " & errMsg
    end try

    return emailData
end tell`;

		const asResult = await runAppleScript(script);

		if (asResult && asResult.startsWith("Error:")) {
			throw new Error(asResult);
		}

		if (!asResult) return [];

		return asResult.split("||").filter(Boolean).map((entry) => {
			const fields: Record<string, string> = {};
			entry.split("|").forEach((part) => {
				const idx = part.indexOf(":");
				if (idx > -1) {
					fields[part.slice(0, idx)] = part.slice(idx + 1);
				}
			});
			return {
				subject: fields["SUBJECT"] || "No subject",
				sender: fields["SENDER"] || "Unknown sender",
				dateSent: fields["DATE"] || new Date().toString(),
				content: "[Use search to retrieve email content]",
				isRead: false,
				mailbox: `${account} - ${fields["MAILBOX"] || "Unknown"}`,
			};
		})
		// Sort newest-first by date, then take the requested limit
		.sort((a, b) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime())
		.slice(0, maxLimit);
	} catch (error) {
		console.error("Error getting latest emails:", error);
		return [];
	}
}

/**
 * Move a specific email to Trash. Matches by exact subject and partial sender
 * within the INBOX of the given account. Only the first match is trashed.
 * Trash is recoverable — the message can be restored from the Trash mailbox.
 *
 * Requires account, subject, and sender to avoid accidental mass deletion.
 */
async function trashMail(
	account: string,
	subject: string,
	sender: string,
): Promise<string> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const escapedAccount = escapeAppleScriptString(validateName(account, "Account name"));
		const escapedSubject = escapeAppleScriptString(subject.slice(0, 500));
		const escapedSender = escapeAppleScriptString(sender.slice(0, 200));

		const script = `
tell application "Mail"
    -- Find the target account
    set targetAccount to missing value
    repeat with acct in accounts
        ignoring case
            if (name of acct) is equal to "${escapedAccount}" then
                set targetAccount to acct
                exit repeat
            end if
        end ignoring
    end repeat
    if targetAccount is missing value then
        return "Error: Account not found: ${escapedAccount}"
    end if

    -- Find INBOX only (safe: unread/recent mail lives here)
    set targetMailbox to missing value
    repeat with mb in (mailboxes of targetAccount)
        ignoring case
            if (name of mb) is "inbox" then
                set targetMailbox to mb
                exit repeat
            end if
        end ignoring
    end repeat
    if targetMailbox is missing value then
        return "Error: INBOX not found in account ${escapedAccount}"
    end if

    -- Find candidates by exact subject (IMAP SEARCH server-side)
    with timeout of 20 seconds
        set candidates to (messages of targetMailbox whose subject is "${escapedSubject}")
    end timeout

    -- Narrow to first message whose sender contains the given sender string
    set foundMsg to missing value
    repeat with msg in candidates
        ignoring case
            if (sender of msg) contains "${escapedSender}" then
                set foundMsg to msg
                exit repeat
            end if
        end ignoring
    end repeat

    if foundMsg is missing value then
        return "Error: No matching message found"
    end if

    -- delete in Mail.app moves to Trash (recoverable)
    delete foundMsg
    return "SUCCESS"
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (result === "SUCCESS") {
			return `Moved to Trash: "${subject}" from ${sender}`;
		} else {
			throw new Error(result);
		}
	} catch (error) {
		console.error(
			`Error trashing email: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw new Error(
			`Error trashing email: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Mark a specific email as read. Matches by exact subject and partial sender
 * within the INBOX of the given account. Only the first match is updated.
 */
async function markAsRead(
	account: string,
	subject: string,
	sender: string,
): Promise<string> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const escapedAccount = escapeAppleScriptString(validateName(account, "Account name"));
		const escapedSubject = escapeAppleScriptString(subject.slice(0, 500));
		const escapedSender = escapeAppleScriptString(sender.slice(0, 200));

		const script = `
tell application "Mail"
    set targetAccount to missing value
    repeat with acct in accounts
        ignoring case
            if (name of acct) is equal to "${escapedAccount}" then
                set targetAccount to acct
                exit repeat
            end if
        end ignoring
    end repeat
    if targetAccount is missing value then
        return "Error: Account not found: ${escapedAccount}"
    end if

    set targetMailbox to missing value
    repeat with mb in (mailboxes of targetAccount)
        ignoring case
            if (name of mb) is "inbox" then
                set targetMailbox to mb
                exit repeat
            end if
        end ignoring
    end repeat
    if targetMailbox is missing value then
        return "Error: INBOX not found in account ${escapedAccount}"
    end if

    with timeout of 20 seconds
        set candidates to (messages of targetMailbox whose subject is "${escapedSubject}")
    end timeout

    set foundMsg to missing value
    repeat with msg in candidates
        ignoring case
            if (sender of msg) contains "${escapedSender}" then
                set foundMsg to msg
                exit repeat
            end if
        end ignoring
    end repeat

    if foundMsg is missing value then
        return "Error: No matching message found"
    end if

    set read status of foundMsg to true
    return "SUCCESS"
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (result === "SUCCESS") {
			return `Marked as read: "${subject}" from ${sender}`;
		} else {
			throw new Error(result);
		}
	} catch (error) {
		console.error(
			`Error marking email as read: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw new Error(
			`Error marking email as read: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export default {
	getUnreadMails,
	searchMails,
	sendMail,
	getMailboxes,
	getAccounts,
	getMailboxesForAccount,
	getLatestMails,
	trashMail,
	markAsRead,
	requestMailAccess,
};
