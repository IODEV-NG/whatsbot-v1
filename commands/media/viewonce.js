import {
  downloadMedia,
  getMessageType,
  getQuotedMessage,
  sendImage,
  sendVideo,
  sendAudio,
} from '../../lib/utils.js'

// ─── .vv — save view-once media ────────────────────────────────────────────────

export default {
  name: 'vv',
  aliases: ['viewonce', 'save'],
  description: 'Save a view-once photo, video, or voice note',
  usage: '.vv (reply to a view-once message)',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from }) {
    const quoted = getQuotedMessage(msg)

    if (!quoted) {
      return sock.sendMessage(from, {
        text: '❌ Reply to a *view-once* message with *.vv* to save it.',
      }, { quoted: msg })
    }

    const msgType = getMessageType(quoted)
    if (!msgType || !['imageMessage', 'videoMessage', 'audioMessage'].includes(msgType)) {
      return sock.sendMessage(from, {
        text: '❌ That message is not view-once media.',
      }, { quoted: msg })
    }

    try {
      const buffer = await downloadMedia(quoted)

      if (msgType === 'imageMessage') return sendImage(sock, from, buffer, '📸 Saved view-once image')
      if (msgType === 'videoMessage') return sendVideo(sock, from, buffer, '🎬 Saved view-once video')
      return sendAudio(sock, from, buffer, { mimetype: 'audio/mpeg' })
    } catch (error) {
      return sock.sendMessage(from, {
        text: `❌ Could not save media: ${error.message}`,
      }, { quoted: msg })
    }
  },
}
