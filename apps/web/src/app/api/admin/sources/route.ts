import { NextRequest, NextResponse } from 'next/server'
import { parseSourceInput } from '../../../../lib/source-catalog'

export async function GET() {
  try {
    const { prisma } = await import('@robotspace/db')
    const sources = await prisma.$queryRawUnsafe(`
      SELECT key, display_name, owner_name, homepage_url, logo_url, content_area,
             admin_description, public_description, is_public, tier, source_type, status,
             legal_status, schedule, rate_limit_rpm, trust_default_confidence, kill_switch,
             last_success_at, last_error_at
      FROM sources
      ORDER BY content_area, display_name NULLS LAST, key
    `)
    return NextResponse.json({ sources })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load sources' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = parseSourceInput(await req.json(), true)
    const { prisma } = await import('@robotspace/db')
    await prisma.$executeRawUnsafe(
      `INSERT INTO sources (
        key, display_name, owner_name, homepage_url, logo_url, content_area, admin_description,
        public_description, is_public, tier, source_type, status, legal_status, schedule,
        rate_limit_rpm, trust_default_confidence, kill_switch, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())`,
      input.key, input.display_name, input.owner_name, input.homepage_url, input.logo_url,
      input.content_area, input.admin_description, input.public_description, input.is_public,
      input.tier, input.source_type, input.status, input.legal_status, input.schedule,
      input.rate_limit_rpm, input.trust_default_confidence, input.kill_switch,
    )
    return NextResponse.json({ success: true, key: input.key }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create source'
    return NextResponse.json({ error: /unique|duplicate/i.test(message) ? 'This source key already exists' : message }, { status: 400 })
  }
}
