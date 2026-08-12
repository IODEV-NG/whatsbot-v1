import { readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { logger } from '../lib/logger.js'
import { PluginRegistry } from '../lib/pluginRegistry.js'
import config from '../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Command Registry ──────────────────────────────────────────────────────────

const commands = new Map()
const aliases = new Map()
const pluginRegistry = new PluginRegistry()

/**
 * Load all commands from category subdirectories and plugin modules
 */
export async function loadCommands() {
  commands.clear()
  aliases.clear()
  pluginRegistry.clear()

  const categories = readdirSync(__dirname).filter((f) => {
    try {
      return readdirSync(resolve(__dirname, f)) && config.categories[f] !== false
    } catch {
      return false
    }
  })

  let loaded = 0
  let pluginCount = 0

  for (const category of categories) {
    const files = readdirSync(resolve(__dirname, category)).filter((f) => f.endsWith('.js'))

    for (const file of files) {
      const filePath = resolve(__dirname, category, file)
      const mod = await import(pathToFileURL(filePath).href)
      const cmd = mod.default

      if (!cmd?.name) continue

      registerCommand(cmd, category)
      loaded++
    }
  }

  const pluginDir = resolve(__dirname, '..', 'plugins')
  const loadedPlugins = await pluginRegistry.loadFromDirectory(pluginDir)
  for (const plugin of loadedPlugins) {
    if (plugin?.commands?.length) {
      for (const command of plugin.commands) {
        registerCommand(command, 'plugin')
        pluginCount++
      }
    }
  }

  logger.success(`Loaded ${loaded} built-in commands and ${pluginCount} plugin commands`)
  return commands
}

function registerCommand(cmd, category) {
  const name = cmd.name.toLowerCase()
  commands.set(name, { ...cmd, category })

  if (cmd.aliases?.length) {
    for (const alias of cmd.aliases) {
      aliases.set(alias.toLowerCase(), name)
    }
  }
}

/**
 * Get a command by name or alias
 */
export function getCommand(name) {
  const key = name.toLowerCase()
  const resolved = aliases.get(key) ?? key
  return commands.get(resolved) ?? null
}

/**
 * Get all commands (for help menu)
 */
export function getAllCommands() {
  return commands
}

export default commands
