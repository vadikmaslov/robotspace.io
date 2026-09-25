import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { prisma } = await import('@robotspace/db')
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    await prisma.articles.update({
      where: { id },
      data: {
        title: body.title,
        authors: body.authors || null,
        canonical_url: body.canonical_url,
        published_at: body.published_at ? new Date(body.published_at) : undefined,
        language: body.language || 'en',
        source_id: body.source_id || null,
        categories: body.categories || null,
      },
    })

    const listSummary = typeof body.list_summary === 'string' ? body.list_summary.trim() || null : null
    const detailSummary = typeof body.detail_summary === 'string' ? body.detail_summary.trim() || null : null
    const publicationStatus = ['PENDING', 'PUBLISHED', 'DRAFT', 'ARCHIVED'].includes(body.publication_status) ? body.publication_status : 'DRAFT'
    await prisma.$executeRawUnsafe(
      `UPDATE articles
       SET list_summary = $1::text, detail_summary = $2::text, publication_status = $3::varchar,
           summary_status = CASE WHEN $1::text IS NOT NULL OR $2::text IS NOT NULL THEN 'MANUAL' ELSE summary_status END,
           summaries_generated_at = CASE WHEN $1::text IS NOT NULL OR $2::text IS NOT NULL THEN now() ELSE NULL END
       WHERE id = $4::uuid`,
      listSummary,
      detailSummary,
      publicationStatus,
      id,
    )

    const brands = normalizeNames(body.brands)
    const robots = normalizeNames(body.robots)
    const candidates = await prisma.$queryRawUnsafe<Array<{ entity_id: string; entity_type: 'COMPANY' | 'ROBOT'; canonical_name: string }>>(`
      SELECT company_entity_id AS entity_id, 'COMPANY'::varchar AS entity_type, canonical_name FROM company_public_projections
      UNION ALL SELECT robot_entity_id AS entity_id, 'ROBOT'::varchar AS entity_type, canonical_name FROM robot_public_projections
    `)
    const requested = [...brands.map(name => ({ name, entity_type: 'COMPANY' as const })), ...robots.map(name => ({ name, entity_type: 'ROBOT' as const }))]
    const resolved = requested.flatMap(item => {
      const match = candidates.find(candidate => candidate.entity_type === item.entity_type && normalized(candidate.canonical_name) === normalized(item.name))
      return match ? [match] : []
    })
    await prisma.$executeRawUnsafe(`DELETE FROM entity_mentions WHERE article_id = $1::uuid`, id)
    for (const mention of resolved) await prisma.$executeRawUnsafe(`INSERT INTO entity_mentions(article_id,entity_type,entity_id,mention_type,confidence) VALUES($1::uuid,$2,$3::uuid,'MANUAL',1.00)`, id, mention.entity_type, mention.entity_id)

    const unresolved = requested.filter(item => !resolved.some(mention => mention.entity_type === item.entity_type && normalized(mention.canonical_name) === normalized(item.name))).map(item => item.name)
    return NextResponse.json({ success: true, attached_mentions: resolved.length, unresolved_mentions: unresolved })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function normalizeNames(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))].slice(0, 50) : [] }
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { prisma } = await import('@robotspace/db')
    await prisma.article_previews.deleteMany({ where: { article_id: id } })
    await prisma.articles.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
