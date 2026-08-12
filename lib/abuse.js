import config from '../config.js'
import { prisma } from './database.js'

// ─── Global outbound kill switch ──────────────────────────────────────────────

let killSwitch = config.killSwitch

export function setKillSwitch(value) {
  killSwitch = Boolean(value)
}

export function isKillSwitchOn() {
  return killSwitch
}

// ─── Outbound audit trail ──────────────────────────────────────────────────────

/**
 * Record an outbound message for audit (source: api | chatbot | welcome | command).
 * Non-fatal — never throws.
 */
export async function auditOutbound({ remoteJid, messageId = null, source = 'bot', status = 'sent' }) {
  if (!remoteJid) return
  try {
    await prisma.outboundMessage.create({
      data: { remoteJid, messageId, source, status },
    })
  } catch {
    // DB down — audit is best-effort
  }
}
