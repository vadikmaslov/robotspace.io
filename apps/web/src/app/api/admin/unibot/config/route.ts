import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { getAllowedUnibotFeedUrl, ImageValidationError } from '../../../../../lib/image-security'

export async function GET() {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { prisma } = await import('@robotspace/db')
  
  const configs = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM unibot_import_config LIMIT 1`)
  let config = configs[0] || null
  if (!config) {
    await prisma.$executeRawUnsafe(`INSERT INTO unibot_import_config DEFAULT VALUES`)
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM unibot_import_config LIMIT 1`)
    config = rows[0]
  }

  const [{ total }] = await prisma.$queryRawUnsafe<Array<{total: number}>>(`SELECT count(*)::int as total FROM unibot_catalog_cache`)
  const [{ robots }] = await prisma.$queryRawUnsafe<Array<{robots: number}>>(`SELECT count(*)::int as robots FROM unibot_catalog_cache WHERE entity_type = 'robot'`)
  const [{ brands }] = await prisma.$queryRawUnsafe<Array<{brands: number}>>(`SELECT count(*)::int as brands FROM unibot_catalog_cache WHERE entity_type = 'brand'`)

  return NextResponse.json({ config, counts: { total, robots, brands } })
}

export async function POST(req: NextRequest) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { prisma } = await import('@robotspace/db')
  const body = await req.json()

  const configs = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM unibot_import_config LIMIT 1`)
  let config = configs[0] || null

  let feedUrl: string
  try {
    feedUrl = getAllowedUnibotFeedUrl(
      body.feed_url || 'https://unibot.ru/local/gadgets/maslov/catalog_export/catalog.php',
    ).toString()
  } catch (error) {
    const message = error instanceof ImageValidationError ? error.message : 'Invalid feed URL'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const cron = body.cron_expression || '0 */6 * * *'
  const enabled = body.is_enabled !== false

  if (!config) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO unibot_import_config (feed_url, cron_expression, is_enabled) VALUES ($1, $2, $3)`,
      feedUrl, cron, enabled,
    )
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE unibot_import_config SET feed_url = $1, cron_expression = $2, is_enabled = $3, updated_at = now() WHERE id = $4`,
      feedUrl, cron, enabled, config.id,
    )
  }

  await prisma.$executeRawUnsafe(
    `UPDATE scheduled_agents SET cron_expression = $1, is_enabled = $2, updated_at = now() WHERE agent_key = 'unibot-catalog-sync'`,
    cron, enabled,
  )

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM unibot_import_config LIMIT 1`)
  return NextResponse.json({ config: rows[0] })
}
