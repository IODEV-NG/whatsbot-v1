import { PrismaClient } from '@prisma/client'
import NodeCache from 'node-cache'

// V5 works perfectly with the clean, empty constructor
export const prisma = new PrismaClient()

// ─── In-Memory Cache Layers ────────────────────────────────────────────────────
export const userCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 })
export const groupCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 })

export default prisma