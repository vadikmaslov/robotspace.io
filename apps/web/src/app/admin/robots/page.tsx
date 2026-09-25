import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { DeleteRobotButton } from './delete-button'
import { ROBOT_CATEGORIES } from '../../../lib/robot-categories'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function AdminRobotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; brand?: string; page?: string }>
}) {
  const params = await searchParams
  let robots: any[] = []
  let total = 0
  const mfrMap: Record<string, string> = {}
  let brands: string[] = []
  let categories: Array<{ id: string; slug: string; name: string }> = []
  const categoryNameById: Record<string, string> = {}

  try {
    const categoryOrder = new Map(ROBOT_CATEGORIES.map((name, index) => [name.toLowerCase(), index]))
    categories = (await prisma.categories.findMany({
      where: { is_active: true, slug: { in: [...categoryOrder.keys()] } },
      select: { id: true, slug: true, name_en: true },
    }))
      .sort((left, right) => (categoryOrder.get(left.slug) ?? 99) - (categoryOrder.get(right.slug) ?? 99))
      .map(category => ({ id: category.id, slug: category.slug, name: category.name_en }))
    for (const category of categories) categoryNameById[category.id] = category.name

    // Load all manufacturers first for brand filter
    const rels = await prisma.robot_company_relations.findMany({ where: { relation: 'MANUFACTURES' } })
    if (rels.length > 0) {
      const companyIds = [...new Set(rels.map((r: any) => r.company_entity_id).filter(Boolean))]
      const companies = await prisma.company_public_projections.findMany({
        where: companyIds.length > 0 ? { company_entity_id: { in: companyIds } } : {},
      })
      const nameMap: Record<string, string> = {}
      const idToName: Record<string, string> = {}
      for (const c of companies) if (c.company_entity_id && c.canonical_name) { nameMap[c.company_entity_id] = c.canonical_name; idToName[c.canonical_name] = c.company_entity_id }
      for (const r of rels) if (r.company_entity_id && r.robot_entity_id) mfrMap[r.robot_entity_id] = nameMap[r.company_entity_id] || '—'
      brands = Object.values(nameMap).sort()
    }

    // Build WHERE with filters
    const where: any = {}
    if (params.q) where.canonical_name = { contains: params.q, mode: 'insensitive' }
    const robotIdFilters: string[][] = []
    if (params.category) {
      const category = categories.find(item => item.slug === params.category)
      if (!category) {
        robotIdFilters.push([])
      } else {
        const categoryRobots = await prisma.$queryRawUnsafe<Array<{ robot_entity_id: string }>>(
          `SELECT robot_entity_id FROM robot_public_projections WHERE category_id = $1::uuid`,
          category.id,
        )
        robotIdFilters.push(categoryRobots.map(robot => robot.robot_entity_id))
      }
    }
    if (params.brand) {
      // Find all robot IDs for this brand
      const brandRels = rels.filter(r => r.robot_entity_id && mfrMap[r.robot_entity_id] === params.brand)
      robotIdFilters.push(brandRels.map(r => r.robot_entity_id!).filter(Boolean))
    }
    if (robotIdFilters.length) {
      const allowedIds = robotIdFilters.reduce((ids, filter) => ids.filter(id => filter.includes(id)))
      where.robot_entity_id = { in: allowedIds }
    }

    total = await prisma.robot_public_projections.count({ where })
    const requestedPage = Number.parseInt(params.page || '1', 10)
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const currentPage = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), pageCount)
    robots = await prisma.robot_public_projections.findMany({
      where,
      orderBy: { canonical_name: 'asc' },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    })
  } catch (e) { console.error(e) }

  const requestedPage = Number.parseInt(params.page || '1', 10)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), pageCount)
  const paginationHref = (page: number) => {
    const query = new URLSearchParams()
    if (params.q) query.set('q', params.q)
    if (params.category) query.set('category', params.category)
    if (params.brand) query.set('brand', params.brand)
    if (page > 1) query.set('page', String(page))
    const search = query.toString()
    return `/admin/robots${search ? `?${search}` : ''}`
  }
  const visiblePages = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter(page => page === 1 || page === pageCount || Math.abs(page - currentPage) <= 2)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>
          Robots ({total})
        </h1>
        <div className="flex gap-3 items-center"><Link href="/admin/robots/categories" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Manage categories</Link><Link href="/admin/robots/new" className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>+ Add Robot</Link></div>
      </div>

      {/* Filter bar */}
      <form action="/admin/robots" method="GET" className="flex gap-2 flex-wrap items-center">
        <input name="q" defaultValue={params.q || ''} placeholder="Search name..."
          className="p-2.5 rounded-md text-sm border min-w-[200px]" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        <select name="category" defaultValue={params.category || ''}
          className="p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
          <option value="">All Categories</option>
          {categories.map(category => (<option key={category.id} value={category.slug}>{category.name}</option>))}
        </select>
        <select name="brand" defaultValue={params.brand || ''}
          className="p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
          <option value="">All Brands</option>
          {brands.map(b => (<option key={b}>{b}</option>))}
        </select>
        <button type="submit" className="px-4 py-2.5 rounded-md text-sm font-medium"
          style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Apply</button>
        {(params.q || params.category || params.brand) && (
          <Link href="/admin/robots" className="px-4 py-2.5 rounded-md text-sm border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Reset</Link>
        )}
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border-color)' }}>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Robot</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Brand</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Category</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider text-right" style={{ color: 'var(--color-text-dim)' }}>Payload</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider text-right" style={{ color: 'var(--color-text-dim)' }}>Reach</th>
              <th className="py-3 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {robots.map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-[var(--color-hover-bg)]" style={{ borderColor: 'var(--color-border-color)' }}>
                <td className="py-3 pr-4" style={{ color: 'var(--color-text-body)' }}>{r.canonical_name}</td>
                <td className="py-3 pr-4" style={{ color: 'var(--color-text-muted)' }}>{mfrMap[r.robot_entity_id] || '—'}</td>
                <td className="py-3 pr-4" style={{ color: 'var(--color-text-muted)' }}>{categoryNameById[r.category_id] || 'Uncategorized'}</td>
                <td className="py-3 pr-4 text-right font-mono text-xs" style={{ color: 'var(--color-text-body)' }}>{r.payload_kg ? `${r.payload_kg} kg` : '—'}</td>
                <td className="py-3 pr-4 text-right font-mono text-xs" style={{ color: 'var(--color-text-body)' }}>{r.reach_mm ? `${r.reach_mm} mm` : '—'}</td>
                <td className="py-3 flex gap-2">
                  <Link href={`/admin/robots/${r.robot_entity_id}`} className="text-xs px-3 py-1.5 rounded-md border transition-colors"
                    style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>Edit</Link>
                  <DeleteRobotButton robotId={r.robot_entity_id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <nav aria-label="Robots pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p style={{ color: 'var(--color-text-muted)' }}>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            {currentPage > 1 ? (
              <Link href={paginationHref(currentPage - 1)} className="rounded-md border px-3 py-2" style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>Previous</Link>
            ) : (
              <span className="rounded-md border px-3 py-2 opacity-50" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Previous</span>
            )}
            {visiblePages.map((page, index) => {
              const previous = visiblePages[index - 1]
              return (
                <span key={page} className="flex items-center gap-1">
                  {previous && page - previous > 1 && <span className="px-1" style={{ color: 'var(--color-text-dim)' }}>…</span>}
                  {page === currentPage ? (
                    <span aria-current="page" className="rounded-md px-3 py-2 font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>{page}</span>
                  ) : (
                    <Link href={paginationHref(page)} className="rounded-md border px-3 py-2" style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>{page}</Link>
                  )}
                </span>
              )
            })}
            {currentPage < pageCount ? (
              <Link href={paginationHref(currentPage + 1)} className="rounded-md border px-3 py-2" style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>Next</Link>
            ) : (
              <span className="rounded-md border px-3 py-2 opacity-50" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Next</span>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
