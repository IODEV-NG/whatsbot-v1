import test from 'node:test'
import assert from 'node:assert/strict'

import { PluginRegistry } from '../lib/pluginRegistry.js'

test('PluginRegistry registers plugin commands and aliases', () => {
  const registry = new PluginRegistry()

  registry.register({
    name: 'echo-plugin',
    commands: [
      {
        name: 'echo',
        aliases: ['say'],
        description: 'Echo input',
        usage: '.echo <text>',
        ownerOnly: false,
        groupOnly: false,
        run: async () => {},
      },
    ],
  })

  const command = registry.getCommand('echo')
  assert.ok(command)
  assert.equal(command.name, 'echo')
  assert.equal(registry.getCommand('say')?.name, 'echo')
  assert.equal(registry.getAllCommands().size, 1)
})
