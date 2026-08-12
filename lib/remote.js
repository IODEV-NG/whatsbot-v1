import config from '../config.js'
import { setKillSwitch } from './abuse.js'
import { setRuntimeOverride } from './runtime.js'
import { setPrivacyProvider } from './privacy.js'
import { setMessageRecorder } from './messageService.js'
import { logger } from './logger.js'

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
