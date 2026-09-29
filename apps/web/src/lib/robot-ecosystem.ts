import type { PrismaClient } from '@robotspace/db'
import { rankRobotEcosystemProjects } from './registry-ranking'

export const robotResourceTypes = ['WEBSITE', 'DOCS', 'SDK', 'GITHUB', 'ROS', 'ROS2', 'HUGGING_FACE', 'FIRMWARE'] as const
export type RobotResourceType = typeof robotResourceTypes[number]

export type RobotEcosystem = Awaited<ReturnType<typeof getRobotEcosystem>>

export async function getRobotEcosystem(db: PrismaClient, robotEntityId: string) {
  const [resources, compatibilities] = await Promise.all([
    db.robot_resources.findMany({ where: { robot_entity_id: robotEntityId, verification_status: 'VERIFIED' }, orderBy: [{ resource_type: 'asc' }, { title: 'asc' }] }),
    db.compatibility_claims.findMany({ where: { robot_id: robotEntityId, project_id: { not: null }, claim_status: 'VERIFIED' }, select: { id: true, project_id: true, checked_at: true }, orderBy: { checked_at: 'desc' }, take: 100 }),
  ])
  const projectIds = [...new Set(compatibilities.map(item => item.project_id).filter((id): id is string => Boolean(id)))]
  const entities = projectIds.length ? await db.entities.findMany({ where: { id: { in: projectIds }, entity_type: 'PROJECT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true, slug: true } }) : []
  const visibleIds = entities.map(entity => entity.id)
  const [projects, evidence, snapshots, claims, confirmations] = await Promise.all([
    visibleIds.length ? db.software_packages.findMany({ where: { entity_id: { in: visibleIds }, verification_status: 'VERIFIED' } }) : [],
    compatibilities.length ? db.registry_evidence.findMany({ where: { compatibility_id: { in: compatibilities.map(item => item.id) } }, select: { id: true, compatibility_id: true, url: true, kind: true, observed_at: true }, orderBy: { observed_at: 'desc' } }) : [],
    visibleIds.length ? db.repository_snapshots.findMany({ where: { project_id: { in: visibleIds } }, orderBy: { checked_at: 'desc' } }) : [],
    visibleIds.length ? db.entity_claims.findMany({ where: { entity_id: { in: visibleIds }, status: 'VERIFIED' }, select: { entity_id: true, claimant_id: true, checked_at: true } }) : [],
    compatibilities.length ? db.compatibility_confirmations.findMany({ where: { compatibility_id: { in: compatibilities.map(item => item.id) } }, select: { compatibility_id: true, evidence_id: true, verdict: true, status: true } }) : [],
  ])
  const userIds = [...new Set(claims.map(claim => claim.claimant_id))]
  const users = userIds.length ? await db.registry_users.findMany({ where: { id: { in: userIds }, status: 'ACTIVE' }, select: { id: true } }) : []
  const profiles = users.length ? await db.developer_profiles.findMany({ where: { user_id: { in: users.map(user => user.id) } } }) : []
  const profileEntityIds = profiles.map(profile => profile.entity_id)
  const publicProfiles = profileEntityIds.length ? await db.entities.findMany({ where: { id: { in: profileEntityIds }, entity_type: 'DEVELOPER', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true } }) : []
  const publicProfileIds = new Set(publicProfiles.map(entity => entity.id))
  const entityById = new Map(entities.map(entity => [entity.id, entity]))
  const compatibilityByProject = new Map<string, typeof compatibilities[number]>()
  const confirmationEvidenceIds = new Set(confirmations.map(item => item.evidence_id))
  for (const compatibility of compatibilities) {
    if (compatibility.project_id && !compatibilityByProject.has(compatibility.project_id)) compatibilityByProject.set(compatibility.project_id, compatibility)
  }

  const projectCards = projects.flatMap(project => {
    const entity = project.entity_id ? entityById.get(project.entity_id) : null
    const compatibility = project.entity_id ? compatibilityByProject.get(project.entity_id) : null
    if (!entity || !compatibility) return []
    const latestSnapshot = snapshots.find(snapshot => snapshot.project_id === project.id)
    const latestSuccessfulSnapshot = snapshots.find(snapshot => snapshot.project_id === project.id && snapshot.sync_status === 'OK')
    const opinions = confirmations.filter(item => item.compatibility_id === compatibility.id && item.status === 'ACCEPTED')
    const confirmedCount = opinions.filter(item => item.verdict === 'CONFIRMED').length
    const disputedCount = opinions.filter(item => item.verdict === 'DISPUTED').length
    return [{
      id: project.id, compatibilityId: compatibility.id, slug: entity.slug, name: project.canonical_name, description: project.description,
      projectType: project.project_type, originStatus: project.origin_status, repositoryUrl: project.repository_url,
      latestRelease: latestSuccessfulSnapshot?.latest_release ?? null, lastActivityAt: latestSuccessfulSnapshot?.last_commit_at ?? latestSuccessfulSnapshot?.observed_at ?? project.updated_at,
      githubCheckedAt: latestSnapshot?.checked_at ?? null, githubSyncStatus: latestSnapshot?.sync_status ?? null,
      githubErrorCode: latestSnapshot?.error_code ?? null, stars: latestSuccessfulSnapshot?.stars ?? null, forks: latestSuccessfulSnapshot?.forks ?? null,
      verifiedAt: compatibility.checked_at, evidence: evidence.filter(item => item.compatibility_id === compatibility.id && !confirmationEvidenceIds.has(item.id)).slice(0, 3),
      confirmedCount, disputedCount,
      trustStatus: disputedCount > 0 ? 'DISPUTED' as const : confirmedCount > 0 ? 'COMMUNITY_CONFIRMED' as const : 'EDITORIALLY_VERIFIED' as const,
    }]
  })
  const rankedProjectCards = rankRobotEcosystemProjects(projectCards)

  const contributors = profiles.filter(profile => publicProfileIds.has(profile.entity_id)).flatMap(profile => {
    const owned = claims.filter(claim => claim.claimant_id === profile.user_id && projectCards.some(project => project.id === claim.entity_id))
    if (!owned.length) return []
    return [{ handle: profile.handle, displayName: profile.display_name, projectCount: new Set(owned.map(claim => claim.entity_id)).size }]
  }).sort((left, right) => right.projectCount - left.projectCount || left.handle.localeCompare(right.handle))

  const categories = [...new Set(rankedProjectCards.map(project => project.projectType))].sort()
  const dated = [
    ...resources.map(resource => resource.verified_at),
    ...rankedProjectCards.flatMap(project => [project.verifiedAt, project.lastActivityAt]).filter((value): value is Date => Boolean(value)),
  ]
  return {
    resources,
    officialProjects: rankedProjectCards.filter(project => project.originStatus === 'OFFICIAL'),
    communityProjects: rankedProjectCards.filter(project => project.originStatus !== 'OFFICIAL'),
    contributors,
    activity: [...rankedProjectCards].sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime()).slice(0, 6),
    maturity: {
      verifiedResourceCount: resources.length,
      verifiedProjectCount: rankedProjectCards.length,
      activeMaintainerCount: contributors.length,
      projectTypes: categories,
      latestVerifiedActivity: dated.length ? new Date(Math.max(...dated.map(value => value.getTime()))) : null,
    },
  }
}
