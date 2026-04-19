# Changelog

All notable changes to apple-mcp-secure are documented here.

## [0.1.0] - 2026-04-19

### Phase 1A: Hybrid Swift Architecture

This release marks the complete implementation and documentation of Phase 1A, delivering comprehensive performance improvements and security hardening.

#### Added

**Mail Performance (10-30x Improvement)**
- `swift-tools/MailKitHelper.swift` - Swift binary for optimized email access
  - Early-exit iteration strategy (stops after N unread found)
  - German AppleScript compatibility (forward iteration)
  - Robust JSON parsing with field markers
- `utils/mailkit.ts` - Node.js wrapper with graceful AppleScript fallback
- Performance: <1 second for mailboxes with 7,000+ messages (was 7+ seconds)

**Calendar Performance (50-100x Improvement)**
- `swift-tools/EventKitHelper.swift` - Native EventKit framework integration
  - Database predicates for efficient filtering
  - Full event details (location, notes, all-day status)
  - ISO8601 date formatting throughout
- `utils/eventkit.ts` - Node.js wrapper with graceful AppleScript fallback
- Performance: <100ms for calendars with 12,000+ events (was 12+ seconds)

**Security Hardening**
- `SECURITY.md` - Comprehensive security guide covering:
  - Error message sanitization (no PII leakage)
  - Prompt injection prevention with escaping patterns
  - Input validation functions (email, phone, search terms, names)
  - MCP tool annotations (read/write hints)
  - Send whitelist implementation
  - Access control whitelists/blocklists
  - TCC permission handling
  - Defense-in-depth 6-layer strategy

**Documentation**
- `MAILKIT_IMPLEMENTATION.md` - Complete Mail architecture guide
- `EVENTKIT_IMPLEMENTATION.md` - Complete Calendar architecture guide
- `PHASE_1A_COMPLETION.md` - Phase completion report with metrics
- `CONTRIBUTING.md` - Contribution guidelines
- `CHANGELOG.md` - This file
- `LICENSE` - MIT license

#### Changed

**Mail Module**
- `utils/mail.ts` - MailKit-first strategy with AppleScript fallback
  - Added `account?: string` field to EmailMessage interface
  - Fixed limit parameter slicing (`.slice(0, limit)`)
  - Preserved global whitelist filtering

**Calendar Module**
- `utils/calendar.ts` - EventKit-first strategy with AppleScript fallback
- Graceful degradation if Swift binaries unavailable

**Repository**
- README repositioned as "fork evolution" from Supermemory
- Moved to independent GitHub repository (apple-mcp-secure)
- Main branch created from secure/hardened branch

#### Fixed

**Mail**
- Bug: Account names showing as `undefined` → Added account field to interface
- Bug: Limit parameter ignored → Added explicit `.slice(0, limit)`
- Bug: German AppleScript "down to" incompatibility → Forward iteration only

**Prompt Injection Prevention**
- Updated SECURITY.md to document actual implementations from `utils/applescript-escape.ts`
- Removed inaccurate pseudo-code examples
- Documented real functions with full details (escaping, validation, limits)

### Architecture

```
Before (AppleScript-only):
├─ Mail: 2-7 seconds per query
├─ Calendar: 2-5 seconds per query
└─ Fallback: None

After (Hybrid Swift + AppleScript):
├─ Mail: 0.4-0.5 seconds (MailKit) or 2-7s (fallback)
├─ Calendar: <100ms (EventKit) or 2-5s (fallback)
└─ Contacts, Messages, Maps, Reminders, Notes: AppleScript (unchanged)
```

### Performance Metrics

| Tool | Before | After | Improvement |
|------|--------|-------|-------------|
| Mail (7000+ msgs) | 7.2s | 0.4s | **18x** |
| Calendar (12000+ events) | 12s+ | <100ms | **120x** |
| Mail (typical) | 2.5s | 0.5s | **5x** |
| Calendar (typical) | 3s | 25ms | **120x** |

### Security Improvements

- Null byte stripping in AppleScript strings
- Backslash and quote escaping with proper ordering
- Input validation (email format, phone format, length limits)
- Character restriction (control chars, guillemets)
- Length limits enforced (10K, 200, 320, 255 chars)
- Error messages sanitized (no PII exposure)
- TCC permission handling with clear error messages

### Breaking Changes

None. Phase 1A maintains 100% backward compatibility.

### Verified

- [x] Mail performance: 0.4s for 7000+ message mailbox (18x faster)
- [x] Calendar performance: <100ms for 12000+ event calendar (120x faster)
- [x] Fallback: AppleScript works when Swift binaries unavailable
- [x] MCP Protocol: End-to-end integration verified
- [x] Security: All hardening measures documented and implemented
- [x] Documentation: Complete architecture guides for all improvements

### Known Limitations

**Mail**
- No email body content (optimized for unread counts)
- Forward iteration only (German AppleScript compatibility)

**Calendar**
- Read-only access (no event creation/modification)
- Recurring events not expanded
- No real-time sync

**Other Tools**
- Contacts, Messages, Maps, Reminders, Notes remain AppleScript-based
- Performance: 2-5 second typical queries

### Contributors

- Achim Nierbeck ([@ANierbeck](https://github.com/ANierbeck))
- Original apple-mcp by Supermemory ([@supermemoryai](https://github.com/supermemoryai))

### Links

- GitHub: https://github.com/ANierbeck/apple-mcp-secure
- License: MIT
- Original: https://github.com/supermemoryai/apple-mcp

---

## Future Phases

### Phase 1B: Swift Server PoC (Optional)
Evaluate full Swift Server migration (all tools in Swift, no Node.js overhead).
- Decision point: Pending user evaluation of Phase 1A success

### Phase 2: Repository Maturity
- Copyright headers in new files
- Community guidelines
- Upstream synchronization strategy (if needed)

