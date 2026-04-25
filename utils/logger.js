/**
 * MCP-konformer Logger - CommonJS
 * Wird als erstes in index.ts geladen
 */

'use strict';

const LEVEL_PRIORITY = { debug: 0, info: 1, notice: 2, warning: 3, error: 4, critical: 5, alert: 6, emergency: 7 };
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const SENSITIVE_KEYS = [
	'password', 'token', 'api_key', 'apikey', 'secret', 'authorization',
	'auth', 'credential', 'private_key'
];

function sanitizeData(data) {
	if (!data || typeof data !== 'object') return data;
	const sanitized = {};
	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();
		if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
			sanitized[key] = '***REDACTED***';
		} else if (typeof value === 'object' && value !== null) {
			sanitized[key] = sanitizeData(value);
		} else {
			sanitized[key] = value;
		}
	}
	return sanitized;
}

function log(level, component, message, data = {}) {
	if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[LOG_LEVEL]) return;
	const entry = { timestamp: new Date().toISOString(), level, component, message, ...sanitizeData(data), pid: process.pid };
	process.stderr.write(JSON.stringify(entry) + '\n');
}

const logger = {
	debug: (c, m, d) => log('debug', c, m, d),
	info: (c, m, d) => log('info', c, m, d),
	notice: (c, m, d) => log('notice', c, m, d),
	warn: (c, m, d) => log('warning', c, m, d),
	error: (c, m, d) => log('error', c, m, d),
	critical: (c, m, d) => log('critical', c, m, d)
};

// Override console - NUR JSON nach stderr, kein Plain-Text mehr
console.log = (...a) => logger.info('console', a.join(' '));
console.info = (...a) => logger.info('console', a.join(' '));
console.warn = (...a) => logger.warn('console', a.join(' '));
console.error = (...a) => logger.error('console', a.join(' '));
console.debug = (...a) => logger.debug('console', a.join(' '));

module.exports = logger;
