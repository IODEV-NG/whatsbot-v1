import pino from 'pino'
import chalk from 'chalk'
import figlet from 'figlet'

// ─── Pretty Console Logger ─────────────────────────────────────────────────────

export const pinoLogger = pino({
  level: 'silent', // silence Baileys internal logs
})

const timestamp = () => {
  const now = new Date()
  return chalk.gray(`[${now.toLocaleTimeString()}]`)
}

export const logger = {
  info: (msg) => console.log(`${timestamp()} ${chalk.cyan('ℹ')}  ${msg}`),
  success: (msg) => console.log(`${timestamp()} ${chalk.green('✔')}  ${msg}`),
  warn: (msg) => console.log(`${timestamp()} ${chalk.yellow('⚠')}  ${msg}`),
  error: (msg) => console.log(`${timestamp()} ${chalk.red('✖')}  ${msg}`),
  command: (name, sender) =>
    console.log(
      `${timestamp()} ${chalk.magenta('⚡')}  Command ${chalk.bold(name)} by ${chalk.yellow(sender)}`
    ),
  message: (from, text) =>
    console.log(
      `${timestamp()} ${chalk.blue('💬')}  ${chalk.dim(from)}: ${chalk.white(text?.slice(0, 60) ?? '')}`
    ),
}

// ─── Banner ────────────────────────────────────────────────────────────────────

export function printBanner(botName, version) {
  const banner = figlet.textSync(botName, { font: 'Small' })
  console.log('\n' + chalk.cyan(banner))
  console.log(chalk.gray(`  v${version} — powered by Baileys\n`))
}
