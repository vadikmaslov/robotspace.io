import Link from 'next/link'
import { auth } from '../../auth'
import { prisma } from '@robotspace/db'
import { revokeProjectClaim, signInForClaim, submitProjectClaim } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Claim a project', robots: { index: false, follow: false } }

const results: Record<string, string> = {
  VERIFIED: 'GitHub confirmed that you administer this repository. Your claim is verified.',
  REVOKED: 'Your claim was revoked.',
  DISABLED: 'Project claims are not available yet.',
  ACCOUNT: 'Sign in with GitHub to continue.',
  TOKEN_EXPIRED: 'Your GitHub verification window expired. Sign in with GitHub again.',
  PROJECT: 'This project could not be claimed.',
  RATE_LIMIT: 'Too many attempts or GitHub is rate limited. Please try again later.',
  DENIED: 'GitHub did not confirm that you administer this repository.',
  REVIEW: 'GitHub could not confirm the permissions. The claim is pending review.',
  GITHUB_ERROR: 'GitHub verification is temporarily unavailable. Please try again.',
}

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ project?: string; result?: string }> }) {
  const { project: requestedSlug, result } = await searchParams
  const slug = typeof requestedSlug === 'string' && /^[a-z0-9][a-z0-9-]{0,254}$/.test(requestedSlug) ? requestedSlug : ''
  const session = await auth()
  const isRegistryUser = session?.user?.sessionKind === 'registry' && Boolean(session.user.registryUserId)
  let project: { id: string; name: string; repositoryUrl: string } | null = null
  let currentClaim: { id: string; status: string } | null = null
  let available = false
  try {
    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development'
    const flags = await prisma.feature_flags.findMany({ where: { key: 'registry.claims', environment: { in: [environment, 'all'] } }, select: { environment: true, enabled: true } })
    available = (flags.find(row => row.environment === environment) ?? flags.find(row => row.environment === 'all'))?.enabled === true
    if (slug) {
      const entity = await prisma.entities.findFirst({ where: { slug, entity_type: 'PROJECT', archived_at: null }, select: { id: true } })
      const packageRow = entity && await prisma.software_packages.findUnique({ where: { entity_id: entity.id }, select: { canonical_name: true, repository_url: true } })
      if (entity && packageRow?.repository_url) {
        project = { id: entity.id, name: packageRow.canonical_name, repositoryUrl: packageRow.repository_url }
        if (isRegistryUser) currentClaim = await prisma.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: session!.user!.registryUserId! }, orderBy: { created_at: 'desc' }, select: { id: true, status: true } })
      }
    }
  } catch { available = false }
  const message = result && Object.hasOwn(results, result) ? results[result] : null

  return <div className="max-w-[720px] mx-auto px-6 py-12">
    <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}><Link href="/registry">Registry</Link> / Claim project</p>
    <h1 className="text-3xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Claim a project</h1>
    <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>Connect your GitHub account and confirm that you administer the project's public repository.</p><Link href="/faq#claim-project" className="mt-2 inline-block text-sm underline" style={{ color: 'var(--color-text-muted)' }}>How ownership verification works</Link>
    {message && <p role="status" className="mt-6 rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>{message}</p>}
    {!available ? <p className="mt-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Project claims are being prepared.</p> : !project ? <p className="mt-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Open a project in Registry and choose Claim project.</p> : <section className="mt-8 rounded-xl border p-6" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}>
      <h2 className="text-lg font-medium">{project.name}</h2><p className="mt-1 text-xs break-all" style={{ color: 'var(--color-text-muted)' }}>{project.repositoryUrl}</p>
      {currentClaim && <p className="mt-4 text-sm">Your claim: {currentClaim.status.toLowerCase()}</p>}
      {!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET ? <p className="mt-4 text-sm">GitHub sign-in is not configured yet.</p> : <div className="mt-5 flex flex-wrap gap-3">
        <form action={signInForClaim}><input type="hidden" name="project" value={slug} /><button className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>{isRegistryUser ? 'Reconnect GitHub' : 'Sign in with GitHub'}</button></form>
        {isRegistryUser && <form action={submitProjectClaim}><input type="hidden" name="project" value={slug} /><button className="rounded-md px-4 py-2 text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>{currentClaim?.status === 'VERIFIED' ? 'Recheck ownership' : 'Confirm ownership'}</button></form>}
        {isRegistryUser && currentClaim?.status === 'VERIFIED' && <form action={revokeProjectClaim}><input type="hidden" name="project" value={slug} /><input type="hidden" name="claim" value={currentClaim.id} /><button className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>Revoke claim</button></form>}
      </div>}
    </section>}
    {isRegistryUser && currentClaim?.status === 'VERIFIED' && <div className="mt-6 flex gap-4 text-sm"><Link href={`/projects/${slug}/manage`} className="underline">Manage project</Link><Link href="/developers/new" className="underline">Create developer profile</Link></div>}
  </div>
}
