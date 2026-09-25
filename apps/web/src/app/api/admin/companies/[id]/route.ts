import { NextRequest, NextResponse } from 'next/server'
import { getEntitySourceLinks } from '../../../../../lib/entity-source-links'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await params
  const id = p.id
  try {
    const m = await import('@robotspace/db')
    const c = await m.prisma.company_public_projections.findFirst({ where: { company_entity_id: id } })
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const [robotCount, sourceLinks] = await Promise.all([
      m.prisma.robot_company_relations.count({ where: { company_entity_id: id } }),
      getEntitySourceLinks(id),
    ])
    return NextResponse.json({ ...c, founded_year: Number((c as any).founded_year || 0), robot_count: robotCount, source_links: sourceLinks })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await params
  const id = p.id
  try {
    const m = await import('@robotspace/db')
    const body = await req.json()
    const officialUrl = typeof body.official_url === 'string' && body.official_url.trim() ? body.official_url.trim() : null
    if (officialUrl) {
      let parsed: URL
      try { parsed = new URL(officialUrl) } catch { return NextResponse.json({ error: 'Official website must be a valid URL' }, { status: 400 }) }
      if (parsed.protocol !== 'https:' || parsed.port || !parsed.hostname) return NextResponse.json({ error: 'Official website must use HTTPS without a custom port' }, { status: 400 })
    }
    const existing = await m.prisma.company_public_projections.findUnique({ where: { company_entity_id: id }, select: { official_url: true } })
    const officialUrlChanged = (existing?.official_url || null) !== officialUrl
    const manualConfirmation = body.official_url_confirmed === 'on'
    if (officialUrlChanged && officialUrl && body.official_url_confirmed !== 'on') {
      return NextResponse.json({ error: 'Confirm that the URL is the official company website before saving it' }, { status: 400 })
    }
    await m.prisma.company_public_projections.update({
      where: { company_entity_id: id },
      data: {
        canonical_name: body.canonical_name,
        country_code: body.country_code || null,
        founded_year: body.founded_year ? Number(body.founded_year) : null,
        official_url: officialUrl,
        summary: body.summary || null,
      },
    })
    if (officialUrlChanged || (officialUrl && manualConfirmation)) {
      await m.prisma.$executeRawUnsafe(
        `UPDATE company_public_projections
         SET official_url_verified_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END,
             official_url_verification_method = CASE WHEN $1::text IS NULL THEN NULL ELSE 'ADMIN_CONFIRMED' END,
             updated_at = now()
         WHERE company_entity_id = $2::uuid`,
        officialUrl, id,
      )
      if (officialUrl) await m.prisma.$executeRawUnsafe(
        `UPDATE robot_public_projections
         SET official_url = $1::varchar(2000), updated_at = now()
         WHERE manufacturer_entity_id = $2::uuid AND official_url IS NULL`,
        officialUrl, id,
      )
    }
    if ('image_url' in body) await m.prisma.$executeRawUnsafe('UPDATE company_public_projections SET image_url = $1 WHERE company_entity_id = $2::uuid', body.image_url || null, id)
    return NextResponse.json({ success: true })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await params
  const id = p.id
  try {
    const m = await import('@robotspace/db')
    await m.prisma.entities.update({
      where: { id },
      data: { publication_status: 'ARCHIVED', archived_at: new Date() },
    })
    return NextResponse.json({ success: true, archived: true })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
