import Link from 'next/link'
import { auth } from '../../../auth'
import { prisma } from '@robotspace/db'
import { signInForRegistry, suggestCompatibilityFromRobotAction } from '../../registry/actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirm robot compatibility', robots: { index: false, follow: false } }

export default async function NewCompatibilityPage({ searchParams }: { searchParams: Promise<{ robot?: string; result?: string }> }) {
  const { robot: requested, result } = await searchParams
  const robotSlug = requested && /^[a-z0-9][a-z0-9-]{0,254}$/.test(requested) ? requested : ''
  const robot = robotSlug ? await prisma.entities.findFirst({ where: { slug: robotSlug, entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true, slug: true } }) : null
  const projection = robot ? await prisma.robot_public_projections.findUnique({ where: { robot_entity_id: robot.id }, select: { canonical_name: true } }) : null
  const publicRobotSlug = projection?.canonical_name.toLowerCase().replace(/\s+/g, '-') ?? robotSlug
  const session = await auth()
  const userId = session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null
  const claims = userId ? await prisma.entity_claims.findMany({ where: { claimant_id: userId, status: 'VERIFIED' }, select: { entity_id: true } }) : []
  const projectEntities = claims.length ? await prisma.entities.findMany({ where: { id: { in: claims.map(claim => claim.entity_id) }, entity_type: 'PROJECT', archived_at: null }, select: { id: true, slug: true } }) : []
  const projects = projectEntities.length ? await prisma.software_packages.findMany({ where: { entity_id: { in: projectEntities.map(entity => entity.id) }, verification_status: { not: 'REJECTED' } }, select: { entity_id: true, canonical_name: true } }) : []
  return <main className="max-w-[720px] mx-auto px-6 py-12 space-y-6"><Link href={robot ? `/robots/${publicRobotSlug}` : '/robots'} className="text-sm underline">Back to robot</Link><h1 className="text-3xl font-semibold">Confirm compatibility</h1>{!robot ? <p>Choose a published robot first.</p> : <><p>Suggest a verified project that works with <strong>{projection?.canonical_name ?? robot.slug}</strong>. The relationship remains pending until its evidence is reviewed.</p><Link href="/faq#compatibility" className="text-sm underline">Compatibility evidence and review explained</Link>{result && <p role="status" className="rounded-lg border p-3">{result === 'PENDING' ? 'Compatibility submitted for review.' : result === 'ACCOUNT' ? 'Sign in with GitHub first.' : 'The suggestion could not be submitted. Check ownership and the evidence URL.'}</p>}{!userId ? <form action={signInForRegistry}><input type="hidden" name="target" value={`/compatibility/new?robot=${robot.slug}`} /><button className="rounded-md border px-4 py-2">Sign in with GitHub</button></form> : projects.length === 0 ? <p>Claim a project before confirming compatibility. <Link href="/projects/new" className="underline">Add project</Link></p> : <form action={suggestCompatibilityFromRobotAction} className="space-y-4"><input type="hidden" name="robot" value={robot.slug} /><label className="block">Your project<select name="project" required className="mt-1 block w-full rounded-md border p-3"><option value="">Choose a project</option>{projects.map(project => { const entity = projectEntities.find(item => item.id === project.entity_id); return entity ? <option key={entity.id} value={entity.slug}>{project.canonical_name}</option> : null })}</select></label><label className="block">Evidence URL<input name="evidence" type="url" required placeholder="https://github.com/owner/repo/..." className="mt-1 block w-full rounded-md border p-3" /></label><button className="rounded-md border px-4 py-2">Submit for review</button></form>}</>}
  </main>
}
