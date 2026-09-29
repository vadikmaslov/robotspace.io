import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '../../../auth'
import { prisma } from '@robotspace/db'

export const dynamic = 'force-dynamic'
export default async function DeveloperPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await prisma.developer_profiles.findUnique({ where: { handle } })
  if (!profile) notFound()
  const [entity, user] = await Promise.all([prisma.entities.findUnique({ where: { id: profile.entity_id } }), prisma.registry_users.findUnique({ where: { id: profile.user_id } })])
  if (entity?.publication_status !== 'PUBLISHED' || entity.archived_at || user?.status !== 'ACTIVE') notFound()
  const claims = await prisma.entity_claims.findMany({ where: { claimant_id: profile.user_id, status: 'VERIFIED' }, select: { entity_id: true } })
  const projectEntities = await prisma.entities.findMany({ where: { id: { in: claims.map(claim => claim.entity_id) }, entity_type: 'PROJECT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true, slug: true } })
  const projects = await prisma.software_packages.findMany({ where: { entity_id: { in: projectEntities.map(item => item.id) }, verification_status: 'VERIFIED' }, select: { entity_id: true, canonical_name: true } })
  const projectIds = projects.map(item => item.entity_id!).filter(Boolean)
  const compatible = projectIds.length ? await prisma.compatibility_claims.findMany({ where: { project_id: { in: projectIds }, claim_status: 'VERIFIED' }, select: { robot_id: true } }) : []
  const robotEntities = compatible.length ? await prisma.entities.findMany({ where: { id: { in: compatible.map(item => item.robot_id!).filter(Boolean) }, entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true, slug: true } }) : []
  const robotNames = robotEntities.length ? await prisma.robot_public_projections.findMany({ where: { robot_entity_id: { in: robotEntities.map(item => item.id) } }, select: { robot_entity_id: true, canonical_name: true } }) : []
  const reputationEvents = await prisma.registry_reputation_events.findMany({ where: { user_id: profile.user_id }, select: { event_type: true, points: true } })
  const reputation = reputationEvents.reduce((total, event) => total + event.points, 0)
  const reputationBreakdown = {
    ownership: reputationEvents.filter(event => event.event_type === 'CLAIM_VERIFIED').reduce((total, event) => total + event.points, 0),
    corrections: reputationEvents.filter(event => event.event_type === 'CORRECTION_ACCEPTED').reduce((total, event) => total + event.points, 0),
    compatibility: reputationEvents.filter(event => event.event_type.startsWith('COMPATIBILITY_')).reduce((total, event) => total + event.points, 0),
  }
  const session = await auth()
  const isOwner = session?.user?.sessionKind === 'registry' && session.user.registryUserId === profile.user_id
  return <main className="max-w-[980px] mx-auto px-6 py-12 space-y-8"><Link href="/registry" className="text-sm underline">Registry</Link><header><h1 className="text-3xl font-semibold">{profile.display_name ?? profile.handle}</h1><p className="mt-1 text-sm">@{profile.handle}</p>{profile.bio && <p className="mt-4 max-w-2xl">{profile.bio}</p>}</header>
    <section className="rounded-xl border p-5"><h2 className="text-xl font-medium">Reputation</h2><p className="mt-2 text-3xl font-semibold">{reputation}</p><p className="mt-3 text-sm">Verified ownership: {reputationBreakdown.ownership} · Accepted corrections: {reputationBreakdown.corrections} · Accepted compatibility work: {reputationBreakdown.compatibility}</p><p className="mt-2 text-xs" style={{ color: 'var(--color-text-dim)' }}>Only moderated or independently verified actions count. Reputation provides context and never gives one person authority to publish a fact.</p></section>
    <section><h2 className="text-xl font-medium">Claimed projects</h2>{projects.length ? <ul className="mt-3 space-y-2">{projects.map(project => { const item = projectEntities.find(entity => entity.id === project.entity_id); return <li key={project.entity_id}><Link className="underline" href={`/projects/${item?.slug}`}>{project.canonical_name}</Link></li> })}</ul> : <p className="mt-2">No published, verified projects yet.</p>}</section>
    <section><h2 className="text-xl font-medium">Supported robots</h2>{robotEntities.length ? <ul className="mt-3 space-y-2">{robotEntities.map(robot => <li key={robot.id}><Link className="underline" href={`/robots/${robot.slug}`}>{robotNames.find(name => name.robot_entity_id === robot.id)?.canonical_name ?? robot.slug}</Link></li>)}</ul> : <p className="mt-2">No verified robot compatibility yet.</p>}</section>
    {isOwner && <div className="flex gap-4 text-sm"><Link className="underline" href="/notifications">Notifications</Link><Link className="underline" href="/projects/new">Add project</Link></div>}
  </main>
}
