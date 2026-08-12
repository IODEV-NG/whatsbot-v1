import NodeCache from 'node-cache'
import { prisma } from './database.js'
import config from '../config.js'

const SETTING_KEY = 'privacy'
// Long TTL is safe: setPrivacySettings refreshes the cache immediately
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

// In remote-client mode a provider is injected (driven by control-plane config)
// instead of reading the local database.
let provider = null
export function setPrivacyProvider(fn) {
  provider = fn
}

// Behavior presets per level — explicit flags always override when provided
const LEVEL_DEFAULTS = {
  normal: { enabled: false, suppressTyping: false, pauseAutoReply: false },
  privacy: { enabled: true, suppressTyping: false, pauseAutoReply: false },
  custom: { enabled: true },
}

/**
 * Get current privacy settings.
 * Falls back to config defaults when the DB is unreachable.
 */
export async function getPrivacySettings() {
  if (provider) return provider()
  const cached = cache.get(SETTING_KEY)
  if (cached) return cached

  let settings = { ...config.privacyDefaults }
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } })
    if (row?.value) settings = { ...settings, ...row.value }
  } catch {
    // DB down — defaults apply
  }
  // Guard against contradictory states (e.g. level 'privacy' with enabled unset)
  if (typeof settings.enabled !== 'boolean') {
    settings.enabled = settings.level !== 'normal'
  }
  cache.set(SETTING_KEY, settings)
  return settings
}

/**
 * Update privacy settings (partial patch). Persists to DB, updates the cache
 * immediately so changes take effect without waiting for TTL expiry.
 */
export async function setPrivacySettings(patch = {}) {
  const current = await getPrivacySettings()
  const level = patch.level ?? current.level ?? 'privacy'

  // Start from the level preset so setting level='privacy' always enables it,
  // even when that level is already active. Explicit patch flags win over the preset.
  let next = { ...current, ...(LEVEL_DEFAULTS[level] ?? {}) }
  for (const key of ['enabled', 'suppressTyping', 'pauseAutoReply']) {
    if (patch[key] !== undefined) next[key] = patch[key]
  }
  next.level = level

  try {
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: next },
      create: { key: SETTING_KEY, value: next },
    })
  } catch {
    // DB down — in-memory only for this session
  }
  cache.set(SETTING_KEY, next)
  return next
}
