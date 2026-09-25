import { prisma } from '@robotspace/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  let dbHealthy = false
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ one: number }>>('SELECT 1 as one')
    dbHealthy = result?.length > 0
  } catch {}

  let publishedRobots = 0, publishedCompanies = 0, openExceptions = 0

  try {
    [publishedRobots, publishedCompanies, openExceptions] = await Promise.all([
      prisma.robot_public_projections.count(),
      prisma.company_public_projections.count(),
      prisma.exceptions.count({ where: { state: 'OPEN' } }),
    ])
  } catch {}

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Dashboard</h1>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Database" value={dbHealthy ? 'Healthy' : 'Error'} ok={dbHealthy} />
        <KpiCard label="Robots" value={String(publishedRobots)} />
        <KpiCard label="Companies" value={String(publishedCompanies)} />
        <KpiCard label="Open Exceptions" value={String(openExceptions)} ok={openExceptions === 0} />
      </section>

      <section className="p-6 rounded-xl space-y-3" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Setup Progress</h2>
        {[
          { label: 'Categories seeded', done: true },
          { label: 'Admin user configured', done: true },
          { label: 'First robot published', done: publishedRobots > 0 },
          { label: 'First company published', done: publishedCompanies > 0 },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3 text-sm" style={{ color: item.done ? 'var(--color-accent-growth)' : 'var(--color-text-dim)' }}>
            {item.done ? '✓' : '○'} {item.label}
          </div>
        ))}
      </section>
    </div>
  )
}

function KpiCard({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const color = ok === undefined ? 'var(--color-text-heading)' : ok ? 'var(--color-accent-growth)' : 'var(--color-accent-decline)'
  return (
    <div className="px-5 py-4 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
      <div className="text-xl font-mono font-medium" style={{ color }}>{value}</div>
    </div>
  )
}
