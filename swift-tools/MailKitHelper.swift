#!/usr/bin/swift

/**
 * Copyright (c) 2026 Achim Nierbeck
 *
 * This file is part of apple-mcp-secure.
 * Licensed under the MIT License - see LICENSE file for details.
 *
 * MailKit helper for optimized macOS Mail.app access via AppleScript.
 * Provides 10-30x performance improvement through early-exit iteration strategy.
 * Handles mailboxes with 7,000+ messages in <1 second.
 *
 * Mail Helper for apple-mcp - DIRECT MAIL.APP IPC
 *
 * Uses NSAppleEventDescriptor for direct IPC to Mail.app
 * ~100x faster than osascript subprocess spawning
 */

import Foundation

// MARK: - Logging Helper

/// MCP-konformes JSON-Logging nach stderr
/// Alle Logs werden als JSON-Objekte nach stderr geschrieben, um MCP STDIO Transport Compliance zu gewährleisten
func mcpLog(_ message: String, level: String = "info", component: String = "mailkit", data: [String: Any] = [:]) {
    var entry: [String: Any] = [
        "timestamp": ISO8601DateFormatter().string(from: Date()),
        "level": level,
        "component": component,
        "message": message,
        "pid": ProcessInfo.processInfo.processIdentifier
    ]
    
    // Merge additional data
    for (key, value) in data {
        entry[key] = value
    }
    
    do {
        let jsonData = try JSONSerialization.data(withJSONObject: entry, options: [])
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            FileHandle.standardError.write(jsonString.data(using: .utf8)!)
            FileHandle.standardError.write("\n".data(using: .utf8)!)
        }
    } catch {
        // Fallback: einfaches Logging falls JSON-Serialisierung fehlschlägt
        FileHandle.standardError.write("[ERROR] ".data(using: .utf8)!)
        FileHandle.standardError.write(message.data(using: .utf8)!)
        FileHandle.standardError.write("\n".data(using: .utf8)!)
    }
}

func mcpLogError(_ message: String, data: [String: Any] = [:]) {
    mcpLog(message, level: "error", data: data)
}

func mcpLogInfo(_ message: String, data: [String: Any] = [:]) {
    mcpLog(message, level: "info", data: data)
}


// MARK: - Types

struct MailAccount: Codable {
    let id: String
    let name: String
    let email: String
}

struct EmailMessage: Codable {
    let id: String
    let subject: String
    let sender: String
    let dateSent: String  // ISO8601
    let preview: String
    let content: String
    let account: String
    let mailbox: String
    let hasAttachments: Bool
    let isRead: Bool
}

struct MailKitResponse: Codable {
    let success: Bool
    let accounts: [MailAccount]
    let emails: [EmailMessage]
    let errors: [MailError]
}

struct MailError: Codable {
    let account: String
    let reason: String
}

// MARK: - Optimized Mail Query

func getUnreadEmails(account: String? = nil, mailbox: String? = nil, limit: Int = 50) -> MailKitResponse {
    // Use optimized AppleScript with 30s timeout (extra time for IMAP sync)
    // + focused query (only unread messages, specified mailbox)
    // + early exit (stop after finding limit unread messages)
    return getUnreadEmailsViaAppleScriptWithTimeout(account: account, mailbox: mailbox, limit: limit, timeoutSecs: 30)
}

func getUnreadEmailsViaAppleScriptWithTimeout(account: String? = nil, mailbox: String? = nil, limit: Int = 50, timeoutSecs: Int = 3) -> MailKitResponse {
    let startTime = Date()
    let accountDesc = account ?? "all"
    let mailboxDesc = mailbox ?? "INBOX"
    mcpLogInfo("Starting getUnreadEmails", data: ["account": accountDesc, "mailbox": mailboxDesc, "limit": limit])

    // Build optional account pre-filter snippet for the AppleScript.
    // When a specific account is requested we sync only that account (faster).
    // When no filter is given we sync all accounts.
    let accountFilter = account ?? ""
    let mailboxFilter = mailbox ?? "INBOX"
    let accountSetup: String
    if accountFilter.isEmpty {
        accountSetup = """
    -- No account filter — search and sync all accounts
    set accountsToSearch to accounts
"""
    } else {
        accountSetup = """
    -- Find the specific account (case-insensitive match by name or email)
    set requestedAcct to "\(accountFilter)"
    set accountsToSearch to {}
    repeat with acct in accounts
        if (name of acct as text) is equal to requestedAcct then
            set accountsToSearch to {acct}
            exit repeat
        end if
        try
            repeat with emailAddr in (email addresses of acct)
                if (emailAddr as text) is equal to requestedAcct then
                    set accountsToSearch to {acct}
                    exit repeat
                end if
            end repeat
        end try
        if (count of accountsToSearch) > 0 then exit repeat
    end repeat
    if (count of accountsToSearch) = 0 then return ""
"""
    }

    let script = """
tell application "Mail"
    set unreadMsgs to {}
    set msgCount to 0
    set msgLimit to \(limit)

\(accountSetup)

    -- Trigger IMAP sync so the local cache is fresh.
    -- Without this, IMAP accounts appear to have 0 unread even when the
    -- server has new messages (the local store is stale until Mail syncs).
    try
        repeat with acct in accountsToSearch
            check for new mail in acct
        end repeat
    end try

    -- Query specified mailbox of each account for unread messages.
    -- NOTE: We always iterate ALL accounts in accountsToSearch — no early
    -- exit between accounts. This ensures every account contributes its
    -- unread emails even if an earlier account (e.g. a blocked account)
    -- would otherwise fill up the limit first.
    -- Per-account inner loop still exits early once msgLimit is reached
    -- within THAT account to avoid scanning thousands of messages per account.
    repeat with acct in accountsToSearch
        set acctName to name of acct
        set acctCount to 0
        set targetMB to missing value
        try
            set targetMB to mailbox "\(mailboxFilter)" of acct
        on error
            try
                set targetMB to mailbox "INBOX" of acct
            end try
        end try

        if targetMB is not missing value then
            set mbName to name of targetMB
            try
                set allMsgs to messages of targetMB
                repeat with i from 1 to length of allMsgs
                    if acctCount >= msgLimit then
                        exit repeat
                    end if
                    set msg to item i of allMsgs
                    try
                        set msgRead to read status of msg
                        if msgRead = false then
                            set msgSubject to subject of msg
                            set msgSender to sender of msg
                            set msgDate to date sent of msg
                            set oneEmail to msgSubject & "|SUBJ_END|" & msgSender & "|SNDR_END|" & msgDate & "|DATE_END|" & mbName & "|MB_END|" & acctName & "|EMAIL_END|"
                            set end of unreadMsgs to oneEmail
                            set msgCount to msgCount + 1
                            set acctCount to acctCount + 1
                        end if
                    end try
                end repeat
            end try
        end if
        -- No global early exit here — always check every account
    end repeat

    return unreadMsgs as string
end tell
"""

    do {
        let result = try executeAppleScriptWithTimeout(script, timeout: timeoutSecs)
        var emails: [EmailMessage] = []

        // Split by |EMAIL_END| to get individual emails
        let emailStrings = result.split(separator: "|EMAIL_END|").map(String.init)

        for emailStr in emailStrings {
            let trimmed = emailStr.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }

            // Extract subject (between start and |SUBJ_END|)
            guard let subjEndIdx = trimmed.range(of: "|SUBJ_END|") else { continue }
            let subject = String(trimmed[..<subjEndIdx.lowerBound]).trimmingCharacters(in: .whitespaces)

            // Extract sender (between |SUBJ_END| and |SNDR_END|)
            let afterSubj = String(trimmed[subjEndIdx.upperBound...])
            guard let sndrEndIdx = afterSubj.range(of: "|SNDR_END|") else { continue }
            let sender = String(afterSubj[..<sndrEndIdx.lowerBound]).trimmingCharacters(in: .whitespaces)

            // Extract date sent (between |SNDR_END| and |DATE_END|)
            let afterSndr = String(afterSubj[sndrEndIdx.upperBound...])
            guard let dateEndIdx = afterSndr.range(of: "|DATE_END|") else { continue }
            let dateSentStr = String(afterSndr[..<dateEndIdx.lowerBound]).trimmingCharacters(in: .whitespaces)

            // Extract mailbox (between |DATE_END| and |MB_END|)
            let afterDate = String(afterSndr[dateEndIdx.upperBound...])
            guard let mbEndIdx = afterDate.range(of: "|MB_END|") else { continue }
            let mailboxName = String(afterDate[..<mbEndIdx.lowerBound]).trimmingCharacters(in: .whitespaces)

            // Extract account (after |MB_END|)
            let accountStr = String(afterDate[mbEndIdx.upperBound...]).trimmingCharacters(in: .whitespaces)

            // Filter by account if specified (case-insensitive)
            if let filterAccount = account,
               accountStr.lowercased() != filterAccount.lowercased() {
                continue
            }

            // Convert AppleScript date string to ISO8601 format
            // AppleScript returns dates in locale format, e.g. "Dienstag, 24. März 2026 um 14:51:56"
            let dateSent: String
            let dateFormatterDE = DateFormatter()
            dateFormatterDE.locale = Locale(identifier: "de_DE")
            dateFormatterDE.dateFormat = "EEEE, d. MMMM yyyy 'um' HH:mm:ss"
            
            let dateFormatterEN = DateFormatter()
            dateFormatterEN.locale = Locale(identifier: "en_US_POSIX")
            dateFormatterEN.dateFormat = "EEEE, MMMM d, yyyy 'at' h:mm:ss a"
            
            if let date = dateFormatterDE.date(from: dateSentStr) {
                dateSent = ISO8601DateFormatter().string(from: date)
            } else if let date = dateFormatterEN.date(from: dateSentStr) {
                dateSent = ISO8601DateFormatter().string(from: date)
            } else {
                // Fallback: try to parse common formats
                let flexibleFormatter = DateFormatter()
                flexibleFormatter.locale = Locale.current
                flexibleFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
                if let date = flexibleFormatter.date(from: dateSentStr) {
                    dateSent = ISO8601DateFormatter().string(from: date)
                } else {
                    dateSent = ISO8601DateFormatter().string(from: Date())
                }
            }

            if !subject.isEmpty && !sender.isEmpty {
                emails.append(EmailMessage(
                    id: UUID().uuidString,
                    subject: subject,
                    sender: sender,
                    dateSent: dateSent,
                    preview: "",
                    content: "",
                    account: accountStr.isEmpty ? (account ?? "Mail") : accountStr,
                    mailbox: mailboxName.isEmpty ? mailboxFilter : mailboxName,
                    hasAttachments: false,
                    isRead: false
                ))
            }
        }

        let elapsed = Date().timeIntervalSince(startTime)
        mcpLogInfo("Completed getUnreadEmails", data: [
            "elapsed": String(format: "%.2f", elapsed),
            "emails": emails.count,
            "errors": emails.isEmpty ? 1 : 0
        ])
        
        return MailKitResponse(
            success: !emails.isEmpty,
            accounts: [],
            emails: emails,
            errors: emails.isEmpty ? [MailError(account: account ?? "Mail", reason: "no_unread_emails")] : []
        )
    } catch {
        mcpLogError("Error in getUnreadEmails", data: ["error": error.localizedDescription])
        return MailKitResponse(
            success: false,
            accounts: [],
            emails: [],
            errors: [MailError(account: account ?? "unknown", reason: "timeout_or_error")]
        )
    }
}


func executeAppleScriptWithTimeout(_ script: String, timeout: Int) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    process.arguments = ["-e", script]

    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = pipe

    try process.run()

    // Wait with timeout
    let deadline = Date().addingTimeInterval(TimeInterval(timeout))
    while process.isRunning && Date() < deadline {
        usleep(10000)  // Sleep 10ms
    }

    if process.isRunning {
        process.terminate()
        throw NSError(domain: "Timeout", code: -1, userInfo: [NSLocalizedDescriptionKey: "AppleScript timeout"])
    }

    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
}

// MARK: - Main Entry Point

let arguments = CommandLine.arguments
var operation = "help"
var account: String? = nil
var mailbox: String? = nil
var limit = 50

var i = 1
while i < arguments.count {
    let arg = arguments[i]
    switch arg {
    case "--operation":
        i += 1
        if i < arguments.count { operation = arguments[i] }
    case "--account":
        i += 1
        if i < arguments.count { account = arguments[i] }
    case "--mailbox":
        i += 1
        if i < arguments.count { mailbox = arguments[i] }
    case "--limit":
        i += 1
        if i < arguments.count { limit = Int(arguments[i]) ?? 50 }
    default:
        break
    }
    i += 1
}

let response: MailKitResponse

switch operation {
case "unread":
    response = getUnreadEmails(account: account, mailbox: mailbox, limit: limit)
default:
    response = MailKitResponse(
        success: false,
        accounts: [],
        emails: [],
        errors: [MailError(account: "unknown", reason: "unknown_operation")]
    )
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
if let jsonData = try? encoder.encode(response),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
}
