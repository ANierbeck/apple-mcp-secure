import { runAppleScript } from "run-applescript";
import { ensureAppRunning } from "./app-launcher.js";

interface CalendarEvent {
	id: string;
	title: string;
	location: string | null;
	notes: string | null;
	startDate: string | null;
	endDate: string | null;
	calendarName: string;
	isAllDay: boolean;
	url: string | null;
}

const CONFIG = {
	MAX_EVENTS: 20,
	// Per-calendar AppleScript timeout (seconds).
	// Large exchange calendars with thousands of events will hit this and be
	// skipped gracefully rather than causing a Beachball of Death.
	PER_CAL_TIMEOUT: 12,
};

// ---------------------------------------------------------------------------
// Calendar filter (blocklist / allowlist)
// ---------------------------------------------------------------------------

/**
 * APPLE_MCP_CALENDAR_BLOCKLIST — comma-separated calendar names to exclude.
 * Example: APPLE_MCP_CALENDAR_BLOCKLIST="achim.nierbeck@codecentric.de,Stuttgart Büro"
 */
function getBlockedCalendars(): Set<string> {
	const raw = process.env.APPLE_MCP_CALENDAR_BLOCKLIST;
	if (!raw || !raw.trim()) return new Set();
	return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * APPLE_MCP_CALENDAR_ALLOWLIST — if set, only these calendars are queried.
 * Example: APPLE_MCP_CALENDAR_ALLOWLIST="Privat,Arbeit,Family"
 */
function getAllowedCalendars(): Set<string> | null {
	const raw = process.env.APPLE_MCP_CALENDAR_ALLOWLIST;
	if (!raw || !raw.trim()) return null;
	return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function isCalendarAllowed(name: string): boolean {
	const lower = name.trim().toLowerCase();
	if (getBlockedCalendars().has(lower)) return false;
	const allowed = getAllowedCalendars();
	if (allowed) return allowed.has(lower);
	return true;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate an AppleScript snippet that builds a Date object via property
 * assignment — locale-independent (no date string literals, which are parsed
 * according to the system locale and fail in non-English environments).
 *
 * Usage in a script:
 *   set myDate to (current date)
 *   ${buildAppleScriptDate("myDate", someJsDate)}
 */
function buildAppleScriptDate(varName: string, d: Date): string {
	// time = seconds since midnight
	const timeOfDay = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
	return [
		`set year of ${varName} to ${d.getFullYear()}`,
		`set month of ${varName} to ${d.getMonth() + 1}`,
		`set day of ${varName} to ${d.getDate()}`,
		`set time of ${varName} to ${timeOfDay}`,
	].join("\n    ");
}

function parseEvents(raw: string): CalendarEvent[] {
	if (!raw || !raw.trim()) return [];
	return raw
		.split("||")
		.filter(Boolean)
		.map((entry) => {
			const fields: Record<string, string> = {};
			entry.split("|").forEach((part) => {
				const idx = part.indexOf(":");
				if (idx > -1) {
					fields[part.slice(0, idx)] = part.slice(idx + 1);
				}
			});
			const startRaw = fields["START"] || "";
			const endRaw = fields["END"] || "";
			return {
				id: fields["ID"] || `unknown-${Date.now()}`,
				title: fields["TITLE"] || "Untitled Event",
				location: fields["LOC"] || null,
				notes: fields["NOTES"] || null,
				startDate: startRaw ? new Date(startRaw).toISOString() : null,
				endDate: endRaw ? new Date(endRaw).toISOString() : null,
				calendarName: fields["CAL"] || "Unknown Calendar",
				isAllDay: fields["ALLDAY"] === "true",
				url: fields["URL"] || null,
			};
		});
}

// ---------------------------------------------------------------------------
// Access check
// ---------------------------------------------------------------------------

async function checkCalendarAccess(): Promise<boolean> {
	try {
		await runAppleScript(`tell application "Calendar" to return name`);
		return true;
	} catch {
		return false;
	}
}

async function requestCalendarAccess(): Promise<{ hasAccess: boolean; message: string }> {
	const hasAccess = await checkCalendarAccess();
	if (hasAccess) return { hasAccess: true, message: "Calendar access is already granted." };
	return {
		hasAccess: false,
		message:
			"Calendar access is required but not granted. Please:\n" +
			"1. Open System Settings > Privacy & Security > Automation\n" +
			"2. Enable 'Calendar' for your terminal / app\n" +
			"3. Also check System Settings > Privacy & Security > Calendars\n" +
			"4. Restart your terminal and try again",
	};
}

// ---------------------------------------------------------------------------
// listCalendars — returns all calendars with their filter status
// ---------------------------------------------------------------------------

async function listCalendars(): Promise<
	Array<{ name: string; eventCount: number; allowed: boolean }>
> {
	await ensureAppRunning("Calendar", "return name of first calendar");
	const access = await requestCalendarAccess();
	if (!access.hasAccess) throw new Error(access.message);

	// Count only events in the next 4 weeks — same window as getEvents/searchEvents.
	// "count of events of cal" returns ALL historical events (can be 10,000+) which
	// is misleading and also slow for large Exchange calendars.
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const windowEnd = new Date(today);
	windowEnd.setDate(today.getDate() + 28);
	windowEnd.setHours(23, 59, 59, 999);
	const startSnippet = buildAppleScriptDate("startBound", today);
	const endSnippet = buildAppleScriptDate("endBound", windowEnd);

	const script = `
tell application "Calendar"
    set startBound to current date
    ${startSnippet}
    set endBound to current date
    ${endSnippet}
    set calData to ""
    repeat with cal in every calendar
        set calName to name of cal
        set evtCount to 0
        try
            tell cal
                with timeout of ${CONFIG.PER_CAL_TIMEOUT} seconds
                    set evtCount to count of (every event whose start date >= startBound and start date <= endBound)
                end timeout
            end tell
        on error
            set evtCount to -1 -- timeout marker
        end try
        set calData to calData & "NAME:" & calName & "|COUNT:" & evtCount & "||"
    end repeat
    return calData
end tell`;

	const result = (await runAppleScript(script)) as string;
	if (!result) return [];

	return result
		.split("||")
		.filter(Boolean)
		.map((entry) => {
			const fields: Record<string, string> = {};
			entry.split("|").forEach((part) => {
				const idx = part.indexOf(":");
				if (idx > -1) {
					fields[part.slice(0, idx)] = part.slice(idx + 1);
				}
			});
			const name = fields["NAME"] || "Unknown";
			return {
				name,
				eventCount: parseInt(fields["COUNT"] || "0", 10),
				allowed: isCalendarAllowed(name),
			};
		});
}

// ---------------------------------------------------------------------------
// getEvents — query each allowed calendar individually with per-cal timeout
// ---------------------------------------------------------------------------

async function getEvents(
	limit = 10,
	fromDate?: string,
	toDate?: string,
): Promise<CalendarEvent[]> {
	try {
		await ensureAppRunning("Calendar", "return name of first calendar");

		const access = await requestCalendarAccess();
		if (!access.hasAccess) throw new Error(access.message);

		// Get calendar names first (fast — no event loading)
		const allCals = await listCalendars();
		const queryCals = allCals.filter((c) => c.allowed);

		if (queryCals.length === 0) {
			return [];
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const defaultEnd = new Date(today);
		defaultEnd.setDate(today.getDate() + 28);
		defaultEnd.setHours(23, 59, 59, 999);

		const start = fromDate ? new Date(fromDate) : today;
		const end = toDate ? new Date(toDate) : defaultEnd;
		const maxEvents = Math.min(limit, CONFIG.MAX_EVENTS);
		const startSnippet = buildAppleScriptDate("startBound", start);
		const endSnippet = buildAppleScriptDate("endBound", end);

		const allEvents: CalendarEvent[] = [];

		// Query each allowed calendar individually — a timeout on one does NOT
		// block the others, unlike a single script that iterates all calendars.
		for (const cal of queryCals) {
			if (allEvents.length >= maxEvents) break;
			const safeName = cal.name.replace(/"/g, '\\"');
			const remaining = maxEvents - allEvents.length;
			const script = `
tell application "Calendar"
    set eventData to ""
    set startBound to current date
    ${startSnippet}
    set endBound to current date
    ${endSnippet}
    set eventCount to 0
    try
        tell calendar "${safeName}"
            with timeout of ${CONFIG.PER_CAL_TIMEOUT} seconds
                set evts to every event whose start date >= startBound and start date <= endBound
            end timeout
            repeat with evt in evts
                if eventCount >= ${remaining} then exit repeat
                try
                    set evtTitle to summary of evt
                    set evtStart to (start date of evt) as string
                    set evtEnd to (end date of evt) as string
                    set evtAllDay to allday event of evt
                    set evtLoc to ""
                    try
                        set evtLoc to location of evt
                        if evtLoc is missing value then set evtLoc to ""
                    end try
                    set evtNotes to ""
                    try
                        set evtNotes to description of evt
                        if evtNotes is missing value then set evtNotes to ""
                    end try
                    set evtId to uid of evt
                    set allDayStr to "false"
                    if evtAllDay then set allDayStr to "true"
                    set eventData to eventData & "ID:" & evtId & "|TITLE:" & evtTitle & "|START:" & evtStart & "|END:" & evtEnd & "|CAL:${safeName}" & "|ALLDAY:" & allDayStr & "|LOC:" & evtLoc & "|NOTES:" & evtNotes & "||"
                    set eventCount to eventCount + 1
                on error
                end try
            end repeat
        end tell
    on error
        -- Calendar timed out or inaccessible — skip it silently
    end try
    return eventData
end tell`;

			try {
				const result = (await runAppleScript(script)) as string;
				allEvents.push(...parseEvents(result));
			} catch {
				// runAppleScript-level error — skip this calendar
			}
		}

		return allEvents.sort(
			(a, b) =>
				new Date(a.startDate ?? 0).getTime() - new Date(b.startDate ?? 0).getTime(),
		);
	} catch (error) {
		console.error(`Error getting events: ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}
}

// ---------------------------------------------------------------------------
// searchEvents
// ---------------------------------------------------------------------------

async function searchEvents(
	searchText: string,
	limit = 10,
	fromDate?: string,
	toDate?: string,
): Promise<CalendarEvent[]> {
	try {
		await ensureAppRunning("Calendar", "return name of first calendar");

		const access = await requestCalendarAccess();
		if (!access.hasAccess) throw new Error(access.message);

		if (!searchText || !searchText.trim()) return [];

		const allCals = await listCalendars();
		const queryCals = allCals.filter((c) => c.allowed);

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const defaultEnd = new Date(today);
		defaultEnd.setDate(today.getDate() + 28);
		defaultEnd.setHours(23, 59, 59, 999);

		const start = fromDate ? new Date(fromDate) : today;
		const end = toDate ? new Date(toDate) : defaultEnd;
		const maxEvents = Math.min(limit, CONFIG.MAX_EVENTS);
		const startSnippet = buildAppleScriptDate("startBound", start);
		const endSnippet = buildAppleScriptDate("endBound", end);
		const safeSearch = searchText.replace(/"/g, "").slice(0, 200).toLowerCase();

		const allEvents: CalendarEvent[] = [];

		for (const cal of queryCals) {
			if (allEvents.length >= maxEvents) break;
			const safeName = cal.name.replace(/"/g, '\\"');
			const remaining = maxEvents - allEvents.length;
			const script = `
tell application "Calendar"
    set eventData to ""
    set startBound to current date
    ${startSnippet}
    set endBound to current date
    ${endSnippet}
    set eventCount to 0
    try
        tell calendar "${safeName}"
            with timeout of ${CONFIG.PER_CAL_TIMEOUT} seconds
                set evts to every event whose start date >= startBound and start date <= endBound
            end timeout
            repeat with evt in evts
                if eventCount >= ${remaining} then exit repeat
                try
                    set evtTitle to summary of evt
                    set titleMatch to false
                    ignoring case
                        if (evtTitle as text) contains "${safeSearch}" then set titleMatch to true
                    end ignoring
                    if titleMatch then
                        set evtStart to (start date of evt) as string
                        set evtEnd to (end date of evt) as string
                        set evtAllDay to allday event of evt
                        set evtLoc to ""
                        try
                            set evtLoc to location of evt
                            if evtLoc is missing value then set evtLoc to ""
                        end try
                        set evtNotes to ""
                        try
                            set evtNotes to description of evt
                            if evtNotes is missing value then set evtNotes to ""
                        end try
                        set evtId to uid of evt
                        set allDayStr to "false"
                        if evtAllDay then set allDayStr to "true"
                        set eventData to eventData & "ID:" & evtId & "|TITLE:" & evtTitle & "|START:" & evtStart & "|END:" & evtEnd & "|CAL:${safeName}" & "|ALLDAY:" & allDayStr & "|LOC:" & evtLoc & "|NOTES:" & evtNotes & "||"
                        set eventCount to eventCount + 1
                    end if
                on error
                end try
            end repeat
        end tell
    on error
        -- Calendar timed out or inaccessible — skip it silently
    end try
    return eventData
end tell`;

			try {
				const result = (await runAppleScript(script)) as string;
				allEvents.push(...parseEvents(result));
			} catch {
				// skip
			}
		}

		return allEvents;
	} catch (error) {
		console.error(`Error searching events: ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}
}

// ---------------------------------------------------------------------------
// createEvent
// ---------------------------------------------------------------------------

async function createEvent(
	title: string,
	startDate: string,
	endDate: string,
	location?: string,
	notes?: string,
	isAllDay = false,
	calendarName?: string,
): Promise<{ success: boolean; message: string; eventId?: string }> {
	try {
		await ensureAppRunning("Calendar", "return name of first calendar");

		const access = await requestCalendarAccess();
		if (!access.hasAccess) return { success: false, message: access.message };

		if (!title.trim()) return { success: false, message: "Event title cannot be empty" };
		if (!startDate || !endDate)
			return { success: false, message: "Start date and end date are required" };

		const start = new Date(startDate);
		const end = new Date(endDate);

		if (isNaN(start.getTime()) || isNaN(end.getTime()))
			return { success: false, message: "Invalid date format. Please use ISO format (YYYY-MM-DDTHH:mm:ssZ)" };

		if (end <= start)
			return { success: false, message: "End date must be after start date" };

		const startSnippet = buildAppleScriptDate("startDate", start);
		const endSnippet = buildAppleScriptDate("endDate", end);
		const safeTitle = title.replace(/"/g, "'").slice(0, 500);
		const safeLoc = (location || "").replace(/"/g, "'").slice(0, 500);
		const safeNotes = (notes || "").replace(/"/g, "'").slice(0, 2000);
		const targetCal = (calendarName || "").replace(/"/g, "'").slice(0, 200);

		const script = `
tell application "Calendar"
    set startDate to current date
    ${startSnippet}
    set endDate to current date
    ${endSnippet}
    set targetCal to missing value
    ${targetCal ? `
    try
        repeat with cal in every calendar
            if (name of cal) is "${targetCal}" then
                set targetCal to cal
                exit repeat
            end if
        end repeat
    end try` : ""}
    if targetCal is missing value then
        set targetCal to first calendar
    end if
    tell targetCal
        set newEvent to make new event with properties {summary:"${safeTitle}", start date:startDate, end date:endDate, allday event:${isAllDay}}
        ${safeLoc ? `set location of newEvent to "${safeLoc}"` : ""}
        ${safeNotes ? `set description of newEvent to "${safeNotes}"` : ""}
        return uid of newEvent
    end tell
end tell`;

		const eventId = (await runAppleScript(script)) as string;
		return { success: true, message: `Event "${title}" created successfully.`, eventId };
	} catch (error) {
		return {
			success: false,
			message: `Error creating event: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

// ---------------------------------------------------------------------------
// openEvent
// ---------------------------------------------------------------------------

async function openEvent(eventId: string): Promise<{ success: boolean; message: string }> {
	try {
		await ensureAppRunning("Calendar", "return name of first calendar");
		const access = await requestCalendarAccess();
		if (!access.hasAccess) return { success: false, message: access.message };
		await runAppleScript(`tell application "Calendar" to activate`);
		return { success: true, message: `Calendar opened. Event ID: ${eventId}` };
	} catch (error) {
		return {
			success: false,
			message: `Error opening Calendar: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const calendar = {
	searchEvents,
	openEvent,
	getEvents,
	createEvent,
	listCalendars,
	requestCalendarAccess,
};

export default calendar;
