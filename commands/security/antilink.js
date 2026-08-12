import { groupService } from '../../lib/services.js'

export default {
  name: 'antilink',
  aliases: ['nolink'],
  description: 'Enable or disable link blocking in a group',
  usage: '.antilink <on|off>',
  ownerOnly: false,
  adminOnly: true,
  groupOnly: true,

  async run({ sock, msg, from, args, groupData }) {
    const state = args[0]?.toLowerCase()

    if (state !== 'on' && state !== 'off') {
      return sock.sendMessage(from, {
        text: '❌ Invalid usage.\nType *.antilink on* or *.antilink off*',
      }, { quoted: msg })
    }

    const isEnabled = state === 'on'
    await groupService.updateGroup(from, { antiLink: isEnabled })

    await sock.sendMessage(from, {
      text: `🛡️ *Group Security Update*\nAnti-Link is now *${state.toUpperCase()}*\nViolators will be warned and auto-kicked at the limit.`,
    }, { quoted: msg })
  },
}
