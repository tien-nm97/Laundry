import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

let prisma: PrismaClient

const connectionString = process.env.DATABASE_URL

const poolConfig = {
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Ignore self-signed certificate validation errors on Supabase
  },
  // Limit pool size for PgBouncer transaction mode compatibility
  max: 1,
}

function createPrismaClient() {
  const pool = new Pool(poolConfig)
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient()
} else {
  // In dev mode, avoid re-creating client on hot reload (keeps connection stable)
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  prisma = globalForPrisma.prisma
}

export { prisma }
