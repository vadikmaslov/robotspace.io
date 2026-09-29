import { adminApiDenied } from '../../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { assertImageRequestSize, ImageValidationError, readValidatedImage } from '../../../../../../lib/image-security'
import { storeImage } from '../../../../../../lib/image-storage'
import { isSourceKey } from '../../../../../../lib/source-catalog'

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { key } = await params
  try {
    if (!isSourceKey(key)) return NextResponse.json({ error: 'Invalid source key' }, { status: 400 })
    assertImageRequestSize(req.headers.get('content-length'))
    const form = await req.formData()
    const file = form.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'Select an image file' }, { status: 400 })
    const image = await readValidatedImage(file)
    const filename = `source-${key}-${Date.now()}.${image.extension}`
    const logoUrl = await storeImage({ namespace: 'sources', filename, buffer: image.buffer, contentType: image.contentType })
    const { prisma } = await import('@robotspace/db')
    const changed = await prisma.$executeRawUnsafe('UPDATE sources SET logo_url=$1, updated_at=now() WHERE key=$2', logoUrl, key)
    if (!changed) return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    return NextResponse.json({ success: true, url: logoUrl })
  } catch (error) {
    if (error instanceof ImageValidationError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
