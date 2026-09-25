/**
 * Phase 2B: Audit Service
 * Append-only audit log with tamper evidence (hash chain)
 */

import { prisma } from '../index'

type ActorType = 'ADMIN' | 'SYSTEM' | 'AGENT'

interface AuditEntry {
  actorType: ActorType
  actorId?: string
  action: string
  targetType?: string
  targetId?: string
  requestId?: string
  beforeValue?: unknown
  afterValue?: unknown
}

/**
 * Write an immutable audit log entry.
 * Application roles have INSERT only; UPDATE/DELETE blocked by DB trigger.
 */
export async function writeAuditEntry(entry: AuditEntry) {
  const beforeJson = entry.beforeValue ? JSON.stringify(entry.beforeValue) : null
  const afterJson = entry.afterValue ? JSON.stringify(entry.afterValue) : null

  // Get previous entry hash for chain
  const lastEntry = await prisma.audit_logs.findFirst({
    orderBy: { id: 'desc' },
    select: { entry_hash: true },
  })

  const entryData = JSON.stringify({ actor: entry.actorId, action: entry.action, target: entry.targetId, ts: new Date().toISOString() })
  const entryHash = bufferToHex(await cryptoSubtleDigest(entryData))

  return prisma.audit_logs.create({
    data: {
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? undefined,
      action: entry.action,
      target_type: entry.targetType ?? undefined,
      target_id: entry.targetId ?? undefined,
      request_id: entry.requestId ?? undefined,
      before_hash: beforeJson ? bufferToHex(await cryptoSubtleDigest(beforeJson)) : undefined,
      after_hash: afterJson ? bufferToHex(await cryptoSubtleDigest(afterJson)) : undefined,
      prev_entry_hash: lastEntry?.entry_hash ?? undefined,
      entry_hash: entryHash,
    },
  })
}

// Simplified SHA-256 hash via Web Crypto
async function cryptoSubtleDigest(input: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(data).digest()
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Query audit log with filters
 */
export async function queryAuditLog(params: {
  targetType?: string
  targetId?: string
  actorType?: ActorType
  limit?: number
  offset?: number
}) {
  return prisma.audit_logs.findMany({
    where: {
      ...(params.targetType ? { target_type: params.targetType } : {}),
      ...(params.targetId ? { target_id: params.targetId } : {}),
      ...(params.actorType ? { actor_type: params.actorType } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: params.limit ?? 50,
    skip: params.offset ?? 0,
  })
}
