/**
 * Worker main entry point
 * Initializes PostgreSQL-backed job queue and starts processing
 */

import { startScheduledAgents, stopScheduledAgents } from './scheduled-agents'
import { prisma } from '@robotspace/db'

let grantCleanup: NodeJS.Timeout | null = null

async function cleanupRegistryGrants() {
  try {
    await prisma.registry_login_grants.deleteMany({ where: { expires_at: { lt: new Date() } } })
    await prisma.registry_claim_attempts.deleteMany({ where: { window_start: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  } catch {
    // Registry migrations may not have been deployed yet.
  }
}

async function main() {
  console.log('[worker] Starting worker node...')

  try {
    await startScheduledAgents()
    console.log('[worker] Worker started, running scheduled agents')
    grantCleanup = setInterval(() => { void cleanupRegistryGrants() }, 5 * 60_000)
    void cleanupRegistryGrants()
  } catch (err) {
    console.error('[worker] Failed to start:', err)
    process.exit(1)
  }

  // Graceful shutdown on SIGTERM/SIGINT
  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down gracefully...`)
    if (grantCleanup) clearInterval(grantCleanup)
    await stopScheduledAgents()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
