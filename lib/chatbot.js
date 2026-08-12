// ─── Lightweight keyword auto-reply chatbot ──────────────────────────────────

const RULES = [
  {
    patterns: [/^(hi+|hii+|hello+|hey+|holla+|good\s*(morning|afternoon|evening))/i],
    reply: (name, botName) =>
      `Hello${name ? ` ${name}` : ''}! 👋 I'm *${botName}*, your WhatsApp assistant.\nType *${'.'}help* to see what I can do.`,
  },
  {
    patterns: [/^(thanks|thank you|thx|ty|gracias)/i],
    reply: () => `You're welcome! 💚 Happy to help anytime.`,
  },
  {
    patterns: [/^(who are you|what are you|about you|your name)/i],
    reply: (name, botName) => `I'm *${botName}*, a modular WhatsApp bot built on Baileys. 🤖`,
  },
  {
    patterns: [/^(how are you|how r u|how's it going)/i],
    reply: () => `Doing great, thanks for asking! ⚡ Ready to serve.`,
  },
  {
    patterns: [/^(what can you do|help me|commands|menu)/i],
    reply: (name, botName) =>
      `I can download media, make stickers, moderate groups, and more. 🤖\nType *${'.'}help* for the full command list.`,
  },
  {
    patterns: [/^(bye|goodbye|see you|gtg)/i],
    reply: () => `Goodbye! 👋 Come back soon.`,
  },
]

/**
 * Get an auto-reply for a non-command message, or null if no rule matches.
 */
export function getAutoReply(text, opts = {}) {
  if (!text || text.startsWith(opts.prefix || '.')) return null

  const clean = text.trim()
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(clean))) {
      return rule.reply(opts.name, opts.botName)
    }
  }
  return null
}
