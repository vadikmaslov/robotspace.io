import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

const PROJECT_TYPES = new Set(['skill', 'SDK', 'driver', 'navigation', 'manipulation', 'perception', 'voice', 'dataset', 'model', 'simulator', 'tool', 'integration'])
const MAX_MANIFEST_BYTES = 64 * 1024

export type RegistryManifest = { version: 1; name: string; description?: string; project_type: string; license?: string; homepage?: string; robots?: Array<{ slug: string; requirements?: Record<string, string | number | boolean> }> }

export function normalizeGitHubRepository(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a public GitHub repository URL') }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)) throw new Error('Enter a public GitHub repository URL')
  return `https://github.com${url.pathname.replace(/\/$/, '').replace(/\.git$/i, '').toLowerCase()}`
}

function scalar(value: string) {
  const clean = value.trim().replace(/^['"]|['"]$/g, '')
  if (!clean) return ''
  if (/^(true|false)$/i.test(clean)) return clean.toLowerCase() === 'true'
  if (/^-?\d+(\.\d+)?$/.test(clean)) return Number(clean)
  return clean
}

// Deliberately narrow YAML subset: mappings, a `robots` list and a nested requirements mapping.
// Unsupported YAML features fail closed instead of creating a different meaning.
export function parseRobotspaceManifest(source: string): RegistryManifest {
  if (Buffer.byteLength(source, 'utf8') > MAX_MANIFEST_BYTES) throw new Error('robotspace.yaml exceeds 64 KiB')
  if (/\t|[&*!]|^\s*(---|\.\.\.)\s*$/m.test(source)) throw new Error('robotspace.yaml uses unsupported YAML syntax')
  const data: Record<string, unknown> = {}
  let robot: Record<string, unknown> | null = null
  let requirements: Record<string, string | number | boolean> | null = null
  for (const raw of source.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '')
    if (!line.trim()) continue
    const indent = line.length - line.trimStart().length
    if (indent === 0) {
      const match = line.match(/^([a-z_]+):(?:\s*(.*))?$/)
      if (!match) throw new Error('robotspace.yaml has an invalid top-level field')
      const [, key, value] = match
      if (!['version','name','description','project_type','license','homepage','robots'].includes(key) || key in data) throw new Error(`robotspace.yaml field is not allowed: ${key}`)
      data[key] = key === 'robots' ? [] : scalar(value)
      robot = null; requirements = null
    } else if (indent === 2 && line.trimStart().startsWith('- ')) {
      if (!Array.isArray(data.robots)) throw new Error('robot entries must be under robots')
      const match = line.trimStart().slice(2).match(/^slug:\s*(.+)$/)
      if (!match) throw new Error('each robot must start with slug')
      robot = { slug: scalar(match[1]) }; data.robots.push(robot); requirements = null
    } else if (indent === 4 && robot) {
      const match = line.trim().match(/^(requirements):\s*$/)
      if (!match || requirements) throw new Error('robot field is not allowed')
      requirements = {}; robot.requirements = requirements
    } else if (indent === 6 && requirements) {
      const match = line.trim().match(/^([a-z][a-z0-9_-]{0,49}):\s*(.+)$/)
      if (!match || Object.keys(requirements).length >= 30) throw new Error('invalid or excessive robot requirements')
      requirements[match[1]] = scalar(match[2]) as string | number | boolean
    } else throw new Error('robotspace.yaml indentation is not supported')
  }
  if (data.version !== 1 || typeof data.name !== 'string' || !data.name || data.name.length > 255 || typeof data.project_type !== 'string' || !PROJECT_TYPES.has(data.project_type)) throw new Error('robotspace.yaml requires version 1, name and valid project_type')
  if (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 4000)) throw new Error('description is invalid')
  if (data.license !== undefined && (typeof data.license !== 'string' || !data.license || data.license.length > 100)) throw new Error('license is invalid')
  if (data.homepage !== undefined) { const url = new URL(String(data.homepage)); if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('homepage must be credential-free HTTPS') }
  const robots = data.robots as Array<Record<string, unknown>> | undefined
  if (robots && robots.length > 50) throw new Error('too many robots')
  for (const entry of robots ?? []) if (typeof entry.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,254}$/.test(entry.slug)) throw new Error('robot slug is invalid')
  return data as RegistryManifest
}

type GitHubRepository = { id: number; name: string; description: string | null; html_url: string; homepage: string | null; topics?: string[]; default_branch: string; license: { spdx_id?: string | null } | null; updated_at: string; stargazers_count: number; forks_count: number; open_issues_count: number }

export async function importGitHubProject(db: PrismaClient, repositoryInput: string, fetcher: typeof fetch = fetch) {
  const repositoryUrl = normalizeGitHubRepository(repositoryInput)
  const [owner, repo] = new URL(repositoryUrl).pathname.slice(1).split('/')
  const existing = await db.registry_imports.findUnique({ where: { repository_url: repositoryUrl } })
  const importRow = existing ?? await db.registry_imports.create({ data: { repository_url: repositoryUrl } })
  await db.registry_imports.update({ where: { id: importRow.id }, data: { state: 'FETCHING', attempt_count: { increment: 1 }, last_error_code: null, last_error_message: null } })
  try {
    const response = await fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'RobotSpace-Registry/1.0' }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (response.status === 403 || response.status === 429) throw new Error('GitHub rate limit reached')
    if (!response.ok) throw new Error(response.status === 404 ? 'GitHub repository was not found' : `GitHub returned HTTP ${response.status}`)
    const metadata = await response.json() as GitHubRepository
    if (!Number.isSafeInteger(metadata.id) || normalizeGitHubRepository(metadata.html_url) !== repositoryUrl) throw new Error('GitHub returned unexpected repository metadata')
    const manifestResponse = await fetcher(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(metadata.default_branch)}/robotspace.yaml`, { headers: { Accept: 'text/plain', 'User-Agent': 'RobotSpace-Registry/1.0' }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
    const manifest = manifestResponse.status === 404 ? null : manifestResponse.ok ? parseRobotspaceManifest(await limitedText(manifestResponse)) : null
    if (!manifestResponse.ok && manifestResponse.status !== 404) throw new Error(`robotspace.yaml returned HTTP ${manifestResponse.status}`)
    const [readmeResponse, releasesResponse] = await Promise.all([
      fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'RobotSpace-Registry/1.0' }, redirect: 'error', signal: AbortSignal.timeout(15_000) }),
      fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=20`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'RobotSpace-Registry/1.0' }, redirect: 'error', signal: AbortSignal.timeout(15_000) }),
    ])
    if (!readmeResponse.ok && readmeResponse.status !== 404) throw new Error(`README returned HTTP ${readmeResponse.status}`)
    if (!releasesResponse.ok) throw new Error(`GitHub releases returned HTTP ${releasesResponse.status}`)
    const releases = await releasesResponse.json() as Array<{ tag_name?: string; name?: string; published_at?: string | null }>
    if (!Array.isArray(releases) || releases.length > 20) throw new Error('GitHub returned invalid releases')
    const existingProject = await db.software_packages.findUnique({ where: { github_repository_id: BigInt(metadata.id) } })
    if (existingProject?.verification_status === 'REJECTED') throw new Error('Rejected projects require manual review')
    if (existingProject && !existingProject.entity_id) throw new Error('Existing project has no registry entity and requires manual review')
    const slug = existingProject ? null : await nextSlug(db, manifest?.name ?? metadata.name, metadata.id)
    const project = await db.$transaction(async tx => {
      const entity = existingProject?.entity_id ? await tx.entities.findUniqueOrThrow({ where: { id: existingProject.entity_id } }) : await tx.entities.create({ data: { id: randomUUID(), entity_type: 'PROJECT', slug: slug! } })
      let record = existingProject ?? await tx.software_packages.create({ data: { id: entity.id, entity_id: entity.id, canonical_name: manifest?.name ?? metadata.name, description: manifest?.description ?? metadata.description, ecosystem: 'OTHER', project_type: manifest?.project_type ?? 'tool', origin_status: 'COMMUNITY', verification_status: 'DISCOVERED', repository_url: repositoryUrl, homepage_url: manifest?.homepage ?? metadata.homepage, license_id: manifest?.license ?? metadata.license?.spdx_id ?? null, github_repository_id: BigInt(metadata.id) } })
      const repositoryEvidence = await tx.registry_evidence.findFirst({ where: { entity_id: entity.id, url: repositoryUrl } })
      if (!repositoryEvidence) await tx.registry_evidence.create({ data: { entity_id: entity.id, url: repositoryUrl, kind: 'REPOSITORY' } })
      if (manifest && record.verification_status === 'DISCOVERED') record = await tx.software_packages.update({ where: { id: record.id }, data: { verification_status: 'SUGGESTED' } })
      for (const release of releases) {
        const version = release.tag_name?.trim().slice(0, 100)
        if (version) await tx.software_releases.upsert({ where: { software_id_version: { software_id: record.id, version } }, create: { software_id: record.id, version, release_tag: version, release_date: release.published_at ? new Date(release.published_at) : null }, update: { release_tag: version, release_date: release.published_at ? new Date(release.published_at) : null } })
      }
      await tx.repository_snapshots.create({ data: { project_id: record.id, stars: metadata.stargazers_count, forks: metadata.forks_count, open_issues: metadata.open_issues_count, latest_release: releases[0]?.tag_name?.slice(0, 255) ?? null, sync_status: 'OK' } })
      for (const candidate of manifest?.robots ?? []) {
        const robot = await tx.entities.findFirst({ where: { slug: candidate.slug, entity_type: 'ROBOT', archived_at: null }, select: { id: true } })
        if (robot) {
          const existingCompatibility = await tx.compatibility_claims.findFirst({ where: { project_id: record.id, robot_id: robot.id, subject_version_range: null, object_version_range: null } })
          if (!existingCompatibility) {
            const compatibility = await tx.compatibility_claims.create({ data: { project_id: record.id, robot_id: robot.id, subject_type: 'PROJECT', subject_entity_id: record.id, object_type: 'ROBOT', object_entity_id: robot.id, type: 'SOFTWARE', claim_status: 'DISCOVERED', requirements: candidate.requirements ?? {} } })
            await tx.registry_evidence.create({ data: { compatibility_id: compatibility.id, url: `${repositoryUrl}/blob/${encodeURIComponent(metadata.default_branch)}/robotspace.yaml`, kind: 'MANIFEST' } })
            await tx.compatibility_claims.update({ where: { id: compatibility.id }, data: { claim_status: 'SUGGESTED' } })
          }
        }
      }
      return record
    })
    await db.registry_imports.update({ where: { id: importRow.id }, data: { project_id: project.id, repository_id: BigInt(metadata.id), state: 'IMPORTED', manifest_version: manifest?.version ?? null, metadata_json: { topics: metadata.topics ?? [], readmePresent: readmeResponse.ok, releases: releases.length, updatedAt: metadata.updated_at, stars: metadata.stargazers_count, forks: metadata.forks_count, openIssues: metadata.open_issues_count } } })
    return { project, manifestFound: Boolean(manifest) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub import failed'
    const rateLimited = message === 'GitHub rate limit reached'
    await db.registry_imports.update({ where: { id: importRow.id }, data: { state: rateLimited ? 'RATE_LIMITED' : 'FAILED', next_retry_at: rateLimited ? new Date(Date.now() + 60 * 60 * 1000) : null, last_error_code: rateLimited ? 'RATE_LIMIT' : 'FETCH_FAILED', last_error_message: message.slice(0, 500) } })
    throw new Error(message)
  }
}

async function limitedText(response: Response) { const body = await response.text(); if (Buffer.byteLength(body, 'utf8') > MAX_MANIFEST_BYTES) throw new Error('robotspace.yaml exceeds 64 KiB'); return body }
async function nextSlug(db: PrismaClient, name: string, repositoryId: number) { const base = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 220) || 'github-project'; for (let i = 0; i < 100; i++) { const tail = i ? `-${repositoryId}-${i}` : `-${repositoryId}`; const slug = `${base.slice(0, 255 - tail.length)}${tail}`; if (!await db.entities.findUnique({ where: { slug }, select: { id: true } })) return slug } throw new Error('Could not allocate a project slug') }
export function importIdempotencyKey(repositoryUrl: string) { return createHash('sha256').update(repositoryUrl).digest('hex') }
