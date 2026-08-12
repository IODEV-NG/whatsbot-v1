import { resolveVideo, getVideo } from '../../lib/youtube.js'
import { sendVideo } from '../../lib/utils.js'

// ─── .yt (video) ───────────────────────────────────────────────────────────────

export default {
  name: 'yt',
  aliases: ['ytmp4', 'ytv', 'video'],
  description: 'Download a video from YouTube (by search or link)',
  usage: '.yt <video name or URL>',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from, args }) {
    const query = args.join(' ').trim()
    if (!query) {
      return sock.sendMessage(from, {
        text: '❌ Please provide a video name or YouTube URL.\nUsage: *.yt <query>*',
      }, { quoted: msg })
    }

    await sock.sendMessage(from, { text: '🎬 Downloading...' }, { quoted: msg }).catch(() => {})

    try {
      const { videoId, title } = await resolveVideo(query)
      const buffer = await getVideo(videoId, 'audioandvideo')

      return sendVideo(sock, from, buffer, title ? `🎬 *${title}*` : '🎬 Here you go!')
    } catch (error) {
      return sock.sendMessage(from, {
        text: `❌ Download failed: ${error.message}`,
      }, { quoted: msg })
    }
  },
}
