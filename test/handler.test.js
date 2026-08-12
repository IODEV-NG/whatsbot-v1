import test from 'node:test'
import assert from 'node:assert/strict'

// Fast DB failures + chatbot enabled for these tests (read before config import)
process.env.AUTO_CHATBOT = 'true'
process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/x'

const { loadCommands } = await import('../commands/index.js')
await loadCommands()

const { handleMessage } = await import('../handler.js')

function mockSock() {
  const sent = []
  return {
    sent,
    readMessages: async () => {},
    sendMessage: async (jid, content) => { sent.push(content) },
    sendPresenceUpdate: async () => {},
    groupMetadata: async () => ({ participants: [] }),
    groupParticipantsUpdate: async () => {},
  }
}

function makeMsg(text, overrides = {}) {
  return {
    key: { remoteJid: '123456@s.whatsapp.net', fromMe: false, ...(overrides.key || {}) },
    pushName: 'Tester',
    message: { conversation: text },
    ...overrides,
  }
}

test('commands receive their parsed arguments', async () => {
  const sock = mockSock()
  await handleMessage(sock, makeMsg('.echo hello world'))
  const reply = sock.sent.find((s) => s.text === 'hello world')
  assert.ok(reply, `echo should reply with the args. Got: ${JSON.stringify(sock.sent)}`)
})

test('anti-link enforcement deletes and warns in groups', async () => {
  const { groupCache } = await import('../lib/database.js')
  const groupId = '999999@g.us'
  groupCache.set(groupId, {
    id: groupId,
    antiTag: false,
    antiLink: true,
    antiSpam: false,
    antiWord: false,
    badWords: [],
    warnLimit: 3,
    warnCounts: {},
  })

  const sock = mockSock()
  await handleMessage(sock, {
    key: { remoteJid: groupId, participant: '1555@s.whatsapp.net', fromMe: false },
    pushName: 'Spammer',
    message: { extendedTextMessage: { text: 'visit https://example.com now' } },
  })

  assert.ok(sock.sent.find((s) => s.delete), 'offending message should be deleted')
  assert.ok(
    sock.sent.find((s) => typeof s.text === 'string' && s.text.includes('⚠️')),
    'offender should receive a warning'
  )
})

test('chatbot auto-replies to greetings but not to its own messages', async () => {
  const sock = mockSock()
  await handleMessage(sock, makeMsg('hello there'))
  assert.ok(
    sock.sent.some((s) => typeof s.text === 'string' && s.text.includes('Hello')),
    'should auto-reply to a greeting'
  )

  sock.sent.length = 0
  await handleMessage(sock, makeMsg('hello again', { key: { remoteJid: '123456@s.whatsapp.net', fromMe: true } }))
  assert.equal(sock.sent.length, 0, 'must not reply to its own messages')
})
