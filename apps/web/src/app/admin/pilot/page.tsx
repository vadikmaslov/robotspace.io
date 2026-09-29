import Link from 'next/link'
import { prisma } from '@robotspace/db'
import { robotUrl } from '../../../lib/public-urls'
import { auth } from '../../../auth'
import { redirect } from 'next/navigation'
import { pilotMetricsSql, pilotTeamIds, type PilotMetrics } from '../../../lib/pilot-metrics'

export const dynamic = 'force-dynamic'

const windows = [30, 60, 90] as const
type Window = typeof windows[number]

function parseWindow(value: string | undefined): Window {
  const days = Number(value)
  return windows.includes(days as Window) ? days as Window : 30
}

function iso(value: Date) { return value.toISOString().slice(0, 10) }
function number(value: number) { return new Intl.NumberFormat('en-US').format(value) }

export default async function PilotDashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if ((await auth())?.user?.sessionKind !== 'admin') redirect('/admin/login')
  let teamIds: string[]
  try { teamIds = pilotTeamIds(process.env.PILOT_TEAM_GITHUB_IDS) } catch { teamIds = [] }
  if (!teamIds.length) return <div><h1>Registry pilot dashboard</h1><p>External participation metrics are unavailable until private PILOT_TEAM_GITHUB_IDS is configured with owner and test-account GitHub IDs. No accounts are assumed to be external by default.</p></div>
  const now = new Date()
  const days = parseWindow((await searchParams).days)
  const cohort = await prisma.pilot_robot_cohort.findMany({ orderBy: { added_at: 'asc' }, select: { robot_entity_id: true, added_at: true } })
  const startedAt = cohort[0]?.added_at ?? null
  const endAt = startedAt ? new Date(startedAt.getTime() + days * 86_400_000) : null
  const until = endAt && endAt < now ? endAt : now
  const cohortIds = cohort.map(item => item.robot_entity_id)

  const publicIds = await prisma.entities.findMany({ where: { id: { in: cohortIds }, entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true } })
  const cohortRobots = await prisma.robot_public_projections.findMany({ where: { robot_entity_id: { in: publicIds.map(item => item.id) }, lifecycle_status: 'ACTIVE' }, select: { robot_entity_id: true, canonical_name: true } })
  const [metrics] = await prisma.$queryRawUnsafe<PilotMetrics[]>(pilotMetricsSql, teamIds, days, now)
  const elapsed = startedAt ? Math.min(days, Math.max(0, Math.ceil((until.getTime() - startedAt.getTime()) / 86_400_000))) : 0
  const cohortWarning = cohort.length > 0 && cohort.length < 100

  return <div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-accent-data)' }}>Phase 11</p><h1 className="text-2xl font-semibold">Registry pilot dashboard</h1><p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--color-text-muted)' }}>A fixed sample measures whether developers and manufacturers contribute independently. It is not a marketplace, CLI or maturity score.</p></div><Link href="/admin" className="text-sm underline">Admin dashboard</Link></div>

    {!startedAt ? <section className="rounded-xl border p-6" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium">Pilot cohort is not available yet</h2><p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Apply migration 44 to select up to 150 published robots with at least three quality signals.</p></section> : <>
      <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-medium">Fixed pilot cohort</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>{number(cohort.length)} strong robot pages selected on {iso(startedAt)}. The sample remains unchanged during the pilot.</p></div><span className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>{elapsed} of {days} days observed</span></div>{cohortWarning && <p className="mt-4 text-sm" style={{ color: 'var(--color-accent-decline)' }}>The automatic sample has fewer than 100 pages. Add verified robot data before interpreting a Go / No-Go result.</p>}</section>

      <nav className="flex gap-2" aria-label="Pilot reporting window">{windows.map(window => <Link key={window} href={`/admin/pilot?days=${window}`} aria-current={window === days ? 'page' : undefined} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--color-border-color)', background: window === days ? 'var(--color-bg-elevated)' : undefined }}>{window}-day report</Link>)}</nav>

      <p className="text-sm">Owner/test accounts and moderators are excluded from external participation ({metrics.team_accounts} matched team accounts). Counts cover only the fixed cohort and its currently published, verified project links. Windows are measured from pilot start, not rolling dates. Publication and moderation statuses are current, so earlier reports can change.</p>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Externally claimed projects" value={metrics.projects} note="Unique published projects linked to cohort robots; external ownership requests submitted in this window and currently verified." /><Metric label="Participating developers" value={metrics.developers} note="Unique external accounts with a published developer profile and cohort activity in this window. Not identity verification." /><Metric label="Independent compatibility reports" value={metrics.reports} note="One per person/project/robot, excluding owners, authors, team and rejected reports. Pending reports are included, not proof of compatibility." /><Metric label="Robots with 3+ claimed projects" value={`${metrics.covered} / ${cohort.length}`} note="Three distinct externally claimed projects, not three links or revisions. Uses the same window and publication rules." /><Metric label="External manufacturer claims" value={metrics.manufacturers} note="Unique published cohort manufacturers with a currently verified DNS claim submitted by an external account in this window." /><Metric label="External / team or system events" value={`${metrics.external_actions} / ${metrics.team_actions}`} note={`Cohort audit events, not unique people or successful contributions. Unclassified/inactive account events: ${metrics.unknown_actions}.`} /></section>

      <section className="rounded-xl border p-5 space-y-3" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium">What this report cannot tell you</h2><p>Visitor analytics are disabled. Traffic, repeat visits and GitHub transitions are not measured here; missing data is not zero demand. These counters alone do not justify a GO / NO-GO decision.</p><p>Invite people from this fixed cohort, then review their verified contributions at 30, 60 and 90 days. External means an active GitHub account outside the configured team list, not a proven independent human. Add any additional team/test accounts to the private exclusion list.</p></section>

      <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium">Cohort pages</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>Use this stable list for a limited, human-managed invitation round.</p><div className="mt-4 flex flex-wrap gap-2">{cohortRobots.map(item => <Link key={item.robot_entity_id} href={robotUrl(item.canonical_name)} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--color-border-color)' }}>{item.canonical_name}</Link>)}</div></section>
    </>}
  </div>
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return <article className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>{label}</p><p className="mt-2 text-2xl font-mono" style={{ color: 'var(--color-text-heading)' }}>{typeof value === 'number' ? number(value) : value}</p><p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{note}</p></article>
}
