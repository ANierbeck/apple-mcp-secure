# MCP-konformes Logging für apple-mcp-secure

## Übersicht

Dieser Server implementiert **MCP STDIO Transport Specification** konformes Logging:

- **stdout**: Nur valide MCP JSON-RPC Nachrichten (Protokoll-Kommunikation)
- **stderr**: Alle Logs, Diagnostik, Debug-Ausgaben

Alle Logs werden als **strukturiertes JSON** ausgegeben für bessere Verarbeitbarkeit und Filterung.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (Vibe/Claude/Codex)                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  MCP JSON-RPC ──────────────────────────────► stdout          │
│       ↑                                                         │
│       │                                                         │
│  ◄────┴────────────────────────────────────────────────── stdout  │
│                                                               │
│                       stderr                                      │
│                        │                                           │
│                        ▼                                           │
│              ┌─────────────────────┐                               │
│              │  MCP SERVER         │                               │
│              │  (Node.js + Swift)  │                               │
│              └──────────┬──────────┘                               │
│                         │                                          │
│              JSON-Logs ───┴─────────────────► Log Files            │
│                                                    (via stderr)     │
└─────────────────────────────────────────────────────────────┘
     ↓
/var/log/apple-mcp/
  ├── server-YYYY-MM-DD.log    # Haupt-Logs
  ├── error-YYYY-MM-DD.log     # Nur Fehler
  └── (rotated daily)
```

## Konfiguration

### Umgebungsvariablen

| Variable | Werte | Standard | Beschreibung |
|----------|-------|----------|-------------|
| `LOG_LEVEL` | debug, info, warning, error, critical | info | Minimaler Log-Level |
| `LOG_DIR` | Pfad | /var/log/apple-mcp | Log-Verzeichnis |
| `NODE_ENV` | development, production, test | production | Laufzeitumgebung |

### Beispiel

```bash
# Entwicklung (Logs auf Konsole + Datei)
LOG_LEVEL=debug NODE_ENV=development node index.js

# Produktion (nur Datei)
LOG_LEVEL=info LOG_DIR=/custom/log/path node index.js
```

## Log-Format (JSON)

```json
{
  "timestamp": "2026-04-25T15:49:33Z",
  "level": "info",
  "component": "mailkit",
  "message": "Starting getUnreadEmails",
  "pid": 54510,
  "account": "Nierbeck",
  "limit": 5
}
```

### Felder

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `timestamp` | ISO8601 | Zeitstempel der Log-Nachricht |
| `level` | string | Log-Level (debug, info, warning, error, etc.) |
| `component` | string | Komponente (mailkit, eventkit, server, loader, etc.) |
| `message` | string | Die Log-Nachricht |
| `pid` | number | Prozess-ID |
| *dinamisch* | any | Zusätzliche Kontextdaten |

## Komponenten

### Node.js Server (index.ts)

- `server` - Server-Lebenszyklus
- `loader` - Modul-Lading (eager/lazy)
- `sanitize` - Fehlerbehandlung
- `mail`, `calendar`, `contacts`, etc. - Tool-spezifische Logs

### Swift Binaries

#### MailKitHelper (mailkit-helper-arm64)

- Komponenten-Name: `mailkit`
- Logs: Start/Ende von E-Mail-Abfragen, Fehler, Performance-Daten

**Beispiel-Logs:**
```json
{"message":"Starting getUnreadEmails","level":"info","component":"mailkit","account":"Nierbeck","limit":50}
{"message":"Completed getUnreadEmails","level":"info","component":"mailkit","elapsed":"2.96","emails":5}
```

#### EventKitHelper (eventkit-helper-arm64)

- Komponenten-Name: `eventkit`
- Logs: Kalender-Abfragen, Event-Handling

## Client-Konfiguration

### Für Vibe / Claude / Codex

Der Client muss stderr des Server-Prozesses in eine Datei umleiten:

**Beispiel für .mcp.json:**
```json
{
  "servers": {
    "apple-mcp": {
      "command": "node",
      "args": ["/path/to/apple-mcp-secure/index.js"],
      "environment": {
        "LOG_LEVEL": "info",
        "LOG_DIR": "/var/log/apple-mcp"
      },
      "stderr": "/var/log/apple-mcp/server.log"
    }
  }
}
```

**Manuell starten:**
```bash
# In Datei leiten
node index.js 2>> /var/log/apple-mcp/server.log

# In Datei UND Konsole
node index.js 2>&1 | tee -a /var/log/apple-mcp/server.log

# Mit Umgebungsvariablen
LOG_LEVEL=debug LOG_DIR=/custom/logs node index.js 2>> /custom/logs/server.log
```

### Docker

**Dockerfile:**
```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN npm install

# Log-Verzeichnis erstellen
RUN mkdir -p /var/log/apple-mcp && \
    chown node:node /var/log/apple-mcp

USER node
ENV LOG_LEVEL=info
ENV LOG_DIR=/var/log/apple-mcp

CMD ["node", "index.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  apple-mcp:
    build: .
    volumes:
      - /var/log/apple-mcp:/var/log/apple-mcp
    environment:
      - LOG_LEVEL=info
      - NODE_ENV=production
```

### Systemd

**/etc/systemd/system/apple-mcp.service:**
```ini
[Unit]
Description=Apple MCP Secure Server
After=network.target

[Service]
User=anierbeck
WorkingDirectory=/opt/apple-mcp-secure
ExecStart=/usr/bin/node index.js
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info
Environment=LOG_DIR=/var/log/apple-mcp
StandardOutput=journal
StandardError=file:/var/log/apple-mcp/server.log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Aktivieren:**
```bash
sudo cp apple-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable apple-mcp
sudo systemctl start apple-mcp
sudo journalctl -u apple-mcp -f  # stdout logs
cat /var/log/apple-mcp/server.log  # stderr logs
```

## Log-Rotation

### Mit logrotate

**/etc/logrotate.d/apple-mcp:**
```conf
/var/log/apple-mcp/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 anierbeck anierbeck
    dateext
    dateformat -%Y-%m-%d
    maxsize 100M
    sharedscripts
    postrotate
        # Optional: Server neustarten (falls möglich)
        systemctl reload apple-mcp 2>/dev/null || true
    endscript
}
```

**Testen:**
```bash
# Dry run
sudo logrotate -d /etc/logrotate.d/apple-mcp

# Erzwingen
sudo logrotate -f /etc/logrotate.d/apple-mcp
```

## Debugging

### Log-Datei überwachen

```bash
# Echtzeit-Überwachung
tail -f /var/log/apple-mcp/server-$(date +%Y-%m-%d).log

# Filter nach Level
cat /var/log/apple-mcp/server-*.log | jq 'select(.level == "error")'

# Filter nach Komponente
cat /var/log/apple-mcp/server-*.log | jq 'select(.component == "mailkit")'

# Pretty Print
cat /var/log/apple-mcp/server-*.log | jq .
```

### Node.js Debug Mode

```bash
# Mit Inspektor
node --inspect-brk index.js

# Oder
NODE_DEBUG=* node index.js
```

### Swift Binary Test

```bash
# Direkter Aufruf mit Logging
./resources/mailkit-helper-arm64 --operation unread --limit 5 --account Nierbeck 2>&1

# Nur stderr anzeigen
./resources/mailkit-helper-arm64 --operation unread --limit 5 2>&1 | grep -v '^{' | jq .
```

## Sicherheitshinweise

### Sensitive Daten

Der Logger **maskiert automatisch** sensible Felder:
- Passwords, Tokens, API-Keys, Secrets
- Authorization-Header
- E-Mail-Adressen, Adressen, Telefonnummern
- Inhalte (content), Betreff (subject), Absender (sender), Body, Message

**Beispiel:**
```json
{
  "level": "info",
  "message": "Email received",
  "data": {
    "sender": "***REDACTED***",
    "subject": "***REDACTED***",
    "password": "***REDACTED***"
  }
}
```

### Audit-Logging (manuell)

Für sicherheitsrelevante Aktionen kann man den `audit` Logger verwenden:

```typescript
logger.audit('mail_send', 'email', 'user@example.com', {
    recipient: '***REDACTED***',
    subject: '***REDACTED***'
});
```

## Performance

### Log-Overhead

- **Node.js**: < 1ms pro Log-Eintrag (JSON Stringify)
- **Swift**: < 0.5ms pro Log-Eintrag
- **Für Hochlast**: LOG_LEVEL auf "warning" oder "error" setzen

### Benchmark

```bash
# 10.000 Log-Einträge
LOG_LEVEL=debug node -e "
const { logger } = require('./utils/logger');
for (let i = 0; i < 10000; i++) {
    logger.info('test', 'Test message', { index: i });
}
console.log('Done');
" 2>/dev/null

# Zeit messen
time node -e "..."
```

## Fehlerbehebung

### Keine Logs sichtbar?

1. **Prüfe LOG_LEVEL**: Standard ist "info", für mehr Details "debug" setzen
2. **Prüfe stderr-Umleitung**: Der Client muss stderr umleiten
3. **Prüfe Berechtigungen**: Log-Verzeichnis muss beschreibbar sein
4. **Test mit direktem Aufruf**:
   ```bash
   cd /path/to/apple-mcp-secure
   LOG_LEVEL=debug node index.js 2>&1
   ```

### Logs sind nicht JSON?

1. **Swift-Binaries neu bauen**: `bash swift-tools/build-mailkit.sh`
2. **Node.js Dependencies**: `npm install`
3. **Prüfe utils/logger.ts**: Muss korrekt importiert werden

### stdout wird durch Logs verunreinigt?

Das ist ein **kritisches Problem**! stdout muss **nur** MCP JSON-RPC Nachrichten enthalten.

**Überprüfen:**
```bash
node index.js 2>/dev/null | head -20
```

Falls nicht nur JSON zu sehen ist, gibt es irgendwo einen `console.log` der stdout verwendet.

**Lösung:**
```bash
# Suche nach console.log in stdout
node index.js 2>/dev/null | grep -v '^{' | grep -v '^$'
```

## Beispiel-Logs

### Server Start
```json
{"timestamp":"2026-04-25T15:48:00Z","level":"info","component":"server","message":"Starting apple-mcp server...","pid":12345}
{"timestamp":"2026-04-25T15:48:01Z","level":"info","component":"loader","message":"Attempting to eagerly load modules...","pid":12345}
{"timestamp":"2026-04-25T15:48:02Z","level":"info","component":"loader","message":"Contacts module loaded successfully","pid":12345}
```

### Mail Ebene
```json
{"timestamp":"2026-04-25T15:49:33Z","level":"info","component":"mailkit","message":"Starting getUnreadEmails","pid":54510,"account":"Nierbeck","limit":5}
{"timestamp":"2026-04-25T15:49:36Z","level":"info","component":"mailkit","message":"Completed getUnreadEmails","pid":54510,"elapsed":"2.96","emails":5,"errors":0}
```

### Fehler
```json
{"timestamp":"2026-04-25T15:50:00Z","level":"error","component":"loader","message":"Error loading module calendar","pid":12345,"error":"Module not found"}
```
