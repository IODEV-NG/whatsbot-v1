import config from '../config.js'
import { setKillSwitch, setOutboundPaused } from './abuse.js'
import { setRuntimeOverride } from './runtime.js'
import { setPrivacyProvider } from './privacy.js'
import { setMessageRecorder } from './messageService.js'
import { logger } from './logger.js'

// ─── Command channel (WhatsBot V1 spec §15) ────────────────────────────────────
//
// Explicit whitelist of server→client commands. Each maps to a fixed, bounded
// local action. There is NO generic execute() — the control plane can never run
// arbitrary shell/JS on this machine.

const COMMAND_HANDLERS = {
  RELOAD_CONFIG: async () => {
    const cfg = await remoteFetchConfig()
    if (cfg) {
      applyRemoteBotConfig(cfg)
      return { applied: true, config: cfg }
    }
    return { applied: false, reason: 'config fetch failed' }
  },
  PAUSE_OUTBOUND: async () => {
    setOutboundPaused(true)
    return { paused: true }
  },
  RESUME_OUTBOUND: async () => {
    setOutboundPaused(false)
    return { paused: false }
  },
  RESTART_BOT: async () => {
    // Controlled, graceful restart. The process supervisor (systemd / pm2 /
    // Docker) is responsible for bringing the bot back up.
    logger.warn('[Remote] RESTART_BOT command received — restarting in 1s')
    setTimeout(() => process.exit(0), 1000)
    return { restarting: true }
  },
  REQUEST_DIAGNOSTICS: async () => ({
    version: config.version,
    uptimeSec: Math.floor(process.uptime()),
    platform: process.platform,
    node: process.version,
    prefix: config.prefix,
    botName: config.botName,
  }),
  SYNC_STATUS: async () => {
    // The caller (index.js) passes a live status provider so the sync command
    // can report current WhatsApp connection state without this module needing
    // direct socket access.
    const status = getSyncStatus ? getSyncStatus() : 'unknown'
    return { synced: true, status }
  },
}

let getSyncStatus = null
export function setSyncStatusProvider(fn) {
  getSyncStatus = fn
}

/**
 * Execute one claimed command. NEVER falls through to anything but the
 * whitelist above — unknown types return { handled: false }.
 */
export async function executeRemoteCommand(command) {
  const handler = COMMAND_HANDLERS[command?.type]
  if (!handler) {
    logger.warn(`[Remote] Rejected unknown command type: ${command?.type}`)
    return { handled: false, reason: `unknown command type: ${command?.type}` }
  }
  try {
    const result = await handler()
    return { handled: true, ok: true, result }
  } catch (error) {
    return { handled: true, ok: false, error: error.message }
  }
}

/**
 * Remote client mode: this bot instance is NOT the control server. It talks to
 * the control plane over HTTP using its SESSION_ID + SESSION_SECRET credentials.
 * Enabled when both env vars are set.
 */
export const isRemoteClient = Boolean(config.sessionId && config.sessionSecret)

let remoteConfig = null

async function apiCall(path, body = {}) {
  const url = `${config.controlUrl.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: config.sessionId, secret: config.sessionSecret, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

/** Poll for pending commands from the control plane → [{ id, type, payload }] */
export async function remotePollCommands() {
  const { status, data } = await apiCall('/api/v1/commands/poll')
  if (status === 200 && data?.ok) return data.commands ?? []
  return []
}

/** Ack a command result back to the control plane (non-fatal) */
export async function remoteAckCommand(commandId, ok, result = null) {
  try {
    await apiCall('/api/v1/commands/ack', { command_id: commandId, ok, result })
  } catch (error) {
    logger.error(`[Remote] command ack failed: ${error.message}`)
  }
}

/** Register with the control plane → { ok, config, features } */
export async function remoteRegister() {
  const { status, data } = await apiCall('/api/v1/sessions/register')
  if (status !== 200 || !data.ok) {
    throw new Error(data.error || `Registration failed (HTTP ${status})`)
  }
  remoteConfig = data.config
  return data
}

/** Fetch the latest remote config (BotConfig) */
export async function remoteFetchConfig() {
  const { status, data } = await apiCall('/api/v1/config')
  if (status === 200 && data?.ok) {
    remoteConfig = data.config
    return data.config
  }
  return null
}

export async function remoteHeartbeat(status, version, uptimeSec) {
  await apiCall('/api/v1/heartbeat', { status, version, uptime: uptimeSec })
}

/** Record an incoming message on the control plane (non-fatal) */
export async function remoteRecordMessage(message) {
  try {
    await apiCall('/api/v1/messages', { message })
  } catch (error) {
    logger.error(`[Remote] message record failed: ${error.message}`)
  }
}

/**
 * Apply remote BotConfig to the running bot:
 *  botEnabled → kill switch · privacyMode → privacy · autoReply/typing → runtime flags
 */
export function applyRemoteBotConfig(cfg) {
  if (!cfg) return
  remoteConfig = cfg
  setKillSwitch(!cfg.botEnabled)
  setPrivacyProvider(() => ({
    enabled: !!cfg.privacyMode,
    level: cfg.privacyMode ? 'privacy' : 'normal',
    suppressTyping: false,
    pauseAutoReply: false,
  }))
  setRuntimeOverride('autoChatbot', cfg.autoReply)
  setRuntimeOverride('autoTyping', cfg.typingIndicator)
}

/** Wire the remote transports into privacy + message persistence */
export function initRemoteTransports() {
  setMessageRecorder(remoteRecordMessage)
}

export function getRemoteConfig() {
  return remoteConfig
}
