import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { downloadMedia, getMessageType, getQuotedMessage, sendSticker } from '../../lib/utils.js'
import config from '../../config.js'

// ─── .sticker ─────────────────────────────────────────────────────────────────

export default {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description: 'Convert an image or video to a WhatsApp sticker',
  usage: '.sticker (reply to image/video)',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from }) {
    const quoted = getQuotedMessage(msg)
    const targetMsg = quoted ?? msg
    const msgType = getMessageType(targetMsg)

    const isImage = msgType === 'imageMessage'
    const isVideo = msgType === 'videoMessage'

    if (!isImage && !isVideo) {
      return sock.sendMessage(from, {
        text: '❌ Please reply to an *image* or *video* with *.sticker*',
      }, { quoted: msg })
    }

    try {
      const buffer = await downloadMedia(targetMsg)

      const sticker = new Sticker(buffer, {
        pack: config.stickerPackName,
        author: config.stickerAuthor,
        type: isVideo ? StickerTypes.VIDEO : StickerTypes.FULL,
        quality: 80,
      })

      const webp = await sticker.toBuffer()
      await sendSticker(sock, from, webp)
    } catch (error) {
      const hint = isVideo
        ? '\n\n💡 Video stickers require *ffmpeg* to be installed (`brew install ffmpeg`).'
        : ''
      return sock.sendMessage(from, {
        text: `❌ Sticker creation failed: ${error.message}${hint}`,
      }, { quoted: msg })
    }
  },
}
