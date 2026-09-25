import { prisma } from '@robotspace/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminCompaniesPage() {
  let companies: any[] = []
  try {
    companies = await prisma.company_public_projections.findMany({ orderBy: { canonical_name: 'asc' } })
    for (const c of companies) {
      c.robotCount = await prisma.robot_company_relations.count({ where: { company_entity_id: c.company_entity_id } })
    }
  } catch {}

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Companies ({companies.length})</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: 'var(--color-border-color)' }}>
            <th className="py-3 pr-4 text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Company</th>
            <th className="py-3 pr-4 text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Country</th>
            <th className="py-3 pr-4 text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Robots</th>
            <th className="py-3 text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c: any) => (
            <tr key={c.id} className="border-b" style={{ borderColor: 'var(--color-border-color)' }}>
              <td className="py-3 pr-4" style={{ color: 'var(--color-text-body)' }}>{c.canonical_name}</td>
              <td className="py-3 pr-4" style={{ color: 'var(--color-text-muted)' }}>{c.country_code || '—'}</td>
              <td className="py-3 pr-4" style={{ color: 'var(--color-text-muted)' }}>{c.robotCount}</td>
              <td className="py-3">
                <Link href={`/admin/companies/${c.company_entity_id}`} className="text-xs px-3 py-1.5 rounded-md border"
                  style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
