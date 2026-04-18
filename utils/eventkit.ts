import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * EventKit helper types (matches Swift binary output)
 */
interface EventKitCalendar {
	id: string;
	name: string;
	eventCount: number;
	source: string;
}

interface EventKitEvent {
	id: string;
	title: string;
	startDate: string; // ISO8601
	endDate: string; // ISO8601
	calendar: string;
	location: string | null;
	notes: string | null;
	isAllDay: boolean;
}

interface EventKitResponse {
	success: boolean;
	calendars: EventKitCalendar[];
	events: EventKitEvent[];
	errors: Array<{ calendar: string; reason: string }>;
}

/**
 * Paths to EventKit binary (architecture-specific)
 */
function getEventKitBinaryPath(): string | null {
	const arch = process.arch;
	const binaryName = arch === "arm64" ? "eventkit-helper-arm64" : "eventkit-helper-intel";

	// Try multiple locations (npm resources, relative to module)
	const locations = [
		resolve(__dirname, "..", "resources", binaryName),
		resolve(process.cwd(), "resources", binaryName),
		resolve("/usr/local/bin", binaryName),
	];

	for (const path of locations) {
		if (existsSync(path)) {
			return path;
		}
	}

	return null;
}

/**
 * Call EventKit helper binary with arguments
 */
async function callEventKit(args: string[]): Promise<EventKitResponse> {
	const binaryPath = getEventKitBinaryPath();

	if (!binaryPath) {
		throw new Error(
			"EventKit helper binary not found. Install with: npm install or build with: swift-tools/build-eventkit.sh"
		);
	}

	try {
		const { stdout } = await execFileAsync(binaryPath, args, {
			timeout: 15000,
			maxBuffer: 20 * 1024 * 1024, // 20MB for large event lists
		});

		return JSON.parse(stdout) as EventKitResponse;
	} catch (error) {
		if (error instanceof Error && error.message.includes("ENOENT")) {
			throw new Error(`EventKit binary not executable: ${binaryPath}`);
		}

		if (error instanceof Error && error.message.includes("timeout")) {
			throw new Error("EventKit query timeout (>15s)");
		}

		throw error;
	}
}

/**
 * Query calendars from EventKit
 */
export async function listCalendarsViaEventKit(
	fromDate?: Date,
	toDate?: Date
): Promise<EventKitCalendar[]> {
	const args = ["--operation", "list-calendars"];

	if (fromDate) args.push("--from", fromDate.toISOString());
	if (toDate) args.push("--to", toDate.toISOString());

	const response = await callEventKit(args);

	if (!response.success) {
		throw new Error(
			`EventKit error: ${response.errors.map((e) => `${e.calendar}: ${e.reason}`).join(", ")}`
		);
	}

	return response.calendars;
}

/**
 * Query events from EventKit
 */
export async function getEventsViaEventKit(
	fromDate: Date,
	toDate: Date,
	calendarNames?: string[]
): Promise<EventKitEvent[]> {
	const args = ["--operation", "get-events", "--from", fromDate.toISOString(), "--to", toDate.toISOString()];

	if (calendarNames && calendarNames.length > 0) {
		args.push("--calendars", calendarNames.join(","));
	}

	const response = await callEventKit(args);

	if (!response.success) {
		throw new Error(
			`EventKit error: ${response.errors.map((e) => `${e.calendar}: ${e.reason}`).join(", ")}`
		);
	}

	return response.events;
}

/**
 * Search events in EventKit
 */
export async function searchEventsViaEventKit(
	searchTerm: string,
	fromDate?: Date,
	toDate?: Date,
	calendarNames?: string[]
): Promise<EventKitEvent[]> {
	const args = ["--operation", "search", "--search", searchTerm];

	if (fromDate) args.push("--from", fromDate.toISOString());
	if (toDate) args.push("--to", toDate.toISOString());
	if (calendarNames && calendarNames.length > 0) {
		args.push("--calendars", calendarNames.join(","));
	}

	const response = await callEventKit(args);

	if (!response.success) {
		throw new Error(
			`EventKit error: ${response.errors.map((e) => `${e.calendar}: ${e.reason}`).join(", ")}`
		);
	}

	return response.events;
}

/**
 * Check if EventKit binary is available
 */
export function isEventKitAvailable(): boolean {
	return getEventKitBinaryPath() !== null;
}
