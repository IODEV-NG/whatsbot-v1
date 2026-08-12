import { groupService } from '../../lib/services.js'

export default {
  name: 'antitag',
  aliases: ['tagging'],
  description: 'Enable or disable mass tagging in a group',
  usage: '.antitag <on|off>',
  ownerOnly: false,
  adminOnly: true,
  groupOnly: true,

  async run({ sock, msg, from, args }) {
    const state = args[0]?.toLowerCase()

    if (state !== 'on' && state !== 'off') {
      return sock.sendMessage(from, {
        text: '❌ Invalid usage.\nType *.antitag on* or *.antitag off*',
      }, { quoted: msg })
    }

    const isEnabled = state === 'on'
    await groupService.updateGroup(from, { antiTag: isEnabled })

    await sock.sendMessage(from, {
      text: `🛡️ *Group Security Update*\nAnti-Tag is now *${state.toUpperCase()}*`,
    }, { quoted: msg })
  },
}
