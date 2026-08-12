# WhatsBot V1

A modular WhatsApp bot client built on [Baileys](https://github.com/WhiskeySockets/Baileys). Runs **standalone** on your own database, or as a **remote client** registered with a WhatsBot V1 control plane.

> This is the *client* repository — it contains the bot engine, commands, moderation, Privacy Mode, and the remote-client transport. The control plane (client management, admin dashboard, licensing, feature flags) is a separate private system; this client talks to it over a simple HTTP API.

## Quick start (standalone)

```bash
npm install
cp .env.example .env      # set OWNER_NUMBER (required) + DATABASE_URL
npx prisma migrate deploy
npm start
```

On first run a **pairing code** is printed. Open WhatsApp → Linked Devices → Link with phone number.

## Remote client mode (control plane)

Set `SESSION_ID` + `SESSION_SECRET` + `CONTROL_URL` and this bot registers with your control plane:

```bash
# .env
SESSION_ID=8F42K91X
SESSION_SECRET=<secret shown once when the client was created>
CONTROL_URL=http://your-control-server:3000
```

The bot then:

- **Registers** on boot (`POST /api/v1/sessions/register`) and receives remote feature flags
- **Heartbeats** every 30s so the control plane can show online/offline
- **Streams messages** to the control plane (`POST /api/v1/messages`) — unread counts and the admin inbox are driven from this
- **Applies remote config live**: `botEnabled` → kill switch, `privacyMode` → Privacy Mode, `autoReply`/`typingIndicator` → runtime flags

Without those env vars it runs fully standalone with local persistence (session backup, group settings, privacy, message log all in your own PostgreSQL).

## Features

| Area | Highlights |
|---|---|
| Commands | `.ping`, `.help/.menu`, `.info`, `.sticker`, `.play`, `.yt`, `.tiktok`, `.vv`, `.tr` |
| Moderation | `.antitag`, `.antilink`, `.antispam`, `.antiword` + warn/kick, welcome/goodbye |
| Privacy Mode | Incoming messages stay unread until you choose — no auto-`readMessages()`, optional typing suppression (`PATCH` via control plane or the `.privacy` owner command) |
| Anti-abuse | Per-session rate limits, kill switch, outbound audit trail |
| Automation | AUTO_READ, AUTO_REACT, AUTO_TYPING, AUTO_STATUS_VIEW, ANTI_CALL, AUTO_BIO, AUTO_CHATBOT |

## Configuration

All settings read from environment variables (see `config.js` and `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `OWNER_NUMBER` | — | Owner WhatsApp number (digits only) |
| `PREFIX` | `.` | Command prefix |
| `BOT_NAME` | `WhatsBot V1` | Bot display name |
| `DATABASE_URL` | — | PostgreSQL connection string (standalone persistence) |
| `SESSION_ID` / `SESSION_SECRET` | — | Remote client credentials (issued by the control plane) |
| `CONTROL_URL` | `http://127.0.0.1:3000` | Control plane API base URL |
| `WEBHOOK_URL` | — | Forward incoming messages here as JSON |
| `AUTO_READ` | `false` | Mark incoming messages as read |
| `AUTO_REACT` | `true` | ⏳/✅/❌ reactions on commands |
| `PRIVACY_MODE` / `PRIVACY_LEVEL` | `false` / `normal` | Privacy Mode defaults |
| `RATE_MSG_PER_MIN` / `_HOUR` / `_DAY` | `20/200/500` | Outbound rate limits |
| `KILL_SWITCH` | `false` | Global outbound pause |

## Project structure

```
whatsbot-v1/
├── index.js              # Entry point + automation events
├── handler.js            # Message pipeline (moderation + routing)
├── config.js             # Env-driven settings
├── core/pipeline.js      # Middleware pipeline
├── commands/             # general, media, security, owner
├── lib/
│   ├── remote.js         # Control-plane HTTP transport (register/heartbeat/messages)
│   ├── services.js       # User/Group/Security services
│   ├── privacy.js        # Privacy Mode (DB-backed + remote-provider injectable)
│   ├── messageService.js # Message persistence (local + remote recorder)
│   ├── abuse.js          # Kill switch + outbound audit
│   ├── ratelimit.js      # Windowed outbound rate limiter
│   └── ...
├── plugins/              # Plugin system (echo example)
└── prisma/               # Local persistence schema + migrations
```

## Testing

```bash
npm test   # node --test --experimental-test-module-mocks (Node >= 22.3)
```

CI runs the full suite on Node 22 and 24. No database or `.env` needed — the v1 API tests use an in-memory fake Prisma, and everything else degrades gracefully when the DB is unreachable.

## License

Proprietary — see the control-plane operator for licensing terms.
