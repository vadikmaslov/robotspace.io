import { adminApiDenied } from '../../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { assertImageRequestSize, ImageValidationError, isUuid, readValidatedImage } from '../../../../../../lib/image-security'
import { storeImage } from '../../../../../../lib/image-storage'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { id } = await params
  try {
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid article ID' }, { status: 400 })
    assertImageRequestSize(req.headers.get('content-length'))
    const form = await req.formData()
    const file = form.get('image') as File
    if (!file || !file.name) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const image = await readValidatedImage(file)
    const filename = `${id}.${image.extension}`
    const imageUrl = await storeImage({ namespace: 'articles', filename, buffer: image.buffer, contentType: image.contentType })
    const { prisma } = await import('@robotspace/db')
    await prisma.$executeRawUnsafe(
      `UPDATE articles SET image_url = $1 WHERE id = $2::uuid`,
      imageUrl, id,
    )

    return NextResponse.json({ success: true, image_url: imageUrl })
  } catch (e: unknown) {
    if (e instanceof ImageValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 })
  }
}
