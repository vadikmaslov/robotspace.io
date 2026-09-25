import { NextRequest, NextResponse } from 'next/server'
import { isSourceKey, parseSourceInput } from '../../../../../lib/source-catalog'

type Params = { params: Promise<{ key: string }> }

async function getKey(params: Params['params']) {
  const { key } = await params
  return key
}

export async function GET(_req: NextRequest, { params }: Params) {
  const key = await getKey(params)
  if (!isSourceKey(key)) return NextResponse.json({ error: 'Invalid source key' }, { status: 400 })
  try {
    const { prisma } = await import('@robotspace/db')
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT s.key, s.display_name, s.owner_name, s.homepage_url, s.logo_url, s.content_area,
             s.admin_description, s.public_description, s.is_public, s.tier, s.source_type,
             s.status, s.legal_status, s.schedule, s.rate_limit_rpm, s.trust_default_confidence,
             s.kill_switch, s.last_success_at, s.last_error_at,
             (SELECT count(*)::int FROM source_contracts c WHERE c.source_key = s.key) AS contract_count,
             (SELECT count(*)::int FROM source_records r WHERE r.source_id = s.key) AS record_count
      FROM sources s WHERE s.key = $1
    `, key)
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load source' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const key = await getKey(params)
  if (!isSourceKey(key)) return NextResponse.json({ error: 'Invalid source key' }, { status: 400 })
  try {
    const input = parseSourceInput(await req.json())
    const { prisma } = await import('@robotspace/db')
    const changed = await prisma.$executeRawUnsafe(
      `UPDATE sources SET
        display_name=$1, owner_name=$2, homepage_url=$3, logo_url=$4, content_area=$5,
        admin_description=$6, public_description=$7, is_public=$8, tier=$9, source_type=$10,
        status=$11, legal_status=$12, schedule=$13, rate_limit_rpm=$14,
        trust_default_confidence=$15, kill_switch=$16, updated_at=now()
       WHERE key=$17`,
      input.display_name, input.owner_name, input.homepage_url, input.logo_url, input.content_area,
      input.admin_description, input.public_description, input.is_public, input.tier, input.source_type,
      input.status, input.legal_status, input.schedule, input.rate_limit_rpm,
      input.trust_default_confidence, input.kill_switch, key,
    )
    if (!changed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update source' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const key = await getKey(params)
  if (!isSourceKey(key)) return NextResponse.json({ error: 'Invalid source key' }, { status: 400 })
  try {
    const { prisma } = await import('@robotspace/db')
    const rows = await prisma.$queryRawUnsafe<Array<{ dependencies: number }>>(
      `SELECT (
        (SELECT count(*) FROM source_contracts WHERE source_key = $1) +
        (SELECT count(*) FROM source_credentials WHERE source_id = $1) +
        (SELECT count(*) FROM source_records WHERE source_id = $1)
      )::int AS dependencies`, key,
    )
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (rows[0].dependencies > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE sources SET status='DISABLED', kill_switch=true, policy_revision=policy_revision + 1, updated_at=now() WHERE key=$1`, key,
      )
      return NextResponse.json({ success: true, archived: true, message: 'Source has history, so it was disabled instead of deleted.' })
    }
    const changed = await prisma.$executeRawUnsafe('DELETE FROM sources WHERE key=$1', key)
    if (!changed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not delete source' }, { status: 500 })
  }
}
