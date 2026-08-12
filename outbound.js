import config from '../config.js'
import { RateLimiter } from './ratelimit.js'
import { isKillSwitchOn, isOutboundPaused, auditOutbound } from './abuse.js'
import { logger } from './logger.js'

/**
 * Centralized outbound gate (WhatsBot V1 spec §17/§18).
 *
 * EVERY automated outbound message must pass through checkOutbound() before it
 * is sent. This is the single choke point where the kill switch, the transient
 * outbound pause (control-plane command), and the windowed rate limiter are
 * enforced — so no code path (chatbot, welcome/goodbye, API, commands) can
 * flood recipients outside the configured limits.
 *
 *   Message → checkOutbound() → Baileys → WhatsApp
 *
 * The limiter is a single shared instance: /api/send, chatbot replies and
 * welcome messages all draw from the same per-minute/hour/day budget.
 */

const limiter = new RateLimiter(config.rateLimits)

/**
 * Returns { ok: true } or { ok: false, reason, retryAfterSec }.
 * Checks, in order: kill switch → outbound pause → rate limiter.
 */
export function checkOutbound(jid) {
  if (isKillSwitchOn()) {
    return { ok: false, reason: 'kill switch active (outbound paused)', retryAfterSec: null }
  }
  if (isOutboundPaused()) {
    return { ok: false, reason: 'outbound paused by control plane', retryAfterSec: null }
  }
  return limiter.check(jid)
}

/**
 * Convenience wrapper: run the gate, audit a blocked send, and log a warning.
 * Returns true when the send is allowed.
 */
export function gateOutbound(jid, source, shouldLog = true) {
  const gate = checkOutbound(jid)
  if (!gate.ok) {
    if (shouldLog) {
      logger.warn(`[Outbound] ${source} send blocked for ${jid}: ${gate.reason}`)
    }
    // Audit the blocked attempt (best-effort, never throws)
    auditOutbound({ remoteJid: jid, source, status: 'blocked' }).catch(() => {})
    return false
  }
  return true
}
