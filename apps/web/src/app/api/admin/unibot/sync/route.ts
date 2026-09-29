import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { NextResponse } from 'next/server'

/** Queue the durable worker instead of running a long catalog import in HTTP. */
export async function POST() {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { prisma } = await import('@robotspace/db')
  try {
    const runs = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO agent_runs (operation, state, idempotency_key, max_attempts)
       VALUES ('unibot-catalog-sync', 'PENDING', $1, 1) RETURNING id`,
      `unibot-catalog-sync:manual:${crypto.randomUUID()}`,
    )
    await prisma.$executeRawUnsafe(
      `INSERT INTO agent_run_logs (agent_run_id, level, message, details)
       VALUES ($1::uuid, 'INFO', 'Run queued manually from Unibot admin', '{"source":"unibot-admin"}'::jsonb)`, runs[0].id,
    )
    return NextResponse.json({ queued: true, run_id: runs[0].id }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to queue sync' }, { status: 500 })
  }
}
