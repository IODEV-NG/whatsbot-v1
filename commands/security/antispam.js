import { groupService } from '../../lib/services.js'

export default {
  name: 'antispam',
  aliases: ['nospam'],
  description: 'Enable or disable spam protection in a group',
  usage: '.antispam <on|off>',
  ownerOnly: false,
  adminOnly: true,
  groupOnly: true,

  async run({ sock, msg, from, args, groupData }) {
    const state = args[0]?.toLowerCase()

    if (state !== 'on' && state !== 'off') {
      return sock.sendMessage(from, {
        text: '❌ Invalid usage.\nType *.antispam on* or *.antispam off*',
      }, { quoted: msg })
    }

    const isEnabled = state === 'on'
    await groupService.updateGroup(from, { antiSpam: isEnabled })

    await sock.sendMessage(from, {
      text: `🛡️ *Group Security Update*\nAnti-Spam is now *${state.toUpperCase()}*\nFlooding the chat triggers a warning.`,
    }, { quoted: msg })
  },
}
