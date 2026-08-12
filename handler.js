import config from './config.js'
import { getCommand } from './commands/index.js'
import { MessagePipeline } from './core/pipeline.js'
import { logger } from './lib/logger.js'
import {
  getMessageText,
  getSender,
  isGroup,
  formatNumber,
  react,
  isOnCooldown,
} from './lib/utils.js'
import { getAutoReply } from './lib/chatbot.js'
import { userService, groupService, securityService, isGroupAdmin } from './lib/services.js'
import { getPrivacySettings } from './lib/privacy.js'
import { recordMessage } from './lib/messageService.js'
import { isKillSwitchOn, auditOutbound } from './lib/abuse.js'
import { gateOutbound } from './lib/outbound.js'
import { getRuntimeFlag } from './lib/runtime.js'

// ─── Pipeline stages ───────────────────────────────────────────────────────────

async function autoReadStage(ctx, next) {
  // Privacy Mode ON → never explicitly mark messages as read
  if (config.autoRead && !ctx.privacy?.enabled) {
    await ctx.sock.readMessages([ctx.msg.key]).catch(() => {})
  }
  await next()
}

async function logStage(ctx, next) {
  if (ctx.text) logger.message(ctx.senderNumber, ctx.text)
  await next()
}

async function registerStage(ctx, next) {
  try {
    ctx.user = await userService.ensureUser(ctx.senderNumber, { name: ctx.msg.pushName || 'Unknown' })
  } catch (error) {
    logger.error(`User service failed for ${ctx.senderNumber}: ${error.message}`)
    ctx.user = { phone: ctx.senderNumber, name: ctx.msg.pushName || 'Unknown', premium: false }
  }

  if (ctx.inGroup) {
    try {
      ctx.groupData = await groupService.ensureGroup(ctx.from, { name: 'WhatsApp Group' })
    } catch (error) {
      logger.error(`Group service failed for ${ctx.from}: ${error.message}`)
      ctx.groupData = { id: ctx.from, name: 'WhatsApp Group', antiTag: false, antiLink: false }
    }
  }

  await next()
}

/**
 * Persist incoming messages (read_at stays NULL until explicitly marked read).
 */
async function persistStage(ctx, next) {
  if (!ctx.msg.key.fromMe) {
    // When the bot reads messages automatically (no privacy mode), record them
    // as read so the DB unread count stays in sync with WhatsApp.
    const autoReads = config.autoRead && !ctx.privacy?.enabled
    await recordMessage({
      remoteJid: ctx.from,
      messageId: ctx.msg.key.id,
      senderJid: ctx.sender,
      msgType: ctx.msgType,
      content: ctx.text || null,
      participant: ctx.msg.key.participant || null,
      readAt: autoReads ? new Date() : null,
    })
  }
  await next()
}

/**
 * Enforce group moderation rules: anti-tag, anti-link, anti-spam, anti-word.
 * Admins, the owner, and command messages are exempt.
 */
async function moderationStage(ctx, next) {
  if (!ctx.inGroup || !ctx.groupData || ctx.isOwner) return next()

  if (ctx.isAdmin === undefined) {
    ctx.isAdmin = await isGroupAdmin(ctx.sock, ctx.from, ctx.sender)
  }
  if (ctx.isAdmin) return next()

  const g = ctx.groupData

  // 1. Anti-tag
  if (g.antiTag && securityService.isMassMention(ctx.msg, ctx.text)) {
    logger.warn(`[Security] Intercepted mass tag from ${ctx.senderNumber} in ${ctx.from}`)
    await ctx.sock.sendMessage(ctx.from, { delete: ctx.msg.key }).catch(() => {})
    await ctx.sock.sendMessage(ctx.from, {
      text: `⚠️ @${ctx.senderNumber.split('@')[0]}, mass tagging is strictly disabled in this group.`,
      mentions: [ctx.sender],
    }).catch(() => {})
    return // halt — offender can't trigger commands in the same message
  }

  // Command messages bypass link/word/spam rules (downloader usage etc.)
  if (ctx.text.startsWith(ctx.prefix)) return next()

  // 2. Anti-link
  if (g.antiLink && securityService.isLinkMessage(ctx.msg, ctx.text)) {
    await enforceViolation(ctx, 'links')
    return
  }

  // 3. Anti-spam
  if (g.antiSpam) {
    const spam = securityService.isSpamming(ctx.senderNumber, ctx.from, config.spamThreshold)
    if (spam) {
      if (spam === 'warn') await enforceViolation(ctx, 'spam')
      else await ctx.sock.sendMessage(ctx.from, { delete: ctx.msg.key }).catch(() => {})
      return
    }
  }

  // 4. Anti-word
  if (g.antiWord && securityService.hasBadWord(ctx.text, g.badWords)) {
    await enforceViolation(ctx, 'bad words')
    return
  }

  await next()
}

/**
 * Delete a violating message, warn the user, and auto-kick at the warn limit.
 */
async function enforceViolation(ctx, rule) {
  const { sock, from, msg, senderNumber, sender, groupData } = ctx

  logger.warn(`[Security] ${rule} violation by ${senderNumber} in ${from}`)
  await sock.sendMessage(from, { delete: msg.key }).catch(() => {})

  try {
    const { count, limit } = await groupService.warnUser(from, sender, groupData.warnLimit)
    if (count >= limit) {
      await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {})
      await sock.sendMessage(from, {
        text: `🚫 @${senderNumber}, you have been *kicked* for exceeding the warning limit (${limit}).`,
        mentions: [sender],
      }).catch(() => {})
    } else {
      await sock.sendMessage(from, {
        text: `⚠️ @${senderNumber}, ${rule} are not allowed here.\nWarning *${count}/${limit}*.`,
        mentions: [sender],
      }).catch(() => {})
    }
  } catch (error) {
    // DB layer unavailable — just delete the message
    logger.error(`[Security] Warn failed for ${ctx.from}: ${error.message}`)
  }
}

/**
 * Route the message: command dispatch, auto-react, auto-typing, chatbot replies.
 */
async function commandStage(ctx, next) {
  const { sock, msg, from, senderNumber, text, prefix } = ctx

  // Non-command message → optional chatbot auto-reply
  if (!text.startsWith(prefix)) {
    // Never auto-reply to our own messages (prevents feedback loops)
    if (getRuntimeFlag('autoChatbot') && !msg.key.fromMe) {
      const autoReply = getAutoReply(text, {
        name: ctx.msg.pushName,
        botName: config.botName,
        prefix,
      })
      const canReply = autoReply &&
        !isKillSwitchOn() &&
        !ctx.privacy?.pauseAutoReply
      // Centralized outbound gate (§17) — chatbot replies share the same
      // kill-switch / rate-limiter budget as every other automated send.
      if (canReply && gateOutbound(from, 'chatbot')) {
        await sock.sendMessage(from, { text: autoReply }).catch(() => {})
        await auditOutbound({ remoteJid: from, source: 'chatbot', status: 'sent' }).catch(() => {})
      }
    }
    return
  }

  const [rawCmd, ...args] = text.slice(prefix.length).trim().split(/\s+/)
  const cmdName = rawCmd.toLowerCase()

  if (!cmdName) {
    logger.warn(`[Router] Empty command name parsed from: ${text}`)
    return
  }

  const cmd = getCommand(cmdName)
  if (!cmd) {
    logger.error(`[Router] Command object NOT found for: "${cmdName}"`)
    return
  }

  if (cmd.ownerOnly && !ctx.isOwner) {
    logger.warn(`[Router] Blocked ownerOnly command "${cmdName}" for non-owner: ${senderNumber}`)
    await react(sock, msg, '🚫').catch(() => {})
    return
  }

  if (cmd.adminOnly && !ctx.isOwner && !ctx.isAdmin) {
    logger.warn(`[Router] Blocked adminOnly command "${cmdName}" for non-admin: ${senderNumber}`)
    await react(sock, msg, '🚫').catch(() => {})
    return
  }

  if (cmd.groupOnly && !ctx.inGroup) {
    logger.warn(`[Router] Blocked groupOnly command "${cmdName}" in DM`)
    await react(sock, msg, '❌').catch(() => {})
    return sock.sendMessage(from, { text: '❌ This command can only be used in groups.' })
  }

  if (isOnCooldown(senderNumber, cmdName, config.commandCooldown)) {
    logger.warn(`[Router] Command "${cmdName}" ignored due to cooldown for user: ${senderNumber}`)
    await react(sock, msg, '⏳').catch(() => {})
    return
  }

  // Populate the command context with parsed args (rest of line after command)
  ctx.args = args
  ctx.text = args.join(' ')

  logger.info(`[Router] Dispatching command execution for: "${prefix}${cmdName}"`)

  if (config.autoReact) {
    await react(sock, msg, '⏳').catch((e) => logger.error(`Reaction failed: ${e.message}`))
  }
  if (getRuntimeFlag('autoTyping') && !ctx.privacy?.suppressTyping) {
    await sock.sendPresenceUpdate('composing', from).catch(() => {})
  }

  try {
    await cmd.run(ctx)
    if (config.autoReact) await react(sock, msg, '✅').catch(() => {})
  } catch (err) {
    logger.error(`Command ${cmdName} failed to execute internally: ${err.message}`)
    if (config.autoReact) await react(sock, msg, '❌').catch(() => {})
    await sock.sendMessage(from, {
      text: `❌ Something went wrong running *${cmdName}*.\n\`${err.message}\``,
    }).catch(() => {})
  } finally {
    if (getRuntimeFlag('autoTyping') && !ctx.privacy?.suppressTyping) {
      await sock.sendPresenceUpdate('paused', from).catch(() => {})
    }
  }
}

// ─── Entry point ───────────────────────────────────────────────────────────────

const pipeline = new MessagePipeline()
  .use(autoReadStage)
  .use(logStage)
  .use(registerStage)
  .use(persistStage)
  .use(moderationStage)
  .use(commandStage)

export async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.remoteJid === 'status@broadcast') return

  const text = getMessageText(msg)
  const from = msg.key.remoteJid
  const sender = getSender(msg)
  const senderNumber = formatNumber(sender)

  // Self-bot owner logic + SUDO support
  const isOwner = msg.key.fromMe ||
    senderNumber === config.ownerNumber ||
    config.sudo.includes(senderNumber)

  const ctx = {
    sock,
    msg,
    from,
    sender,
    senderNumber,
    text,
    msgType: msg.message ? Object.keys(msg.message)[0] : null,
    isOwner,
    inGroup: isGroup(msg),
    prefix: config.prefix,
    config,
    privacy: await getPrivacySettings(),
    user: null,
    groupData: null,
    isAdmin: undefined,
    args: [],
  }

  await pipeline.execute(ctx)
}
