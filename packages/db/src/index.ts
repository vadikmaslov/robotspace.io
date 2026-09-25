/**
 * Prisma client singleton
 * Uses DATABASE_URL env var for connection
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

export { Prisma } from '@prisma/client'
export type { PrismaClient } from '@prisma/client'

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required to initialize Prisma')

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaAdapter?: PrismaPg }
const prismaAdapter = globalForPrisma.prismaAdapter ?? new PrismaPg({ connectionString })

export const prisma =
  globalForPrisma?.prisma ??
  new PrismaClient({
    adapter: prismaAdapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaAdapter = prismaAdapter
}

export default prisma
