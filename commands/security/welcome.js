import { groupService } from '../../lib/services.js'

export default {
  name: 'welcome',
  aliases: ['goodbye', 'farewell'],
  description: 'Configure automatic welcome / goodbye messages',
  usage: '.welcome <on|off> | .setwelcome <text> | .setgoodbye <text>',
  ownerOnly: false,
  adminOnly: true,
  groupOnly: true,

  async run({ sock, msg, from, args, groupData }) {
    const [sub, ...rest] = args
    const action = sub?.toLowerCase()
    const g = groupData ?? {}

    // ─── Toggle ──────────────────────────────────────────────────────────
    if (action === 'on' || action === 'off') {
      await groupService.updateGroup(from, { welcomeEnabled: action === 'on' })
      return sock.sendMessage(from, {
        text: `👋 Welcome/Goodbye messages are now *${action.toUpperCase()}*`,
      }, { quoted: msg })
    }

    // ─── Set welcome text ────────────────────────────────────────────────
    if (action === 'setwelcome' || action === 'set') {
      const text = rest.join(' ').trim()
      if (!text) {
        return sock.sendMessage(from, { text: '❌ Usage: *.setwelcome <text>*' }, { quoted: msg })
      }
      await groupService.updateGroup(from, { welcomeMsg: text, welcomeEnabled: true })
      return sock.sendMessage(from, {
        text: `✅ Welcome message set (auto-enabled).\n\n📝 *Preview:*\n${text}`,
      }, { quoted: msg })
    }

    // ─── Set goodbye text ────────────────────────────────────────────────
    if (action === 'setgoodbye') {
      const text = rest.join(' ').trim()
      if (!text) {
        return sock.sendMessage(from, { text: '❌ Usage: *.setgoodbye <text>*' }, { quoted: msg })
      }
      await groupService.updateGroup(from, { goodbyeMsg: text })
      return sock.sendMessage(from, {
        text: `✅ Goodbye message set.\n\n📝 *Preview:*\n${text}`,
      }, { quoted: msg })
    }

    return sock.sendMessage(from, {
      text: [
        '❌ Invalid usage.\n',
        '*Commands:*',
        '• *.welcome on|off* — enable/disable messages',
        '• *.setwelcome <text>* — set welcome message (use @ for mentions)',
        '• *.setgoodbye <text>* — set goodbye message',
      ].join('\n'),
    }, { quoted: msg })
  },
}
