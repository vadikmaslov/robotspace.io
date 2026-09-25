import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  const initials = name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  const colors = ['#e4f222','#34d59a','#5266eb','#27a644','#eb5757','#6366f1','#ff3621','#02b8cc']
  const color = colors[slug.length % colors.length]

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#0f1011" rx="12"/>
    <rect x="1" y="1" width="398" height="398" fill="none" stroke="#23252a" stroke-width="0.5" rx="12"/>
    <text x="200" y="165" text-anchor="middle" fill="${color}" font-family="Inter,sans-serif" font-size="64" font-weight="300">${initials}</text>
    <text x="200" y="240" text-anchor="middle" fill="#8a8f98" font-family="Inter,sans-serif" font-size="14">${name}</text>
  </svg>`

  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } })
}
