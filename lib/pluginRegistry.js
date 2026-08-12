import { readdirSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { logger } from './logger.js'

export class PluginRegistry {
  constructor() {
    this.plugins = new Map()
    this.commands = new Map()
    this.aliases = new Map()
  }

  register(pluginOrCommand) {
    if (!pluginOrCommand) return null

    if (Array.isArray(pluginOrCommand.commands)) {
      return this.registerPlugin(pluginOrCommand)
    }

    return this.registerCommand(pluginOrCommand)
  }

  registerPlugin(plugin) {
    if (!plugin?.name) return null

    const pluginId = plugin.name.toLowerCase()
    this.plugins.set(pluginId, plugin)

    const commands = Array.isArray(plugin.commands) ? plugin.commands : []
    for (const command of commands) {
      this.registerCommand(command)
    }

    return plugin
  }

  registerCommand(command) {
    if (!command?.name) return null

    const key = command.name.toLowerCase()
    this.commands.set(key, command)

    if (command.aliases?.length) {
      for (const alias of command.aliases) {
        this.aliases.set(alias.toLowerCase(), key)
      }
    }

    return command
  }

  getCommand(name) {
    const key = name?.toLowerCase()
    if (!key) return null
    const resolved = this.aliases.get(key) ?? key
    return this.commands.get(resolved) ?? null
  }

  getAllCommands() {
    return this.commands
  }

  clear() {
    this.plugins.clear()
    this.commands.clear()
    this.aliases.clear()
  }

  async loadFromDirectory(directory) {
    if (!directory) return []

    let entries = []
    try {
      entries = readdirSync(directory)
    } catch {
      return []
    }

    const plugins = []
    for (const entry of entries) {
      const entryPath = path.join(directory, entry)
      const stat = statSync(entryPath)
      if (!stat.isFile() || !entry.endsWith('.js')) continue

      try {
        const moduleUrl = pathToFileURL(entryPath).href
        const mod = await import(moduleUrl)
        const plugin = mod.default ?? mod.plugin ?? mod
        if (plugin) {
          this.register(plugin)
          plugins.push(plugin)
        }
      } catch (error) {
        logger.error(`Failed to load plugin from ${entryPath}: ${error.message}`)
      }
    }

    return plugins
  }
}

export function createPluginRegistry() {
  return new PluginRegistry()
}
