/**
 * Phase 5.1: PostgreSQL-Backed Job Queue (pgboss)
 *
 * Queues: source, agent-simple, agent-complex, publication, notifications, maintenance
 * Features: idempotency keys, retry/backoff, dead-letter, advisory locks, graceful shutdown
 */

import PgBoss from 'pg-boss'
import { prisma } from '@robotspace/db'

export type QueueName =
  | 'source'
  | 'agent-simple'
  | 'agent-complex'
  | 'publication'
  | 'notifications'
  | 'maintenance'

export interface JobPayload {
  idempotency_key: string
  policy_revision: number
  source_id?: string
  entity_id?: string
  operation?: string
  attempt?: number
  max_attempts?: number
}

interface QueueConfig {
  name: QueueName
  concurrency: number
  retryLimit: number
  retryDelay: number // seconds
  retentionDays: number
  expireInSeconds: number
}

const QUEUE_CONFIGS: Record<QueueName, QueueConfig> = {
  source:        { name: 'source',         concurrency: 1,  retryLimit: 3,  retryDelay: 60,   retentionDays: 30, expireInSeconds: 3600 },
  'agent-simple': { name: 'agent-simple',  concurrency: 2,  retryLimit: 3,  retryDelay: 30,   retentionDays: 14, expireInSeconds: 1800 },
  'agent-complex':{ name: 'agent-complex', concurrency: 1,  retryLimit: 3,  retryDelay: 120,  retentionDays: 14, expireInSeconds: 3600 },
  publication:    { name: 'publication',    concurrency: 1,  retryLimit: 5,  retryDelay: 10,   retentionDays: 7,  expireInSeconds: 600 },
  notifications:  { name: 'notifications',  concurrency: 1,  retryLimit: 3,  retryDelay: 30,   retentionDays: 14, expireInSeconds: 300 },
  maintenance:    { name: 'maintenance',    concurrency: 1,  retryLimit: 2,  retryDelay: 300,  retentionDays: 7,  expireInSeconds: 7200 },
}

let boss: PgBoss | null = null
let shutdownRequested = false

/**
 * Create PgBoss instance with database connection
 */
export function createBoss(): PgBoss {
  if (boss) return boss

  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    defaultQueueOptions: {
      retryLimit: 3,
      retryDelay: 60,
      retentionDays: 14,
    },
    monitorStateIntervalSeconds: 30,
    archiveCompletedJobsEvery: '5 minutes',
    deleteArchivedJobsEvery: '1 day',
  })

  return boss
}

/**
 * Start the queue worker — register all queues and begin processing
 */
export async function startWorker(): Promise<void> {
  const bg = createBoss()

  bg.on('error', (error) => {
    console.error('[worker] PgBoss error:', error)
  })

  await bg.start()

  // Register all queues
  for (const config of Object.values(QUEUE_CONFIGS)) {
    await bg.createQueue(config.name)
    console.log(`[worker] Queue registered: ${config.name} (concurrency=${config.concurrency}, retry=${config.retryLimit})`)
  }

  // Register handlers
  await bg.work<JobPayload>('source',         { teamConcurrency: QUEUE_CONFIGS.source.concurrency },         handleSourceJob)
  await bg.work<JobPayload>('agent-simple',   { teamConcurrency: QUEUE_CONFIGS['agent-simple'].concurrency },  handleAgentSimple)
  await bg.work<JobPayload>('agent-complex',  { teamConcurrency: QUEUE_CONFIGS['agent-complex'].concurrency }, handleAgentComplex)
  await bg.work<JobPayload>('publication',    { teamConcurrency: QUEUE_CONFIGS.publication.concurrency },       handlePublication)
  await bg.work<JobPayload>('notifications',  { teamConcurrency: QUEUE_CONFIGS.notifications.concurrency },     handleNotification)
  await bg.work<JobPayload>('maintenance',    { teamConcurrency: QUEUE_CONFIGS.maintenance.concurrency },       handleMaintenance)

  console.log('[worker] All queue handlers registered')
}

/**
 * Graceful shutdown — wait for in-flight jobs to complete
 */
export async function stopWorker(): Promise<void> {
  shutdownRequested = true
  console.log('[worker] Shutdown requested, waiting for in-flight jobs...')

  if (boss) {
    try {
      await boss.stop({ graceful: true, timeout: 30_000 })
    } catch {
      // Force stop if graceful fails
      await boss.stop({ graceful: false, timeout: 5_000 })
    }
    boss = null
  }
  console.log('[worker] Stopped')
}

/**
 * Enqueue a job with idempotency key
 */
export async function enqueue(
  queue: QueueName,
  payload: JobPayload,
  options?: { startAfter?: number; singletonKey?: string },
): Promise<string | null> {
  if (!boss) throw new Error('Queue not started — call startWorker() first')

  return boss.send(queue, payload, {
    singletonKey: options?.singletonKey ?? payload.idempotency_key,
    startAfter: options?.startAfter ?? 0,
    retryLimit: QUEUE_CONFIGS[queue].retryLimit,
    retryDelay: QUEUE_CONFIGS[queue].retryDelay,
  })
}

// ============================================================
// JOB HANDLERS (stubs — real implementations in Phase 6+)
// ============================================================

async function handleSourceJob(job: PgBoss.Job<JobPayload>) {
  const payload = job.data
  console.log(`[source] Processing job: idempotency_key=${payload.idempotency_key}, source_id=${payload.source_id}`)

  // Check kill switch before processing
  if (payload.source_id) {
    const source = await prisma.sources.findUnique({ where: { key: payload.source_id } })
    if (!source || source.kill_switch || source.status !== 'ACTIVE') {
      console.log(`[source] Source ${payload.source_id} is disabled/kill-switched — discarding job`)
      return { cancelled: true }
    }
    if (source.policy_revision > (payload.policy_revision ?? 0)) {
      console.log(`[source] Policy revision changed (${payload.policy_revision} → ${source.policy_revision}) — discarding job`)
      return { cancelled: true }
    }
  }

  // Placeholder — real collector logic in Phase 6
  return { ok: true }
}

async function handleAgentSimple(job: PgBoss.Job<JobPayload>) {
  console.log(`[agent-simple] Processing job: operation=${job.data.operation}`)
  // Placeholder — real agent logic in Phase 7
  return { ok: true }
}

async function handleAgentComplex(job: PgBoss.Job<JobPayload>) {
  console.log(`[agent-complex] Processing job: operation=${job.data.operation}`)
  // Placeholder — real agent logic in Phase 7
  return { ok: true }
}

async function handlePublication(job: PgBoss.Job<JobPayload>) {
  console.log(`[publication] Recalculating canonical fields for entity: ${job.data.entity_id}`)
  // Placeholder — real canonicalization in Phase 7
  return { ok: true }
}

async function handleNotification(job: PgBoss.Job<JobPayload>) {
  console.log(`[notification] Sending notification`)
  // Placeholder — real notification transport in 5.5
  return { ok: true }
}

async function handleMaintenance(job: PgBoss.Job<JobPayload>) {
  console.log(`[maintenance] Running scheduled maintenance`)
  // Placeholder — key rotation, backup verification, etc.
  return { ok: true }
}
