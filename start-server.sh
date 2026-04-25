#!/bin/bash
# MCP-konformes Startskript für apple-mcp-secure
# Leitet stderr in Logfiles um und stellt stdout für MCP zur Verfügung

# Konfiguration
LOG_DIR="/var/log/apple-mcp"
LOG_FILE="${LOG_DIR}/server-$(date +%Y-%m-%d).log"
ERROR_LOG="${LOG_DIR}/error-$(date +%Y-%m-%d).log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting apple-mcp-secure server..."
echo "Logs will be written to: ${LOG_FILE}"

# Log-Verzeichnis erstellen
if [ ! -d "${LOG_DIR}" ]; then
    echo "Creating log directory: ${LOG_DIR}"
    mkdir -p "${LOG_DIR}"
    chmod 755 "${LOG_DIR}"
fi

# Node.js-Prozess starten mit stderr-Umleitung
# stdout bleibt unberührt (für MCP JSON-RPC Nachrichten)
# stderr geht in die Logdatei

# Für Development: Auch auf der Konsole zeigen
if [ "$NODE_ENV" = "development" ] || [ "$1" = "--dev" ]; then
    echo "Running in development mode (logs to console and file)..."
    cd "${SCRIPT_DIR}"
    node index.js 2>&1 | tee -a "${LOG_FILE}"
else
    echo "Running in production mode (logs to file only)..."
    cd "${SCRIPT_DIR}"
    # Standardmäßig nur stderr in Logdatei, stdout direkt an Parent
    node index.js 2>> "${LOG_FILE}"
fi

echo "Server stopped. Logs available at: ${LOG_FILE}"
