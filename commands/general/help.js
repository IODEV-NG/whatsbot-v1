import { getAllCommands } from '../index.js'

// ─── .help ────────────────────────────────────────────────────────────────────

export default {
  name: 'help',
  aliases: ['h', 'menu', 'commands'],
  description: 'List all available commands',
  usage: '.help [command]',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from, args, prefix }) {
    const all = getAllCommands()

    // .help <command> — show specific command info
    if (args[0]) {
      const cmd = all.get(args[0].toLowerCase())
      if (!cmd) {
        return sock.sendMessage(from, {
          text: `❌ No command named *${args[0]}* found.`,
        }, { quoted: msg })
      }

      const lines = [
        `📖 *Command Info*`,
        ``,
        `🔹 Name: *${prefix}${cmd.name}*`,
        `📂 Category: ${cmd.category}`,
        `📝 Description: ${cmd.description}`,
        `📌 Usage: \`${cmd.usage}\``,
        cmd.aliases?.length ? `🔗 Aliases: ${cmd.aliases.map(a => prefix + a).join(', ')}` : '',
        cmd.ownerOnly ? `🔒 Owner only` : '',
        cmd.groupOnly ? `👥 Group only` : '',
      ].filter(Boolean)

      return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg })
    }

    // Group commands by category
    const grouped = {}
    for (const [, cmd] of all) {
      if (!grouped[cmd.category]) grouped[cmd.category] = []
      grouped[cmd.category].push(cmd)
    }

    const lines = [`🤖 *WA-Bot Commands*\n`]

    for (const [category, cmds] of Object.entries(grouped)) {
      lines.push(`📂 *${category.toUpperCase()}*`)
      for (const cmd of cmds) {
        lines.push(`  ${prefix}${cmd.name} — ${cmd.description}`)
      }
      lines.push('')
    }

    lines.push(`💡 Type *${prefix}help <command>* for details`)

    return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg })
  },
}
