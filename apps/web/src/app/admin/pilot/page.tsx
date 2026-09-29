import Link from 'next/link'
import { prisma } from '@robotspace/db'

export const dynamic = 'force-dynamic'

const windows = [30, 60, 90] as const
type Window = typeof windows[number]

function parseWindow(value: string | undefined): Window {
  const days = Number(value)
  return windows.includes(days as Window) ? days as Window : 30
}

function iso(value: Date) { return value.toISOString().slice(0, 10) }
function number(value: number) { return new Intl.NumberFormat('en-US').format(value) }
function publicRobotSlug(name: string) { return name.toLowerCase().replace(/\s+/g, '-') }

export default async function PilotDashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parseWindow((await searchParams).days)
  const cohort = await prisma.pilot_robot_cohort.findMany({ orderBy: { added_at: 'asc' }, select: { robot_entity_id: true, added_at: true } })
  const startedAt = cohort[0]?.added_at ?? null
  const endAt = startedAt ? new Date(startedAt.getTime() + days * 86_400_000) : null
  const until = endAt && endAt < new Date() ? endAt : new Date()
  const inWindow = startedAt ? { gte: startedAt, lte: until } : undefined
  const cohortIds = cohort.map(item => item.robot_entity_id)

  const [cohortRobots, claimedProjects, profileEvents, compatibilityReports, manufacturerClaims, activity, compatibilityCounts] = await Promise.all([
    cohortIds.length ? prisma.robot_public_projections.findMany({ where: { robot_entity_id: { in: cohortIds }, lifecycle_status: 'ACTIVE' }, select: { robot_entity_id: true, canonical_name: true } }) : [],
    inWindow ? prisma.entity_claims.findMany({ where: { status: 'VERIFIED', created_at: inWindow }, select: { entity_id: true } }) : [],
    inWindow ? prisma.registry_changes.count({ where: { action: 'DEVELOPER_PROFILE_CREATED', actor_id: { not: null }, created_at: inWindow } }) : 0,
    inWindow ? prisma.compatibility_confirmations.count({ where: { created_at: inWindow } }) : 0,
    inWindow ? prisma.entity_claims.count({ where: { status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER', created_at: inWindow } }) : 0,
    inWindow ? prisma.registry_changes.groupBy({ by: ['actor_id'], where: { created_at: inWindow }, _count: { _all: true } }) : [],
    cohortIds.length ? prisma.compatibility_claims.groupBy({ by: ['robot_id'], where: { robot_id: { in: cohortIds }, project_id: { not: null }, claim_status: 'VERIFIED' }, _count: { _all: true } }) : [],
  ])

  const projectEntityIds = [...new Set(claimedProjects.map(item => item.entity_id))]
  const projects = projectEntityIds.length ? await prisma.entities.count({ where: { id: { in: projectEntityIds }, entity_type: 'PROJECT' } }) : 0
  const pagesWithThreeProjects = compatibilityCounts.filter(item => item._count._all >= 3).length
  const externalActions = activity.filter(item => item.actor_id !== null).reduce((sum, item) => sum + item._count._all, 0)
  const teamActions = activity.filter(item => item.actor_id === null).reduce((sum, item) => sum + item._count._all, 0)
  const elapsed = startedAt ? Math.min(days, Math.max(0, Math.ceil((until.getTime() - startedAt.getTime()) / 86_400_000))) : 0
  const cohortWarning = cohort.length > 0 && cohort.length < 100

  return <div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-accent-data)' }}>Phase 11</p><h1 className="text-2xl font-semibold">Registry pilot dashboard</h1><p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--color-text-muted)' }}>A fixed sample measures whether developers and manufacturers contribute independently. It is not a marketplace, CLI or maturity score.</p></div><Link href="/admin" className="text-sm underline">Admin dashboard</Link></div>

    {!startedAt ? <section className="rounded-xl border p-6" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium">Pilot cohort is not available yet</h2><p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Apply migration 44 to select up to 150 published robots with at least three quality signals.</p></section> : <>
      <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-medium">Fixed pilot cohort</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>{number(cohort.length)} strong robot pages selected on {iso(startedAt)}. The sample remains unchanged during the pilot.</p></div><span className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>{elapsed} of {days} days observed</span></div>{cohortWarning && <p className="mt-4 text-sm" style={{ color: 'var(--color-accent-decline)' }}>The automatic sample has fewer than 100 pages. Add verified robot data before interpreting a Go / No-Go result.</p>}</section>

      <nav className="flex gap-2" aria-label="Pilot reporting window">{windows.map(window => <Link key={window} href={`/admin/pilot?days=${window}`} aria-current={window === days ? 'page' : undefined} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--color-border-color)', background: window === days ? 'var(--color-bg-elevated)' : undefined }}>{window}-day report</Link>)}</nav>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Claimed projects" value={projects} note="Verified project claims created in this pilot window." /><Metric label="Verified developers" value={profileEvents} note="Profiles created by a signed-in Registry participant." /><Metric label="External compatibility" value={compatibilityReports} note="Independent community reports, before moderation outcome." /><Metric label="Pages with 3+ projects" value={`${pagesWithThreeProjects} / ${cohort.length}`} note="Published verified compatibilities in the fixed cohort." /><Metric label="Manufacturer claims" value={manufacturerClaims} note="Verified official-domain claims during the pilot." /><Metric label="External / team actions" value={`${externalActions} / ${teamActions}`} note="Audit events with an account vs system or editorial activity." /></section>

      <section className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="font-medium">Traffic and GitHub transitions</h2><p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>RobotSpace deliberately does not create a visitor ID, tracking cookie or IP log. Use the existing Yandex Metrika report for repeat visits and the <code>repository_link_opened</code> goal for RobotSpace → GitHub. Use its referrer report filtered to github.com for GitHub → RobotSpace.</p><a className="mt-3 inline-block text-sm underline" href="https://metrika.yandex.ru/" target="_blank" rel="noopener noreferrer">Open Yandex Metrika</a></section><section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="font-medium">Recruitment and decision</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm" style={{ color: 'var(--color-text-muted)' }}><li>Invite maintainers and manufacturers only from the fixed cohort.</li><li>Give each person the existing Add project, Claim project and Compatibility routes.</li><li>Review this dashboard at 30, 60 and 90 days with the Metrika traffic report.</li><li>Choose GO only when outside participants claim, maintain and validate data; choose NO-GO when the team remains the primary source of activity.</li></ol></section></section>

      <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium">Cohort pages</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>Use this stable list for a limited, human-managed invitation round.</p><div className="mt-4 flex flex-wrap gap-2">{cohortRobots.map(item => <Link key={item.robot_entity_id} href={`/robots/${publicRobotSlug(item.canonical_name)}`} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--color-border-color)' }}>{item.canonical_name}</Link>)}</div></section>
    </>}
  </div>
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return <article className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>{label}</p><p className="mt-2 text-2xl font-mono" style={{ color: 'var(--color-text-heading)' }}>{typeof value === 'number' ? number(value) : value}</p><p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{note}</p></article>
}
