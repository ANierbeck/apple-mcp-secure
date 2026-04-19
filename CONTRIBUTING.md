# Contributing to apple-mcp-secure

Thank you for your interest in contributing! This document explains how to report bugs, propose features, and submit code.

## Getting Started

### Development Setup
```bash
git clone https://github.com/ANierbeck/apple-mcp-secure.git
cd apple-mcp-secure
bun install
bun run dev
```

### Code Style
Follow the guidelines in [CLAUDE.md](CLAUDE.md):
- 2-space indentation
- Lines under 100 characters
- Explicit type annotations (TypeScript)
- PascalCase for types/interfaces, camelCase for variables/functions

### Testing
Before submitting a PR:
1. Run `bun run dev` and verify the MCP server works
2. Test with your own Mail.app and Calendar.app data
3. Check error handling for edge cases

## Reporting Bugs

Use [GitHub Issues](https://github.com/ANierbeck/apple-mcp-secure/issues) to report bugs.

**For security issues:** See [SECURITY.md](SECURITY.md) for responsible disclosure.

When reporting a bug, include:
- Your macOS version
- Steps to reproduce
- Expected vs actual behavior
- Error message (if applicable)

Example:
```
Title: Calendar queries timeout with 12K+ events

Environment:
- macOS 13.5
- Apple Silicon M2

Steps:
1. Create calendar with 12,000+ events
2. Call calendar tool with 1-month date range
3. Observe: Timeout after 15 seconds

Expected: Query completes in <100ms
Actual: Timeout, no results returned
```

## Proposing Features

Open a [GitHub Issue](https://github.com/ANierbeck/apple-mcp-secure/issues) or [Discussion](https://github.com/ANierbeck/apple-mcp-secure/discussions).

Describe:
- Use case and motivation
- Proposed solution
- Alternative approaches considered
- Impact on existing functionality

## Submitting Pull Requests

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes** following code style (CLAUDE.md)

3. **Commit with clear messages** (conventional commits):
   ```
   feat: Add event creation to calendar
   fix: Handle null bytes in search terms
   docs: Update SECURITY.md with new escaping rules
   ```

4. **Push and create PR**:
   ```bash
   git push origin feature/my-feature
   ```

5. **PR Description** should include:
   - What problem does this solve?
   - How was it tested?
   - Any breaking changes?

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring (no behavior change)
- `test`: Test additions/changes
- `security`: Security improvements

**Example:**
```
feat: Add phone number validation for message sending

Validates phone numbers before interpolating into AppleScript.
Accepts international +1 format and common variations.

Closes #42
```

## Scope

### In Scope
- Bug fixes (Mail, Calendar, other tools)
- Security improvements (input validation, escaping, etc.)
- Documentation enhancements
- Performance optimizations
- Error handling improvements

### Out of Scope
- Contacts, Messages, Notes, Reminders, Maps (AppleScript-based; low priority)
- Full Swift Server migration (Part 1B, pending decision)
- Features requiring new macOS APIs (TCC expansion)

## Code Review Process

1. Automated checks run (type checking, linting if enabled)
2. Project maintainer reviews for:
   - Security implications
   - Performance impact
   - Code style adherence
   - Test coverage
3. Feedback and iterations
4. Merge when approved

## Questions?

- Check [README.md](README.md) for overview
- See [SECURITY.md](SECURITY.md) for hardening details
- Review [MAILKIT_IMPLEMENTATION.md](MAILKIT_IMPLEMENTATION.md) for mail architecture
- Check [EVENTKIT_IMPLEMENTATION.md](EVENTKIT_IMPLEMENTATION.md) for calendar architecture

Thank you for contributing! 🎉
