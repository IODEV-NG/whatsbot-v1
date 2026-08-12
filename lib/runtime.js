import config from '../config.js'

// Runtime-overridable flags. null = fall back to config defaults.
// Remote config (control plane) mutates these while the bot runs.
const overrides = {
  autoChatbot: null,
  autoTyping: null,
}

export function setRuntimeOverride(key, value) {
  overrides[key] = value
}

export function getRuntimeFlag(key) {
  return overrides[key] ?? config[key]
}
