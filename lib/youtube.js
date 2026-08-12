import yts from 'yt-search'
import ytdl from '@distube/ytdl-core'

// Cap downloads at 10 minutes to protect memory on long videos
const MAX_SECONDS = 10 * 60

/**
 * Resolve a YouTube URL or search query into a { videoId, title }
 */
export async function resolveVideo(query) {
  if (ytdl.validateURL(query)) {
    return { videoId: ytdl.getVideoID(query), title: null }
  }
  const result = await yts(query)
  if (!result.videos?.length) {
    throw new Error('No results found for that query.')
  }
  const top = result.videos[0]
  return { videoId: top.videoId, title: top.title }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

/**
 * Download a video's audio-only or audio+video stream as a buffer,
 * enforcing the maximum duration guard.
 */
export async function getVideo(videoId, filter) {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const info = await ytdl.getInfo(url)
  const seconds = Number(info.videoDetails.lengthSeconds)

  if (Number.isFinite(seconds) && seconds > MAX_SECONDS) {
    const mins = Math.floor(seconds / 60)
    throw new Error(`Video is too long (${mins} min). Limit is ${MAX_SECONDS / 60} min.`)
  }

  const stream = ytdl(url, { filter, quality: 'lowest' })
  return streamToBuffer(stream)
}
