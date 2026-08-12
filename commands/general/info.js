import os from 'os'
import config from '../../config.js'

// ─── .info ────────────────────────────────────────────────────────────────────

export default {
  name: 'info',
  aliases: ['about', 'botinfo'],
  description: 'Show bot information and system stats',
  usage: '.info',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from }) {
    const uptime = process.uptime()
    const hours = Math.floor(uptime / 3600)
    const mins = Math.floor((uptime % 3600) / 60)
    const secs = Math.floor(uptime % 60)

    const mem = process.memoryUsage()
    const memUsed = (mem.heapUsed / 1024 / 1024).toFixed(1)
    const memTotal = (mem.heapTotal / 1024 / 1024).toFixed(1)

    const platform = `${os.type()} ${os.release()}`
    const node = process.version

    const text = [
      `🤖 *${config.botName}* v${config.version}`,
      ``,
      `⏱ *Uptime:* ${hours}h ${mins}m ${secs}s`,
      `💾 *Memory:* ${memUsed} / ${memTotal} MB`,
      `🖥 *Platform:* ${platform}`,
      `⚙️ *Node.js:* ${node}`,
      `📡 *Library:* @whiskeysockets/baileys`,
      ``,
      `Built with ❤️ by HitchAfrica Technologies`,
    ].join('\n')

    return sock.sendMessage(from, { text }, { quoted: msg })
  },
}
