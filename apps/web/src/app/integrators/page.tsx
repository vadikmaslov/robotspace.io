import { prisma } from '@robotspace/db'
import IntegratorsMap from './world-map'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Integrators Map | RobotSpace.io', description: 'Verified company locations worldwide with interactive map.' }
}

export default async function IntegratorsPage() {
  let companies: { id: string; name: string; country_code: string | null; robots: number; url: string }[] = []
  let countrySet = new Set<string>()
  let totalRobots = 0

  try {
    const rows = await prisma.company_public_projections.findMany({
      orderBy: { canonical_name: 'asc' },
    })

    // Batch-load robot counts
    const entityIds = rows.map(r => r.company_entity_id)
    const rels = entityIds.length > 0
      ? await prisma.robot_company_relations.groupBy({
          by: ['company_entity_id'],
          _count: { robot_entity_id: true },
          where: { company_entity_id: { in: entityIds } },
        })
      : []

    const robotCountMap: Record<string, number> = {}
    for (const r of rels) {
      if (r.company_entity_id) robotCountMap[r.company_entity_id] = r._count.robot_entity_id
    }

    for (const row of rows) {
      if (row.country_code) countrySet.add(row.country_code)
      const rc = robotCountMap[row.company_entity_id] || 0
      totalRobots += rc
      companies.push({
        id: row.id,
        name: row.canonical_name,
        country_code: row.country_code,
        robots: rc,
        url: `/companies/${row.canonical_name?.toLowerCase().replace(/\s+/g, '-')}`,
      })
    }
  } catch {}

  const countryCount = countrySet.size

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <h1 className="text-[32px] font-medium tracking-tight mb-1" style={{ color: 'var(--color-text-heading)' }}>
        Integrators Map
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
        Verified company locations worldwide — hover dots for details, click to visit profile.
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          ['Companies', String(companies.length)],
          ['Countries', String(countryCount)],
          ['With Location', String(companies.filter(c => c.country_code).length)],
          ['Robot Models', String(totalRobots)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
            <div className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
            <div className="font-mono text-2xl mt-1" style={{ color: 'var(--color-text-heading)' }}>{value}</div>
          </div>
        ))}
      </div>

      <IntegratorsMap
        companies={companies}
        countryCount={countryCount}
        totalCompanies={companies.length}
      />
    </div>
  )
}
