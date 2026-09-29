import { adminApiDenied } from '../../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { assertImageRequestSize, ImageValidationError, isUuid, readValidatedImage } from '../../../../../../lib/image-security'
import { storeImage } from '../../../../../../lib/image-storage'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { id } = await params
  try {
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid company ID' }, { status: 400 })
    assertImageRequestSize(req.headers.get('content-length'))
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const image = await readValidatedImage(file)
    const filename = `company-${id}.${image.extension}`
    const { prisma } = await import('@robotspace/db')
    const imageUrl = await storeImage({ namespace: 'companies', filename, buffer: image.buffer, contentType: image.contentType })
    await prisma.$executeRawUnsafe('UPDATE company_public_projections SET image_url = $1 WHERE company_entity_id = $2::uuid', imageUrl, id)
    return NextResponse.json({ success: true, url: imageUrl })
  } catch (e: unknown) {
    if (e instanceof ImageValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 })
  }
}
