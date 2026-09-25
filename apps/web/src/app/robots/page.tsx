import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { RobotImage } from './robot-image'
import { getUnibotRobotImageMap } from '../../lib/unibot-robot-images'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Robot Catalog', description: 'Search, filter, and compare industrial, humanoid, service, medical, logistics, and agricultural robots.' }
}

export default async function RobotsCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; page?: string; country?: string; payload_min?: string; payload_max?: string; reach_min?: string; reach_max?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const take = 24
  const skip = (page - 1) * take

  let robots: any[] = []
  let total = 0
  const mfrMap: Record<string, string> = {}
  const mfrImageMap: Record<string, string> = {}
  const mfrSlugMap: Record<string, string> = {}
  const mfrIdMap: Record<string, string> = {} // robot_entity_id → company_entity_id
  const categoryNameById: Record<string, string> = {}
  let categories: Array<{ id: string; slug: string; name: string }> = []
  let unibotImageMap = new Map<string, string>()

  try {
    categories = (await prisma.categories.findMany({
      where: { is_active: true, parent_id: null, slug: { not: 'other' } },
      select: { id: true, slug: true, name_en: true },
      orderBy: { sort_order: 'asc' },
    })).map(category => ({ id: category.id, slug: category.slug, name: category.name_en }))
    for (const category of categories) categoryNameById[category.id] = category.name

    const where: any = { lifecycle_status: 'ACTIVE' }
    if (params.q) {
      where.canonical_name = { contains: params.q, mode: 'insensitive' }
    }
    if (params.category) {
      const category = categories.find(item => item.slug === params.category)
      if (!category) {
        where.robot_entity_id = { in: [] }
      } else {
        const categoryRobots = await prisma.$queryRawUnsafe<Array<{ robot_entity_id: string }>>(
          `SELECT robot_entity_id FROM robot_public_projections WHERE category_id = $1::uuid`,
          category.id,
        )
        where.robot_entity_id = { in: categoryRobots.map(robot => robot.robot_entity_id) }
      }
    }

    let orderBy: any = { canonical_name: 'asc' }
    if (params.sort === 'newest') orderBy = { last_verified_at: 'desc' }
    if (params.sort === 'name-desc') orderBy = { canonical_name: 'desc' }

    ;[robots, total] = await Promise.all([
      prisma.robot_public_projections.findMany({ where, orderBy, take, skip }),
      prisma.robot_public_projections.count({ where }),
    ])
    unibotImageMap = await getUnibotRobotImageMap(robots.map((robot: any) => robot.unibot_id))

    try {
      const rels = await prisma.robot_company_relations.findMany({ where: { relation: 'MANUFACTURES' } })
      if (rels.length > 0) {
        const companyIds = [...new Set(rels.map((r: any) => r.company_entity_id).filter(Boolean))]
        // Use raw SQL to get image_url (Prisma client not regenerated after schema change)
        const companies = companyIds.length > 0 ? await prisma.$queryRawUnsafe<any[]>(`
          SELECT company_entity_id, canonical_name, image_url
          FROM company_public_projections
          WHERE company_entity_id = ANY($1::uuid[])
        `, companyIds) : []
        const names: Record<string, string> = {}
        for (const c of companies) { names[c.company_entity_id] = c.canonical_name; if (c.image_url) mfrImageMap[c.company_entity_id] = c.image_url; mfrSlugMap[c.company_entity_id] = c.canonical_name?.toLowerCase().replace(/\s+/g, '-') }
        for (const r of rels) {
          if (r.company_entity_id && r.robot_entity_id) {
            mfrMap[r.robot_entity_id] = names[r.company_entity_id] || '—'
            mfrIdMap[r.robot_entity_id] = r.company_entity_id
          }
        }
      }
    } catch (e) { console.error('[brands]', e) }
  } catch (e) {
    console.error('[robots]', e)
  }

  const totalPages = Math.ceil(total / take)

  return (
    <div>
      {/* Header */}
      <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-4">
        <div className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
          <Link href="/" style={{ color: 'var(--color-text-muted)' }}>Home</Link>
          <span className="mx-2" style={{ color: 'var(--color-text-dim)' }}>/</span>
          <span style={{ color: 'var(--color-text-heading)' }}>Robots</span>
        </div>
        <h1 className="text-[32px] font-medium tracking-tight" style={{ color: 'var(--color-text-heading)' }}>Robot Catalog</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ color: 'var(--color-text-heading)', fontWeight: 510 }}>{total}</span> of {total} robots
        </p>
      </div>

      {/* Filter bar — matching prototype: search, category, country, sort, range sliders */}
      <form action="/robots" method="GET" className="max-w-[1200px] mx-auto px-6 pb-4 space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex-1 min-w-[240px] flex items-center px-3 rounded-md border"
            style={{ background: 'var(--color-input-bg)', borderColor: 'var(--color-input-border)' }}>
            <span style={{ color: 'var(--color-text-dim)', fontSize: 14, marginRight: 4 }}>🔍</span>
            <input name="q" defaultValue={params.q || ''} placeholder="Filter robots by name, manufacturer..."
              className="flex-1 bg-transparent border-none text-sm py-2.5 outline-none"
              style={{ color: 'var(--color-text-body)' }} />
          </div>
          <select name="category" defaultValue={params.category || ''}
            className="text-sm py-2.5 px-3 rounded-md border outline-none cursor-pointer min-w-[140px]"
            style={{ background: 'var(--color-input-bg)', borderColor: 'var(--color-input-border)', color: 'var(--color-text-body)' }}>
            <option value="">All Categories</option>
            {categories.map(category => <option key={category.id} value={category.slug}>{category.name}</option>)}
          </select>
          <select name="country" defaultValue={params.country || ''}
            className="text-sm py-2.5 px-3 rounded-md border outline-none cursor-pointer min-w-[140px]"
            style={{ background: 'var(--color-input-bg)', borderColor: 'var(--color-input-border)', color: 'var(--color-text-body)' }}>
            <option value="">All Countries</option>
            <option>United States</option><option>Germany</option><option>Japan</option>
            <option>China</option><option>South Korea</option><option>Denmark</option>
          </select>
          <select name="sort" defaultValue={params.sort || ''}
            className="text-sm py-2.5 px-3 rounded-md border outline-none cursor-pointer"
            style={{ background: 'var(--color-input-bg)', borderColor: 'var(--color-input-border)', color: 'var(--color-text-body)' }}>
            <option value="">Sort: Name A-Z</option><option value="name-desc">Sort: Name Z-A</option><option value="newest">Sort: Newest</option>
          </select>
          <button type="submit"
            className="px-4 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
            Apply
          </button>
          {(params.q || params.category || params.sort) && (
            <Link href="/robots" className="text-sm py-2.5 px-4 rounded-md border cursor-pointer transition-colors"
              style={{ background: 'transparent', borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>
              Reset
            </Link>
          )}
        </div>
        {/* Range sliders */}
        <div className="flex gap-4 flex-wrap text-xs items-center" style={{ color: 'var(--color-text-muted)' }}>
          <span>Payload:</span>
          <input type="range" name="payload_min" min="0" max="3000" defaultValue={params.payload_min || 0}
            className="w-[100px] accent-[var(--color-accent-cta)]" />
          <span className="font-mono" style={{ color: 'var(--color-text-heading)', minWidth: 40 }}>{params.payload_min || 0}kg</span>
          <span>–</span>
          <input type="range" name="payload_max" min="0" max="3000" defaultValue={params.payload_max || 3000}
            className="w-[100px] accent-[var(--color-accent-cta)]" />
          <span className="font-mono" style={{ color: 'var(--color-text-heading)', minWidth: 48 }}>{params.payload_max || 3000}kg</span>
          <span className="ml-4">Reach:</span>
          <input type="range" name="reach_min" min="0" max="4000" defaultValue={params.reach_min || 0}
            className="w-[100px] accent-[var(--color-accent-cta)]" />
          <span className="font-mono" style={{ color: 'var(--color-text-heading)', minWidth: 40 }}>{params.reach_min || 0}mm</span>
          <span>–</span>
          <input type="range" name="reach_max" min="0" max="4000" defaultValue={params.reach_max || 4000}
            className="w-[100px] accent-[var(--color-accent-cta)]" />
          <span className="font-mono" style={{ color: 'var(--color-text-heading)', minWidth: 48 }}>{params.reach_max || 4000}mm</span>
        </div>
      </form>

      {/* TABLE */}
      <div className="max-w-[1200px] mx-auto px-6 pb-12 overflow-x-auto">
        <table className="w-full border-collapse rounded-xl overflow-hidden border"
          style={{ borderColor: 'var(--color-border-color)' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-card)' }}>
              <th className="text-left text-xs font-normal uppercase tracking-wider py-3 px-4 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Robot</th>
              <th className="text-left text-xs font-normal uppercase tracking-wider py-3 px-4 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Brand</th>
              <th className="text-left text-xs font-normal uppercase tracking-wider py-3 px-4 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Category</th>
              <th className="text-right text-xs font-normal uppercase tracking-wider py-3 px-4 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Payload</th>
              <th className="text-right text-xs font-normal uppercase tracking-wider py-3 px-4 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Reach</th>
              <th className="text-right text-xs font-normal uppercase tracking-wider py-3 px-4 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Weight</th>
              <th className="text-right text-xs font-normal uppercase tracking-wider py-3 px-4 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Verified</th>
            </tr>
          </thead>
          <tbody>
            {robots.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: 'var(--color-text-dim)' }}>No robots found</td></tr>
            )}
            {robots.map((robot: any, i: number) => (
              <tr key={robot.id} className="transition-colors border-b"
                style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', borderColor: 'var(--color-border-color)' }}>
                <td className="py-3 px-4">
                  <Link href={`/robots/${robot.canonical_name?.toLowerCase().replace(/\s+/g, '-')}`}
                    className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-md border flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
                      <RobotImage imageUrl={robot.image_url} unibotImageUrl={unibotImageMap.get(robot.unibot_id)} fallbackUrl={mfrImageMap[mfrIdMap[robot.robot_entity_id]]} size="sm" />
                    </div>
                    <div>
                      <div className="text-sm font-medium group-hover:underline" style={{ color: 'var(--color-text-heading)' }}>{robot.canonical_name}</div>
                    </div>
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">
                  {mfrMap[robot.robot_entity_id] && mfrMap[robot.robot_entity_id] !== '—' ? (
                    <Link href={`/companies/${mfrSlugMap[mfrIdMap[robot.robot_entity_id]]}`} className="hover:underline"
                      style={{ color: 'var(--color-text-muted)' }}>{mfrMap[robot.robot_entity_id]}</Link>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="inline-block text-[11px] px-3 py-1 rounded-full border"
                    style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)', background: 'var(--color-tag-bg)' }}>
                    {categoryNameById[robot.category_id] || 'Other'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-sm font-mono" style={{ color: 'var(--color-text-body)' }}>
                  {robot.payload_kg ? `${robot.payload_kg} kg` : <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                </td>
                <td className="py-3 px-4 text-right text-sm font-mono" style={{ color: 'var(--color-text-body)' }}>
                  {robot.reach_mm ? `${robot.reach_mm} mm` : <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                </td>
                <td className="py-3 px-4 text-right text-sm font-mono" style={{ color: 'var(--color-text-body)' }}>
                  {robot.weight_kg ? `${robot.weight_kg} kg` : <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                </td>
                <td className="py-3 px-4 text-right text-xs" style={{ color: 'var(--color-text-dim)' }}>
                  {robot.last_verified_at ? new Date(robot.last_verified_at).toISOString().slice(0, 10) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-1 mt-8">
            {Array.from({ length: totalPages }, (_, i) => (
              <Link key={i} href={`/robots?page=${i + 1}${params.q ? `&q=${params.q}` : ''}${params.sort ? `&sort=${params.sort}` : ''}`}
                className={`min-w-[36px] h-9 flex items-center justify-center rounded-md text-sm border transition-colors`}
                style={{
                  background: page === i + 1 ? 'var(--color-accent-cta)' : 'transparent',
                  color: page === i + 1 ? 'var(--color-accent-cta-text)' : 'var(--color-text-body)',
                  borderColor: page === i + 1 ? 'var(--color-accent-cta)' : 'var(--color-border-color)',
                  fontWeight: page === i + 1 ? 510 : 400,
                }}>
                {i + 1}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
