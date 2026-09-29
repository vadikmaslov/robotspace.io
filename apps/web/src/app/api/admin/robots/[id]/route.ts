import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { id } = await params
  try {
    const { prisma } = await import('@robotspace/db')
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const categoryId = typeof body.category_id === 'string' && body.category_id.trim() ? body.category_id.trim() : null
    if (categoryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId)) {
      return NextResponse.json({ error: 'Invalid category selection' }, { status: 400 })
    }
    if (categoryId) {
      const category = await prisma.categories.findFirst({ where: { id: categoryId, is_active: true }, select: { id: true } })
      if (!category) return NextResponse.json({ error: 'The selected category is no longer available' }, { status: 400 })
    }

    const numeric = (value: unknown) => {
      if (value === '' || value === null || value === undefined) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    const rawSpecs = body.extra_specs && typeof body.extra_specs === 'object' && !Array.isArray(body.extra_specs) ? body.extra_specs : {}
    const extraSpecs: Record<string, string> = {}
    for (const [label, value] of Object.entries(rawSpecs)) {
      if (label.trim().length > 0 && label.trim().length <= 120 && typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 600) {
        extraSpecs[label.trim()] = value.trim()
      }
    }

    await prisma.$executeRawUnsafe(
      `UPDATE robot_public_projections
       SET canonical_name = $1, category_id = $2::uuid, payload_kg = $3::numeric, reach_mm = $4::numeric,
           weight_kg = $5::numeric, summary = $6, image_url = $7, official_url = $8,
           extra_specs = $9::jsonb, manufacturer_entity_id = $10::uuid, last_verified_at = now(), updated_at = now()
       WHERE robot_entity_id = $11::uuid`,
      String(body.canonical_name || '').trim(), categoryId, numeric(body.payload_kg), numeric(body.reach_mm), numeric(body.weight_kg),
      body.summary || null, body.image_url || null, body.official_url || null, JSON.stringify(extraSpecs), body.manufacturer_entity_id || null, id,
    )
    if (body.manufacturer_entity_id) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO robot_company_relations(robot_entity_id, company_entity_id, relation, evidence_url)
         VALUES($1::uuid, $2::uuid, 'MANUFACTURES', 'admin://manual')
         ON CONFLICT(robot_entity_id, company_entity_id, relation) DO NOTHING`,
        id, body.manufacturer_entity_id,
      )
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { id } = await params
  try {
    const { prisma } = await import('@robotspace/db')
    await prisma.entities.update({
      where: { id },
      data: { publication_status: 'ARCHIVED', archived_at: new Date() },
    })
    return NextResponse.json({ success: true, archived: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
