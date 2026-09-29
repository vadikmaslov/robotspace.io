import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '../../../../auth'
import { prisma } from '@robotspace/db'
import { saveProjectAction, suggestCompatibilityAction } from '../../../registry/actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manage project', robots: { index: false, follow: false } }
export default async function ManageProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ result?: string }> }) {
  const slug = (await params).slug
  const session = await auth()
  const userId = session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null
  if (!userId) redirect(`/claim?project=${encodeURIComponent(slug)}`)
  const entity = await prisma.entities.findFirst({ where: { slug, entity_type: 'PROJECT', archived_at: null } })
  if (!entity) notFound()
  const claim = await prisma.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: 'VERIFIED' }, select: { id: true } })
  if (!claim) notFound()
  const project = await prisma.software_packages.findUnique({ where: { entity_id: entity.id } })
  if (!project) notFound()
  const robots = await prisma.entities.findMany({ where: { entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true, slug: true }, orderBy: { slug: 'asc' }, take: 200 })
  const names = robots.length ? await prisma.robot_public_projections.findMany({ where: { robot_entity_id: { in: robots.map(robot => robot.id) } }, select: { robot_entity_id: true, canonical_name: true } }) : []
  const { result } = await searchParams
  const message = result === 'UPDATED' ? 'Draft metadata saved.' : result === 'PENDING' ? 'Metadata submitted for review.' : result === 'COMPATIBILITY_PENDING' ? 'Compatibility suggested for review.' : result ? 'Action could not be completed. Check your input and permissions.' : ''
  return <main className="max-w-[800px] mx-auto px-6 py-12 space-y-8"><Link href="/registry" className="text-sm underline">Registry</Link><h1 className="text-3xl font-semibold">Manage {project.canonical_name}</h1><p className="text-sm">Verified owner · {entity.publication_status.toLowerCase()} project · {project.verification_status.toLowerCase()} project data</p>{message && <p role="status" className="rounded-lg border p-3">{message}</p>}
    <section><h2 className="text-xl font-medium">Project metadata</h2><p className="mt-2 text-sm">Draft changes save immediately. Changes to published projects wait for moderation.</p><form action={saveProjectAction} className="mt-4 space-y-3"><input type="hidden" name="project" value={slug} /><label className="block">Name<input name="name" required maxLength={255} defaultValue={project.canonical_name} className="mt-1 block w-full rounded-md border p-2" /></label><label className="block">Description<textarea name="description" maxLength={4000} defaultValue={project.description ?? ''} className="mt-1 block w-full rounded-md border p-2" /></label><label className="block">Homepage<input name="homepage" type="url" defaultValue={project.homepage_url ?? ''} className="mt-1 block w-full rounded-md border p-2" /></label><label className="block">License identifier<input name="license" maxLength={100} defaultValue={project.license_id ?? ''} className="mt-1 block w-full rounded-md border p-2" /></label><label className="block">Evidence URL<input name="evidence" type="url" required defaultValue={project.repository_url ?? ''} className="mt-1 block w-full rounded-md border p-2" /></label><button className="rounded-md border px-4 py-2">Save metadata</button></form></section>
    <section><h2 className="text-xl font-medium">Suggest robot compatibility</h2><p className="mt-2 text-sm">Add a source showing that this project works with a robot. The relationship stays unverified until reviewed.</p><form action={suggestCompatibilityAction} className="mt-4 space-y-3"><input type="hidden" name="project" value={slug} /><label className="block">Robot<select name="robot" required className="mt-1 block w-full rounded-md border p-2"><option value="">Choose a robot</option>{robots.map(robot => <option key={robot.id} value={robot.slug}>{names.find(name => name.robot_entity_id === robot.id)?.canonical_name ?? robot.slug}</option>)}</select></label><label className="block">Evidence URL<input name="evidence" type="url" required placeholder="https://..." className="mt-1 block w-full rounded-md border p-2" /></label><button className="rounded-md border px-4 py-2">Suggest compatibility</button></form></section>
    <p className="text-sm"><Link href="/notifications" className="underline">Moderation notifications</Link> · <Link href={`/corrections/new?entity=${slug}`} className="underline">Submit correction</Link></p>
  </main>
}
