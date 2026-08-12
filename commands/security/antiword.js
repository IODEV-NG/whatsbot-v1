import { groupService } from '../../lib/services.js'

export default {
  name: 'antiword',
  aliases: ['badword', 'wordfilter'],
  description: 'Block forbidden words in a group',
  usage: '.antiword <on|off> | .addword <word> | .delword <word> | .words',
  ownerOnly: false,
  adminOnly: true,
  groupOnly: true,

  async run({ sock, msg, from, args, groupData }) {
    const [sub, ...rest] = args
    const action = sub?.toLowerCase()
    const g = groupData ?? { badWords: [] }

    // ─── Toggle ──────────────────────────────────────────────────────────
    if (action === 'on' || action === 'off') {
      await groupService.updateGroup(from, { antiWord: action === 'on' })
      return sock.sendMessage(from, {
        text: `🛡️ *Group Security Update*\nAnti-Word is now *${action.toUpperCase()}*`,
      }, { quoted: msg })
    }

    // ─── List words ──────────────────────────────────────────────────────
    if (action === 'words' || action === 'list') {
      const words = g.badWords ?? []
      return sock.sendMessage(from, {
        text: words.length
          ? `🚫 *Blocked words:*\n${words.map((w) => `• ${w}`).join('\n')}`
          : '✅ No blocked words yet. Add one with *.addword <word>*',
      }, { quoted: msg })
    }

    // ─── Add word ────────────────────────────────────────────────────────
    if (action === 'addword' || action === 'add') {
      const word = rest.join(' ').trim().toLowerCase()
      if (!word) {
        return sock.sendMessage(from, { text: '❌ Usage: *.addword <word>*' }, { quoted: msg })
      }
      const words = g.badWords ?? []
      if (words.includes(word)) {
        return sock.sendMessage(from, { text: `⚠️ *${word}* is already blocked.` }, { quoted: msg })
      }
      const next = [...words, word]
      await groupService.updateGroup(from, { badWords: next })
      return sock.sendMessage(from, {
        text: `🚫 Added *${word}* to the blocked list.\nCurrent: ${next.length} word(s)`,
      }, { quoted: msg })
    }

    // ─── Remove word ─────────────────────────────────────────────────────
    if (action === 'delword' || action === 'remove' || action === 'delete') {
      const word = rest.join(' ').trim().toLowerCase()
      const words = g.badWords ?? []
      const next = words.filter((w) => w !== word)
      if (next.length === words.length) {
        return sock.sendMessage(from, { text: `⚠️ *${word}* is not in the blocked list.` }, { quoted: msg })
      }
      await groupService.updateGroup(from, { badWords: next })
      return sock.sendMessage(from, {
        text: `✅ Removed *${word}* from the blocked list.\nRemaining: ${next.length} word(s)`,
      }, { quoted: msg })
    }

    return sock.sendMessage(from, {
      text: '❌ Invalid usage.\n\n*Commands:*\n• *.antiword on|off*\n• *.addword <word>*\n• *.delword <word>*\n• *.words*',
    }, { quoted: msg })
  },
}
