import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@robotspace/db'
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { id } = await params; const body = await request.json().catch(() => ({}))
  if (body.action !== 'RESTORE' && body.action !== 'REJECT') return NextResponse.json({ error: 'Unsupported review action' }, { status: 400 })
  const candidates = await prisma.$queryRawUnsafe<Array<{ id: string; robot_entity_id: string | null }>>(`SELECT id, robot_entity_id FROM catalog_candidates WHERE id = $1::uuid AND status = 'NEEDS_REVIEW'`, id)
  const candidate = candidates[0]
  if (!candidate) return NextResponse.json({ error: 'Review candidate was not found' }, { status: 404 })
  try {
    if (body.action === 'REJECT') await prisma.$executeRawUnsafe(`UPDATE catalog_candidates SET status = 'REJECTED', decision_reason = 'Rejected by administrator', decided_at = now(), updated_at = now() WHERE id = $1::uuid`, id)
    else {
      if (!candidate.robot_entity_id) return NextResponse.json({ error: 'This candidate has no archived robot to restore' }, { status: 400 })
      await prisma.$transaction([prisma.$executeRawUnsafe(`UPDATE entities SET publication_status = 'PUBLISHED', archived_at = NULL, updated_at = now() WHERE id = $1::uuid`, candidate.robot_entity_id), prisma.$executeRawUnsafe(`UPDATE robot_public_projections SET lifecycle_status = 'ACTIVE', updated_at = now() WHERE robot_entity_id = $1::uuid`, candidate.robot_entity_id), prisma.$executeRawUnsafe(`UPDATE catalog_candidates SET status = 'ACCEPTED', decision_reason = 'Restored by administrator', decided_at = now(), updated_at = now() WHERE id = $1::uuid`, id)])
    }
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update candidate' }, { status: 500 }) }
}
