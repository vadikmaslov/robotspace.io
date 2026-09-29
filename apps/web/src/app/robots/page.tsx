import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { catalogParams, catalogPageUrl, numberRange, type CatalogParams } from '../../lib/catalog-params'
import { publicRobotWhere } from '../../lib/public-catalog'
import { robotUrl } from '../../lib/public-urls'
import { RobotImage } from './robot-image'
import { getUnibotRobotImageMap } from '../../lib/unibot-robot-images'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Robot Catalog', description: 'Search, filter, and compare industrial, humanoid, service, medical, logistics, and agricultural robots.' }
}

export default async function RobotsCatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogParams>
}) {
  const filters = catalogParams(await searchParams)
  const params = filters.values
  let page = filters.page
  const take = 24

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
    if (filters.error) throw new Error('Invalid filters')
    categories = (await prisma.categories.findMany({
      where: { is_active: true, parent_id: null, slug: { not: 'other' } },
      select: { id: true, slug: true, name_en: true },
      orderBy: { sort_order: 'asc' },
    })).map(category => ({ id: category.id, slug: category.slug, name: category.name_en }))
    for (const category of categories) categoryNameById[category.id] = category.name

    const where: any = { AND: [await publicRobotWhere()] }
    if (params.q || params.country) {
      const companies = await prisma.$queryRaw<Array<{ id: string; name: string; country: string | null }>>`
        SELECT p.company_entity_id AS id, p.canonical_name AS name, p.country_code AS country
        FROM company_public_projections p JOIN entities e ON e.id = p.company_entity_id
        WHERE e.publication_status = 'PUBLISHED' AND e.archived_at IS NULL AND p.status = 'ACTIVE'`
      const relations = await prisma.robot_company_relations.findMany({ where: { relation: 'MANUFACTURES', company_entity_id: { in: companies.map(c => c.id) } } })
      const robotIdsFor = (ids: string[]) => relations.filter(r => r.company_entity_id && ids.includes(r.company_entity_id)).map(r => r.robot_entity_id).filter((id): id is string => Boolean(id))
      if (params.q) where.AND.push({ OR: [
        { canonical_name: { contains: params.q, mode: 'insensitive' } },
        { robot_entity_id: { in: robotIdsFor(companies.filter(c => c.name.toLowerCase().includes(params.q.toLowerCase())).map(c => c.id)) } },
      ] })
      if (params.country) where.AND.push({ robot_entity_id: { in: robotIdsFor(companies.filter(c => c.country === params.country).map(c => c.id)) } })
    }
    if (params.payload_min || params.payload_max) where.payload_kg = numberRange(params.payload_min, params.payload_max)
    if (params.reach_min || params.reach_max) where.reach_mm = numberRange(params.reach_min, params.reach_max)
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

    total = await prisma.robot_public_projections.count({ where })
    page = Math.min(page, Math.max(1, Math.ceil(total / take)))
    robots = await prisma.robot_public_projections.findMany({ where, orderBy: [orderBy, { id: 'asc' }], take, skip: (page - 1) * take })
    unibotImageMap = await getUnibotRobotImageMap(robots.map((robot: any) => robot.unibot_id))

    try {
      const rels = await prisma.robot_company_relations.findMany({ where: { relation: 'MANUFACTURES' } })
      if (rels.length > 0) {
        const companyIds = [...new Set(rels.map((r: any) => r.company_entity_id).filter(Boolean))]
        // Use raw SQL to get image_url (Prisma client not regenerated after schema change)
        const companies = companyIds.length > 0 ? await prisma.$queryRawUnsafe<any[]>(`
          SELECT company_entity_id, projection.canonical_name, image_url, entity.slug
          FROM company_public_projections projection
          JOIN entities entity ON entity.id = projection.company_entity_id
          WHERE company_entity_id = ANY($1::uuid[]) AND entity.publication_status = 'PUBLISHED'
            AND entity.archived_at IS NULL AND projection.status = 'ACTIVE'
        `, companyIds) : []
        const names: Record<string, string> = {}
        for (const c of companies) { names[c.company_entity_id] = c.canonical_name; if (c.image_url) mfrImageMap[c.company_entity_id] = c.image_url; mfrSlugMap[c.company_entity_id] = c.slug }
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
          <span style={{ color: 'var(--color-text-heading)', fontWeight: 510 }}>{total}</span> matching robots
        </p>
      </div>

      {/* Filter bar — matching prototype: search, category, country, sort, range sliders */}
      {filters.error && <p role="alert" className="max-w-[1200px] mx-auto px-6 pb-4">{filters.error}</p>}
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
            <option value="US">United States</option><option value="DE">Germany</option><option value="JP">Japan</option>
            <option value="CN">China</option><option value="KR">South Korea</option><option value="DK">Denmark</option>
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
          {(Object.values(params).some(Boolean)) && (
            <Link href="/robots" className="text-sm py-2.5 px-4 rounded-md border cursor-pointer transition-colors"
              style={{ background: 'transparent', borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>
              Reset
            </Link>
          )}
        </div>
        <div className="flex gap-4 flex-wrap text-xs items-center" style={{ color: 'var(--color-text-muted)' }}>
          {[
            ['payload_min', 'Minimum payload (kg)'], ['payload_max', 'Maximum payload (kg)'],
            ['reach_min', 'Minimum reach (mm)'], ['reach_max', 'Maximum reach (mm)'],
          ].map(([key, label]) => <label key={key} className="flex flex-col gap-1">{label}
            <input type="number" name={key} min="0" max="1000000" step="any" defaultValue={params[key as keyof typeof params]} placeholder="No limit"
              className="w-36 rounded border p-2" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </label>)}
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
              <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: 'var(--color-text-dim)' }}>No robots found</td></tr>
            )}
            {robots.map((robot: any, i: number) => (
              <tr key={robot.id} className="transition-colors border-b"
                style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', borderColor: 'var(--color-border-color)' }}>
                <td className="py-3 px-4">
                  <Link href={robotUrl(robot.canonical_name)}
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
          <div className="flex flex-wrap justify-center gap-1 mt-8">
            {Array.from({ length: totalPages }, (_, i) => (
              <Link key={i} href={catalogPageUrl('/robots', params, i + 1)}
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
