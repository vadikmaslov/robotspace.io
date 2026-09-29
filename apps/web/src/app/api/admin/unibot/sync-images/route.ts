import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { NextResponse } from 'next/server'
import { getAllowedRemoteImageUrl, MAX_IMAGE_BYTES, validateImageBuffer } from '../../../../../lib/image-security'
import { storeImage } from '../../../../../lib/image-storage'

export async function POST() {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { prisma } = await import('@robotspace/db')
  const results: string[] = []
  let brandsUpdated = 0
  let robotsUpdated = 0

  try {
    // Clear old remote URLs so they can be re-fetched into managed storage.
    await prisma.$executeRawUnsafe(`UPDATE company_public_projections SET image_url = NULL WHERE image_url LIKE 'http%'`)
    await prisma.$executeRawUnsafe(`UPDATE robot_public_projections SET image_url = NULL WHERE image_url LIKE 'http%'`)
    results.push('Cleared remote URLs, downloading to managed storage...')

    // ================================================================
    // PHASE 1: BRAND logos — download to /uploads/brands/
    // ================================================================
    results.push('--- BRAND SYNC ---')

    const companies = await prisma.$queryRawUnsafe<any[]>(`
      SELECT cp.id, cp.company_entity_id, cp.canonical_name, cp.image_url
      FROM company_public_projections cp
    `)

    for (const comp of companies) {
      if (comp.image_url && comp.image_url.startsWith('/uploads/')) continue

      const bname = comp.canonical_name?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

      let match = await prisma.$queryRawUnsafe<any[]>(`
        SELECT unibot_id, name, picture_url FROM unibot_catalog_cache
        WHERE entity_type = 'brand' AND picture_url IS NOT NULL AND picture_url LIKE 'http%'
          AND (LOWER(REPLACE(name, ' ', '')) = $1 OR LOWER(name) = $2)
        LIMIT 1
      `, bname, comp.canonical_name?.toLowerCase() || '')

      if (match.length === 0 && bname.length > 2) {
        match = await prisma.$queryRawUnsafe<any[]>(`
          SELECT unibot_id, name, picture_url FROM unibot_catalog_cache
          WHERE entity_type = 'brand' AND picture_url IS NOT NULL AND picture_url LIKE 'http%'
            AND LOWER(name) LIKE $1 LIMIT 1
        `, `%${bname}%`)
      }

      if (match.length > 0) {
        try {
          const imageUrl = await downloadFile(match[0].picture_url, comp.company_entity_id, 'brands')
          await prisma.$executeRawUnsafe(
            `UPDATE company_public_projections SET image_url = $1, unibot_id = $2, last_verified_at = now() WHERE id = $3::uuid`,
            imageUrl, match[0].unibot_id, comp.id,
          )
          brandsUpdated++
          results.push(`✓ Brand: ${comp.canonical_name} ← ${match[0].name}`)
        } catch (e: any) {
          results.push(`✗ Brand ${comp.canonical_name}: ${e.message}`)
          // Fallback: store remote URL
          await prisma.$executeRawUnsafe(
            `UPDATE company_public_projections SET image_url = $1, unibot_id = $2 WHERE id = $3::uuid`,
            match[0].picture_url, match[0].unibot_id, comp.id,
          )
        }
      }
    }

    // ================================================================
    // PHASE 2: ROBOT images — strict matching, download local
    // ================================================================
    results.push('--- ROBOT SYNC ---')

    const robots = await prisma.$queryRawUnsafe<any[]>(`
      SELECT rp.id, rp.robot_entity_id, rp.canonical_name, rp.image_url
      FROM robot_public_projections rp
    `)

    const brandMap: Record<string, string> = {}
    const brandRels = await prisma.$queryRawUnsafe<any[]>(`
      SELECT rcr.robot_entity_id, cp.canonical_name as brand
      FROM robot_company_relations rcr
      JOIN company_public_projections cp ON cp.company_entity_id = rcr.company_entity_id
      WHERE rcr.relation = 'MANUFACTURES'
    `)
    for (const r of brandRels) brandMap[r.robot_entity_id] = (r.brand || '').toLowerCase()

    for (const robot of robots) {
      if (robot.image_url && robot.image_url.startsWith('/uploads/')) continue

      const rname = robot.canonical_name?.toLowerCase() || ''
      const brand = brandMap[robot.robot_entity_id] || ''
      const nameWords = rname.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 1)
      const codeSlug = rname.replace(/\s+/g, '-')

      let allMatches: any[] = []

      const codeMatches = await prisma.$queryRawUnsafe<any[]>(`
        SELECT unibot_id, name, brand_name, picture_url FROM unibot_catalog_cache
        WHERE entity_type = 'robot' AND picture_url IS NOT NULL AND picture_url LIKE 'http%'
          AND LOWER(code) = $1 LIMIT 3
      `, codeSlug)
      allMatches.push(...codeMatches)

      if (allMatches.length === 0 && nameWords.length > 0) {
        const conds = nameWords.map((_: string, i: number) => `LOWER(name) LIKE $${i + 2}`).join(' AND ')
        const fuzzy = await prisma.$queryRawUnsafe<any[]>(`
          SELECT unibot_id, name, brand_name, picture_url FROM unibot_catalog_cache
          WHERE entity_type = 'robot' AND picture_url IS NOT NULL AND picture_url LIKE 'http%'
            AND (${conds}) LIMIT 5
        `, codeSlug, ...nameWords.map((w: string) => `%${w}%`))
        allMatches.push(...fuzzy)
      }

      const valid = allMatches.filter((m: any) => {
        const ub = (m.brand_name || '').toLowerCase()
        if (brand && ub && brand.length > 2 && ub.length > 2) return brand.includes(ub) || ub.includes(brand)
        if (nameWords.length >= 2) {
          const mn = (m.name || '').toLowerCase()
          return nameWords.filter((w: string) => mn.includes(w)).length >= 2
        }
        return nameWords.length === 1
      })

      if (valid.length > 0) {
        try {
          const imageUrl = await downloadFile(valid[0].picture_url, robot.robot_entity_id, 'robots')
          await prisma.$executeRawUnsafe(
            `UPDATE robot_public_projections SET image_url = $1, unibot_id = $2, last_verified_at = now() WHERE id = $3::uuid`,
            imageUrl, valid[0].unibot_id, robot.id,
          )
          robotsUpdated++
          results.push(`✓ Robot: ${robot.canonical_name} ← ${valid[0].name}`)
        } catch (e: any) {
          results.push(`✗ Robot ${robot.canonical_name}: ${e.message}`)
        }
      }
    }

    return NextResponse.json({ success: true, brandsUpdated, robotsUpdated, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results }, { status: 500 })
  }
}

async function downloadFile(url: string, entityId: string, namespace: 'brands' | 'robots'): Promise<string> {
  const imageUrl = getAllowedRemoteImageUrl(url)
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RobotSpace.io/1.0)' },
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const contentLength = Number(res.headers.get('content-length') ?? 0)
  if (contentLength > MAX_IMAGE_BYTES) throw new Error('Image too large')

  const image = validateImageBuffer(Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') ?? undefined)

  const filename = `${entityId}.${image.extension}`
  return storeImage({ namespace, filename, buffer: image.buffer, contentType: image.contentType })
}
