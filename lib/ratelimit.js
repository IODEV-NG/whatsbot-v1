import NodeCache from 'node-cache'
import { formatNumber } from './utils.js'

function windowSlot(now, windowSec) {
  return Math.floor(now / 1000 / windowSec)
}

/**
 * Windowed outbound-message rate limiter.
 * Limits: messages per minute/hour/day, and unique new recipients per day.
 *
 * Each instance owns its own counter store, so multiple limiters
 * (e.g. per session) never share state.
 */
export class RateLimiter {
  constructor(limits = {}, store = null) {
    this.store = store ?? new NodeCache({ stdTTL: 0, checkperiod: 60 })
    this.limits = {
      perMinute: limits.perMinute ?? 20,
      perHour: limits.perHour ?? 200,
      perDay: limits.perDay ?? 500,
      newRecipientsPerDay: limits.newRecipientsPerDay ?? 50,
    }
  }

  hit(key, windowSec) {
    const k = `${key}:${windowSlot(Date.now(), windowSec)}`
    const count = (this.store.get(k) ?? 0) + 1
    this.store.set(k, count, windowSec + 5)
    return count
  }

  /** Returns { ok: true } or { ok: false, reason, retryAfterSec } */
  check(jid) {
    const num = formatNumber(jid)

    const minute = this.hit('msg:min', 60)
    if (minute > this.limits.perMinute) {
      return { ok: false, reason: `over ${this.limits.perMinute}/minute`, retryAfterSec: 60 }
    }

    const hour = this.hit('msg:hr', 3600)
    if (hour > this.limits.perHour) {
      return { ok: false, reason: `over ${this.limits.perHour}/hour`, retryAfterSec: 3600 }
    }

    const day = this.hit('msg:day', 86400)
    if (day > this.limits.perDay) {
      return { ok: false, reason: `over ${this.limits.perDay}/day`, retryAfterSec: 86400 }
    }

    // Unique new recipients per UTC day (prevents blasting thousands of numbers)
    const dayLabel = new Date().toISOString().slice(0, 10)
    const recipKey = `recip:${dayLabel}`
    const recips = this.store.get(recipKey) ?? []
    if (!recips.includes(num)) {
      if (recips.length >= this.limits.newRecipientsPerDay) {
        return { ok: false, reason: `over ${this.limits.newRecipientsPerDay} new recipients/day`, retryAfterSec: 86400 }
      }
      recips.push(num)
      this.store.set(recipKey, recips, 86400 + 60)
    }

    return { ok: true }
  }
}
