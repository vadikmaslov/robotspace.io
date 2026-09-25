import { NextRequest, NextResponse } from 'next/server'
import {
  getAllowedRemoteImageUrl,
  ImageValidationError,
  MAX_IMAGE_BYTES,
  validateImageBuffer,
} from '../../../lib/image-security'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  try {
    const imageUrl = getAllowedRemoteImageUrl(url)
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'RobotSpace.io/1.0 (image proxy)' },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    })
    if (!res.ok) return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 })

    const contentLength = Number(res.headers.get('content-length') ?? 0)
    if (contentLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Image too large' }, { status: 413 })

    const image = validateImageBuffer(Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') ?? undefined)

    return new NextResponse(image.buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': image.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400, immutable',
        'CDN-Cache-Control': 'public, max-age=604800',
      },
    })
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 })
  }
}
