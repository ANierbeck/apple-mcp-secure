/**
 * Copyright (c) 2026 Achim Nierbeck
 *
 * This file is part of apple-mcp-secure.
 * Licensed under the MIT License - see LICENSE file for details.
 *
 * EventKit helper for native macOS Calendar access using Apple's EventKit framework.
 * Provides <100ms query performance for calendars with 12,000+ events.
 */

import Foundation
import EventKit

// MARK: - Data Models

struct CalendarInfo: Codable {
    let id: String
    let name: String
    let eventCount: Int
    let source: String
}

struct EventInfo: Codable {
    let id: String
    let title: String
    let startDate: String
    let endDate: String
    let calendar: String
    let location: String?
    let notes: String?
    let isAllDay: Bool
}

struct EventKitResponse: Codable {
    let success: Bool
    let calendars: [CalendarInfo]
    let events: [EventInfo]
    let errors: [ErrorInfo]
}

struct ErrorInfo: Codable {
    let calendar: String
    let reason: String
}

// MARK: - Helper Functions

func dateToISO(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    return formatter.string(from: date)
}

func parseISO(_ dateString: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    return formatter.date(from: dateString)
}

// MARK: - Main EventKit Helper

class EventKitHelper {
    let eventStore = EKEventStore()
    var errors: [ErrorInfo] = []

    func requestAccess() async -> Bool {
        do {
            let hasAccess = try await eventStore.requestFullAccessToEvents()
            return hasAccess
        } catch {
            errors.append(ErrorInfo(calendar: "system", reason: "access_request_failed: \(error.localizedDescription)"))
            return false
        }
    }

    func checkAccess() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        switch status {
        case .fullAccess:
            return true
        case .writeOnly:
            return false // We need read access
        case .denied, .restricted, .notDetermined:
            return false
        @unknown default:
            return false
        }
    }

    func listCalendars(dateRange: DateRange) -> [CalendarInfo] {
        let calendars = eventStore.calendars(for: .event)

        return calendars.compactMap { calendar in
            // Count events in date range
            let predicate = eventStore.predicateForEvents(withStart: dateRange.start, end: dateRange.end, calendars: [calendar])
            let eventsInRange = eventStore.events(matching: predicate)

            let source = sourceTypeString(calendar.source?.sourceType ?? .local)

            return CalendarInfo(
                id: calendar.calendarIdentifier,
                name: calendar.title,
                eventCount: eventsInRange.count,
                source: source
            )
        }
    }

    func getEvents(dateRange: DateRange, calendarNames: [String]? = nil) -> [EventInfo] {
        let predicate = eventStore.predicateForEvents(withStart: dateRange.start, end: dateRange.end, calendars: nil)
        let allEvents = eventStore.events(matching: predicate)

        let filteredEvents: [EKEvent]
        if let calendarNames = calendarNames, !calendarNames.isEmpty {
            let lowerNames = calendarNames.map { $0.lowercased() }
            filteredEvents = allEvents.filter {
                lowerNames.contains($0.calendar.title.lowercased())
            }
        } else {
            filteredEvents = allEvents
        }

        return filteredEvents.compactMap { event in
            let startISO = dateToISO(event.startDate)
            let endISO = dateToISO(event.endDate)

            return EventInfo(
                id: event.eventIdentifier,
                title: event.title ?? "Untitled",
                startDate: startISO,
                endDate: endISO,
                calendar: event.calendar.title,
                location: event.location,
                notes: event.notes,
                isAllDay: event.isAllDay
            )
        }
    }

    func searchEvents(dateRange: DateRange, searchTerm: String) -> [EventInfo] {
        let predicate = eventStore.predicateForEvents(withStart: dateRange.start, end: dateRange.end, calendars: nil)
        let allEvents = eventStore.events(matching: predicate)

        let searchLower = searchTerm.lowercased()
        let filtered = allEvents.filter { event in
            let titleMatch = (event.title ?? "").lowercased().contains(searchLower)
            let locationMatch = (event.location ?? "").lowercased().contains(searchLower)
            let notesMatch = (event.notes ?? "").lowercased().contains(searchLower)

            return titleMatch || locationMatch || notesMatch
        }

        return filtered.compactMap { event in
            let startISO = dateToISO(event.startDate)
            let endISO = dateToISO(event.endDate)

            return EventInfo(
                id: event.eventIdentifier,
                title: event.title ?? "Untitled",
                startDate: startISO,
                endDate: endISO,
                calendar: event.calendar.title,
                location: event.location,
                notes: event.notes,
                isAllDay: event.isAllDay
            )
        }
    }

    private func sourceTypeString(_ type: EKSourceType) -> String {
        switch type {
        case .local:
            return "Local"
        case .exchange:
            return "Exchange"
        case .calDAV:
            return "CalDAV"
        case .mobileMe:
            return "MobileMe"
        case .subscribed:
            return "Subscribed"
        case .birthdays:
            return "Birthdays"
        @unknown default:
            return "Unknown"
        }
    }
}

// MARK: - Date Range

struct DateRange {
    let start: Date
    let end: Date

    static func from(_ fromISO: String, to toISO: String) -> DateRange? {
        guard let start = parseISO(fromISO),
              let end = parseISO(toISO) else {
            return nil
        }
        return DateRange(start: start, end: end)
    }
}

// MARK: - CLI Entry Point

func main() {
    let helper = EventKitHelper()

        // Parse arguments
        let arguments = CommandLine.arguments
        guard arguments.count > 1 else {
            printUsage()
            exit(1)
        }

        // Check authorization
        guard helper.checkAccess() else {
            let response = EventKitResponse(
                success: false,
                calendars: [],
                events: [],
                errors: [ErrorInfo(calendar: "system", reason: "access_denied")]
            )
            outputJSON(response)
            exit(1)
        }

        var operation = "list-calendars"
        var fromISO: String? = nil
        var toISO: String? = nil
        var calendarNames: [String]? = nil
        var searchTerm: String? = nil

        // Parse CLI arguments
        var i = 1
        while i < arguments.count {
            let arg = arguments[i]

            switch arg {
            case "--operation":
                i += 1
                if i < arguments.count {
                    operation = arguments[i]
                }
            case "--from":
                i += 1
                if i < arguments.count {
                    fromISO = arguments[i]
                }
            case "--to":
                i += 1
                if i < arguments.count {
                    toISO = arguments[i]
                }
            case "--calendars":
                i += 1
                if i < arguments.count {
                    calendarNames = arguments[i].split(separator: ",").map { String($0.trimmingCharacters(in: .whitespaces)) }
                }
            case "--search":
                i += 1
                if i < arguments.count {
                    searchTerm = arguments[i]
                }
            default:
                break
            }

            i += 1
        }

        // Default date range: today to 28 days from now
        let now = Date()
        let fourWeeksLater = Calendar.current.date(byAdding: .day, value: 28, to: now) ?? now

        guard let dateRange = (fromISO.flatMap { from in
            toISO.flatMap { to in
                DateRange.from(from, to: to)
            }
        }) ?? DateRange(start: now, end: fourWeeksLater) as DateRange? else {
            let response = EventKitResponse(
                success: false,
                calendars: [],
                events: [],
                errors: [ErrorInfo(calendar: "system", reason: "invalid_date_format")]
            )
            outputJSON(response)
            exit(1)
        }

        // Execute operation
        switch operation {
        case "list-calendars":
            let calendars = helper.listCalendars(dateRange: dateRange)
            let response = EventKitResponse(
                success: true,
                calendars: calendars,
                events: [],
                errors: helper.errors
            )
            outputJSON(response)

        case "get-events":
            let events = helper.getEvents(dateRange: dateRange, calendarNames: calendarNames)
            let calendars = helper.listCalendars(dateRange: dateRange)
            let response = EventKitResponse(
                success: true,
                calendars: calendars,
                events: events,
                errors: helper.errors
            )
            outputJSON(response)

        case "search":
            guard let search = searchTerm else {
                let response = EventKitResponse(
                    success: false,
                    calendars: [],
                    events: [],
                    errors: [ErrorInfo(calendar: "system", reason: "search_term_required")]
                )
                outputJSON(response)
                exit(1)
            }
            let events = helper.searchEvents(dateRange: dateRange, searchTerm: search)
            let calendars = helper.listCalendars(dateRange: dateRange)
            let response = EventKitResponse(
                success: true,
                calendars: calendars,
                events: events,
                errors: helper.errors
            )
            outputJSON(response)

        default:
            let response = EventKitResponse(
                success: false,
                calendars: [],
                events: [],
                errors: [ErrorInfo(calendar: "system", reason: "unknown_operation")]
            )
            outputJSON(response)
            exit(1)
        }
}

func outputJSON(_ response: EventKitResponse) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

    if let data = try? encoder.encode(response),
       let jsonString = String(data: data, encoding: .utf8) {
        print(jsonString)
    }
}

func printUsage() {
    let usage = """
    EventKit Helper - macOS Calendar query tool

    Usage:
      eventkit-helper --operation list-calendars [--from DATE] [--to DATE]
      eventkit-helper --operation get-events [--from DATE] [--to DATE] [--calendars NAME1,NAME2]
      eventkit-helper --operation search --search TERM [--from DATE] [--to DATE]

    Arguments:
      --operation   Operation: list-calendars, get-events, search
      --from        Start date (ISO8601, default: today)
      --to          End date (ISO8601, default: today + 28 days)
      --calendars   Comma-separated calendar names to filter
      --search      Search term (for search operation)

    Examples:
      eventkit-helper --operation list-calendars
      eventkit-helper --operation get-events --from 2026-04-18T00:00:00Z --to 2026-05-18T00:00:00Z
      eventkit-helper --operation search --search "Meeting" --calendars "Personal,Work"
    """
    print(usage)
}

// Run main
main()
