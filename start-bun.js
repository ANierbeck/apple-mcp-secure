/**
 * Startskript für apple-mcp-secure mit MCP-konformem Logging
 * Funktioniert mit Bun und Node.js
 */

import { logger } from './utils/logger.js';

// Startet den Server
import('./dist/index.js');
