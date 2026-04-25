/**
 * Copyright (c) 2026 Achim Nierbeck
 *
 * MCP-konformer Logger für apple-mcp-secure
 * Schreibt NUR nach stderr (STMIO Transport Compliance)
 * Strukturiertes JSON-Format für bessere Verarbeitbarkeit
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// MCP Log Levels (RFC 5424 compliant)
export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	notice: 2,
	warning: 3,
	error: 4,
	critical: 5,
	alert: 6,
	emergency: 7
};

// Konfiguration
const LOG_DIR = process.env.LOG_DIR || '/var/log/apple-mcp';
const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel | undefined) || 'info';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Stelle sicher dass Log-Verzeichnis existiert (nur für lokale Entwicklung)
if (NODE_ENV === 'development' || NODE_ENV === 'test') {
	if (!existsSync(LOG_DIR)) {
		try {
			mkdirSync(LOG_DIR, { recursive: true });
		} catch (e) {
			// Ignoriere Fehler - Hauptsache stderr funktioniert
		}
	}
}

/**
 * Maskiert sensitive Felder im Datenobjekt
 */
function sanitizeData(data: Record<string, any>): Record<string, any> {
	const sensitiveKeys = [
		'password', 'token', 'api_key', 'apikey', 'secret', 'authorization',
		'auth', 'credential', 'private_key', 'email', 'address', 'phone',
		'content', 'subject', 'sender', 'body', 'message'
	];
	
	if (!data || typeof data !== 'object') {
		return data;
	}
	
	const sanitized: Record<string, any> = {};
	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();
		if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
			sanitized[key] = '***REDACTED***';
		} else if (typeof value === 'object' && value !== null) {
			sanitized[key] = sanitizeData(value);
		} else {
			sanitized[key] = value;
		}
	}
	return sanitized;
}

/**
 * Haupt-Log-Funktion
 * MCP-konform: NUR stderr, strukturiertes JSON
 */
export function log(level: LogLevel, component: string, message: string, data: Record<string, any> = {}): void {
	// Filter nach Log-Level
	if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) {
		return;
	}

	const entry = {
		timestamp: new Date().toISOString(),
		level,
		component,
		message,
		...sanitizeData(data),
		pid: process.pid
	};

	const jsonLine = JSON.stringify(entry) + '\n';

	// MCP-konform: NUR stderr für Logs
	try {
		process.stderr.write(jsonLine);
	} catch (e) {
		// Falls stderr nicht verfügbar, versuche wenigstens stdout (Notfall)
		try {
			process.stdout.write(`[FALLBACK LOG] ${jsonLine}`);
		} catch (e2) {
			// Nichts mehr zu tun
		}
	}

	// Für lokale Entwicklung: Auch in Datei schreiben (optional)
	if (NODE_ENV === 'development' || NODE_ENV === 'test') {
		try {
			const logFile = join(LOG_DIR, `${component}.log`);
			writeFileSync(logFile, jsonLine, { flag: 'a' });
		} catch (e) {
			// Ignoriere Datei-Fehler - stderr hat Vorrang
		}
	}
}

// Convenience Methods
export const logger = {
	// Standard Log Levels
	debug: (component: string, message: string, data?: Record<string, any>) => 
		log('debug', component, message, data),
	info: (component: string, message: string, data?: Record<string, any>) => 
		log('info', component, message, data),
	notice: (component: string, message: string, data?: Record<string, any>) => 
		log('notice', component, message, data),
	warn: (component: string, message: string, data?: Record<string, any>) => 
		log('warning', component, message, data),
	error: (component: string, message: string, data?: Record<string, any>) => 
		log('error', component, message, data),
	critical: (component: string, message: string, data?: Record<string, any>) => 
		log('critical', component, message, data),

	// Spezielle Logs
	audit: (action: string, resource: string, user?: string, data?: Record<string, any>) => {
		const auditData = {
			action,
			resource,
			user: user || 'system',
			...data
		};
		log('info', 'audit', `Audit: ${action} on ${resource}`, auditData);
	},

	// Für Swift-Binary Wrapper: Leite stderr weiter
	forwardStderr: (component: string, stderr: string) => {
		if (stderr && stderr.trim()) {
			// Versuche zu parsen falls bereits JSON
			try {
				const parsed = JSON.parse(stderr.trim());
				if (parsed.level && parsed.component) {
					// Schon strukturiert - direkt weiterleiten
					process.stderr.write(stderr);
					return;
				}
			} catch (e) {
				// Nicht JSON - als plain text loggen
			}
			log('info', component, 'Swift binary stderr', { stderr: stderr.trim() });
		}
	}
};

// Legacy-Kompatibilität: Ersetze console.xxx durch logger
// Diese Funktionen können temporär als Drop-in Replacement verwendet werden
export function setupConsoleRedirect() {
	const originalConsole = {
		log: console.log,
		info: console.info,
		warn: console.warn,
		error: console.error,
		debug: console.debug
	};

	console.log = (...args: any[]) => {
		logger.info('console', args.join(' '));
		originalConsole.log(...args);
	};

	console.info = (...args: any[]) => {
		logger.info('console', args.join(' '));
		originalConsole.info(...args);
	};

	console.warn = (...args: any[]) => {
		logger.warn('console', args.join(' '));
		originalConsole.warn(...args);
	};

	console.error = (...args: any[]) => {
		logger.error('console', args.join(' '));
		originalConsole.error(...args);
	};

	console.debug = (...args: any[]) => {
		logger.debug('console', args.join(' '));
		originalConsole.debug(...args);
	};
}

export default logger;
