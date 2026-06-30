/**
 * Integration tests for the mail details operation
 * Tests the getEmailByRef function and details handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEmailByRef, emailRefMap } from "../../utils/mail";
import { EmailMessage } from "../../utils/mail";

// Mock the AppleScript functions
vi.mock("../../utils/applescript", () => ({
	runAppleScript: vi.fn(),
	requestMailAccess: vi.fn(),
}));

import { runAppleScript, requestMailAccess } from "../../utils/applescript";

describe("mail details operation", () => {
	describe("getEmailByRef", () => {
		beforeEach(() => {
			// Clear the ref map before each test
			emailRefMap.clear();
			vi.clearAllMocks();
		});

		afterEach(() => {
			emailRefMap.clear();
			vi.restoreAllMocks();
		});

		it("should throw error for unknown ref", async () => {
			await expect(getEmailByRef("nonexistent-ref")).rejects.toThrow(
				"Unknown email ref \"nonexistent-ref\". Refs are session-scoped and expire on server restart."
			);
		});

		it("should return null when Mail access is denied", async () => {
			// Setup: Add a ref to the map
			const ref = "test-ref-123";
			emailRefMap.set(ref, {
				sender: "test@example.com",
				subject: "Test Subject",
				account: "TestAccount",
				mailbox: "INBOX",
				dateSent: "2026-01-01T00:00:00Z",
				epoch: 1700000000,
			});

			// Mock access denied
			vi.mocked(requestMailAccess).mockResolvedValue({ hasAccess: false, message: "Access denied" });

			await expect(getEmailByRef(ref)).rejects.toThrow("Access denied");
		});

		it("should use fast path when account and mailbox are available", async () => {
			// Setup: Add a ref with account and mailbox
			const ref = "test-ref-fast";
			emailRefMap.set(ref, {
				sender: "test@example.com",
				subject: "Test Subject",
				account: "GMX",
				mailbox: "INBOX",
				dateSent: "2026-01-01T00:00:00Z",
				epoch: 1700000000,
			});

			// Mock successful access and email found
			vi.mocked(requestMailAccess).mockResolvedValue({ hasAccess: true, message: "Access granted" });
			vi.mocked(runAppleScript).mockResolvedValue(
				"SUBJECT:Test Subject|SENDER:test@example.com|DATE:2026-01-01 00:00:00|CONTENT:Test content|READ:true|MAILBOX:INBOX"
			);

			const result = await getEmailByRef(ref);

			expect(result).not.toBeNull();
			expect(result?.subject).toBe("Test Subject");
			expect(result?.sender).toBe("test***@example.com"); // anonymized
			expect(result?.content).toBe("Test content");
			expect(result?.mailbox).toBe("GMX - INBOX");
			expect(result?.account).toBe("GMX");
		});

		it("should use fallback path when account or mailbox is missing", async () => {
			// Setup: Add a ref WITHOUT account/mailbox (legacy case)
			const ref = "test-ref-fallback";
			emailRefMap.set(ref, {
				sender: "test@example.com",
				subject: "Test Subject",
				account: undefined,
				mailbox: undefined,
				dateSent: "2026-01-01T00:00:00Z",
				epoch: 1700000000,
			});

			// Mock successful access and email found via fallback
			vi.mocked(requestMailAccess).mockResolvedValue({ hasAccess: true, message: "Access granted" });
			vi.mocked(runAppleScript).mockResolvedValue(
				"SUBJECT:Test Subject|SENDER:test@example.com|DATE:2026-01-01 00:00:00|CONTENT:Test content|READ:true|MAILBOX:INBOX|ACCOUNT:GMX"
			);

			const result = await getEmailByRef(ref);

			expect(result).not.toBeNull();
			expect(result?.subject).toBe("Test Subject");
			expect(result?.mailbox).toBe("GMX - INBOX");
			expect(result?.account).toBe("GMX");
		});

		it("should return null when email is not found", async () => {
			// Setup
			const ref = "test-ref-notfound";
			emailRefMap.set(ref, {
				sender: "test@example.com",
				subject: "Test Subject",
				account: "GMX",
				mailbox: "INBOX",
				dateSent: "2026-01-01T00:00:00Z",
				epoch: 1700000000,
			});

			vi.mocked(requestMailAccess).mockResolvedValue({ hasAccess: true, message: "Access granted" });
			vi.mocked(runAppleScript).mockResolvedValue("Error: Message not found");

			const result = await getEmailByRef(ref);
			expect(result).toBeNull();
		});
	});

	describe("registerEmailRef", () => {
		beforeEach(() => {
			emailRefMap.clear();
		});

		it("should store all metadata in ref map", () => {
			const ref = registerEmailRef(
				"sender@example.com",
				"Test Subject",
				undefined,
				1700000000,
				"GMX",
				"INBOX",
				"2026-01-01T00:00:00Z"
			);

			const entry = emailRefMap.get(ref);
			expect(entry).toBeDefined();
			expect(entry?.sender).toBe("sender@example.com");
			expect(entry?.subject).toBe("Test Subject");
			expect(entry?.account).toBe("GMX");
			expect(entry?.mailbox).toBe("INBOX");
			expect(entry?.dateSent).toBe("2026-01-01T00:00:00Z");
			expect(entry?.epoch).toBe(1700000000);
		});

		it("should generate same ref for same input", () => {
			const ref1 = registerEmailRef(
				"sender@example.com",
				"Test Subject",
				undefined,
				1700000000,
				"GMX",
				"INBOX",
				"2026-01-01T00:00:00Z"
			);
			const ref2 = registerEmailRef(
				"sender@example.com",
				"Test Subject",
				undefined,
				1700000000,
				"GMX",
				"INBOX",
				"2026-01-01T00:00:00Z"
			);
			expect(ref1).toBe(ref2);
		});
	});
});
