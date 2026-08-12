// ─── .ping ────────────────────────────────────────────────────────────────────

export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Check if the bot is alive and measure response time',
  usage: '.ping',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from }) {
    const start = Date.now()
    const sentMsg = await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: msg })
    const elapsed = Date.now() - start

    await sock.sendMessage(from, {
      text: `🏓 *Pong!*\n⏱ Response time: *${elapsed}ms*`,
      edit: sentMsg.key,
    })
  },
}
