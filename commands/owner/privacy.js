import { getPrivacySettings, setPrivacySettings } from '../../lib/privacy.js'

export default {
  name: 'privacy',
  aliases: ['pvmode', 'privacymode'],
  description: 'Toggle Privacy Mode (stop auto-read / typing indicators)',
  usage: '.privacy <on|off|status>',
  ownerOnly: true,
  groupOnly: false,

  async run({ sock, msg, from, args }) {
    const action = args[0]?.toLowerCase()

    if (action === 'status' || !action) {
      const p = await getPrivacySettings()
      const lines = [
        '🛡️ *Privacy Mode*',
        '',
        `Level: *${p.level}*`,
        `Auto-mark read: *${p.enabled ? 'OFF (private)' : 'ON (normal)'}*`,
        `Suppress typing: *${p.suppressTyping ? 'ON' : 'OFF'}*`,
        `Pause auto-replies: *${p.pauseAutoReply ? 'ON' : 'OFF'}*`,
        '',
        'Usage: *.privacy on* | *.privacy off*',
      ]
      return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg })
    }

    if (action === 'on' || action === 'off') {
      const on = action === 'on'
      await setPrivacySettings({ level: on ? 'privacy' : 'normal' })
      return sock.sendMessage(from, {
        text: on
          ? '🛡️ *Privacy Mode ON* — incoming messages will not be marked read until you choose.'
          : '✅ *Privacy Mode OFF* — normal read behavior restored.',
      }, { quoted: msg })
    }

    return sock.sendMessage(from, {
      text: '❌ Invalid usage. Try *.privacy status*',
    }, { quoted: msg })
  },
}
