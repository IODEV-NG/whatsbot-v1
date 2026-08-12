import test from 'node:test'
import assert from 'node:assert/strict'

// Fast DB failures (read before any config import loads .env)
process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/x'
// Tight limits so the windowed rate limiter is easy to exhaust in tests
process.env.RATE_MSG_PER_MIN = '3'
process.env.RATE_MSG_PER_HOUR = '5'
process.env.RATE_MSG_PER_DAY = '7'
process.env.RATE_NEW_RECIPIENTS_PER_DAY = '2'

const { checkOutbound, gateOutbound, outboundLimiter } = await import('../lib/outbound.js')
const { RateLimiter } = await import('../lib/ratelimit.js')
const { setKillSwitch, setOutboundPaused } = await import('../lib/abuse.js')

// The shared limiter accumulates window counts across tests in this file, so
// reset the store between tests for deterministic assertions.
test.beforeEach(() => {
  outboundLimiter.store.flushAll()
  setKillSwitch(false)
  setOutboundPaused(false)
})

test('outbound gate allows sends under the limits', () => {
  const gate = checkOutbound('1555@s.whatsapp.net')
  assert.equal(gate.ok, true)
})

test('kill switch blocks ALL outbound regardless of limits', () => {
  setKillSwitch(true)
  const gate = checkOutbound('1555@s.whatsapp.net')
  assert.equal(gate.ok, false)
  assert.match(gate.reason, /kill switch/)
})

test('transient outbound pause (control-plane command) blocks sends', () => {
  setOutboundPaused(true)
  const gate = checkOutbound('1555@s.whatsapp.net')
  assert.equal(gate.ok, false)
  assert.match(gate.reason, /paused/)
})

test('per-minute limit is enforced', () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(checkOutbound(`1555@s.whatsapp.net`).ok, true)
  }
  const blocked = checkOutbound('1555@s.whatsapp.net')
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /minute/)
})

test('per-hour limit is enforced', () => {
  // Isolated limiter so the hour window can trip before the minute window
  const limiter = new RateLimiter({ perMinute: 1000, perHour: 5, perDay: 10000, newRecipientsPerDay: 1000 })
  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.check('1555@s.whatsapp.net').ok, true)
  }
  const blocked = limiter.check('1555@s.whatsapp.net')
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /hour/)
})

test('per-day limit is enforced', () => {
  const limiter = new RateLimiter({ perMinute: 1000, perHour: 1000, perDay: 7, newRecipientsPerDay: 1000 })
  for (let i = 0; i < 7; i++) {
    assert.equal(limiter.check('1555@s.whatsapp.net').ok, true)
  }
  const blocked = limiter.check('1555@s.whatsapp.net')
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /day/)
})

test('new-recipients-per-day limit is enforced', () => {
  assert.equal(checkOutbound('1555@s.whatsapp.net').ok, true)
  assert.equal(checkOutbound('1556@s.whatsapp.net').ok, true)
  const blocked = checkOutbound('1557@s.whatsapp.net')
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /recipients/)
})

test('gateOutbound audits blocked sends and allows healthy ones', () => {
  setKillSwitch(true)
  const blocked = gateOutbound('1555@s.whatsapp.net', 'chatbot')
  assert.equal(blocked, false)
  setKillSwitch(false)
  assert.equal(gateOutbound('1555@s.whatsapp.net', 'chatbot'), true)
})
