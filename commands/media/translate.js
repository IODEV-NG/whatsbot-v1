import { translate } from '@vitalets/google-translate-api'
import { getMessageText } from '../../lib/utils.js'

// ─── .tr — translate text ──────────────────────────────────────────────────────

export default {
  name: 'tr',
  aliases: ['translate', 'tl'],
  description: 'Translate text to another language',
  usage: '.tr <lang> <text> | .tr <lang> (reply to a message)',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from, args }) {
    const [lang, ...rest] = args

    if (!lang) {
      return sock.sendMessage(from, {
        text: '❌ Please provide a language code.\nUsage: *.tr <lang> <text>*  (e.g. *.tr es hello*)',
      }, { quoted: msg })
    }

    // Text from args, or from the quoted/replied message
    let text = rest.join(' ').trim()
    if (!text) {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      text = quoted ? getMessageText({ message: quoted }) : ''
    }
    if (!text) {
      return sock.sendMessage(from, {
        text: '❌ Nothing to translate. Add text or reply to a message.',
      }, { quoted: msg })
    }

    try {
      const result = await translate(text, { to: lang })
      return sock.sendMessage(from, {
        text: `🌐 *Translation (${lang})*\n\n${result.text}`,
      }, { quoted: msg })
    } catch (error) {
      return sock.sendMessage(from, {
        text: `❌ Translation failed: ${error.message}\n\n💡 Use ISO codes like *es, fr, de, pt, yo, ha, ig*`,
      }, { quoted: msg })
    }
  },
}
