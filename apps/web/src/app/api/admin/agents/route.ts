import { adminApiDenied } from '../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@robotspace/db'

const RUNNABLE = new Set(['unibot-catalog-sync', 'unibot-brand-import', 'aparobot-company-import', 'official-company-enrichment', 'catalog-wikidata-discovery', 'catalog-orchestrator', 'catalog-commercial-directory-review', 'insights-orchestrator', 'insights-metadata-collector', 'insights-summary-writer', 'market-orchestrator', 'market-statistics-collector'])

export async function GET() {
  const denied = await adminApiDenied()
  if (denied) return denied
  const agents = await prisma.$queryRawUnsafe<any[]>(`
    SELECT a.*, (
      SELECT count(*)::int FROM agent_runs r WHERE r.operation = a.agent_key AND r.state = 'FAILED'
        AND r.created_at > now() - interval '7 days'
    ) AS failures_last_7d
    FROM scheduled_agents a ORDER BY a.display_name
  `)
  return NextResponse.json({ agents })
}

export async function POST(req: NextRequest) {
  const denied = await adminApiDenied()
  if (denied) return denied
  try {
    const body = await req.json()
    const agentKey = String(body.agent_key || '')
    const agents = await prisma.$queryRawUnsafe<Array<{ agent_key: string; implementation_status: string }>>(
      `SELECT agent_key, implementation_status FROM scheduled_agents WHERE agent_key = $1`, agentKey,
    )
    const agent = agents[0]
    if (!agent) return NextResponse.json({ error: 'Unknown agent' }, { status: 400 })

    if (body.action === 'run') {
      if (agent.implementation_status !== 'READY' || !RUNNABLE.has(agentKey)) {
        return NextResponse.json({ error: 'This agent is planned but does not have a worker executor yet' }, { status: 409 })
      }
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO agent_runs (operation, state, idempotency_key, max_attempts)
         VALUES ($1, 'PENDING', $2, 1) RETURNING id`,
        agentKey, `${agentKey}:manual:${crypto.randomUUID()}`,
      )
      await prisma.$executeRawUnsafe(
        `INSERT INTO agent_run_logs (agent_run_id, level, message, details)
         VALUES ($1::uuid, 'INFO', 'Run queued manually from admin', '{"source":"admin"}'::jsonb)`, rows[0].id,
      )
      return NextResponse.json({ success: true, run_id: rows[0].id }, { status: 202 })
    }

    if (body.action === 'update') {
      const enabled = Boolean(body.is_enabled)
      const cron = body.cron_expression === null || body.cron_expression === undefined ? null : String(body.cron_expression).trim()
      if (cron && !isValidCron(cron)) return NextResponse.json({ error: 'Cron must contain five valid fields' }, { status: 400 })
      if (enabled && agent.implementation_status !== 'READY') {
        return NextResponse.json({ error: 'This planned agent cannot be enabled until its worker executor and source contracts are ready' }, { status: 409 })
      }
      await prisma.$executeRawUnsafe(
        `UPDATE scheduled_agents SET is_enabled = $1, cron_expression = COALESCE($2, cron_expression), updated_at = now() WHERE agent_key = $3`,
        enabled, cron, agentKey,
      )
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: 500 })
  }
}

function isValidCron(expression: string) {
  const fields = expression.split(/\s+/)
  return fields.length === 5 && fields.every(field => /^[*0-9,\-/]+$/.test(field))
}
