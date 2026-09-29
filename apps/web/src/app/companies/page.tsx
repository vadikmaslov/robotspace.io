import { Prisma, prisma } from '@robotspace/db'
import Link from 'next/link'
import { catalogParams, catalogPageUrl, escapedLike, type CatalogParams } from '../../lib/catalog-params'

export async function generateMetadata() {
  return { title: 'Robotics Companies', description: 'Directory of robotics companies worldwide — manufacturers, integrators, and suppliers with verified data.' }
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', DE: 'Germany', JP: 'Japan', CH: 'Switzerland', DK: 'Denmark', CN: 'China',
  KR: 'South Korea', FR: 'France', GB: 'United Kingdom', IT: 'Italy', SE: 'Sweden', NL: 'Netherlands',
  CA: 'Canada', IL: 'Israel', IN: 'India', SG: 'Singapore', TW: 'Taiwan', ES: 'Spain', AU: 'Australia',
  NO: 'Norway', FI: 'Finland', AT: 'Austria', BE: 'Belgium', PL: 'Poland', CZ: 'Czechia', BR: 'Brazil',
  MX: 'Mexico', AE: 'United Arab Emirates', TR: 'Turkey', RU: 'Russia', BY: 'Belarus', KZ: 'Kazakhstan', UA: 'Ukraine',
}
const cn = (code: string) => COUNTRY_NAMES[code] || code || '—'
const PAGE_SIZE = 50

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<CatalogParams> }) {
  let companies: any[] = []
  let totalCompanies = 0
  const filters = catalogParams(await searchParams)
  const params = filters.values
  let page = filters.page
  const conditions = Prisma.sql`entity.publication_status = 'PUBLISHED' AND entity.archived_at IS NULL AND projection.status = 'ACTIVE'
    AND projection.canonical_name ILIKE ${escapedLike(params.q)}
    AND (${params.country} = '' OR projection.country_code = ${params.country})`

  try {
    if (filters.error) throw new Error('Invalid filters')
    const totals = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(*)::int AS count
       FROM company_public_projections projection
       JOIN entities entity ON entity.id = projection.company_entity_id
       WHERE ${conditions}`,
    )
    totalCompanies = totals[0]?.count ?? 0
    const totalPages = Math.max(1, Math.ceil(totalCompanies / PAGE_SIZE))
    page = Math.min(page, totalPages)
    const sort = params.sort === 'robots' ? Prisma.sql`"robotCount" DESC, projection.canonical_name ASC, entity.slug ASC` : Prisma.sql`projection.canonical_name ASC, entity.slug ASC`
    companies = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT projection.*, entity.slug, count(DISTINCT robot.robot_entity_id)::int AS "robotCount"
       FROM company_public_projections projection
       JOIN entities entity ON entity.id = projection.company_entity_id
       LEFT JOIN robot_company_relations relation ON relation.company_entity_id = projection.company_entity_id
       LEFT JOIN entities robot_entity ON robot_entity.id = relation.robot_entity_id AND robot_entity.publication_status = 'PUBLISHED' AND robot_entity.archived_at IS NULL
       LEFT JOIN robot_public_projections robot ON robot.robot_entity_id = robot_entity.id AND robot.lifecycle_status = 'ACTIVE'
       WHERE ${conditions}
       GROUP BY projection.id, entity.slug
       ORDER BY ${sort}
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    )
  } catch {}

  const totalPages = Math.max(1, Math.ceil(totalCompanies / PAGE_SIZE))

  return (
    <div>
      <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-4">
        <h1 className="text-[32px] font-medium tracking-tight" style={{ color: 'var(--color-text-heading)' }}>Robotics Companies</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ color: 'var(--color-text-heading)', fontWeight: 510 }}>{totalCompanies}</span> companies tracked worldwide
        </p>
      </div>

      {filters.error && <p role="alert" className="max-w-[1200px] mx-auto px-6 pb-4">{filters.error}</p>}
      <form action="/companies" method="GET" className="max-w-[1200px] mx-auto px-6 pb-4 flex gap-2 flex-wrap">
        <input name="q" aria-label="Company name" defaultValue={params.q} placeholder="Search companies..." className="flex-1 min-w-[200px] p-2.5 rounded-md text-sm border"
          style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        <select name="country" aria-label="Country" defaultValue={params.country} className="p-2.5 rounded-md text-sm border min-w-[140px]"
          style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
          <option value="">All Countries</option>{Object.entries(COUNTRY_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <select name="sort" aria-label="Sort companies" defaultValue={params.sort} className="p-2.5 rounded-md text-sm border"
          style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
          <option value="">Sort: Name A-Z</option><option value="robots">Sort: Robots Count</option>
        </select>
        <button type="submit" className="rounded-md border px-4 py-2">Apply</button>
        <Link href="/companies" className="px-4 py-2">Reset</Link>
      </form>

      <div className="max-w-[1200px] mx-auto px-6 pb-12 overflow-x-auto">
        <table className="w-full text-sm border-collapse rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border-color)' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-card)' }}>
              <th className="py-3 px-4 text-left text-xs uppercase tracking-wider w-12" style={{ color: 'var(--color-text-dim)' }}>#</th>
              <th className="py-3 px-4 text-left text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Company</th>
              <th className="py-3 px-4 text-left text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Country</th>
              <th className="py-3 px-4 text-right text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Robots</th>
              <th className="py-3 px-4 text-right text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Founded</th>
              <th className="py-3 px-4 text-right text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Verified</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center" style={{ color: 'var(--color-text-dim)' }}>No companies listed yet</td></tr>
            )}
            {companies.map((c: any, i: number) => (
              <tr key={c.id} className="border-b transition-colors hover:bg-[var(--color-hover-bg)]"
                style={{ borderColor: 'var(--color-border-color)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                <td className="py-3 px-4 text-xs" style={{ color: 'var(--color-text-dim)' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="py-3 px-4">
                  <Link href={`/companies/${c.slug}`} className="font-medium hover:underline" style={{ color: 'var(--color-text-heading)' }}>
                    {c.canonical_name}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm" style={{ color: 'var(--color-text-body)' }}>{cn(c.country_code)}</td>
                <td className="py-3 px-4 text-right font-mono text-sm" style={{ color: 'var(--color-text-heading)' }}>{c.robotCount}</td>
                <td className="py-3 px-4 text-right text-xs" style={{ color: 'var(--color-text-dim)' }}>{c.founded_year || '—'}</td>
                <td className="py-3 px-4 text-right text-xs" style={{ color: 'var(--color-text-dim)' }}>
                  {c.last_verified_at ? new Date(c.last_verified_at).toISOString().slice(0, 10) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalCompanies > PAGE_SIZE && (
          <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Companies pagination">
            {page > 1 ? (
              <Link href={catalogPageUrl('/companies', params, page - 1)} className="rounded-md border px-3 py-2 hover:bg-[var(--color-hover-bg)]" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-body)' }}>← Previous</Link>
            ) : <span />}
            <span style={{ color: 'var(--color-text-muted)' }}>Page {page} of {totalPages}</span>
            {page < totalPages ? (
              <Link href={catalogPageUrl('/companies', params, page + 1)} className="rounded-md border px-3 py-2 hover:bg-[var(--color-hover-bg)]" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-body)' }}>Next →</Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  )
}
