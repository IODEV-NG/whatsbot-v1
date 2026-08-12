import fs from 'fs'
import path from 'path'
import { prisma } from './database.js'
import config from '../config.js'

const SESSION_DIR = path.resolve(config.sessionDir)

export async function restoreSessionFromDb() {
  const botPhone = config.ownerNumber
  
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true })
  }

  // If files already exist locally, skip download to save bandwidth
  if (fs.readdirSync(SESSION_DIR).length > 0) return

  const savedFiles = await prisma.session.findMany({
    where: { phone: botPhone }
  })

  for (const file of savedFiles) {
    const filePath = path.join(SESSION_DIR, file.key)
    fs.writeFileSync(filePath, file.value, 'utf-8')
  }
}

export async function backupFileToDb(filename, contentString) {
  const botPhone = config.ownerNumber
  
  await prisma.session.upsert({
    where: {
      phone_key: { phone: botPhone, key: filename }
    },
    update: { value: contentString },
    create: { phone: botPhone, key: filename, value: contentString }
  })
}

export async function deleteFileFromDb(filename) {
  const botPhone = config.ownerNumber
  try {
    await prisma.session.delete({
      where: {
        phone_key: { phone: botPhone, key: filename }
      }
    })
  } catch (err) {
    // Ignore if already deleted
  }
}