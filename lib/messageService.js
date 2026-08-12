import { prisma } from './database.js'

// In remote-client mode a recorder is injected that POSTs to the control API
// instead of writing to the local database.
let recorder = null
export function setMessageRecorder(fn) {
  recorder = fn
}

// The owning control-plane client id (embedded mode) — attached automatically.
let selfClientId = null
export function setSelfClientId(id) {
  selfClientId = id
}

/**
 * Persist an incoming message. Uses receivedAt = now, readAt = NULL.
 * Non-fatal — never throws.
 */
export async function recordMessage({ remoteJid, messageId, senderJid, msgType, content, participant, fromMe = false, readAt = null, clientId = null }) {
  if (!remoteJid || !messageId) return
  if (recorder) {
    return recorder({ remoteJid, messageId, senderJid, msgType, content, participant, fromMe, readAt, clientId })
  }
  try {
    const now = new Date()
    await prisma.message.upsert({
      where: { remoteJid_messageId: { remoteJid, messageId } },
      update: {},
      create: {
        clientId: clientId ?? selfClientId,
        remoteJid,
        messageId,
        senderJid,
        msgType,
        content,
        participant,
        fromMe,
        receivedAt: now,
        processedAt: now,
        readAt,
      },
    })
  } catch {
    // DB down — persistence is best-effort
  }
}

// Resolve the owner client: an explicit clientId wins; otherwise fall back to the
// embedded self-client (so the embedded /api/whatsapp/* endpoints keep matching
// messages recorded with clientId: selfClientId).
function resolveClientId(clientId) {
  return clientId ?? selfClientId
}

export async function getUnreadMessages(remoteJid, clientId = null) {
  try {
    return await prisma.message.findMany({
      where: { remoteJid, clientId: resolveClientId(clientId), readAt: null, fromMe: false },
      orderBy: { receivedAt: 'asc' },
    })
  } catch {
    return []
  }
}

/** Unread counts per chat: { '2345@s.whatsapp.net': 3 } */
export async function getUnreadCounts(clientId = null) {
  try {
    const rows = await prisma.message.groupBy({
      by: ['remoteJid'],
      where: { clientId: resolveClientId(clientId), readAt: null, fromMe: false },
      _count: { _all: true },
    })
    return Object.fromEntries(rows.map((r) => [r.remoteJid, r._count._all]))
  } catch {
    return {}
  }
}

export async function markReadByKeys(remoteJid, messageIds, clientId = null) {
  if (!messageIds?.length) return 0
  try {
    const result = await prisma.message.updateMany({
      where: { remoteJid, clientId: resolveClientId(clientId), messageId: { in: messageIds }, readAt: null },
      data: { readAt: new Date() },
    })
    return result.count
  } catch {
    return 0
  }
}

export async function markAllRead(clientId = null) {
  try {
    const result = await prisma.message.updateMany({
      where: { clientId: resolveClientId(clientId), readAt: null, fromMe: false },
      data: { readAt: new Date() },
    })
    return result.count
  } catch {
    return 0
  }
}

/** Rebuild WhatsApp message keys from stored rows (for sock.readMessages) */
export function messageKeysToRead(messages) {
  return messages.map((m) => ({
    remoteJid: m.remoteJid,
    id: m.messageId,
    fromMe: m.fromMe,
    participant: m.participant || undefined,
  }))
}
