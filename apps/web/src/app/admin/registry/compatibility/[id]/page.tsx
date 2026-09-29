import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@robotspace/db'

export const dynamic = 'force-dynamic'

export default async function AdminCompatibilityHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const compatibility = await prisma.compatibility_claims.findUnique({ where: { id } })
  if (!compatibility?.project_id || !compatibility.robot_id) notFound()
  const [project, robot, evidence, reports, changes] = await Promise.all([
    prisma.software_packages.findUnique({ where: { id: compatibility.project_id }, select: { canonical_name: true } }),
    prisma.robot_public_projections.findUnique({ where: { robot_entity_id: compatibility.robot_id }, select: { canonical_name: true } }),
    prisma.registry_evidence.findMany({ where: { compatibility_id: id }, orderBy: { observed_at: 'asc' } }),
    prisma.compatibility_confirmations.findMany({ where: { compatibility_id: id }, orderBy: { created_at: 'asc' } }),
    prisma.registry_changes.findMany({ where: { compatibility_id: id }, orderBy: { created_at: 'asc' } }),
  ])
  const users = reports.length ? await prisma.developer_profiles.findMany({ where: { user_id: { in: reports.map(report => report.user_id) } }, select: { user_id: true, handle: true, display_name: true } }) : []
  const points = reports.length ? await prisma.registry_reputation_events.groupBy({ by: ['user_id'], where: { user_id: { in: reports.map(report => report.user_id) } }, _sum: { points: true } }) : []
  return <main className="space-y-8"><div><Link href="/admin/registry/review" className="text-sm underline">Registry review</Link><h1 className="mt-3 text-2xl font-semibold">Compatibility history</h1><p className="mt-2">{project?.canonical_name ?? 'Project'} → {robot?.canonical_name ?? 'Robot'} · {compatibility.claim_status.toLowerCase()} · revision {compatibility.revision}</p></div>
    <section><h2 className="text-xl font-medium">Evidence</h2><div className="mt-3 space-y-2">{evidence.map(item => <article key={item.id} className="rounded border p-3 text-sm"><span>{item.kind.toLowerCase().replaceAll('_', ' ')} · {item.observed_at.toISOString()}</span><a href={item.url} target="_blank" rel="noopener noreferrer" className="block underline break-all">{item.url}</a></article>)}</div></section>
    <section><h2 className="text-xl font-medium">Independent reports</h2><div className="mt-3 space-y-2">{reports.map(report => { const profile = users.find(user => user.user_id === report.user_id); const reputation = points.find(row => row.user_id === report.user_id)?._sum.points ?? 0; return <article key={report.id} className="rounded border p-3 text-sm"><strong>{report.verdict}</strong> · {report.status.toLowerCase()} · {profile?.display_name ?? profile?.handle ?? report.user_id} · reputation {reputation}<span className="block text-xs">Evidence {report.evidence_id} · created {report.created_at.toISOString()}</span></article>})}{!reports.length && <p>No community reports.</p>}</div></section>
    <section><h2 className="text-xl font-medium">Append-only change chain</h2><div className="mt-3 space-y-2">{changes.map(change => <article key={change.id} className="rounded border p-3"><div className="text-sm font-medium">{change.created_at.toISOString()} · {change.action}</div><pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ actor: change.actor_id, evidence: change.evidence_id, before: change.before_value, after: change.after_value }, null, 2)}</pre></article>)}</div></section>
  </main>
}
