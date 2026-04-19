/**
 * Copyright (c) 2026 Achim Nierbeck
 *
 * This file is part of apple-mcp-secure.
 * Licensed under the MIT License - see LICENSE file for details.
 *
 * Node.js wrapper for MailKit Swift helper binary.
 * Provides <1 second mail queries with fallback to AppleScript.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * MailKit helper types (matches Swift binary output)
 */
interface MailKitAccount {
	id: string;
	name: string;
	email: string;
}

interface MailKitEmail {
	id: string;
	subject: string;
	sender: string;
	dateSent: string; // ISO8601
	preview: string;
	content: string;
	account: string;
	mailbox: string;
	hasAttachments: boolean;
	isRead: boolean;
}

interface MailKitResponse {
	success: boolean;
	accounts: MailKitAccount[];
	emails: MailKitEmail[];
	errors: Array<{ account: string; reason: string }>;
}

/**
 * Paths to MailKit binary (architecture-specific)
 */
function getMailKitBinaryPath(): string | null {
	const arch = process.arch;
	const binaryName = arch === "arm64" ? "mailkit-helper-arm64" : "mailkit-helper-intel";

	// Try multiple locations (npm resources, relative to module)
	const locations = [
		resolve(__dirname, "..", "resources", binaryName),
		resolve(process.cwd(), "resources", binaryName),
		resolve("/usr/local/bin", binaryName),
	];

	for (const path of locations) {
		if (existsSync(path)) {
			console.log(`[MailKit] Found binary at: ${path}`);
			return path;
		}
	}

	console.log(`[MailKit] Binary not found. Tried: ${locations.join(", ")}`);
	return null;
}

/**
 * Call MailKit helper binary with arguments
 */
async function callMailKit(args: string[]): Promise<MailKitResponse> {
	const binaryPath = getMailKitBinaryPath();

	if (!binaryPath) {
		throw new Error(
			"MailKit helper binary not found. Install with: npm install or build with: swift-tools/build-mailkit.sh"
		);
	}

	try {
		const { stdout } = await execFileAsync(binaryPath, args, {
			timeout: 45000, // 45s: accounts for multi-account IMAP sync (check for new mail)
			maxBuffer: 20 * 1024 * 1024, // 20MB for large email lists
		});

		return JSON.parse(stdout) as MailKitResponse;
	} catch (error) {
		if (error instanceof Error && error.message.includes("ENOENT")) {
			throw new Error(`MailKit binary not executable: ${binaryPath}`);
		}

		if (error instanceof Error && error.message.includes("timeout")) {
			throw new Error("MailKit query timeout (>15s)");
		}

		throw error;
	}
}

/**
 * Get unread emails from MailKit
 */
export async function getUnreadEmailsViaMailKit(
	account?: string,
	limit: number = 50
): Promise<MailKitEmail[]> {
	const args = ["--operation", "unread", "--limit", limit.toString()];

	if (account) {
		args.push("--account", account);
	}

	const response = await callMailKit(args);

	// "no_unread_emails" is not an error, it's a valid result (empty list)
	if (!response.success) {
		const hasOnlyNoUnreadError = response.errors.every((e) => e.reason === "no_unread_emails");
		if (!hasOnlyNoUnreadError) {
			throw new Error(
				`MailKit error: ${response.errors.map((e) => `${e.account}: ${e.reason}`).join(", ")}`
			);
		}
		// If only "no_unread_emails" errors, return empty list (success case)
	}

	return response.emails;
}

/**
 * Check if MailKit binary is available
 */
export function isMailKitAvailable(): boolean {
	return getMailKitBinaryPath() !== null;
}
