import axios from 'axios'
import { sendImage } from '../../lib/utils.js'

// ─── .download ────────────────────────────────────────────────────────────────

export default {
  name: 'download',
  aliases: ['dl', 'fetch'],
  description: 'Download and send an image from a URL',
  usage: '.download <url>',
  ownerOnly: false,
  groupOnly: false,

  async run({ sock, msg, from, args }) {
    const url = args[0]

    if (!url) {
      return sock.sendMessage(from, {
        text: `❌ Please provide a URL.\nUsage: *.download <url>*`,
      }, { quoted: msg })
    }

    // Basic URL validation
    try {
      new URL(url)
    } catch {
      return sock.sendMessage(from, { text: '❌ Invalid URL provided.' }, { quoted: msg })
    }

    // Download the image
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    const contentType = response.headers['content-type'] ?? ''
    if (!contentType.startsWith('image/')) {
      return sock.sendMessage(from, {
        text: '❌ URL does not point to an image.',
      }, { quoted: msg })
    }

    const buffer = Buffer.from(response.data)
    await sendImage(sock, from, buffer, `📥 Downloaded from:\n${url}`)
  },
}
