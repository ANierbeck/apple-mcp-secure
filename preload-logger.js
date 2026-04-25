/**
 * MCP-konforme Console-Umleitung
 * Wird mit --require geladen: node --require ./preload-logger.js dist/index.js
 * Übersetzt alle console.xxx Aufrufe in strukturiertes JSON nach stderr
 */

'use strict';

const LEVEL_PRIORITY = { debug: 0, info: 1, notice: 2, warning: 3, error: 4, critical: 5, alert: 6, emergency: 7 };
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

function log(level, component, message) {
	if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[LOG_LEVEL]) return;
	const entry = { timestamp: new Date().toISOString(), level, component, message, pid: process.pid };
	process.stderr.write(JSON.stringify(entry) + '\n');
}

// Überschreibe console-Methoden
const original = {
	log: console.log,
	info: console.info || console.log,
	warn: console.warn,
	error: console.error,
	debug: console.debug || console.log
};

console.log = (...args) => { log('info', 'console', args.join(' ')); original.log(...args); };
console.info = (...args) => { log('info', 'console', args.join(' ')); original.info(...args); };
console.warn = (...args) => { log('warning', 'console', args.join(' ')); original.warn(...args); };
console.error = (...args) => { log('error', 'console', args.join(' ')); original.error(...args); };
console.debug = (...args) => { log('debug', 'console', args.join(' ')); original.debug(...args); };
