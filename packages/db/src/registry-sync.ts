import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

const USER_AGENT = 'RobotSpace-Registry/1.0'
const MAX_PROJECTS_PER_RUN = 12
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

type GitHubRepository = {
  id: number
  html_url: string
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  pushed_at: string | null
}
type GitHubRelease = { tag_name?: string; published_at?: string | null }
type SnapshotStatus = 'OK' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'NOT_FOUND'

function normalizeGitHubRepository(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a public GitHub repository URL') }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)) throw new Error('Enter a public GitHub repository URL')
  return `https://github.com${url.pathname.replace(/\/$/, '').replace(/\.git$/i, '').toLowerCase()}`
}

export type GitHubSyncResult = {
  enabled: boolean
  attempted: number
  updated: number
  unchanged: number
  unavailable: number
  rateLimited: boolean
}

type SyncOptions = {
  environment?: string
  fetcher?: typeof fetch
  now?: Date
  maxProjects?: number
  force?: boolean
  projectIds?: string[]
}

function environment() { return process.env.NODE_ENV === 'production' ? 'production' : 'development' }
function validDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
function nonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}
function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function rateLimitReset(response: Response) {
  const seconds = Number(response.headers.get('x-ratelimit-reset'))
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null
}

async function syncEnabled(db: PrismaClient, targetEnvironment: string) {
  const flags = await db.feature_flags.findMany({ where: { key: 'registry.sync', environment: { in: [targetEnvironment, 'all'] } }, select: { environment: true, enabled: true } })
  return (flags.find(flag => flag.environment === targetEnvironment) ?? flags.find(flag => flag.environment === 'all'))?.enabled === true
}

async function writeSnapshot(db: PrismaClient, input: {
  projectId: string
  now: Date
  status: SnapshotStatus
  stars?: number | null
  forks?: number | null
  openIssues?: number | null
  latestRelease?: string | null
  lastCommitAt?: Date | null
  errorCode?: string | null
  errorMessage?: string | null
  rateLimitResetAt?: Date | null
}) {
  const state = {
    status: input.status, stars: input.stars ?? null, forks: input.forks ?? null, openIssues: input.openIssues ?? null,
    latestRelease: input.latestRelease ?? null, lastCommitAt: input.lastCommitAt?.toISOString() ?? null,
    errorCode: input.errorCode ?? null, errorMessage: input.errorMessage ?? null,
    rateLimitResetAt: input.rateLimitResetAt?.toISOString() ?? null,
  }
  const hash = fingerprint(state)
  const existing = await db.repository_snapshots.findFirst({ where: { project_id: input.projectId, fingerprint: hash }, select: { id: true } })
  if (existing) {
    await db.repository_snapshots.update({ where: { id: existing.id }, data: { checked_at: input.now } })
    return false
  }
  await db.repository_snapshots.create({ data: {
    project_id: input.projectId, observed_at: input.now, checked_at: input.now, fingerprint: hash, sync_status: input.status,
    stars: input.stars ?? null, forks: input.forks ?? null, open_issues: input.openIssues ?? null,
    latest_release: input.latestRelease?.slice(0, 255) ?? null, last_commit_at: input.lastCommitAt ?? null,
    error_code: input.errorCode?.slice(0, 80) ?? null, error_message: input.errorMessage?.slice(0, 500) ?? null,
    rate_limit_reset_at: input.rateLimitResetAt ?? null,
  } })
  return true
}

async function syncProject(db: PrismaClient, project: { id: string; repository_url: string }, fetcher: typeof fetch, now: Date) {
  let repositoryUrl: string
  try { repositoryUrl = normalizeGitHubRepository(project.repository_url) }
  catch {
    return { status: 'UNAVAILABLE' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'UNAVAILABLE', errorCode: 'INVALID_REPOSITORY_URL', errorMessage: 'Stored GitHub URL is no longer supported' }) }
  }
  const [owner, repo] = new URL(repositoryUrl).pathname.slice(1).split('/')
  let response: Response
  try {
    response = await fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
  } catch {
    return { status: 'UNAVAILABLE' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'UNAVAILABLE', errorCode: 'NETWORK_ERROR', errorMessage: 'GitHub could not be reached' }) }
  }
  if (response.status === 403 || response.status === 429) return { status: 'RATE_LIMITED' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'RATE_LIMITED', errorCode: 'RATE_LIMIT', errorMessage: `GitHub HTTP ${response.status}`, rateLimitResetAt: rateLimitReset(response) }) }
  if (response.status === 404) return { status: 'NOT_FOUND' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'NOT_FOUND', errorCode: 'NOT_FOUND', errorMessage: 'GitHub repository was not found' }) }
  if (!response.ok) return { status: 'UNAVAILABLE' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'UNAVAILABLE', errorCode: `HTTP_${response.status}`, errorMessage: `GitHub HTTP ${response.status}` }) }

  let repository: GitHubRepository
  try { repository = await response.json() as GitHubRepository }
  catch { return { status: 'UNAVAILABLE' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'UNAVAILABLE', errorCode: 'INVALID_RESPONSE', errorMessage: 'GitHub returned invalid repository data' }) } }
  let returnedUrl: string
  try { returnedUrl = normalizeGitHubRepository(repository.html_url) }
  catch { returnedUrl = '' }
  if (!Number.isSafeInteger(repository.id) || returnedUrl !== repositoryUrl || nonNegativeInteger(repository.stargazers_count) === null || nonNegativeInteger(repository.forks_count) === null || nonNegativeInteger(repository.open_issues_count) === null) {
    return { status: 'UNAVAILABLE' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'UNAVAILABLE', errorCode: 'INVALID_RESPONSE', errorMessage: 'GitHub returned invalid repository data' }) }
  }

  let latestRelease: string | null = null
  try {
    const releases = await fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (releases.status === 403 || releases.status === 429) return { status: 'RATE_LIMITED' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'RATE_LIMITED', errorCode: 'RATE_LIMIT', errorMessage: `GitHub HTTP ${releases.status}`, rateLimitResetAt: rateLimitReset(releases) }) }
    if (releases.ok) {
      const release = await releases.json() as GitHubRelease
      latestRelease = typeof release.tag_name === 'string' && release.tag_name.trim() ? release.tag_name.trim().slice(0, 100) : null
      if (latestRelease) await db.software_releases.upsert({ where: { software_id_version: { software_id: project.id, version: latestRelease } }, create: { software_id: project.id, version: latestRelease, release_tag: latestRelease, release_date: validDate(release.published_at) }, update: { release_tag: latestRelease, release_date: validDate(release.published_at) } })
    } else if (releases.status !== 404) return { status: 'UNAVAILABLE' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'UNAVAILABLE', errorCode: `RELEASES_HTTP_${releases.status}`, errorMessage: `GitHub releases HTTP ${releases.status}` }) }
  } catch {
    return { status: 'UNAVAILABLE' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'UNAVAILABLE', errorCode: 'RELEASES_NETWORK_ERROR', errorMessage: 'GitHub releases could not be reached' }) }
  }
  return { status: 'OK' as const, changed: await writeSnapshot(db, { projectId: project.id, now, status: 'OK', stars: repository.stargazers_count, forks: repository.forks_count, openIssues: repository.open_issues_count, latestRelease, lastCommitAt: validDate(repository.pushed_at) }) }
}

export async function syncGitHubProjects(db: PrismaClient, options: SyncOptions = {}): Promise<GitHubSyncResult> {
  const targetEnvironment = options.environment ?? environment()
  if (!await syncEnabled(db, targetEnvironment)) return { enabled: false, attempted: 0, updated: 0, unchanged: 0, unavailable: 0, rateLimited: false }
  const now = options.now ?? new Date()
  const maxProjects = Math.max(1, Math.min(MAX_PROJECTS_PER_RUN, options.maxProjects ?? MAX_PROJECTS_PER_RUN))
  const projects = await db.software_packages.findMany({ where: { repository_url: { not: null }, verification_status: 'VERIFIED', entity_id: { not: null } }, select: { id: true, entity_id: true, repository_url: true, updated_at: true } })
  const entities = projects.length ? await db.entities.findMany({ where: { id: { in: projects.map(project => project.entity_id!).filter(Boolean) }, entity_type: 'PROJECT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true } }) : []
  const visible = new Set(entities.map(entity => entity.id))
  const requestedProjectIds = options.projectIds ? new Set(options.projectIds) : null
  const candidates = projects.filter(project => project.entity_id && project.repository_url && visible.has(project.entity_id) && (!requestedProjectIds || requestedProjectIds.has(project.id)))
  const snapshots = candidates.length ? await db.repository_snapshots.findMany({ where: { project_id: { in: candidates.map(project => project.id) } }, orderBy: { checked_at: 'desc' } }) : []
  const latestByProject = new Map<string, typeof snapshots[number]>()
  for (const snapshot of snapshots) if (!latestByProject.has(snapshot.project_id)) latestByProject.set(snapshot.project_id, snapshot)
  const selected = candidates
    .filter(project => options.force || !latestByProject.get(project.id) || latestByProject.get(project.id)!.checked_at.getTime() < now.getTime() - STALE_AFTER_MS)
    .sort((left, right) => {
      const leftSnapshot = latestByProject.get(left.id)
      const rightSnapshot = latestByProject.get(right.id)
      const leftActivity = leftSnapshot?.last_commit_at?.getTime() ?? left.updated_at.getTime()
      const rightActivity = rightSnapshot?.last_commit_at?.getTime() ?? right.updated_at.getTime()
      const leftCheck = leftSnapshot?.checked_at.getTime() ?? 0
      const rightCheck = rightSnapshot?.checked_at.getTime() ?? 0
      return rightActivity - leftActivity || leftCheck - rightCheck || left.id.localeCompare(right.id)
    }).slice(0, maxProjects)

  const result: GitHubSyncResult = { enabled: true, attempted: 0, updated: 0, unchanged: 0, unavailable: 0, rateLimited: false }
  const fetcher = options.fetcher ?? fetch
  for (const project of selected) {
    result.attempted++
    const outcome = await syncProject(db, { id: project.id, repository_url: project.repository_url! }, fetcher, now)
    if (outcome.changed) result.updated++; else result.unchanged++
    if (outcome.status === 'RATE_LIMITED') { result.rateLimited = true; break }
    if (outcome.status !== 'OK') result.unavailable++
  }
  return result
}
