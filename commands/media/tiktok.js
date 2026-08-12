import axios from 'axios'
import { sendVideo, sendImage } from '../../lib/utils.js'

// ─── .tiktok ───────────────────────────────────────────────────────────────────

export default {
  name: 'tiktok',
  aliases: ['tt', 'tdl'],
  description: 'Download a TikTok video (no watermark)',
  usage: '.tiktok <url>',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from, args }) {
    const url = args[0]

    if (!url) {
      return sock.sendMessage(from, {
        text: '❌ Please provide a TikTok URL.\nUsage: *.tiktok <url>*',
      }, { quoted: msg })
    }

    try {
      new URL(url)
    } catch {
      return sock.sendMessage(from, { text: '❌ Invalid URL provided.' }, { quoted: msg })
    }

    await sock.sendMessage(from, { text: '🎬 Fetching TikTok...' }, { quoted: msg }).catch(() => {})

    try {
      const { data } = await axios.get('https://www.tikwm.com/api/', {
        params: { url },
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })

      if (data?.code !== 0 || !data?.data) {
        throw new Error(data?.msg || 'TikTok returned an error')
      }

      const media = data.data

      // Photo slideshow
      if (media.images?.length) {
        for (const imageUrl of media.images) {
          const img = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 })
          await sendImage(sock, from, Buffer.from(img.data))
        }
        return sock.sendMessage(from, {
          text: `📸 TikTok slideshow: *${media.title || 'No caption'}*`,
        }, { quoted: msg })
      }

      // Video
      const videoUrl = media.hdplay || media.play
      const video = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 30000 })
      return sendVideo(sock, from, Buffer.from(video.data), `🎬 TikTok: *${media.title || 'No caption'}*`)
    } catch (error) {
      return sock.sendMessage(from, {
        text: `❌ TikTok download failed: ${error.message}`,
      }, { quoted: msg })
    }
  },
}
