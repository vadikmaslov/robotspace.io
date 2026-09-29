import Link from 'next/link'
import { prisma } from '@robotspace/db'
import { reviewCompatibilitySuggestion, reviewConfirmation, reviewCorrection } from './actions'

export const dynamic = 'force-dynamic'

export default async function RegistryReviewPage() {
  const [corrections, confirmations, suggestions] = await Promise.all([
    prisma.registry_corrections.findMany({ where: { status: 'PENDING' }, orderBy: { created_at: 'asc' }, take: 100 }),
    prisma.compatibility_confirmations.findMany({ where: { status: 'PENDING' }, orderBy: { created_at: 'asc' }, take: 100 }),
    prisma.compatibility_claims.findMany({ where: { project_id: { not: null }, claim_status: 'SUGGESTED' }, orderBy: { created_at: 'asc' }, take: 100 }),
  ])
  const compatibilityIds = [...new Set([...confirmations.map(item => item.compatibility_id), ...suggestions.map(item => item.id)])]
  const compatibility = compatibilityIds.length ? await prisma.compatibility_claims.findMany({ where: { id: { in: compatibilityIds } }, select: { id: true, project_id: true, robot_id: true } }) : []
  const projectIds = compatibility.map(item => item.project_id).filter((id): id is string => Boolean(id))
  const robotIds = compatibility.map(item => item.robot_id).filter((id): id is string => Boolean(id))
  const userIds = [...new Set(confirmations.map(item => item.user_id))]
  const [correctionEntities, projects, robots, evidence, suggestionEvidence, profiles, reputation] = await Promise.all([
    corrections.length ? prisma.entities.findMany({ where: { id: { in: corrections.map(item => item.entity_id) } }, select: { id: true, slug: true } }) : [],
    projectIds.length ? prisma.software_packages.findMany({ where: { id: { in: projectIds } }, select: { id: true, canonical_name: true } }) : [],
    robotIds.length ? prisma.robot_public_projections.findMany({ where: { robot_entity_id: { in: robotIds } }, select: { robot_entity_id: true, canonical_name: true } }) : [],
    corrections.length || confirmations.length ? prisma.registry_evidence.findMany({ where: { id: { in: [...corrections.map(item => item.evidence_id), ...confirmations.map(item => item.evidence_id)] } }, select: { id: true, url: true } }) : [],
    suggestions.length ? prisma.registry_evidence.findMany({ where: { compatibility_id: { in: suggestions.map(item => item.id) } }, select: { compatibility_id: true, url: true } }) : [],
    userIds.length ? prisma.developer_profiles.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, handle: true, display_name: true } }) : [],
    userIds.length ? prisma.registry_reputation_events.groupBy({ by: ['user_id'], where: { user_id: { in: userIds } }, _sum: { points: true } }) : [],
  ])
  const compatibilityById = new Map(compatibility.map(item => [item.id, item]))
  const label = (id: string) => {
    const item = compatibilityById.get(id)
    const project = projects.find(row => row.id === item?.project_id)?.canonical_name ?? 'Project'
    const robot = robots.find(row => row.robot_entity_id === item?.robot_id)?.canonical_name ?? 'Robot'
    return `${project} → ${robot}`
  }
  return <div className="space-y-8"><div><h1 className="text-2xl font-semibold">Registry review</h1><p className="mt-2 text-sm">Review evidence and history. Reputation is context only and never decides a verdict automatically.</p></div>
    <section><h2 className="text-xl font-medium">Corrections ({corrections.length})</h2><div className="mt-3 space-y-3">{corrections.map(item => <article key={item.id} className="rounded-lg border p-4 space-y-2"><p className="font-medium">{correctionEntities.find(entity => entity.id === item.entity_id)?.slug ?? 'Entity'}</p><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(item.proposed_value, null, 2)}</pre><a className="text-sm underline break-all" href={evidence.find(source => source.id === item.evidence_id)?.url ?? '#'} target="_blank" rel="noopener noreferrer">View evidence</a><form action={reviewCorrection} className="flex gap-3"><input type="hidden" name="correction" value={item.id} /><button name="decision" value="ACCEPTED" className="rounded border px-3 py-1">Accept</button><button name="decision" value="REJECTED" className="rounded border px-3 py-1">Reject</button></form></article>)}{!corrections.length && <p>No pending corrections.</p>}</div></section>
    <section><h2 className="text-xl font-medium">Compatibility suggestions ({suggestions.length})</h2><div className="mt-3 space-y-3">{suggestions.map(item => <article key={item.id} className="rounded-lg border p-4 space-y-2"><p className="font-medium">{label(item.id)}</p>{suggestionEvidence.filter(source => source.compatibility_id === item.id).map(source => <a key={source.url} className="block text-sm underline break-all" href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>)}<Link href={`/admin/registry/compatibility/${item.id}`} className="text-sm underline">Full history</Link><form action={reviewCompatibilitySuggestion} className="flex gap-3"><input type="hidden" name="compatibility" value={item.id} /><button name="decision" value="ACCEPTED" className="rounded border px-3 py-1">Verify</button><button name="decision" value="REJECTED" className="rounded border px-3 py-1">Reject</button></form></article>)}{!suggestions.length && <p>No pending suggestions.</p>}</div></section>
    <section><h2 className="text-xl font-medium">Community reports ({confirmations.length})</h2><div className="mt-3 space-y-3">{confirmations.map(item => { const profile = profiles.find(person => person.user_id === item.user_id); const points = reputation.find(row => row.user_id === item.user_id)?._sum.points ?? 0; return <article key={item.id} className="rounded-lg border p-4 space-y-2"><div className="flex flex-wrap justify-between gap-3"><p className="font-medium">{label(item.compatibility_id)}</p><strong>{item.verdict === 'CONFIRMED' ? 'CONFIRM' : 'DISPUTE'}</strong></div><p className="text-sm">{profile ? `${profile.display_name ?? profile.handle} (@${profile.handle})` : 'Registry participant'} · {points} reputation point{points === 1 ? '' : 's'}</p><a className="text-sm underline break-all" href={evidence.find(source => source.id === item.evidence_id)?.url ?? '#'} target="_blank" rel="noopener noreferrer">View evidence</a><Link href={`/admin/registry/compatibility/${item.compatibility_id}`} className="ml-4 text-sm underline">Full history</Link><form action={reviewConfirmation} className="flex gap-3"><input type="hidden" name="confirmation" value={item.id} /><button name="decision" value="ACCEPTED" className="rounded border px-3 py-1">Accept report</button><button name="decision" value="REJECTED" className="rounded border px-3 py-1">Reject report</button></form></article>})}{!confirmations.length && <p>No pending community reports.</p>}</div></section>
  </div>
}
