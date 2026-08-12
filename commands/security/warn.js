import { groupService } from '../../lib/services.js'
import { formatNumber, toJid } from '../../lib/utils.js'

export default {
  name: 'warn',
  aliases: ['warnings'],
  description: 'Warn a member, view warnings, or reset them',
  usage: '.warn @user <reason> | .warnlist | .resetwarn @user',
  ownerOnly: false,
  adminOnly: true,
  groupOnly: true,

  async run({ sock, msg, from, args, groupData }) {
    const [sub, ...rest] = args
    const action = sub?.toLowerCase()
    const g = groupData ?? {}

    // ─── List warnings ───────────────────────────────────────────────────
    if (action === 'list' || action === 'warnlist') {
      const counts = g.warnCounts ?? {}
      const entries = Object.entries(counts).filter(([, c]) => c > 0)
      if (!entries.length) {
        return sock.sendMessage(from, { text: '✅ No active warnings in this group.' }, { quoted: msg })
      }
      const lines = entries.map(([phone, count]) => `• ${phone} — *${count}* ⚠️`)
      return sock.sendMessage(from, {
        text: `📋 *Warnings (${entries.length}):*\n${lines.join('\n')}\n\nLimit: *${g.warnLimit ?? 3}*`,
      }, { quoted: msg })
    }

    // ─── Reset warnings ──────────────────────────────────────────────────
    if (action === 'reset' || action === 'resetwarn') {
      const target = extractTarget(args, msg)
      await groupService.resetWarn(from, target)
      return sock.sendMessage(from, {
        text: target ? '✅ Warnings reset for that member.' : '✅ Warnings reset for *all* members.',
      }, { quoted: msg })
    }

    // ─── Warn a user ─────────────────────────────────────────────────────
    const target = extractTarget(args, msg)
    if (!target) {
      return sock.sendMessage(from, {
        text: '❌ Reply to a message or mention a user.\nUsage: *.warn @user <reason>*',
      }, { quoted: msg })
    }

    const reason = args
      .filter((a) => !a.startsWith('@'))
      .join(' ')
      .trim() || 'No reason provided'

    const { count, limit } = await groupService.warnUser(from, target, g.warnLimit)

    if (count >= limit) {
      await sock.groupParticipantsUpdate(from, [target], 'remove').catch(() => {})
      await groupService.resetWarn(from, target)
      return sock.sendMessage(from, {
        text: `🚫 @${formatNumber(target)} has been *kicked* (warning limit reached: ${limit}).`,
        mentions: [target],
      }, { quoted: msg })
    }

    return sock.sendMessage(from, {
      text: `⚠️ @${formatNumber(target)} has been warned.\nReason: *${reason}*\nWarnings: *${count}/${limit}*`,
      mentions: [target],
    }, { quoted: msg })
  },
}

/** Extract a target JID from mentions, replies, or args */
function extractTarget(args, msg) {
  const mentioned = args.find((a) => a.startsWith('@'))
  if (mentioned) return toJid(mentioned.slice(1))

  // Quoted reply → warn the quoted sender
  const quotedSender = msg.message?.extendedTextMessage?.contextInfo?.participant
  if (quotedSender) return quotedSender
  return null
}
