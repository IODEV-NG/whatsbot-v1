import { prisma } from '../../lib/database.js'
import config from '../../config.js'
import os from 'os'

export default {
  name: 'menu',
  aliases: ['dashboard', 'panel', 'owner'],
  description: 'Exclusive Owner Dashboard',
  usage: '.menu',
  ownerOnly: true,
  groupOnly: false,

  async run({ sock, msg, from }) {
    // Fetch live stats from PostgreSQL (defensive — DB may be down)
    let usersCount = '?'
    let groupsCount = '?'
    let premiumCount = '?'
    try {
      usersCount = await prisma.user.count()
      groupsCount = await prisma.group.count()
      premiumCount = await prisma.user.count({ where: { premium: true } })
    } catch (error) {
      console.error(`Menu stats failed: ${error.message}`)
    }

    const uptime = Math.floor(process.uptime() / 60)
    const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)

    const dashboard = `👑 *${config.botName} v${config.version} Dashboard*\nWelcome back, Boss.\n\n📊 *Live Database Stats*\n👥 Total Users: *${usersCount}*\n🏘️ Total Groups: *${groupsCount}*\n💎 Premium Subs: *${premiumCount}*\n\n⚙️ *System Metrics*\n⏱️ Uptime: *${uptime} mins*\n💾 Memory: *${memUsed} MB*\n📡 Engine: *Prisma v5* (PostgreSQL)\n\n🛡️ *Group Security*\n🔹 .antitag on/off\n🔹 .antilink on/off\n🔹 .antispam on/off\n🔹 .antiword on/off + .addword/.delword\n🔹 .welcome on/off + .setwelcome/.setgoodbye\n🔹 .warn @user / .warnlist / .resetwarn\n\n🎵 *Media*\n🔹 .play <song>  |  .yt <video>\n🔹 .tiktok <url>  |  .vv (view-once)\n🔹 .sticker  |  .tr <lang> <text>\n\n⚡ *Automation*\nAUTO_STATUS_VIEW, AUTO_REACT, ANTI_CALL, AUTO_BIO, AUTO_CHATBOT\n\nType *.help* for the full command list.`

    await sock.sendMessage(from, { text: dashboard }, { quoted: msg })
  }
}
