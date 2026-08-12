import { prisma, userCache, groupCache } from './database.js'
import NodeCache from 'node-cache'
import { formatNumber } from './utils.js'

// Admin lookup cache (TTL 2 min) — avoids hammering groupMetadata
const adminCache = new NodeCache({ stdTTL: 120, checkperiod: 60 })

/**
 * Check whether a participant is an admin of a group (cached)
 */
export async function isGroupAdmin(sock, groupId, participantJid) {
  if (!groupId?.endsWith('@g.us') || !participantJid) return false
  const key = `${groupId}:${participantJid}`
  const cached = adminCache.get(key)
  if (cached !== undefined) return cached

  try {
    const meta = await sock.groupMetadata(groupId)
    const admins = (meta.participants || [])
      .filter((p) => p.admin)
      .map((p) => p.id)
    const isAdmin = admins.includes(participantJid)
    adminCache.set(key, isAdmin)
    return isAdmin
  } catch {
    return false
  }
}

class UserService {
  constructor(client, cache) {
    this.client = client
    this.cache = cache
  }

  async ensureUser(phone, defaults = {}) {
    const cacheKey = phone
    const cached = this.cache.get(cacheKey)
    if (cached) return cached

    const user = await this.client.user.upsert({
      where: { phone },
      update: {},
      create: {
        phone,
        name: defaults.name ?? 'Unknown',
        premium: defaults.premium ?? false,
      },
    })

    this.cache.set(cacheKey, user)
    return user
  }
}

class GroupService {
  constructor(client, cache) {
    this.client = client
    this.cache = cache
  }

  async ensureGroup(id, defaults = {}) {
    const cached = this.cache.get(id)
    if (cached) return cached

    const group = await this.client.group.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: defaults.name ?? 'WhatsApp Group',
        antiTag: defaults.antiTag ?? false,
        antiLink: defaults.antiLink ?? false,
        antiSpam: defaults.antiSpam ?? false,
        antiWord: defaults.antiWord ?? false,
        badWords: defaults.badWords ?? [],
        welcomeEnabled: defaults.welcomeEnabled ?? false,
        welcomeMsg: defaults.welcomeMsg ?? null,
        goodbyeMsg: defaults.goodbyeMsg ?? null,
        warnLimit: defaults.warnLimit ?? null,
        warnCounts: defaults.warnCounts ?? {},
      },
    })

    this.cache.set(id, group)
    return group
  }

  /** Update a group in cache + DB. Returns updated row or null on failure. */
  async updateGroup(id, data) {
    const merged = { ...(this.cache.get(id) ?? {}), ...data }
    this.cache.set(id, merged)

    try {
      const updated = await this.client.group.update({ where: { id }, data })
      this.cache.set(id, { ...merged, ...updated })
      return updated
    } catch (error) {
      // DB unreachable — cache still reflects the change for this session
      return null
    }
  }

  /** Add a warning for a user. Returns { count, limit } or null on failure. */
  async warnUser(id, jid, warnLimit) {
    const group = await this.ensureGroup(id)
    const counts = { ...(group.warnCounts ?? {}) }
    const num = formatNumber(jid)
    counts[num] = (counts[num] ?? 0) + 1

    const updated = await this.updateGroup(id, { warnCounts: counts })
    const limit = warnLimit ?? 3
    return { count: counts[num], limit }
  }

  /** Reset warnings for a user (or everyone when jid is null). */
  async resetWarn(id, jid) {
    const group = await this.ensureGroup(id)
    const counts = { ...(group.warnCounts ?? {}) }
    if (jid) {
      delete counts[formatNumber(jid)]
    } else {
      for (const key of Object.keys(counts)) delete counts[key]
    }
    await this.updateGroup(id, { warnCounts: counts })
    return counts
  }
}

class SecurityService {
  constructor() {
    this.spamCache = new NodeCache({ stdTTL: 10, checkperiod: 5 })
  }

  isMassMention(message, text) {
    const mentionedJids = message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    return mentionedJids.length >= 5 || text.includes('@everyone') || text.includes('@all')
  }

  /** Detect links in a message (wa.me / t.me / chat.whatsapp.com / http(s) / www) */
  isLinkMessage(message, text) {
    if (!text) return false
    if (text.startsWith('.')) return false // command args bypass moderation
    const LINK_RE =
      /(https?:\/\/[^\s]+|www\.[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+)/i
    return LINK_RE.test(text)
  }

  /** Check if text contains any configured bad word */
  hasBadWord(text, badWords) {
    if (!badWords?.length) return false
    const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    return words.some((w) => badWords.includes(w))
  }

  /**
   * Track message frequency for a user in a group window (10s).
   * Returns false when under threshold, true on first breach (with 'warn' marker),
   * and 'repeat' for further breaches in the same window.
   */
  isSpamming(phone, groupId, threshold = 5) {
    const key = `spam:${groupId}:${phone}`
    const count = (this.spamCache.get(key) ?? 0) + 1
    this.spamCache.set(key, count)

    if (count > threshold) {
      if (!this.spamCache.get(`${key}:warned`)) {
        this.spamCache.set(`${key}:warned`, true)
        return 'warn'
      }
      return 'repeat'
    }
    return false
  }
}

export const userService = new UserService(prisma, userCache)
export const groupService = new GroupService(prisma, groupCache)
export const securityService = new SecurityService()

export { UserService, GroupService, SecurityService }
