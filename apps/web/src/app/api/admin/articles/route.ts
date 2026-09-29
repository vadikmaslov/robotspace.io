import { adminApiDenied } from '../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const denied = await adminApiDenied()
  if (denied) return denied
  try {
    const { prisma } = await import('@robotspace/db')
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const article = await prisma.articles.create({
      data: {
        title: body.title,
        canonical_url: body.canonical_url,
        authors: body.authors || null,
        published_at: body.published_at ? new Date(body.published_at) : new Date(),
        language: body.language || 'en',
        source_id: body.source_id || null,
        categories: body.categories || null,
      },
    })

    const listSummary = typeof body.list_summary === 'string' ? body.list_summary.trim() || null : null
    const detailSummary = typeof body.detail_summary === 'string' ? body.detail_summary.trim() || null : null
    if (listSummary || detailSummary) {
      await prisma.$executeRawUnsafe(
        `UPDATE articles SET list_summary = $1::text, detail_summary = $2::text, summaries_generated_at = now() WHERE id = $3::uuid`,
        listSummary,
        detailSummary,
        article.id,
      )
    }

    const brands = normalizeNames(body.brands)
    const robots = normalizeNames(body.robots)
    const candidates = await prisma.$queryRawUnsafe<Array<{ entity_id: string; entity_type: 'COMPANY' | 'ROBOT'; canonical_name: string }>>(`
      SELECT company_entity_id AS entity_id, 'COMPANY'::varchar AS entity_type, canonical_name FROM company_public_projections
      UNION ALL SELECT robot_entity_id AS entity_id, 'ROBOT'::varchar AS entity_type, canonical_name FROM robot_public_projections
    `)
    const requested = [...brands.map(name => ({ name, entity_type: 'COMPANY' as const })), ...robots.map(name => ({ name, entity_type: 'ROBOT' as const }))]
    for (const item of requested) {
      const mention = candidates.find(candidate => candidate.entity_type === item.entity_type && normalized(candidate.canonical_name) === normalized(item.name))
      if (mention) await prisma.$executeRawUnsafe(`INSERT INTO entity_mentions(article_id,entity_type,entity_id,mention_type,confidence) VALUES($1::uuid,$2,$3::uuid,'MANUAL',1.00)`, article.id, mention.entity_type, mention.entity_id)
    }

    return NextResponse.json({ success: true, id: article.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function normalizeNames(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))].slice(0, 50) : [] }
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
