import { Prisma, prisma, type PrismaClient } from '@robotspace/db'

const PAGE_SIZE = 24
const PROJECT_TYPES = ['skill', 'SDK', 'driver', 'navigation', 'manipulation', 'perception', 'voice', 'dataset', 'model', 'simulator', 'tool', 'integration'] as const
const ORIGIN_STATUSES = ['OFFICIAL', 'COMMUNITY', 'EXPERIMENTAL'] as const

type ProjectType = typeof PROJECT_TYPES[number]
type OriginStatus = typeof ORIGIN_STATUSES[number]

export type RegistryFilters = {
  q?: string
  type?: string
  origin?: string
  license?: string
  robot?: string
  page?: string
}

export type CleanRegistryFilters = {
  q?: string
  type?: ProjectType
  origin?: OriginStatus
  license?: string
  robot?: string
  page: number
}

export type RegistryProject = {
  id: string
  slug: string
  name: string
  description: string | null
  projectType: ProjectType
  originStatus: OriginStatus
  license: string | null
  repositoryUrl: string | null
  latestRelease: string | null
  lastCommitAt: Date | null
  robotCount: number
}

export type RegistryProjectDetail = RegistryProject & {
  entityId: string
  homepageUrl: string | null
  ecosystem: string
  verifiedAt: Date | null
  compatibility: Array<{
    id: string
    robotName: string
    robotSlug: string
    projectVersion: string | null
    robotVersion: string | null
    requirements: unknown
    verifiedAt: Date | null
    evidence: Array<{ url: string; kind: string; observedAt: Date }>
    communityTrust: {
      status: 'EDITORIALLY_VERIFIED' | 'COMMUNITY_CONFIRMED' | 'DISPUTED'
      confirmedCount: number
      disputedCount: number
      reports: Array<{
        verdict: 'CONFIRMED' | 'DISPUTED'
        evidenceUrl: string
        observedAt: Date
        handle: string | null
        displayName: string | null
        reputation: number
      }>
    }
  }>
  releases: Array<{ version: string; tag: string | null; releasedAt: Date | null; supportStatus: string }>
  owners: Array<{ handle: string; displayName: string | null; checkedAt: Date | null }>
  repositorySync: {
    status: 'OK' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'NOT_FOUND' | null
    checkedAt: Date | null
    errorCode: string | null
  }
}

function environment() {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

export async function registryReadEnabled(db: PrismaClient = prisma, targetEnvironment = environment()) {
  try {
    const rows = await db.feature_flags.findMany({
      where: { key: 'registry.read', environment: { in: [targetEnvironment, 'all'] } },
      select: { environment: true, enabled: true },
    })
    return (rows.find((row) => row.environment === targetEnvironment) ?? rows.find((row) => row.environment === 'all'))?.enabled === true
  } catch {
    return false
  }
}

function cleanFilters(input: RegistryFilters): CleanRegistryFilters {
  const q = input.q?.trim().slice(0, 100) || undefined
  return {
    q,
    type: PROJECT_TYPES.includes(input.type as ProjectType) ? input.type as ProjectType : undefined,
    origin: ORIGIN_STATUSES.includes(input.origin as OriginStatus) ? input.origin as OriginStatus : undefined,
    license: input.license?.trim().slice(0, 100) || undefined,
    robot: input.robot?.trim().toLowerCase().slice(0, 255) || undefined,
    page: Math.max(1, Math.min(10_000, Number(input.page) || 1)),
  }
}

function projectConditions(filters: ReturnType<typeof cleanFilters>) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`entity.entity_type = 'PROJECT'`,
    Prisma.sql`entity.publication_status = 'PUBLISHED'`,
    Prisma.sql`entity.archived_at IS NULL`,
    Prisma.sql`project.entity_id = entity.id`,
    Prisma.sql`project.verification_status = 'VERIFIED'`,
  ]
  if (filters.q) conditions.push(Prisma.sql`(project.canonical_name ILIKE ${`%${filters.q}%`} OR project.description ILIKE ${`%${filters.q}%`})`)
  if (filters.type) conditions.push(Prisma.sql`project.project_type = ${filters.type}`)
  if (filters.origin) conditions.push(Prisma.sql`project.origin_status = ${filters.origin}`)
  if (filters.license) conditions.push(Prisma.sql`project.license_id = ${filters.license}`)
  if (filters.robot) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM compatibility_claims AS compatibility
      JOIN entities AS robot ON robot.id = compatibility.robot_id
      WHERE compatibility.project_id = project.id
        AND compatibility.claim_status = 'VERIFIED'
        AND robot.entity_type = 'ROBOT'
        AND robot.publication_status = 'PUBLISHED'
        AND robot.archived_at IS NULL
        AND robot.slug = ${filters.robot}
    )`)
  }
  return conditions
}

export async function listRegistryProjects(input: RegistryFilters) {
  const filters = cleanFilters(input)
  if (!await registryReadEnabled()) return { enabled: false, filters, total: 0, projects: [] as RegistryProject[] }

  const conditions = projectConditions(filters)
  const where = Prisma.join(conditions, ' AND ')
  const offset = (filters.page - 1) * PAGE_SIZE
  try {
    const [projects, totals] = await Promise.all([
      prisma.$queryRaw<RegistryProject[]>(Prisma.sql`
        SELECT project.id, entity.slug, project.canonical_name AS "name", project.description,
               project.project_type AS "projectType", project.origin_status AS "originStatus",
               project.license_id AS "license", project.repository_url AS "repositoryUrl",
               snapshot.latest_release AS "latestRelease", snapshot.last_commit_at AS "lastCommitAt",
               COALESCE(compatible.robot_count, 0)::int AS "robotCount"
        FROM software_packages AS project
        JOIN entities AS entity ON entity.id = project.entity_id
        LEFT JOIN LATERAL (
          SELECT latest_release, last_commit_at
          FROM repository_snapshots
          WHERE project_id = project.id AND sync_status = 'OK'
          ORDER BY observed_at DESC LIMIT 1
        ) AS snapshot ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS robot_count
          FROM compatibility_claims AS compatibility
          JOIN entities AS robot ON robot.id = compatibility.robot_id
          WHERE compatibility.project_id = project.id AND compatibility.claim_status = 'VERIFIED'
            AND robot.publication_status = 'PUBLISHED' AND robot.archived_at IS NULL
        ) AS compatible ON true
        WHERE ${where}
        ORDER BY project.updated_at DESC, project.canonical_name ASC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}`),
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT count(*)::int AS count
        FROM software_packages AS project
        JOIN entities AS entity ON entity.id = project.entity_id
        WHERE ${where}`),
    ])
    return { enabled: true, filters, total: totals[0]?.count ?? 0, projects }
  } catch {
    return { enabled: false, filters, total: 0, projects: [] as RegistryProject[] }
  }
}

export async function registryFilterOptions() {
  if (!await registryReadEnabled()) return { licenses: [] as string[], robots: [] as Array<{ slug: string; name: string }> }
  try {
    const [licenses, robots] = await Promise.all([
      prisma.$queryRaw<Array<{ license: string }>>(Prisma.sql`
        SELECT DISTINCT project.license_id AS license FROM software_packages AS project
        JOIN entities AS entity ON entity.id = project.entity_id
        WHERE entity.entity_type = 'PROJECT' AND entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL AND project.verification_status = 'VERIFIED'
          AND project.license_id IS NOT NULL ORDER BY license LIMIT 100`),
      prisma.$queryRaw<Array<{ slug: string; name: string }>>(Prisma.sql`
        SELECT DISTINCT robot.slug, COALESCE(projection.canonical_name, robot.slug) AS name
        FROM compatibility_claims AS compatibility
        JOIN software_packages AS project ON project.id = compatibility.project_id
        JOIN entities AS project_entity ON project_entity.id = project.entity_id
        JOIN entities AS robot ON robot.id = compatibility.robot_id
        LEFT JOIN robot_public_projections AS projection ON projection.robot_entity_id = robot.id
        WHERE compatibility.claim_status = 'VERIFIED' AND project.verification_status = 'VERIFIED'
          AND project_entity.publication_status = 'PUBLISHED' AND project_entity.archived_at IS NULL
          AND robot.publication_status = 'PUBLISHED' AND robot.archived_at IS NULL
        ORDER BY name LIMIT 200`),
    ])
    return { licenses: licenses.map((row) => row.license), robots }
  } catch {
    return { licenses: [] as string[], robots: [] as Array<{ slug: string; name: string }> }
  }
}

export async function registrySitemapProjects() {
  if (!await registryReadEnabled()) return [] as Array<{ slug: string; updatedAt: Date }>
  try {
    return await prisma.$queryRaw<Array<{ slug: string; updatedAt: Date }>>(Prisma.sql`
      SELECT entity.slug, project.updated_at AS "updatedAt"
      FROM entities AS entity
      JOIN software_packages AS project ON project.entity_id = entity.id
      WHERE entity.entity_type = 'PROJECT' AND entity.publication_status = 'PUBLISHED'
        AND entity.archived_at IS NULL AND project.verification_status = 'VERIFIED'
      ORDER BY project.updated_at DESC LIMIT 50000`)
  } catch {
    return []
  }
}

export async function registrySitemapDevelopers() {
  if (!await registryReadEnabled()) return [] as Array<{ handle: string }>
  try {
    return await prisma.$queryRaw<Array<{ handle: string }>>(Prisma.sql`
      SELECT profile.handle
      FROM developer_profiles AS profile
      JOIN entities AS entity ON entity.id = profile.entity_id
      JOIN registry_users AS registry_user ON registry_user.id = profile.user_id
      WHERE entity.entity_type = 'DEVELOPER' AND entity.publication_status = 'PUBLISHED'
        AND entity.archived_at IS NULL AND registry_user.status = 'ACTIVE'
      ORDER BY profile.handle ASC LIMIT 50000`)
  } catch {
    return []
  }
}

export async function getRegistryProject(slug: string, db: PrismaClient = prisma): Promise<{ enabled: boolean; project: RegistryProjectDetail | null }> {
  if (!await registryReadEnabled(db)) return { enabled: false, project: null }
  try {
    const entity = await db.entities.findFirst({
      where: { slug, entity_type: 'PROJECT', publication_status: 'PUBLISHED', archived_at: null },
      select: { id: true },
    })
    if (!entity) return { enabled: true, project: null }
    const project = await db.software_packages.findFirst({ where: { entity_id: entity.id, verification_status: 'VERIFIED' } })
    if (!project) return { enabled: true, project: null }

    const [releases, compatibility, snapshot, latestSnapshot, claims] = await Promise.all([
      db.software_releases.findMany({ where: { software_id: project.id }, orderBy: { release_date: 'desc' }, take: 12 }),
      db.compatibility_claims.findMany({ where: { project_id: project.id, claim_status: 'VERIFIED' }, orderBy: { checked_at: 'desc' } }),
      db.repository_snapshots.findFirst({ where: { project_id: project.id, sync_status: 'OK' }, orderBy: { checked_at: 'desc' } }),
      db.repository_snapshots.findFirst({ where: { project_id: project.id }, orderBy: { checked_at: 'desc' } }),
      db.entity_claims.findMany({ where: { entity_id: entity.id, status: 'VERIFIED' }, select: { claimant_id: true, checked_at: true } }),
    ])
    const compatibilityIds = compatibility.map((row) => row.id)
    const allConfirmations = compatibilityIds.length
      ? await db.compatibility_confirmations.findMany({ where: { compatibility_id: { in: compatibilityIds } }, select: { compatibility_id: true, user_id: true, evidence_id: true, verdict: true, status: true } })
      : []
    const confirmationEvidenceIds = new Set(allConfirmations.map(item => item.evidence_id))
    const compatibilityEvidence = compatibilityIds.length
      ? await db.registry_evidence.findMany({ where: { compatibility_id: { in: compatibilityIds } }, orderBy: { observed_at: 'desc' } })
      : []
    const acceptedConfirmations = allConfirmations.filter(item => item.status === 'ACCEPTED')
    const acceptedEvidenceById = new Map(compatibilityEvidence.filter(item => confirmationEvidenceIds.has(item.id)).map(item => [item.id, item]))
    const reporterIds = [...new Set(acceptedConfirmations.map(item => item.user_id))]
    const [reporterProfiles, reporterReputation] = await Promise.all([
      reporterIds.length ? db.developer_profiles.findMany({ where: { user_id: { in: reporterIds } }, select: { user_id: true, handle: true, display_name: true } }) : [],
      reporterIds.length ? db.registry_reputation_events.groupBy({ by: ['user_id'], where: { user_id: { in: reporterIds } }, _sum: { points: true } }) : [],
    ])
    const robots = compatibility.length
      ? await db.entities.findMany({ where: { id: { in: compatibility.map((row) => row.robot_id).filter((id): id is string => Boolean(id)) }, entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true, slug: true } })
      : []
    const robotNames = robots.length
      ? await db.robot_public_projections.findMany({ where: { robot_entity_id: { in: robots.map((robot) => robot.id) } }, select: { robot_entity_id: true, canonical_name: true } })
      : []
    const users = claims.length
      ? await db.registry_users.findMany({ where: { id: { in: claims.map((claim) => claim.claimant_id) }, status: 'ACTIVE' }, select: { id: true } })
      : []
    const profiles = users.length
      ? await db.developer_profiles.findMany({ where: { user_id: { in: users.map((user) => user.id) } }, select: { user_id: true, handle: true, display_name: true } })
      : []
    const robotById = new Map(robots.map((robot) => [robot.id, robot]))
    const nameByRobotId = new Map(robotNames.map((robot) => [robot.robot_entity_id, robot.canonical_name]))

    return {
      enabled: true,
      project: {
        id: project.id,
        entityId: entity.id,
        slug,
        name: project.canonical_name,
        description: project.description,
        projectType: project.project_type as ProjectType,
        originStatus: project.origin_status as OriginStatus,
        license: project.license_id,
        repositoryUrl: project.repository_url,
        homepageUrl: project.homepage_url,
        ecosystem: project.ecosystem,
        latestRelease: snapshot?.latest_release ?? null,
        lastCommitAt: snapshot?.last_commit_at ?? null,
        repositorySync: {
          status: latestSnapshot?.sync_status as 'OK' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'NOT_FOUND' | undefined ?? null,
          checkedAt: latestSnapshot?.checked_at ?? null,
          errorCode: latestSnapshot?.error_code ?? null,
        },
        verifiedAt: project.last_verified_at,
        robotCount: compatibility.filter((item) => item.robot_id && robotById.has(item.robot_id)).length,
        compatibility: compatibility.flatMap((item) => {
          const robot = item.robot_id ? robotById.get(item.robot_id) : undefined
          if (!robot) return []
          return [{
            id: item.id,
            robotName: nameByRobotId.get(robot.id) ?? robot.slug,
            robotSlug: (nameByRobotId.get(robot.id) ?? robot.slug).toLowerCase().replace(/\s+/g, '-'),
            projectVersion: item.subject_version_range,
            robotVersion: item.object_version_range,
            requirements: item.requirements,
            verifiedAt: item.checked_at,
            evidence: compatibilityEvidence.filter((source) => source.compatibility_id === item.id && !confirmationEvidenceIds.has(source.id)).map((source) => ({ url: source.url, kind: source.kind, observedAt: source.observed_at })),
            communityTrust: (() => {
              const opinions = acceptedConfirmations.filter(report => report.compatibility_id === item.id)
              const confirmedCount = opinions.filter(report => report.verdict === 'CONFIRMED').length
              const disputedCount = opinions.filter(report => report.verdict === 'DISPUTED').length
              return {
                status: disputedCount > 0 ? 'DISPUTED' as const : confirmedCount > 0 ? 'COMMUNITY_CONFIRMED' as const : 'EDITORIALLY_VERIFIED' as const,
                confirmedCount,
                disputedCount,
                reports: opinions.flatMap(report => {
                  const proof = acceptedEvidenceById.get(report.evidence_id)
                  if (!proof || (report.verdict !== 'CONFIRMED' && report.verdict !== 'DISPUTED')) return []
                  const profile = reporterProfiles.find(person => person.user_id === report.user_id)
                  return [{
                    verdict: report.verdict,
                    evidenceUrl: proof.url,
                    observedAt: proof.observed_at,
                    handle: profile?.handle ?? null,
                    displayName: profile?.display_name ?? null,
                    reputation: reporterReputation.find(row => row.user_id === report.user_id)?._sum.points ?? 0,
                  }]
                }),
              }
            })(),
          }]
        }),
        releases: releases.map((release) => ({ version: release.version, tag: release.release_tag, releasedAt: release.release_date, supportStatus: release.support_status })),
        owners: claims.flatMap((claim) => {
          const profile = profiles.find((item) => item.user_id === claim.claimant_id)
          return profile ? [{ handle: profile.handle, displayName: profile.display_name, checkedAt: claim.checked_at }] : []
        }),
      },
    }
  } catch {
    return { enabled: false, project: null }
  }
}

export async function getPublicCompatibility(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const compatibility = await prisma.compatibility_claims.findFirst({ where: { id, project_id: { not: null }, claim_status: 'VERIFIED' }, select: { project_id: true } })
  if (!compatibility?.project_id) return null
  const entity = await prisma.entities.findFirst({ where: { id: compatibility.project_id, entity_type: 'PROJECT', publication_status: 'PUBLISHED', archived_at: null }, select: { slug: true } })
  if (!entity) return null
  const data = await getRegistryProject(entity.slug)
  if (!data.enabled || !data.project) return null
  const record = data.project.compatibility.find(item => item.id === id)
  return record ? { project: data.project, compatibility: record } : null
}

export const registryProjectTypes = PROJECT_TYPES
export const registryOrigins = ORIGIN_STATUSES
export const registryPageSize = PAGE_SIZE
