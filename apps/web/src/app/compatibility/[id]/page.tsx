import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '../../../auth'
import { prisma } from '@robotspace/db'
import { getPublicCompatibility } from '../../../lib/registry-public'
import { confirmCompatibilityAction, signInForRegistry } from '../../registry/actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compatibility evidence', robots: { index: false, follow: true } }

function date(value: Date | null) { return value ? value.toISOString().slice(0, 10) : null }

export default async function CompatibilityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ result?: string }> }) {
  const { id } = await params
  const { result } = await searchParams
  const data = await getPublicCompatibility(id)
  if (!data) notFound()
  const { project, compatibility } = data
  const session = await auth()
  const userId = session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null
  const [existing, owner] = userId ? await Promise.all([
    prisma.compatibility_confirmations.findUnique({ where: { compatibility_id_user_id: { compatibility_id: id, user_id: userId } } }),
    prisma.entity_claims.findFirst({ where: { entity_id: project.entityId, claimant_id: userId, status: 'VERIFIED' }, select: { id: true } }),
  ]) : [null, null]
  const trust = compatibility.communityTrust
  const label = trust.status === 'DISPUTED' ? 'Community reports conflict' : trust.status === 'COMMUNITY_CONFIRMED' ? 'Community confirmed' : 'Editorially verified'
  return <main className="max-w-[900px] mx-auto px-6 py-12 space-y-6">
    <div className="text-sm"><Link href={`/projects/${project.slug}`} className="underline">{project.name}</Link><span className="mx-2">/</span><span>Compatibility evidence</span></div>
    <header><p className="text-xs uppercase tracking-wider" style={{ color: trust.status === 'DISPUTED' ? 'var(--color-warning, #d9a441)' : 'var(--color-accent-data)' }}>{label}</p><h1 className="mt-2 text-3xl font-semibold">{project.name} and {compatibility.robotName}</h1><p className="mt-3" style={{ color: 'var(--color-text-muted)' }}>RobotSpace verified the relationship from submitted evidence. Accepted community reports are shown independently and never overwrite one another.</p></header>
    <section className="grid sm:grid-cols-3 gap-3" aria-label="Community trust summary"><div className="rounded-xl border p-4"><div className="text-2xl font-semibold">{trust.confirmedCount}</div><div className="text-sm">accepted confirmations</div></div><div className="rounded-xl border p-4"><div className="text-2xl font-semibold">{trust.disputedCount}</div><div className="text-sm">accepted disputes</div></div><div className="rounded-xl border p-4"><div className="text-sm font-medium">{date(compatibility.verifiedAt) ?? 'Not recorded'}</div><div className="text-sm">editorial verification</div></div></section>
    <section className="rounded-xl border p-5"><h2 className="text-xl font-medium">Editorial evidence</h2>{compatibility.evidence.length ? <ul className="mt-3 space-y-2">{compatibility.evidence.map(source => <li key={`${source.url}-${source.observedAt.toISOString()}`}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{source.kind.toLowerCase().replaceAll('_', ' ')}</a><span className="ml-2 text-xs" style={{ color: 'var(--color-text-dim)' }}>{date(source.observedAt)}</span></li>)}</ul> : <p className="mt-3 text-sm">No public editorial source is available.</p>}</section>
    <section className="rounded-xl border p-5"><h2 className="text-xl font-medium">Accepted community reports</h2>{trust.reports.length ? <div className="mt-4 space-y-3">{trust.reports.map((report, index) => <article key={`${report.evidenceUrl}-${index}`} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{report.verdict === 'CONFIRMED' ? 'Confirmed' : 'Disputed'}</strong><span className="text-xs">{date(report.observedAt)}</span></div><p className="mt-2 text-sm">Contributor: {report.handle ? <Link href={`/developers/${report.handle}`} className="underline">{report.displayName ?? `@${report.handle}`}</Link> : 'Registry participant'} · {report.reputation} reputation point{report.reputation === 1 ? '' : 's'}</p><a href={report.evidenceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm underline break-all">Review evidence</a></article>)}</div> : <p className="mt-3 text-sm">No community report has passed moderation yet.</p>}<p className="mt-4 text-xs" style={{ color: 'var(--color-text-dim)' }}>Reputation provides context only. It never lets one contributor decide whether compatibility is true.</p></section>
    <section className="rounded-xl border p-5"><h2 className="text-xl font-medium">Share independent experience</h2><p className="mt-2 text-sm">Choose confirm or dispute and provide a public HTTPS source. One account can submit one report for this relationship. Every report is moderated.</p>{result && <p role="status" className="mt-3 rounded-lg border p-3">{result === 'PENDING' ? 'Your report was submitted for moderation.' : result === 'ACCOUNT' ? 'Sign in with GitHub first.' : 'The report could not be submitted. You may already have a report, own the project, or have an invalid evidence URL.'}</p>}{!userId ? <form action={signInForRegistry} className="mt-4"><input type="hidden" name="target" value={`/compatibility/${id}`} /><button className="rounded-md border px-4 py-2">Sign in with GitHub</button></form> : owner ? <p className="mt-3 text-sm">Verified project owners cannot add an independent community report about their own compatibility.</p> : existing ? <p className="mt-3 text-sm">Your {existing.verdict.toLowerCase()} report is {existing.status.toLowerCase()} and remains in the audit history.</p> : <form action={confirmCompatibilityAction} className="mt-4 space-y-4"><input type="hidden" name="compatibility" value={id} /><fieldset><legend className="font-medium">Your finding</legend><label className="mt-2 mr-5 inline-flex gap-2"><input type="radio" name="verdict" value="CONFIRMED" required /> Works as described</label><label className="mt-2 inline-flex gap-2"><input type="radio" name="verdict" value="DISPUTED" required /> Does not work as described</label></fieldset><label className="block">Evidence URL<input type="url" name="evidence" required placeholder="https://..." className="mt-1 block w-full rounded-md border p-2" /></label><button className="rounded-md border px-4 py-2">Submit for moderation</button></form>}</section>
  </main>
}
