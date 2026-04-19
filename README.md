# 🍎 apple-mcp-secure

> **An evolution of apple-mcp** - Hardened macOS integration for Claude with blazing-fast native APIs (EventKit + MailKit) and comprehensive security controls.

A fork of [apple-mcp](https://github.com/supermemoryai/apple-mcp) that has evolved into **apple-mcp-secure**: Mail and Calendar completely reimplemented with focus on **performance**, **security**, and **native Swift integration**.

## Architecture

### ✅ Completely New (Phase 1A)
- **Mail (MailKit):** Native Swift binary - 10-30x faster than AppleScript
- **Calendar (EventKit):** Native EventKit.framework - 50-100x faster than AppleScript
- **Performance:** <100ms calendar queries, 0.4s mail queries (even 7K+ message mailboxes)
- **Security:** Whitelist-based access control, input validation, TCC permission handling
- **Fallback:** Graceful degradation to AppleScript if native APIs unavailable

### 📦 Other Tools (AppleScript-based)
- Contacts, Messages, Notes, Maps, Reminders
- From original apple-mcp, maintained for compatibility
- 2-5 second typical queries (acceptable for read-only operations)

---

## 🎯 What It Does

### 📧 **Mail** (NEW - 10-30x faster)
- **Unread emails:** Get unread count from any account (<1 second)
- **Search emails:** Full-text search with account filtering
- **Send emails:** Send with CC, BCC, attachments (scheduled optional)
- **Account whitelist:** Control which accounts are accessible via `APPLE_MCP_MAIL_ACCOUNT_WHITELIST`

**Performance:** 0.4-0.5s for typical queries, <1s even for 7,000+ message mailboxes.

### 📅 **Calendar** (NEW - 50-100x faster)
- **Get events:** Query by date range, with location and notes
- **List calendars:** See all calendars with event counts
- **Multiple calendars:** Search across calendars simultaneously
- **Calendar filtering:** Allowlist/blocklist via environment variables

**Performance:** <100ms for typical queries, even on 12,000+ event calendars.

### 👥 **Contacts** (Original)
- Search contacts by name
- Get phone numbers and emails instantly
- Access contact details

### 💬 **Messages** (Original)
- Send SMS/iMessage
- Read conversation history
- Schedule messages for later

### 📝 **Notes** (Original)
- Search notes by content
- Create notes in organized folders
- Full-text search

### 🗓️ **Reminders** (Original)
- List reminders from any list
- Create reminders with due dates
- Mark reminders complete

### 🗺️ **Maps** (Original)
- Search for locations
- Get directions
- Save favorites

---

## ⚡ Performance Improvements

### Mail: MailKit Swift Helper
**10-30x faster** mail queries with optimized AppleScript:

**Before:** 2-7 seconds per query  
**After:** 0.4-0.5 seconds per query  

- Early-exit iteration (stops after finding N unread emails)
- Handles large mailboxes (7,000+ messages) in <1 second
- Graceful fallback to AppleScript if binary unavailable

📖 **[MAILKIT_IMPLEMENTATION.md](MAILKIT_IMPLEMENTATION.md)** - Full technical details

### Calendar: EventKit Native API
**50-100x faster** calendar queries with native EventKit framework:

**Before:** 2-5 seconds per query  
**After:** <100ms per query  

- Native Swift API (direct EventKit.framework access)
- Database predicates for efficient filtering
- Handles 12,000+ event calendars instantly
- Full event details included

📖 **[EVENTKIT_IMPLEMENTATION.md](EVENTKIT_IMPLEMENTATION.md)** - Full technical details

---

## 📚 Documentation

- **[PHASE_1A_COMPLETION.md](PHASE_1A_COMPLETION.md)** - Project completion report with metrics and verification
- **[MAILKIT_IMPLEMENTATION.md](MAILKIT_IMPLEMENTATION.md)** - Mail implementation, architecture, performance analysis
- **[EVENTKIT_IMPLEMENTATION.md](EVENTKIT_IMPLEMENTATION.md)** - Calendar implementation, native API details
- **[CLAUDE.md](CLAUDE.md)** - Development guidelines for code style and testing

---

## 🔐 Security & Hardening

This is the `secure/hardened` branch focusing on:

- **Access Control:** Whitelist-based filtering for mail accounts and calendars
- **Input Validation:** Sanitized search terms and date inputs
- **Error Handling:** Clear error messages without sensitive data exposure
- **Permissions:** Explicit TCC (Transparency, Consent, Control) handling
- **Fallback Strategy:** Graceful degradation if native APIs unavailable

### Configuration

**Mail Account Whitelist:**
```bash
APPLE_MCP_MAIL_ACCOUNT_WHITELIST=Work,Personal
```
Only these accounts appear in results. If unset, all accounts are visible.

**Calendar Allowlist:**
```bash
APPLE_MCP_CALENDAR_ALLOWLIST=Personal,Family
```
Only these calendars are queried. If unset, all calendars are visible.

**Calendar Blocklist:**
```bash
APPLE_MCP_CALENDAR_BLOCKLIST=Archive,Backup
```
Exclude these calendars from results.

Store these in `.env.local` (not committed to git):
```bash
# .env.local
APPLE_MCP_MAIL_ACCOUNT_WHITELIST=Work
APPLE_MCP_CALENDAR_ALLOWLIST=Personal
```

---

## 🛠️ Installation & Setup

### Quick Start (Ready to Use ✅)
```bash
git clone https://github.com/ANierbeck/apple-mcp-secure.git
cd apple-mcp-secure
bun install
bun run dev
```

The MCP server will start and be ready to use with Claude or other MCP clients.

### Requirements
- macOS 10.15+ (EventKit and MailKit frameworks)
- Bun runtime (or Node.js)
- Calendar.app and Mail.app configured with accounts

### First Run
On first run, macOS will ask for permissions:
- ✅ Calendar access (System Settings > Privacy & Security > Calendar)
- ✅ Mail access (System Settings > Privacy & Security > Mail)
- ✅ Contacts access (System Settings > Privacy & Security > Contacts)

Grant these so the tools can access your data.

---

## 📋 Known Limitations

### Mail
- No email body content in preview (optimized for unread counts)
- Account filter respects global whitelist setting
- Attachments not fully extracted (headers only)

### Calendar
- Read-only access (no event creation/modification)
- Recurring events not expanded (returns base event)
- No real-time notifications (query-based only)

### Other Tools
- Same limitations as original apple-mcp (AppleScript-based)
- Performance: typical 2-5 second queries

---

## 🔄 Comparison: Original vs Hardened

| Feature | Original | Hardened | Change |
|---------|----------|----------|--------|
| **Mail Performance** | 2-7s | 0.4-0.5s | **10-30x faster** |
| **Calendar Performance** | 2-5s | <100ms | **50-100x faster** |
| **Mail Implementation** | AppleScript | Swift binary | ⭐ New |
| **Calendar Implementation** | AppleScript | Native EventKit | ⭐ New |
| **Access Control** | None | Whitelist-based | ⭐ Enhanced |
| **Error Handling** | Basic | Comprehensive | ⭐ Enhanced |
| **Other Tools** | Original | Unchanged | Same |

---

## 📄 License

MIT License - See original apple-mcp repository

This fork maintains the MIT license and builds upon the original work by:
- Adding Swift native implementations for Mail and Calendar
- Implementing access control and security hardening
- Optimizing performance for large datasets
- Providing comprehensive documentation

---

## 🙏 Fork Evolution: apple-mcp → apple-mcp-secure

Started as a fork of [apple-mcp](https://github.com/supermemoryai/apple-mcp) by Supermemory, but has evolved significantly:

**What's New (Phase 1A):**
- **Mail system:** Completely reimplemented with Swift MailKit binary (10-30x faster)
- **Calendar system:** Completely reimplemented with native EventKit framework (50-100x faster)
- **Security:** Built-in whitelist access control, input validation, TCC handling
- **Documentation:** Comprehensive guides (MAILKIT_IMPLEMENTATION.md, EVENTKIT_IMPLEMENTATION.md, PHASE_1A_COMPLETION.md)

**What's Unchanged:**
- Contacts, Messages, Notes, Maps, Reminders (AppleScript-based from original)
- MCP server infrastructure and tool framework
- MIT license (preserved)

**Result:** A fork that has become **its own thing** - apple-mcp-secure is now the "performance & security-hardened" evolution of apple-mcp.

---

## 📊 Project Status

### ✅ Phase 1A: Complete (April 2026)
- Mail performance: 10-30x improvement
- Calendar performance: 50-100x improvement
- Security hardening: 8-layer defense strategy
- Full documentation and testing

### ✅ Repository Independence: Complete
- MIT License with Supermemory acknowledgment
- Contributing guidelines ([CONTRIBUTING.md](CONTRIBUTING.md))
- Security policy ([SECURITY.md](SECURITY.md))
- Changelog documenting all Phase 1A improvements ([CHANGELOG.md](CHANGELOG.md))

### ⏭️ Future (Optional)
- **Phase 1B (Not Scheduled):** Swift Server PoC evaluation - deferred until performance proves insufficient
- **Ongoing:** Monitor real-world usage, security updates, AppleScript dependency maintenance

---

## 🤝 Contributing

While this is a hardened fork, contributions are welcome for:
- Bug reports in Mail/Calendar performance
- Security improvements
- Documentation enhancements
- Additional Apple app integrations

Please follow [CLAUDE.md](CLAUDE.md) for code style guidelines.

---

---

**Repository:** https://github.com/ANierbeck/apple-mcp-secure  
**Status:** Production-ready ✅  
**Version:** 0.1.0  
**License:** MIT  
**Last Updated:** April 19, 2026  
**Performance:** Mail 10-30x faster, Calendar 50-100x faster  
**Documentation:** Complete (8 comprehensive guides)
