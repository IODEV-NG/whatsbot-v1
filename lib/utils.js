import { downloadMediaMessage } from '@whiskeysockets/baileys'
import NodeCache from 'node-cache'

// ─── Reply Helpers ─────────────────────────────────────────────────────────────

/**
 * Send a plain text reply to the message sender
 */
export async function reply(sock, msg, text) {
  return sock.sendMessage(
    msg.key.remoteJid,
    { text },
    { quoted: msg }
  )
}

/**
 * React to a message with an emoji
 */
export async function react(sock, msg, emoji) {
  return sock.sendMessage(msg.key.remoteJid, {
    react: { text: emoji, key: msg.key },
  })
}

/**
 * Send a text message without quoting
 */
export async function send(sock, jid, text) {
  return sock.sendMessage(jid, { text })
}

/**
 * Send an image
 */
export async function sendImage(sock, jid, buffer, caption = '') {
  return sock.sendMessage(jid, { image: buffer, caption })
}

/**
 * Send a video
 */
export async function sendVideo(sock, jid, buffer, caption = '') {
  return sock.sendMessage(jid, { video: buffer, caption })
}

/**
 * Send an audio file
 */
export async function sendAudio(sock, jid, buffer, opts = {}) {
  return sock.sendMessage(jid, {
    audio: buffer,
    mimetype: opts.mimetype || 'audio/mpeg',
    ptt: opts.ptt ?? false,
    caption: opts.caption,
  })
}

/**
 * Send a sticker
 */
export async function sendSticker(sock, jid, buffer) {
  return sock.sendMessage(jid, { sticker: buffer })
}

/**
 * Download media from a quoted/incoming message (handles view-once too)
 */
export async function downloadMedia(msg) {
  return downloadMediaMessage(msg, 'buffer', {})
}

// ─── Message Parsers ───────────────────────────────────────────────────────────

/**
 * Unwrap view-once message containers to their inner message
 */
export function unwrapMessage(msg) {
  const m = msg?.message
  if (!m) return msg
  if (m.viewOnceMessageV2?.message) return { ...msg, message: m.viewOnceMessageV2.message }
  if (m.viewOnceMessage?.message) return { ...msg, message: m.viewOnceMessage.message }
  return msg
}

/**
 * Extract plain text from any message type (including view-once)
 */
export function getMessageText(msg) {
  const m = unwrapMessage(msg).message
  if (!m) return ''
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  )
}

/**
 * Get the type of message (text, image, video, sticker, etc.)
 */
export function getMessageType(msg) {
  const m = unwrapMessage(msg).message
  if (!m) return null
  return Object.keys(m)[0]
}

/**
 * Get quoted message if exists (including quoted view-once)
 */
export function getQuotedMessage(msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
  if (!quoted) return null
  return { message: quoted }
}

/**
 * Check if message is from a group
 */
export function isGroup(msg) {
  return msg.key.remoteJid?.endsWith('@g.us') ?? false
}

/**
 * Get sender JID (works for both DM and group)
 */
export function getSender(msg) {
  return msg.key.participant || msg.key.remoteJid
}

/**
 * Format a JID to a readable number
 */
export function formatNumber(jid) {
  return jid?.replace(/[^0-9]/g, '') ?? ''
}

/**
 * Format a number back into a JID
 */
export function toJid(number) {
  return `${String(number).replace(/[^0-9]/g, '')}@s.whatsapp.net`
}

// ─── Cooldowns (TTL-backed to avoid unbounded growth) ─────────────────────────

const cooldowns = new NodeCache({ stdTTL: 0, checkperiod: 60 })

export function isOnCooldown(userId, command, ms) {
  const key = `${userId}:${command}`
  const last = cooldowns.get(key)
  if (last && Date.now() - last < ms) return true
  cooldowns.set(key, Date.now(), Math.max(ms / 1000, 1))
  return false
}
