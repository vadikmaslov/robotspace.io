import { NextRequest, NextResponse } from 'next/server'
import { importGitHubProject } from '@robotspace/db/registry-import'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { repository_url?: unknown }
    if (typeof body.repository_url !== 'string') return NextResponse.json({ error: 'repository_url is required' }, { status: 400 })
    const { prisma } = await import('@robotspace/db')
    const result = await importGitHubProject(prisma, body.repository_url)
    const entity = await prisma.entities.findUnique({ where: { id: result.project.id }, select: { slug: true } })
    return NextResponse.json({ project_id: result.project.id, slug: entity?.slug, manifest_found: result.manifestFound, verification_status: result.project.verification_status }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub import failed'
    const status = /rate limit/i.test(message) ? 429 : /not found|invalid|required|must|exceeds|unsupported|not allowed|Enter a public/i.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
