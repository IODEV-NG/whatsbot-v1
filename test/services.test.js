import test from 'node:test'
import assert from 'node:assert/strict'

import { getAutoReply } from '../lib/chatbot.js'
import { securityService, groupService, GroupService } from '../lib/services.js'

test('getAutoReply matches greetings and ignores commands', () => {
  assert.ok(getAutoReply('hello there', { prefix: '.' }))
  assert.ok(getAutoReply('good morning', { prefix: '.' }))
  assert.equal(getAutoReply('.help', { prefix: '.' }), null)
  assert.equal(getAutoReply('random gibberish xyz', { prefix: '.' }), null)
})

test('isLinkMessage detects links but not commands', () => {
  assert.equal(securityService.isLinkMessage({}, 'check https://example.com now'), true)
  assert.equal(securityService.isLinkMessage({}, 'join wa.me/12345'), true)
  assert.equal(securityService.isLinkMessage({}, 'no links here'), false)
  // Command args (downloader usage) bypass moderation
  assert.equal(securityService.isLinkMessage({}, '.play https://youtube.com/watch?v=x'), false)
})

test('hasBadWord checks the configured word list', () => {
  assert.equal(securityService.hasBadWord('this is badword here', ['badword']), true)
  assert.equal(securityService.hasBadWord('clean message', ['badword']), false)
  assert.equal(securityService.hasBadWord('clean', []), false)
})

test('isSpamming flags floods once per window', () => {
  for (let i = 1; i <= 5; i++) {
    assert.equal(securityService.isSpamming('123', 'group@g.us', 5), false)
  }
  assert.equal(securityService.isSpamming('123', 'group@g.us', 5), 'warn')
  assert.equal(securityService.isSpamming('123', 'group@g.us', 5), 'repeat')
})

test('GroupService.warnUser increments counts and reports limit', async () => {
  const client = { group: { upsert: async () => ({ id: 'g', warnCounts: {} }) } }
  const service = new GroupService(client, new Map())
  const first = await service.warnUser('g', '1555@s.whatsapp.net', 3)
  assert.equal(first.count, 1)
  assert.equal(first.limit, 3)
  const second = await service.warnUser('g', '1555@s.whatsapp.net', 3)
  assert.equal(second.count, 2)
})
