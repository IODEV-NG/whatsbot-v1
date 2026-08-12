// ─── whatsbot-v1 Configuration (env-driven with sensible defaults) ─────────────

// Load .env into process.env (Node native — Prisma loads it internally, but the
// rest of the app needs it too). Existing env vars take precedence.
try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile()
} catch {
  // .env is optional — defaults below apply
}

const env = process.env

function toBool(value, def = false) {
  if (value === undefined || value === null || value === '') return def
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function toInt(value, def) {
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : def
}

const config = {
  // Command prefix
  prefix: env.PREFIX || '.',

  // Your WhatsApp number (with country code, no + or spaces)
  ownerNumber: (env.OWNER_NUMBER || '').replace(/\D/g, ''),

  // SUDO numbers — additional users with owner-level access (comma separated)
  sudo: (env.SUDO || '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean),

  // Bot display name
  botName: env.BOT_NAME || 'WhatsBot V1',

  // Session folder
  sessionDir: env.SESSION_DIR || './session',

  // ─── Remote client mode (control plane) ─────────────────────────────────
  // Set SESSION_ID + SESSION_SECRET to register this bot with a WhatsBot V1
  // control plane. CONTROL_URL points at the control plane's API.
  sessionId: env.SESSION_ID || '',
  sessionSecret: env.SESSION_SECRET || '',
  controlUrl: env.CONTROL_URL || 'http://127.0.0.1:3000',

  // ─── Local health endpoint (§26) ──────────────────────────────────────────
  apiPort: toInt(env.API_PORT, 3000),
  apiHost: env.API_HOST || '127.0.0.1', // bind to loopback by default (LAN-safe)

  // Optional: forward incoming messages to a webhook as JSON
  webhookUrl: env.WEBHOOK_URL || '',

  // ─── Automation flags ──────────────────────────────────────────────────────
  autoRead: toBool(env.AUTO_READ, false), // mark messages as seen
  autoReact: toBool(env.AUTO_REACT, true), // ⏳/✅/❌ reactions on commands
  autoTyping: toBool(env.AUTO_TYPING, false), // show typing before command reply
  autoStatusView: toBool(env.AUTO_STATUS_VIEW, false), // auto-view statuses
  autoStatusReact: toBool(env.AUTO_STATUS_REACT, false), // react to statuses
  statusReactEmoji: env.STATUS_REACT_EMOJI || '❤️',
  antiCall: toBool(env.ANTI_CALL, false), // auto-reject incoming calls
  autoBio: toBool(env.AUTO_BIO, false), // periodic bio updates
  autoChatbot: toBool(env.AUTO_CHATBOT, false), // keyword auto-replies

  // ─── Privacy Mode ──────────────────────────────────────────────────────────
  privacyDefaults: {
    enabled: toBool(env.PRIVACY_MODE, false),
    level: (env.PRIVACY_LEVEL || 'normal').toLowerCase(), // normal | privacy | custom
    suppressTyping: toBool(env.PRIVACY_SUPPRESS_TYPING, false),
    pauseAutoReply: toBool(env.PRIVACY_PAUSE_AUTOREPLY, false),
  },

  // ─── Anti-abuse ────────────────────────────────────────────────────────────
  rateLimits: {
    perMinute: toInt(env.RATE_MSG_PER_MIN, 20),
    perHour: toInt(env.RATE_MSG_PER_HOUR, 200),
    perDay: toInt(env.RATE_MSG_PER_DAY, 500),
    newRecipientsPerDay: toInt(env.RATE_NEW_RECIPIENTS_PER_DAY, 50),
  },
  killSwitch: toBool(env.KILL_SWITCH, false), // global outbound pause

  // ─── Media ─────────────────────────────────────────────────────────────────
  stickerPackName: env.STICKER_PACK_NAME || 'WhatsBot V1',
  stickerAuthor: env.STICKER_AUTHOR || 'WhatsBot V1',

  // ─── Moderation ────────────────────────────────────────────────────────────
  warnLimit: toInt(env.WARN_LIMIT, 3), // warnings before auto-kick
  spamThreshold: toInt(env.SPAM_THRESHOLD, 5), // msgs allowed per 10s window
  defaultBadWords: (env.BAD_WORDS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean),

  // ─── Runtime ───────────────────────────────────────────────────────────────
  commandCooldown: toInt(env.COMMAND_COOLDOWN, 3000),

  // Enable/disable command categories
  categories: {
    general: true,
    media: true,
  },

  // Bot version
  version: '1.0.0',
}

// Validate critical settings
if (!config.prefix) {
  throw new Error('PREFIX must not be empty')
}
if (!/^\d+$/.test(config.ownerNumber)) {
  console.warn(`⚠  OWNER_NUMBER "${config.ownerNumber}" looks invalid — expected digits only`)
}

export default config
