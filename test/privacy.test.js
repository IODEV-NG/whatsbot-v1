import test from 'node:test'
import assert from 'node:assert/strict'

// Fast DB failures (read before any config import loads .env)
process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/x'

const { RateLimiter } = await import('../lib/ratelimit.js')
const { getPrivacySettings, setPrivacySettings } = await import('../lib/privacy.js')
const { setKillSwitch, isKillSwitchOn } = await import('../lib/abuse.js')
const { recordMessage, getUnreadCounts, markAllRead, markReadByKeys } = await import('../lib/messageService.js')

test('RateLimiter enforces per-minute limits', () => {
  const rl = new RateLimiter({ perMinute: 3, perHour: 100, perDay: 100, newRecipientsPerDay: 100 })
  for (let i = 0; i < 3; i++) {
    assert.equal(rl.check('2345@s.whatsapp.net').ok, true)
  }
  const blocked = rl.check('2345@s.whatsapp.net')
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /minute/)
})

test('RateLimiter caps unique new recipients per day', () => {
  const rl = new RateLimiter({ perMinute: 100, perHour: 1000, perDay: 10000, newRecipientsPerDay: 2 })
  assert.equal(rl.check('111@s.whatsapp.net').ok, true)
  assert.equal(rl.check('222@s.whatsapp.net').ok, true)
  const third = rl.check('333@s.whatsapp.net')
  assert.equal(third.ok, false)
  assert.match(third.reason, /recipients/)
})

test('kill switch toggles', () => {
  setKillSwitch(true)
  assert.equal(isKillSwitchOn(), true)
  setKillSwitch(false)
  assert.equal(isKillSwitchOn(), false)
})

test('privacy settings use defaults and update in-memory when DB is down', async () => {
  const defaults = await getPrivacySettings()
  assert.equal(defaults.enabled, false)
  assert.equal(defaults.level, 'normal')

  const updated = await setPrivacySettings({ level: 'privacy' })
  assert.equal(updated.enabled, true)

  // Level preset + explicit flags merge
  const custom = await setPrivacySettings({ level: 'custom', suppressTyping: true })
  assert.equal(custom.enabled, true)
  assert.equal(custom.suppressTyping, true)
  assert.equal(custom.level, 'custom')

  // Back to normal resets behavior flags
  const normal = await setPrivacySettings({ level: 'normal' })
  assert.equal(normal.enabled, false)
  assert.equal(normal.suppressTyping, false)
})

test('message service is non-fatal with DB down', async () => {
  await recordMessage({ remoteJid: 'x@g.us', messageId: 'abc' })
  const counts = await getUnreadCounts()
  assert.deepEqual(counts, {})
  assert.equal(await markReadByKeys('x@g.us', ['abc']), 0)
  assert.equal(await markAllRead(), 0)
})
