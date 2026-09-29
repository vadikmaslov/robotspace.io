import { Prisma, prisma } from '@robotspace/db'
import { cookies } from 'next/headers'
import { CompareSelector } from './compare-selector'
import { CompareRemovalControls } from './compare-removal-controls'
import { publicRobotWhere } from '../../lib/public-catalog'
import { catalogParams } from '../../lib/catalog-params'
import { isUuid } from '../../lib/image-security'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Compare Robots', description: 'Side-by-side comparison of robot specifications: payload, reach, weight, category, and more.' }
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const cookieStore = await cookies()
  const params = await searchParams
  const cookieIds = cookieStore.get('compare_ids')?.value || ''
  const selectedIds = [...new Set(cookieIds.split(',').filter(isUuid))].slice(0, 5)
  const page = catalogParams(params).page
  const pageSize = 60

  let robots: any[] = []
  let allRobots: any[] = []
  let totalRobots = 0
  const ecosystemByRobot = new Map<string, { projects: number; resources: number }>()

  try {
    const publicWhere = await publicRobotWhere()
    if (selectedIds.length >= 2 && selectedIds.length <= 5) {
      robots = await prisma.robot_public_projections.findMany({
        where: { ...publicWhere, id: { in: selectedIds } },
        take: 5,
      })
      const categoryIds = robots.map(robot => robot.category_id).filter((id): id is string => Boolean(id))
      const categories = categoryIds.length
        ? await prisma.categories.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name_en: true } })
        : []
      const categoryNames = new Map(categories.map(category => [category.id, category.name_en]))
      robots = robots.map(robot => ({ ...robot, category_name: categoryNames.get(robot.category_id) ?? 'Other' }))
      const robotIds = robots.map(robot => robot.robot_entity_id)
      if (robotIds.length) {
        const [projects, resources] = await Promise.all([
          prisma.$queryRaw<Array<{ robotId: string; count: number }>>(Prisma.sql`
            SELECT compatibility.robot_id AS "robotId", count(DISTINCT compatibility.project_id)::int AS count
            FROM compatibility_claims AS compatibility
            JOIN software_packages AS project ON project.id = compatibility.project_id
            JOIN entities AS project_entity ON project_entity.id = project.entity_id
            WHERE compatibility.robot_id IN (${Prisma.join(robotIds)})
              AND compatibility.claim_status = 'VERIFIED'
              AND project.verification_status = 'VERIFIED'
              AND project_entity.publication_status = 'PUBLISHED' AND project_entity.archived_at IS NULL
            GROUP BY compatibility.robot_id`),
          prisma.$queryRaw<Array<{ robotId: string; count: number }>>(Prisma.sql`
            SELECT robot_entity_id AS "robotId", count(*)::int AS count
            FROM robot_resources
            WHERE robot_entity_id IN (${Prisma.join(robotIds)}) AND verification_status = 'VERIFIED'
            GROUP BY robot_entity_id`),
        ])
        for (const robot of robots) ecosystemByRobot.set(robot.robot_entity_id, {
          projects: projects.find(item => item.robotId === robot.robot_entity_id)?.count ?? 0,
          resources: resources.find(item => item.robotId === robot.robot_entity_id)?.count ?? 0,
        })
      }
    }
    ;[allRobots, totalRobots] = await Promise.all([
      prisma.robot_public_projections.findMany({ where: publicWhere, orderBy: [{ canonical_name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.robot_public_projections.count({ where: publicWhere }),
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
                  ['Weight (kg)', 'weight_kg'], ['Verified projects', 'verified_projects'], ['Official resources', 'official_resources'], ['Description', 'summary'],
                ].map(([label, key]) => (
                  <tr key={key} className="border-b" style={{ borderColor: 'var(--color-border-color)', opacity: 0.5 }}>
                    <td className="py-3 pr-6" style={{ color: 'var(--color-text-muted)' }}>{label}</td>
                    {robots.map((r: any) => (
                      <td key={r.id} className="py-3 pr-6 text-right font-mono text-xs" style={{ color: 'var(--color-text-body)' }}>
                        {key === 'summary' ? String(r[key] || '—').slice(0, 120)
                          : key === 'verified_projects' ? ecosystemByRobot.get(r.robot_entity_id)?.projects ?? 0
                          : key === 'official_resources' ? ecosystemByRobot.get(r.robot_entity_id)?.resources ?? 0
                          : r[key] != null ? String(r[key]) : <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>Ecosystem rows are counts of published, verified projects and verified first-party resources. They are not a quality score.</p>
          <CompareRemovalControls robots={robots} selectedIds={selectedIds} />
          <CompareSelector allRobots={allRobots} selectedIds={selectedIds} page={page} totalPages={Math.max(1, Math.ceil(totalRobots / pageSize))} />
        </div>
      )}
    </div>
  )
}
