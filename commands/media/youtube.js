import { resolveVideo, getVideo } from '../../lib/youtube.js'

// ─── .play (audio) ─────────────────────────────────────────────────────────────

export default {
  name: 'play',
  aliases: ['ytmp3', 'yta', 'song'],
  description: 'Download audio from YouTube (by search or link)',
  usage: '.play <song name or URL>',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from, args }) {
    const query = args.join(' ').trim()
    if (!query) {
      return sock.sendMessage(from, {
        text: '❌ Please provide a song name or YouTube URL.\nUsage: *.play <query>*',
      }, { quoted: msg })
    }

    await sock.sendMessage(from, { text: '🎵 Searching...' }, { quoted: msg }).catch(() => {})

    try {
      const { videoId, title } = await resolveVideo(query)
      const buffer = await getVideo(videoId, 'audioonly')

      return sock.sendMessage(from, {
        audio: buffer,
        mimetype: 'audio/mp4',
        ptt: false,
        caption: title ? `🎵 *${title}*` : '🎵 Here you go!',
      }, { quoted: msg })
    } catch (error) {
      return sock.sendMessage(from, {
        text: `❌ Download failed: ${error.message}`,
      }, { quoted: msg })
    }
  },
}
