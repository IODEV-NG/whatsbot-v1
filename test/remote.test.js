import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'

// Fast DB failures (read before any config import loads .env)
process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/x'

// ─── Fake control server ───────────────────────────────────────────────────────
// Captures every request so the test can assert on the transport's payloads.
const requests = []
let failMode = false // when true, the server answers 500s

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    const parsed = body ? JSON.parse(body) : {}
    requests.push({ path: req.url, method: req.method, body: parsed })
    if (failMode) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: false, error: 'boom' }))
    }
    const payload = { ok: true }
    if (req.url === '/api/v1/sessions/register') {
      payload.session = { id: parsed.session_id, status: 'active' }
      payload.features = { privacy_mode: false, ai: false, commands: true }
      payload.config = { botEnabled: true, privacyMode: false, autoReply: false, typingIndicator: false }
    } else if (req.url === '/api/v1/config') {
      payload.config = { botEnabled: false, privacyMode: true, autoReply: true, typingIndicator: true }
    } else if (req.url === '/api/v1/heartbeat') {
      payload.lastSeen = new Date().toISOString()
    } else if (req.url === '/api/v1/messages') {
      payload.recorded = true
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const controlUrl = `http://127.0.0.1:${server.address().port}`

// ─── Remote client env — MUST be set before importing remote.js (config reads
//     these at module load, and loadEnvFile never overrides existing vars) ─────
process.env.SESSION_ID = 'TEST1234'
process.env.SESSION_SECRET = 'test-secret'
process.env.CONTROL_URL = controlUrl

const remote = await import('../lib/remote.js')
const { setKillSwitch, isKillSwitchOn } = await import('../lib/abuse.js')
const { setRuntimeOverride, getRuntimeFlag } = await import('../lib/runtime.js')
const {
  getPrivacySettings,
  setPrivacySettings,
  setPrivacyProvider,
} = await import('../lib/privacy.js')
const { recordMessage } = await import('../lib/messageService.js')

const lastRequest = () => requests[requests.length - 1]
const requestCount = () => requests.length

test('remote client is detected from env credentials', () => {
  assert.equal(remote.isRemoteClient, true)
})

test('remoteRegister posts credentials and returns config + features', async () => {
  const count = requestCount()
  const reg = await remote.remoteRegister()

  assert.ok(reg.ok)
  assert.equal(reg.session.id, 'TEST1234')
  assert.equal(reg.config.botEnabled, true)
  assert.equal(reg.features.commands, true)

  const req = requests[count] // the request just made
  assert.equal(req.path, '/api/v1/sessions/register')
  assert.equal(req.method, 'POST')
  assert.equal(req.body.session_id, 'TEST1234')
  assert.equal(req.body.secret, 'test-secret')
})

test('remoteFetchConfig returns the control-plane config', async () => {
  const cfg = await remote.remoteFetchConfig()
  assert.ok(cfg)
  assert.equal(cfg.botEnabled, false)
  assert.equal(cfg.privacyMode, true)
  const req = lastRequest()
  assert.equal(req.path, '/api/v1/config')
})

test('remoteHeartbeat posts status/version/uptime', async () => {
  const count = requestCount()
  await remote.remoteHeartbeat('connected', '2.0.0', 42)
  const req = requests[count]
  assert.equal(req.path, '/api/v1/heartbeat')
  assert.equal(req.body.status, 'connected')
  assert.equal(req.body.version, '2.0.0')
  assert.equal(req.body.uptime, 42)
})

test('remoteRecordMessage posts the message and is non-fatal on failure', async () => {
  const count = requestCount()
  await remote.remoteRecordMessage({
    remoteJid: '1555@s.whatsapp.net',
    messageId: 'MSG-1',
    senderJid: '1555@s.whatsapp.net',
    msgType: 'conversation',
    content: 'hello',
    fromMe: false,
  })
  const req = requests[count]
  assert.equal(req.path, '/api/v1/messages')
  assert.equal(req.body.message.messageId, 'MSG-1')

  // Server failure must not throw (fire-and-forget transport)
  failMode = true
  let threw = false
  try {
    await remote.remoteRecordMessage({ remoteJid: 'x', messageId: 'y' })
  } catch {
    threw = true
  }
  failMode = false
  assert.equal(threw, false)
})

test('remoteRegister rejects when the control plane is down or unauthorized', async () => {
  failMode = true
  await assert.rejects(() => remote.remoteRegister(), /boom|Registration failed/)
  failMode = false
})

test('remoteFetchConfig returns null when the poll fails', async () => {
  failMode = true
  const cfg = await remote.remoteFetchConfig()
  failMode = false
  assert.equal(cfg, null)
})

test('applyRemoteBotConfig drives kill switch, privacy, and runtime flags', async () => {
  remote.applyRemoteBotConfig({
    botEnabled: false,
    privacyMode: true,
    autoReply: true,
    typingIndicator: true,
  })
  assert.equal(isKillSwitchOn(), true)
  assert.equal(getRuntimeFlag('autoChatbot'), true)
  assert.equal(getRuntimeFlag('autoTyping'), true)
  const privacy = await getPrivacySettings()
  assert.equal(privacy.enabled, true)
  assert.equal(privacy.level, 'privacy')

  // Restore outbound when botEnabled flips back
  remote.applyRemoteBotConfig({
    botEnabled: true,
    privacyMode: false,
    autoReply: false,
    typingIndicator: false,
  })
  assert.equal(isKillSwitchOn(), false)
  assert.equal(getRuntimeFlag('autoChatbot'), false)

  // Reset module state so later tests in this file are unaffected
  setKillSwitch(false)
  setRuntimeOverride('autoChatbot', null)
  setRuntimeOverride('autoTyping', null)
  setPrivacyProvider(null)
  await setPrivacySettings({ level: 'normal' })
})

test('initRemoteTransports wires message persistence through the control API', async () => {
  remote.initRemoteTransports()
  const count = requestCount()
  await recordMessage({
    remoteJid: '1777@s.whatsapp.net',
    messageId: 'TRANSPORT-1',
    senderJid: '1777@s.whatsapp.net',
    msgType: 'conversation',
    content: 'via recorder',
    fromMe: false,
  })
  const req = requests[count]
  assert.equal(req.path, '/api/v1/messages')
  assert.equal(req.body.message.messageId, 'TRANSPORT-1')
})

test.after(() => {
  server.close()
})
