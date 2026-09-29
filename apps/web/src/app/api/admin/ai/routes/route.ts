import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const denied = await adminApiDenied()
  if (denied) return denied
  try {
    const { prisma } = await import('@robotspace/db')
    const body = await req.json()
    const { model_id, scope } = body
    if (!['SIMPLE_DEFAULT', 'COMPLEX_DEFAULT'].includes(scope)) return NextResponse.json({ error: 'Invalid route scope' }, { status: 400 })
    const model = await prisma.ai_models.findUnique({ where: { id: model_id } })
    if (!model?.enabled || !model.provider_id) return NextResponse.json({ error: 'Model is not available' }, { status: 400 })
    const duplicate = await prisma.ai_routes.findFirst({ where: { model_id, scope, enabled: true } })
    if (duplicate) return NextResponse.json({ error: 'Model is already in this chain' }, { status: 409 })

    // Get current max rank for this scope
    const existing = await prisma.ai_routes.findFirst({
      where: { scope },
      orderBy: { rank: 'desc' },
    })
    const rank = (existing?.rank ?? 0) + 1

    await prisma.ai_routes.create({
      data: { model_id, scope, rank, enabled: true },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await adminApiDenied()
  if (denied) return denied
  try {
    const { prisma } = await import('@robotspace/db')
    const { id, direction } = await req.json()
    if (!id || !['up', 'down'].includes(direction)) return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    const current = await prisma.ai_routes.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'Route not found' }, { status: 404 })
    const sibling = await prisma.ai_routes.findFirst({
      where: direction === 'up' ? { scope: current.scope, rank: { lt: current.rank ?? 0 }, enabled: true } : { scope: current.scope, rank: { gt: current.rank ?? 0 }, enabled: true },
      orderBy: { rank: direction === 'up' ? 'desc' : 'asc' },
    })
    if (!sibling) return NextResponse.json({ success: true })
    await prisma.$transaction([
      prisma.ai_routes.update({ where: { id: current.id }, data: { rank: sibling.rank } }),
      prisma.ai_routes.update({ where: { id: sibling.id }, data: { rank: current.rank } }),
    ])
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await adminApiDenied()
  if (denied) return denied
  try {
    const { prisma } = await import('@robotspace/db')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await prisma.ai_routes.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
