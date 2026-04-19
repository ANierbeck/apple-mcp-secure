# Security Hardening Guide

## Overview

apple-mcp-secure implements comprehensive security hardening across multiple layers to protect user data and prevent common attack vectors.

---

## 1. Error Message Sanitization

**Problem:** Sensitive user data (account names, file paths, contact info) was exposed in error messages.

**Solution:** All error messages are sanitized to prevent information leakage.

### Implementation

**Before:**
```typescript
catch (error) {
  throw new Error(`Failed to access account "Work" at path /Users/achim/Library/Mail...`);
}
```

**After:**
```typescript
catch (error) {
  throw new Error(`Failed to access email account. Contact administrator if issue persists.`);
  // Log full error internally, never expose to user
  logger.error(`[Internal] Failed to access account:`, { 
    account, 
    error, 
    timestamp 
  });
}
```

### What's Protected
- ✅ Mail account names (Work, Personal, etc.)
- ✅ File system paths (~/Library/Mail, etc.)
- ✅ Email addresses (not shown in errors)
- ✅ Calendar names (not shown in errors)
- ✅ Contact details (never exposed)
- ✅ System paths and configuration

### Error Message Policy
```
❌ NEVER show in error messages:
  - Account/calendar names
  - Email addresses
  - File paths
  - Contact information
  - System configuration
  - Internal API details

✅ ALWAYS show:
  - Generic operation description ("Failed to query emails")
  - Error category ("Access denied", "Timeout", "Network error")
  - User action ("Contact administrator")
  - Reference ID for logging (optional)
```

---

## 2. Prompt Injection Prevention

**Problem:** User-controlled input (search terms, date ranges) could contain AppleScript/code injection.

**Solution:** Input validation and escaping at all boundaries.

### Implementation

**Mail Search Term Validation:**
```typescript
function sanitizeSearchTerm(term: string): string {
  // Remove special AppleScript characters
  return term
    .replace(/[&"|]/g, '')           // Remove special chars
    .replace(/\$/g, '')               // Remove $ (variable expansion)
    .replace(/`/g, '')                // Remove backticks
    .trim()
    .slice(0, 500);                   // Limit length
}
```

**AppleScript String Escaping:**
```typescript
function escapeAppleScriptString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')           // Escape backslashes
    .replace(/"/g, '\\"')             // Escape quotes
    .replace(/\n/g, '\\n')            // Escape newlines
    .replace(/\r/g, '\\r')            // Escape carriage returns
    .replace(/\t/g, '\\t');           // Escape tabs
}
```

**Date Range Validation:**
```typescript
function validateDateRange(from: Date, to: Date): void {
  if (from > to) {
    throw new Error('Invalid date range: start must be before end');
  }
  const now = new Date();
  const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year
  if (to.getTime() - from.getTime() > maxRange) {
    throw new Error('Date range exceeds maximum (1 year)');
  }
}
```

### Protected Input Boundaries
- ✅ Mail search terms
- ✅ Calendar date ranges
- ✅ Account/calendar name filters
- ✅ Contact search queries
- ✅ Message content (for sending)
- ✅ Note content (for creating)
- ✅ All AppleScript string parameters

---

## 3. MCP Tool Annotations

**Problem:** Tool capabilities and destructiveness were incorrectly annotated, causing MCP clients to make wrong assumptions.

**Solution:** Proper annotations for all tools describing read/write behavior.

### Tool Annotations Standard

```typescript
const MAIL_TOOL: Tool = {
  name: "mail",
  description: "Read and send emails...",
  annotations: {
    readOnlyHint: false,        // CAN write (send emails)
    destructiveHint: true,      // SENDS emails (potentially destructive)
  },
  inputSchema: { /* ... */ }
};

const CONTACTS_TOOL: Tool = {
  name: "contacts",
  description: "Search contacts...",
  annotations: {
    readOnlyHint: true,         // NO writes
    destructiveHint: false,     // Safe to call
  },
  inputSchema: { /* ... */ }
};
```

### Tool Classification

**Read-Only (readOnlyHint: true, destructiveHint: false)**
- ✅ Contacts (search only)
- ✅ Calendar (read events)
- ✅ Notes (search only)
- ✅ Maps (search locations)
- ✅ Reminders (list only)

**Write-Only (readOnlyHint: false, destructiveHint: true)**
- ✅ Mail (sending emails)
- ✅ Messages (sending SMS/iMessage)
- ✅ Notes (create new)
- ✅ Reminders (create/mark complete)

**Mixed (readOnlyHint: false, destructiveHint: true)**
- ✅ Mail (read unread, send emails)
- ✅ Messages (read conversations, send messages)

**Why This Matters:**
- MCP clients respect these hints when planning operations
- Prevents accidental destructive operations
- Allows proper user confirmation for sensitive actions

---

## 4. Send Whitelist for Messages/Email

**Problem:** Any message/email could be sent without restriction, risking spam or accidental leaks.

**Solution:** Optional whitelist-based sending control.

### Implementation

**Environment Variable:**
```bash
# Only allow sending to these addresses
APPLE_MCP_SEND_WHITELIST=boss@company.com,support@company.com,family@personal.com
```

**Validation Logic:**
```typescript
function isSendingAllowed(recipient: string): boolean {
  const whitelist = process.env.APPLE_MCP_SEND_WHITELIST;
  
  if (!whitelist) {
    // No whitelist = allow all (user chose this)
    return true;
  }
  
  const allowedAddresses = whitelist
    .split(',')
    .map(a => a.trim().toLowerCase());
  
  return allowedAddresses.includes(recipient.toLowerCase());
}

// Usage
if (!isSendingAllowed(email.to)) {
  throw new Error(`Sending to ${email.to} is not allowed by whitelist`);
}
```

### Use Cases

**Whitelist Enabled (Restrictive):**
```bash
APPLE_MCP_SEND_WHITELIST=boss@company.com,family@personal.com
```
- Only these recipients can receive emails/messages
- Prevents accidental sends to wrong people
- Good for testing environments

**No Whitelist (Permissive):**
```bash
# Not set
```
- Any recipient allowed
- User takes full responsibility
- Production setting for trusted environments

---

## 5. AppleScript Input Validation & Escaping

**Problem:** Direct AppleScript execution with user input could allow command injection.

**Solution:** Strict input validation and proper escaping throughout the codebase.

### Validation Rules

**Account Names:**
```typescript
function validateAccountName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error('Account name cannot be empty');
  }
  if (name.length > 255) {
    throw new Error('Account name too long');
  }
  if (!/^[a-zA-Z0-9\s\-_.@]+$/.test(name)) {
    throw new Error('Account name contains invalid characters');
  }
}
```

**Calendar Names:**
```typescript
function validateCalendarName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error('Calendar name cannot be empty');
  }
  if (name.length > 255) {
    throw new Error('Calendar name too long');
  }
  // Allow most characters in calendar names
  if (/['"]/g.test(name)) {
    throw new Error('Calendar name cannot contain quotes');
  }
}
```

**Search Terms:**
```typescript
function sanitizeSearchTerm(term: string): string {
  const maxLength = 500;
  const sanitized = term
    .trim()
    .slice(0, maxLength)
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Escape special shell characters
    .replace(/[;&|`$()]/g, '');
  
  return sanitized;
}
```

### Escaping Standards

**All AppleScript String Parameters:**
```typescript
const script = `
  tell application "Mail"
    set searchTerm to "${escapeAppleScriptString(userInput)}"
    -- Now safe to use searchTerm
  end tell
`;
```

**Pattern to Follow:**
```typescript
// ❌ NEVER
const script = `... "${userInput}" ...`;

// ✅ ALWAYS
const script = `... "${escapeAppleScriptString(userInput)}" ...`;
```

---

## 6. Access Control: Whitelisting & Blocklisting

**Problem:** Users might not want all accounts/calendars accessible via MCP.

**Solution:** Environment-based access control.

### Mail Account Whitelist

**Purpose:** Only expose specific email accounts.

**Configuration:**
```bash
APPLE_MCP_MAIL_ACCOUNT_WHITELIST=Work,Personal
```

**Behavior:**
- Only "Work" and "Personal" accounts appear in results
- Queries for other accounts return error
- If not set: all accounts are visible

**Implementation:**
```typescript
function getAllowedMailAccounts(): Set<string> | null {
  const raw = process.env.APPLE_MCP_MAIL_ACCOUNT_WHITELIST;
  if (!raw || !raw.trim()) return null;
  return new Set(
    raw.split(',').map(s => s.trim().toLowerCase())
  );
}

function isAccountAllowed(accountName: string): boolean {
  const allowed = getAllowedMailAccounts();
  if (!allowed) return true; // No whitelist = all allowed
  return allowed.has(accountName.toLowerCase());
}
```

### Calendar Allowlist

**Purpose:** Only expose specific calendars.

**Configuration:**
```bash
APPLE_MCP_CALENDAR_ALLOWLIST=Personal,Family
```

**Behavior:**
- Only these calendars are queried
- Other calendars completely hidden
- Takes precedence over blocklist

### Calendar Blocklist

**Purpose:** Hide specific calendars (e.g., "Archive", "Backup").

**Configuration:**
```bash
APPLE_MCP_CALENDAR_BLOCKLIST=Archive,Backup,Spam
```

**Behavior:**
- These calendars never appear
- Useful for hiding junk or archived calendars
- Ignored if allowlist is set

### Precedence

```
Allowlist set?
  ├─ YES → Use ONLY allowlist, ignore blocklist
  └─ NO → Use blocklist (if set) or all calendars
```

---

## 7. TCC (Transparency, Consent, Control) Handling

**Problem:** macOS requires explicit user permission for Calendar, Mail, Contacts access.

**Solution:** Proper error messages and permission handling.

### First-Run Experience

**When tool called without permission:**
1. **For EventKit (Calendar):**
   ```
   Error: Calendar permission not granted
   Please go to: System Settings > Privacy & Security > Calendar
   Add your terminal/Claude to the list and grant access
   ```

2. **For Mail (AppleScript):**
   ```
   Error: Mail access not granted
   Please go to: System Settings > Privacy & Security > Mail
   Add your terminal/Claude to the list and grant access
   ```

### Permission Handling

```typescript
async function checkMailAccess(): Promise<boolean> {
  try {
    const script = `tell application "Mail" to return name`;
    await runAppleScript(script);
    return true;
  } catch (error) {
    // TCC denial has specific error format
    if (error.message.includes('osascript is not allowed')) {
      throw new Error(
        'Mail access denied. Grant permission in System Settings > Privacy & Security > Mail'
      );
    }
    throw error;
  }
}
```

### Cached Permissions

Once granted, permissions persist:
- ✅ No need to re-grant for each call
- ✅ Permission cached by macOS
- ✅ User sees TCC dialog only once per app

---

## 8. Defense-in-Depth Strategy

### Layer 1: Input Validation
- Validate all user inputs
- Limit string lengths
- Reject invalid characters
- Check date ranges

### Layer 2: Escaping
- Escape AppleScript strings
- Escape shell characters
- Proper quoting in commands

### Layer 3: Whitelisting
- Mail: Account whitelist
- Calendar: Allow/blocklists
- Send: Recipient whitelist (optional)

### Layer 4: Error Handling
- Never expose sensitive info
- Log internally for debugging
- Provide helpful user messages

### Layer 5: Annotations
- Proper MCP tool annotations
- Clear read/write hints
- Destructiveness marking

### Layer 6: TCC Integration
- Proper permission handling
- Clear error messages
- Guided user flow

---

## Configuration Reference

### Complete Secure Configuration Example

```bash
# ~/.env.local (never committed to git)

# Mail Access Control
APPLE_MCP_MAIL_ACCOUNT_WHITELIST=Work,Personal

# Calendar Access Control
APPLE_MCP_CALENDAR_ALLOWLIST=Personal,Family
APPLE_MCP_CALENDAR_BLOCKLIST=Archive

# Send Restrictions (optional)
APPLE_MCP_SEND_WHITELIST=boss@company.com,family@personal.com

# Logging
LOG_LEVEL=info
```

### Production Checklist

- [ ] Error messages reviewed for data leakage
- [ ] Input validation tested with malicious inputs
- [ ] AppleScript escaping verified
- [ ] MCP annotations correct
- [ ] Whitelists configured appropriately
- [ ] TCC permissions granted
- [ ] .env.local never committed
- [ ] Logs don't expose sensitive data

---

## Security Best Practices

### For Users

1. **Never commit `.env.local` to git**
2. **Review whitelist/blocklist settings**
3. **Use send whitelist in testing environments**
4. **Monitor logs for suspicious activity**
5. **Grant TCC permissions cautiously**
6. **Keep macOS and Claude updated**

### For Developers

1. **Always escape AppleScript input** (use `escapeAppleScriptString`)
2. **Validate all user inputs** (account names, dates, search terms)
3. **Never expose sensitive data in errors**
4. **Test with malicious inputs** ("'; rm -rf /")
5. **Use proper MCP annotations**
6. **Review security fixes** before merging

### For Deployment

1. **Use whitelist in production** (restrict to needed accounts)
2. **Enable send whitelist** (prevent accidental sends)
3. **Review error logs regularly**
4. **Keep backups of `.env.local` settings**
5. **Document security decisions**

---

## Audit Log

**Phase 1A Security Hardening (April 2026):**
- ✅ Error message sanitization
- ✅ Prompt injection prevention
- ✅ MCP tool annotations
- ✅ Send whitelist implementation
- ✅ AppleScript input escaping
- ✅ Access control (whitelists/blocklists)
- ✅ TCC permission handling
- ✅ Security documentation

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. **Email** ultimate-surfer@gmx.net with details
3. **Include:** Vulnerability description, impact, reproduction steps
4. **Allow:** Time for fix before public disclosure (30 days)

---

**Last Updated:** April 2026  
**Status:** Production-Ready  
**Audit Level:** Comprehensive
