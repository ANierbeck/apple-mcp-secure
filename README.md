# 🍎 Apple MCP - Better Siri that can do it all :)

> **Plot twist:** Your Mac can do more than just look pretty. Turn your Apple apps into AI superpowers!

Love this MCP? Check out supermemory MCP too - https://mcp.supermemory.ai


Click below for one click install with `.dxt`

<a href="https://github.com/supermemoryai/apple-mcp/releases/download/1.0.0/apple-mcp.dxt">
  <img  width="280" alt="Install with Claude DXT" src="https://github.com/user-attachments/assets/9b0fa2a0-a954-41ee-ac9e-da6e63fc0881" />
</a>

[![smithery badge](https://smithery.ai/badge/@Dhravya/apple-mcp)](https://smithery.ai/server/@Dhravya/apple-mcp)


<a href="https://glama.ai/mcp/servers/gq2qg6kxtu">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gq2qg6kxtu/badge" alt="Apple Server MCP server" />
</a>

## 🤯 What Can This Thing Do?

**Basically everything you wish your Mac could do automatically (but never bothered to set up):**

### 💬 **Messages** - Because who has time to text manually?

- Send messages to anyone in your contacts (even that person you've been avoiding)
- Read your messages (finally catch up on those group chats)
- Schedule messages for later (be that organized person you pretend to be)

### 📝 **Notes** - Your brain's external hard drive

- Create notes faster than you can forget why you needed them
- Search through that digital mess you call "organized notes"
- Actually find that brilliant idea you wrote down 3 months ago

### 👥 **Contacts** - Your personal network, digitized

- Find anyone in your contacts without scrolling forever
- Get phone numbers instantly (no more "hey, what's your number again?")
- Actually use that contact database you've been building for years

### 📧 **Mail** - Email like a pro (or at least pretend to)

- Send emails with attachments, CC, BCC - the whole professional shebang
- Search through your email chaos with surgical precision
- Schedule emails for later (because 3 AM ideas shouldn't be sent at 3 AM)
- Check unread counts (prepare for existential dread)

### ⏰ **Reminders** - For humans with human memory

- Create reminders with due dates (finally remember to do things)
- Search through your reminder graveyard
- List everything you've been putting off
- Open specific reminders (face your procrastination)

### 📅 **Calendar** - Time management for the chronically late

- Create events faster than you can double-book yourself
- Search for that meeting you're definitely forgetting about
- List upcoming events (spoiler: you're probably late to something)
- Open calendar events directly (skip the app hunting)

### 🗺️ **Maps** - For people who still get lost with GPS

- Search locations (find that coffee shop with the weird name)
- Save favorites (bookmark your life's important spots)
- Get directions (finally stop asking Siri while driving)
- Create guides (be that friend who plans everything)
- Drop pins like you're claiming territory

## 🎭 The Magic of Chaining Commands

Here's where it gets spicy. You can literally say:

_"Read my conference notes, find contacts for the people I met, and send them a thank you message"_

And it just... **works**. Like actual magic, but with more code.

## 🚀 Installation (The Easy Way)

### Option 1: Smithery (For the Sophisticated)

```bash
npx -y install-mcp apple-mcp --client claude
```

For Cursor users (we see you):

```bash
npx -y install-mcp apple-mcp --client cursor
```

### Option 2: Manual Setup (For the Brave)

<details>
<summary>Click if you're feeling adventurous</summary>

First, get bun (if you don't have it already):

```bash
brew install oven-sh/bun/bun
```

Then add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-mcp": {
      "command": "bunx",
      "args": ["--no-cache", "apple-mcp@latest"]
    }
  }
}
```

</details>

## 🎬 See It In Action

Here's a step-by-step video walkthrough: https://x.com/DhravyaShah/status/1892694077679763671

(Yes, it's actually as cool as it sounds)

## 🎯 Example Commands That'll Blow Your Mind

```
"Send a message to mom saying I'll be late for dinner"
```

```
"Find all my AI research notes and email them to sarah@company.com"
```

```
"Create a reminder to call the dentist tomorrow at 2pm"
```

```
"Show me my calendar for next week and create an event for coffee with Alex on Friday"
```

```
"Find the nearest pizza place and save it to my favorites"
```

## ⚡ Performance Improvements (Phase 1A)

### Mail: MailKit Swift Helper
**10-30x faster** mail queries with optimized AppleScript:

**Before:** 2-7 seconds per query  
**After:** 0.4-0.5 seconds per query  

- Early-exit iteration (stops after finding N unread emails)
- Handles large mailboxes (7,000+ messages) in <1 second
- Graceful fallback to AppleScript
- Full MCP protocol support
- German macOS compatible

📖 **[MAILKIT_IMPLEMENTATION.md](MAILKIT_IMPLEMENTATION.md)** - Architecture, performance, troubleshooting

### Calendar: EventKit Native API
**50-100x faster** calendar queries with native EventKit framework:

**Before:** 2-5 seconds per query  
**After:** <100ms per query  

- Native Swift API (not AppleScript)
- Database predicates for efficient filtering
- Full event details (location, notes, all-day status)
- Handles 12,000+ event calendars instantly
- Type-safe with compile-time guarantees

📖 **[EVENTKIT_IMPLEMENTATION.md](EVENTKIT_IMPLEMENTATION.md)** - Architecture, performance, features

### Summary
**Comprehensive Documentation:**
- **[PHASE_1A_COMPLETION.md](PHASE_1A_COMPLETION.md)** - Full project report, metrics, verification

## ⚙️ Configuration

### Account & Calendar Filtering

Restrict which mail accounts and calendars are accessible via environment variables:

**Mail Account Whitelist:**
```bash
APPLE_MCP_MAIL_ACCOUNT_WHITELIST=Work,Personal
```
Only these accounts appear in unread/search results. If unset, all accounts are visible.

**Calendar Blocklist:**
```bash
APPLE_MCP_CALENDAR_BLOCKLIST=Work,Projects
```
Exclude these calendars from results.

**Calendar Allowlist:**
```bash
APPLE_MCP_CALENDAR_ALLOWLIST=Personal,Family
```
If set, *only* these calendars are queried. Overrides blocklist.

Store these in your `.env.local` (not committed to git):
```bash
# .env.local
APPLE_MCP_MAIL_ACCOUNT_WHITELIST=Work
APPLE_MCP_CALENDAR_BLOCKLIST=Archive
```

## 🛠️ Local Development (For the Tinkerers)

```bash
git clone https://github.com/dhravya/apple-mcp.git
cd apple-mcp
bun install
bun run index.ts
```

Now go forth and automate your digital life! 🚀

---

_Made with ❤️ by supermemory (and honestly, claude code)_
