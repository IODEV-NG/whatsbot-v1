import http from 'http'
import config from '../config.js'
import { logger } from './logger.js'

/**
 * Minimal local health endpoint (WhatsBot V1 spec §26).
 *
 * GET /health → { status, version, whatsapp, controlPlane }
 *
 * Deliberately exposes NO secrets: no database credentials, no WhatsApp auth
 * state, no environment variables.
 */

let server = null
let getStatus = null

/**
 * Start the health server. `statusProvider` is called on each request and must
 * return the dynamic fields (whatsapp / controlPlane connection state).
 * Bind to 127.0.0.1 by default so it is not exposed to the internet unless
 * API_HOST is explicitly set.
 */
export function startHealthServer(statusProvider = null) {
  if (server) return server
  getStatus = statusProvider

  server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const dynamic = typeof getStatus === 'function' ? getStatus() : {}
      const payload = {
        status: 'ok',
        version: config.version,
        botName: config.botName,
        prefix: config.prefix,
        remoteMode: Boolean(config.sessionId && config.sessionSecret),
        ...dynamic,
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(payload))
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ status: 'not_found' }))
  })

  server.listen(config.apiPort || 3000, config.apiHost || '127.0.0.1', () => {
    logger.success(`Health endpoint → http://${config.apiHost || '127.0.0.1'}:${config.apiPort || 3000}/health`)
  })
  return server
}

export function stopHealthServer() {
  if (!server) return
  server.close()
  server = null
}
