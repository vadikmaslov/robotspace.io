import { prisma } from '@robotspace/db'
import { cookies } from 'next/headers'
import { CompareSelector } from './compare-selector'
import { CompareRemovalControls } from './compare-removal-controls'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Compare Robots', description: 'Side-by-side comparison of robot specifications: payload, reach, weight, category, and more.' }
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const cookieStore = await cookies()
  const params = await searchParams
  const cookieIds = cookieStore.get('compare_ids')?.value || ''
  const selectedIds = cookieIds.split(',').filter(Boolean)
  const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1)
  const pageSize = 60

  let robots: any[] = []
  let allRobots: any[] = []
  let totalRobots = 0

  try {
    if (selectedIds.length >= 2 && selectedIds.length <= 5) {
      robots = await prisma.robot_public_projections.findMany({
        where: { id: { in: selectedIds }, lifecycle_status: 'ACTIVE' },
        take: 5,
      })
      const categoryIds = robots.map(robot => robot.category_id).filter((id): id is string => Boolean(id))
      const categories = categoryIds.length
        ? await prisma.categories.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name_en: true } })
        : []
      const categoryNames = new Map(categories.map(category => [category.id, category.name_en]))
      robots = robots.map(robot => ({ ...robot, category_name: categoryNames.get(robot.category_id) ?? 'Other' }))
    }
    ;[allRobots, totalRobots] = await Promise.all([
      prisma.robot_public_projections.findMany({ where: { lifecycle_status: 'ACTIVE' }, orderBy: { canonical_name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.robot_public_projections.count({ where: { lifecycle_status: 'ACTIVE' } }),
    ])
  } catch {}

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <h1 className="text-4xl font-semibold mb-8" style={{ color: 'var(--color-text-heading)' }}>Compare Robots</h1>

      {robots.length < 2 ? (
        <CompareSelector allRobots={allRobots} selectedIds={selectedIds} page={page} totalPages={Math.max(1, Math.ceil(totalRobots / pageSize))} />
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-border-color)' }}>
                  <th className="py-4 pr-6 text-left text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Attribute</th>
                  {robots.map((r: any) => (
                    <th key={r.id} className="py-4 pr-6 text-right font-medium" style={{ color: 'var(--color-text-heading)' }}>{r.canonical_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Category', 'category_name'], ['Payload (kg)', 'payload_kg'], ['Reach (mm)', 'reach_mm'],
                  ['Weight (kg)', 'weight_kg'], ['Description', 'summary'],
                ].map(([label, key]) => (
                  <tr key={key} className="border-b" style={{ borderColor: 'var(--color-border-color)', opacity: 0.5 }}>
                    <td className="py-3 pr-6" style={{ color: 'var(--color-text-muted)' }}>{label}</td>
                    {robots.map((r: any) => (
                      <td key={r.id} className="py-3 pr-6 text-right font-mono text-xs" style={{ color: 'var(--color-text-body)' }}>
                        {key === 'summary' ? String(r[key] || '—').slice(0, 120)
                          : r[key] != null ? String(r[key]) : <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CompareRemovalControls robots={robots} selectedIds={selectedIds} />
          <CompareSelector allRobots={allRobots} selectedIds={selectedIds} page={page} totalPages={Math.max(1, Math.ceil(totalRobots / pageSize))} />
        </div>
      )}
    </div>
  )
}
