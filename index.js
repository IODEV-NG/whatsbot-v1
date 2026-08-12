import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import readline from 'readline'
import chokidar from 'chokidar'
import fs from 'fs'
import path from 'path'

import config from './config.js'
import { handleMessage } from './handler.js'
import { loadCommands } from './commands/index.js'
import { logger, pinoLogger, printBanner } from './lib/logger.js'
import { prisma } from './lib/database.js'
import { restoreSessionFromDb, backupFileToDb, deleteFileFromDb } from './lib/session.js'
import { groupService } from './lib/services.js'
import { formatNumber, react, getMessageText } from './lib/utils.js'
import { isKillSwitchOn, auditOutbound } from './lib/abuse.js'
import { gateOutbound } from './lib/outbound.js'
import { startHealthServer } from './lib/health.js'
import {
  isRemoteClient,
  remoteRegister,
  remoteFetchConfig,
  remoteHeartbeat,
  applyRemoteBotConfig,
  initRemoteTransports,
  remotePollCommands,
  remoteAckCommand,
  executeRemoteCommand,
  setSyncStatusProvider,
} from './lib/remote.js'

// Reconnect backoff (1s → 2s → 4s → ... capped at 60s)
let reconnectAttempt = 0
const reconnectDelay = () => Math.min(1000 * 2 ** reconnectAttempt, 60000)

// ─── Prompt helper ─────────────────────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()) }))
}

// ─── Connection ────────────────────────────────────────────────────────────────

async function startBot() {
  printBanner(config.botName, config.version)

  await loadCommands()

  // Remote clients keep an isolated auth folder per session; standalone uses the
  // shared session dir backed up to the local database.
  const sessionDir = isRemoteClient
    ? path.join(config.sessionDir, config.sessionId)
    : config.sessionDir

  if (!isRemoteClient) {
    logger.info('Syncing authentication state from database...')
    await restoreSessionFromDb()
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
  const { version, isLatest } = await fetchLatestBaileysVersion()
  logger.info(`Using WA v${version.join('.')} ${isLatest ? '(latest)' : '(outdated)'}`)

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pinoLogger),
    },
    logger: pinoLogger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    markOnlineOnConnect: true,
  })

  // ─── Local health endpoint (§26) — reports status/version/connection state ─
  startHealthServer(() => ({
    whatsapp: sock.user ? 'connected' : 'connecting',
    controlPlane: isRemoteClient ? 'connected' : 'local',
  }))

  // ─── Remote client mode: register with the control plane ─────────────────
  if (isRemoteClient) {
    initRemoteClient(sock)
  } else {
    logger.success('Standalone mode — commands, moderation and privacy run locally')
  }

  // ─── Session backup to the local database (standalone mode) ───────────────
  let watcher = null
  if (!isRemoteClient) {
    watcher = chokidar.watch(config.sessionDir, {
      persistent: true,
      ignoreInitial: true,
    })

    watcher.on('add', async (filePath) => {
      await backupFileToDb(path.basename(filePath), fs.readFileSync(filePath, 'utf-8'))
    })
    watcher.on('change', async (filePath) => {
      await backupFileToDb(path.basename(filePath), fs.readFileSync(filePath, 'utf-8'))
    })
    watcher.on('unlink', async (filePath) => {
      await deleteFileFromDb(path.basename(filePath))
    })
  }

  // ─── Pairing Code ────────────────────────────────────────────────────────────
  if (!sock.authState.creds.registered) {
    let phoneNumber = config.ownerNumber

    if (!phoneNumber || phoneNumber === 'YOUR_NUMBER_HERE') {
      phoneNumber = await prompt('\n📱 Enter your WhatsApp number (with country code, no + or spaces): ')
    }

    phoneNumber = phoneNumber.replace(/\D/g, '')
    logger.info(`Requesting pairing code for ${phoneNumber}...`)

    await new Promise((r) => setTimeout(r, 3000))

    const code = await sock.requestPairingCode(phoneNumber)
    const formatted = code.match(/.{1,4}/g)?.join('-') ?? code

    console.log('\n┌─────────────────────────────┐')
    console.log(`│  🔑 Pairing Code: ${formatted.padEnd(10)} │`)
    console.log('└─────────────────────────────┘')
    console.log('  Open WhatsApp → Linked Devices → Link with phone number\n')
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      watcher?.close() // Clean up watcher on close
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      if (statusCode === DisconnectReason.loggedOut) {
        logger.warn('Logged out. Delete the session folder and restart.')
        process.exit(1)
      }

      logger.warn(`Connection closed (${statusCode}). Reconnecting: ${shouldReconnect}`)
      if (shouldReconnect) {
        const delay = reconnectDelay()
        reconnectAttempt++
        setTimeout(() => startBot(), delay)
      }
    }

    if (connection === 'open') {
      reconnectAttempt = 0 // backoff resets on a healthy connection
      const num = sock.user?.id?.split(':')[0]
      logger.success(`Connected as ${num}`)
      logger.success(`${config.botName} is ready! Prefix: "${config.prefix}"`)
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return

    for (const msg of messages) {
      // ─── Status (broadcast) automation ────────────────────────────────
      if (msg.key.remoteJid === 'status@broadcast' && msg.message) {
        if (config.autoStatusView) {
          await sock.readMessages([msg.key]).catch(() => {})
        }
        if (config.autoStatusReact) {
          await react(sock, msg, config.statusReactEmoji).catch(() => {})
        }
        continue // statuses never reach the command handler
      }

      // Optional webhook forward (fire-and-forget)
      if (config.webhookUrl) {
        fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: msg.key.remoteJid,
            sender: msg.key.participant || msg.key.remoteJid,
            text: getMessageText(msg),
            pushName: msg.pushName,
            fromMe: Boolean(msg.key.fromMe),
            isGroup: msg.key.remoteJid?.endsWith('@g.us'),
          }),
        }).catch(() => {})
      }

      await handleMessage(sock, msg)
    }
  })

  // ─── Group participants (welcome / goodbye) ────────────────────────────
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (!id?.endsWith('@g.us')) return
    try {
      const group = await groupService.ensureGroup(id, { name: 'WhatsApp Group' })
      if (!group.welcomeEnabled) return

      if (isKillSwitchOn()) return // global outbound pause

      if (action === 'add' && group.welcomeMsg && gateOutbound(id, 'welcome')) {
        try {
          await sock.sendMessage(id, { text: group.welcomeMsg, mentions: participants })
          await auditOutbound({ remoteJid: id, source: 'welcome', status: 'sent' })
        } catch {
          await auditOutbound({ remoteJid: id, source: 'welcome', status: 'failed' })
        }
      } else if (action === 'remove' && group.goodbyeMsg && gateOutbound(id, 'welcome')) {
        try {
          await sock.sendMessage(id, { text: group.goodbyeMsg, mentions: participants })
          await auditOutbound({ remoteJid: id, source: 'welcome', status: 'sent' })
        } catch {
          await auditOutbound({ remoteJid: id, source: 'welcome', status: 'failed' })
        }
      }
    } catch (error) {
      logger.error(`[Welcome] Failed for ${id}: ${error.message}`)
    }
  })

  // ─── Anti-call ─────────────────────────────────────────────────────────
  if (config.antiCall) {
    sock.ev.on('call', async (calls) => {
      for (const call of calls) {
        if (call.status !== 'offer') continue
        logger.warn(`[AntiCall] Rejecting call from ${formatNumber(call.from)}`)
        try {
          await sock.rejectCall(call.id, call.from)
        } catch (error) {
          logger.error(`[AntiCall] Reject failed: ${error.message}`)
        }
      }
    })
  }

  // ─── Auto-bio ──────────────────────────────────────────────────────────
  if (config.autoBio) {
    const updateBio = async () => {
      const text = `${config.botName} • Online ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      await sock.updateProfileStatus(text).catch(() => {})
    }
    await updateBio()
    setInterval(updateBio, 5 * 60 * 1000)
  }

  return sock
}

// ─── Remote client runtime (runs once, survives reconnects) ───────────────────

let remoteStarted = false

async function initRemoteClient(sock) {
  if (remoteStarted) return
  remoteStarted = true

  try {
    const reg = await remoteRegister()
    applyRemoteBotConfig(reg.config)
    initRemoteTransports()
    logger.success(`Registered with control plane as session ${config.sessionId}`)
  } catch (error) {
    logger.error(`Control plane registration failed: ${error.message}`)
    logger.error('Check SESSION_ID / SESSION_SECRET / CONTROL_URL and restart.')
    process.exit(1)
  }

  // Lets the SYNC_STATUS command report live WhatsApp connection state
  setSyncStatusProvider(() => ({
    whatsapp: sock.user ? 'connected' : 'connecting',
    botStatus: 'running',
  }))

  const beat = async () => {
    await remoteHeartbeat(
      sock.user ? 'connected' : 'connecting',
      config.version,
      Math.floor(process.uptime())
    ).catch(() => {})
  }

  const poll = async () => {
    const cfg = await remoteFetchConfig().catch(() => null)
    if (cfg) applyRemoteBotConfig(cfg)

    // Controlled command channel (§15) — whitelisted commands only
    const commands = await remotePollCommands().catch(() => [])
    for (const command of commands) {
      const outcome = await executeRemoteCommand(command)
      await remoteAckCommand(command.id, outcome.ok === true, outcome).catch(() => {})
      logger.info(`[Remote] command ${command.type} → ${outcome.ok ? 'ok' : outcome.handled ? 'failed' : 'rejected'}`)
    }
  }

  await beat()
  setInterval(beat, 30_000)
  setInterval(poll, 30_000)
}

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
async function handleShutdown(signal) {
  logger.warn(`\nReceived ${signal}. Starting graceful termination sequence...`)
  try {
    await prisma.$disconnect()
    logger.success('Database connections safely severed.')
    process.exit(0)
  } catch (error) {
    logger.error(`Error during shutdown sequence: ${error.message}`)
    process.exit(1)
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'))
process.on('SIGTERM', () => handleShutdown('SIGTERM'))

startBot().catch((err) => {
  logger.error(`Fatal error: ${err.message}`)
  process.exit(1)
})
