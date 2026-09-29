import type { PrismaClient, Prisma } from '@robotspace/db'
import { importGitHubProject } from '@robotspace/db/registry-import'
import { registryRepository } from '@robotspace/db/registry'

type Client = PrismaClient | Prisma.TransactionClient
const environment = () => process.env.NODE_ENV === 'production' ? 'production' : 'development'

export class CommunityError extends Error {}

function cleanText(value: string, max: number, required = false) {
  const text = value.trim()
  if (text.length > max || (required && !text)) throw new CommunityError('Invalid text length')
  return text
}

function secureUrl(value: string, required = false) {
  const text = value.trim()
  if (!text && !required) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2000) throw new Error()
    return url.href
  } catch { throw new CommunityError('A credential-free HTTPS link is required') }
}

async function activeUser(db: Client, userId: string) {
  const user = await db.registry_users.findUnique({ where: { id: userId }, select: { status: true } })
  if (user?.status !== 'ACTIVE') throw new CommunityError('Active Registry account required')
}

async function writable(db: PrismaClient, userId: string) {
  if (!await registryRepository(db).enabled('registry.write', environment())) throw new CommunityError('Registry contributions are not enabled yet')
  await activeUser(db, userId)
  const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  const attempts = await db.$queryRaw<Array<{ attempt_count: number }>>`
    INSERT INTO registry_submission_attempts(user_id, window_start, attempt_count)
    VALUES (${userId}::uuid, ${windowStart}, 1)
    ON CONFLICT(user_id, window_start) DO UPDATE
      SET attempt_count = registry_submission_attempts.attempt_count + 1
      WHERE registry_submission_attempts.attempt_count < 20
    RETURNING attempt_count`
  if (!attempts.length) throw new CommunityError('Too many submissions. Try again later')
}

async function ownedProject(db: Client, userId: string, slug: string) {
  const entity = await db.entities.findFirst({ where: { slug, entity_type: 'PROJECT', archived_at: null } })
  if (!entity) throw new CommunityError('Project not found')
  const claim = await db.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: 'VERIFIED' }, select: { id: true } })
  if (!claim) throw new CommunityError('Verified ownership required')
  const project = await db.software_packages.findUnique({ where: { entity_id: entity.id } })
  if (!project) throw new CommunityError('Project not found')
  return { entity, project }
}

export async function createDeveloperProfile(db: PrismaClient, userId: string, input: { handle: string; displayName: string; bio: string }) {
  await writable(db, userId)
  const handle = input.handle.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(handle)) throw new CommunityError('Handle must be 3-40 lowercase letters, numbers or hyphens')
  const displayName = cleanText(input.displayName, 100, true)
  const bio = cleanText(input.bio, 1000)
  return db.$transaction(async tx => {
    await activeUser(tx, userId)
    if (await tx.developer_profiles.findUnique({ where: { user_id: userId } })) throw new CommunityError('Developer profile already exists')
    if (!await tx.entity_claims.count({ where: { claimant_id: userId, status: 'VERIFIED' } })) throw new CommunityError('Verify a project before creating a profile')
    const claim = await tx.entity_claims.findFirst({ where: { claimant_id: userId, status: 'VERIFIED' }, orderBy: { checked_at: 'desc' }, select: { id: true } })
    const source = claim && await tx.registry_evidence.findFirst({ where: { claim_id: claim.id }, orderBy: { observed_at: 'desc' }, select: { id: true } })
    const entity = await tx.entities.create({ data: { entity_type: 'DEVELOPER', slug: `developer-${handle}`, publication_status: 'PUBLISHED' } })
    const reputation = await tx.registry_reputation_events.aggregate({ where: { user_id: userId }, _sum: { points: true } })
    const profile = await tx.developer_profiles.create({ data: { user_id: userId, entity_id: entity.id, handle, display_name: displayName, bio, reputation: reputation._sum.points ?? 0 } })
    await tx.registry_changes.create({ data: { entity_id: entity.id, actor_id: userId, evidence_id: source?.id, action: 'DEVELOPER_PROFILE_CREATED', after_value: { handle, displayName, bio } } })
    return profile
  })
}

export async function addGitHubProject(db: PrismaClient, userId: string, repositoryUrl: string) {
  await writable(db, userId)
  const recent = await db.registry_changes.count({ where: { actor_id: userId, action: 'PROJECT_ADDED', created_at: { gte: new Date(Date.now() - 3_600_000) } } })
  if (recent >= 5) throw new CommunityError('Try adding another project later')
  const result = await importGitHubProject(db, repositoryUrl)
  if (!result.project.entity_id) throw new CommunityError('Imported project is missing its Registry identity')
  const entity = await db.entities.findUniqueOrThrow({ where: { id: result.project.entity_id }, select: { slug: true } })
  const proof = await db.registry_evidence.findFirst({ where: { entity_id: result.project.entity_id, kind: 'REPOSITORY' }, select: { id: true } })
  await db.registry_changes.create({ data: { entity_id: result.project.entity_id, actor_id: userId, evidence_id: proof?.id, action: 'PROJECT_ADDED', after_value: { repositoryUrl: result.project.repository_url, status: result.project.verification_status } } })
  return entity.slug
}

export async function saveProjectMetadata(db: PrismaClient, userId: string, slug: string, input: { name: string; description: string; homepage: string; license: string; evidence: string }) {
  await writable(db, userId)
  const name = cleanText(input.name, 255, true)
  const description = cleanText(input.description, 4000)
  const homepage = secureUrl(input.homepage)
  const license = cleanText(input.license, 100) || null
  const evidenceUrl = secureUrl(input.evidence, true)!
  return db.$transaction(async tx => {
    const { entity, project } = await ownedProject(tx, userId, slug)
    const after = { name, description, homepage, license }
    const before = { name: project.canonical_name, description: project.description, homepage: project.homepage_url, license: project.license_id }
    const proof = await tx.registry_evidence.create({ data: { entity_id: entity.id, submitted_by: userId, url: evidenceUrl, kind: 'COMMUNITY' } })
    if (entity.publication_status === 'DRAFT') {
      await tx.software_packages.update({ where: { id: project.id }, data: { canonical_name: name, description, homepage_url: homepage, license_id: license, updated_at: new Date() } })
      await tx.registry_changes.create({ data: { entity_id: entity.id, actor_id: userId, evidence_id: proof.id, action: 'PROJECT_METADATA_UPDATED', before_value: before, after_value: after } })
      return 'UPDATED' as const
    }
    const correction = await tx.registry_corrections.create({ data: { entity_id: entity.id, user_id: userId, evidence_id: proof.id, proposed_value: { kind: 'PROJECT_METADATA', before, after } } })
    await tx.registry_changes.create({ data: { entity_id: entity.id, actor_id: userId, evidence_id: proof.id, action: 'PROJECT_METADATA_PROPOSED', before_value: before, after_value: { correctionId: correction.id, ...after } } })
    return 'PENDING' as const
  })
}

export async function submitCorrection(db: PrismaClient, userId: string, slug: string, text: string, evidence: string) {
  await writable(db, userId)
  const description = cleanText(text, 2000, true)
  const evidenceUrl = secureUrl(evidence, true)!
  return db.$transaction(async tx => {
    const entity = await tx.entities.findFirst({ where: { slug, archived_at: null, entity_type: { in: ['PROJECT', 'ROBOT'] } }, select: { id: true } })
    if (!entity) throw new CommunityError('Entity not found')
    const proof = await tx.registry_evidence.create({ data: { entity_id: entity.id, submitted_by: userId, url: evidenceUrl, kind: 'COMMUNITY' } })
    const correction = await tx.registry_corrections.create({ data: { entity_id: entity.id, user_id: userId, evidence_id: proof.id, proposed_value: { kind: 'TEXT_CORRECTION', description } } })
    await tx.registry_changes.create({ data: { entity_id: entity.id, actor_id: userId, evidence_id: proof.id, action: 'CORRECTION_SUBMITTED', after_value: { correctionId: correction.id, description } } })
    return correction
  })
}

export async function suggestCompatibility(db: PrismaClient, userId: string, projectSlug: string, robotSlug: string, evidence: string) {
  await writable(db, userId)
  const project = await ownedProject(db, userId, projectSlug)
  const robot = await db.entities.findFirst({ where: { slug: robotSlug, entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true } })
  if (!robot) throw new CommunityError('Published robot not found')
  const url = secureUrl(evidence, true)!
  return registryRepository(db).proposeCompatibility({ userId, projectId: project.project.id, robotId: robot.id, evidenceUrl: url, environment: environment() })
}

export async function submitCompatibilityOpinion(db: PrismaClient, userId: string, compatibilityId: string, verdict: 'CONFIRMED' | 'DISPUTED', evidence: string) {
  await writable(db, userId)
  const url = secureUrl(evidence, true)!
  return db.$transaction(async tx => {
    const compatibility = await tx.compatibility_claims.findFirst({ where: { id: compatibilityId, project_id: { not: null }, claim_status: 'VERIFIED' } })
    if (!compatibility?.project_id) throw new CommunityError('Compatibility is not open for community review')
    const ownsProject = await tx.entity_claims.count({ where: { entity_id: compatibility.project_id, claimant_id: userId, status: 'VERIFIED' } })
    if (ownsProject || compatibility.created_by === userId) throw new CommunityError('An independent account must review this compatibility')
    const proof = await tx.registry_evidence.create({ data: { compatibility_id: compatibility.id, submitted_by: userId, url, kind: 'COMMUNITY' } })
    const confirmation = await tx.compatibility_confirmations.create({ data: { compatibility_id: compatibility.id, user_id: userId, evidence_id: proof.id, verdict } })
    await tx.registry_changes.create({ data: { compatibility_id: compatibility.id, actor_id: userId, evidence_id: proof.id, action: verdict === 'CONFIRMED' ? 'COMPATIBILITY_CONFIRMATION_SUBMITTED' : 'COMPATIBILITY_DISPUTE_SUBMITTED', after_value: { confirmationId: confirmation.id, verdict } } })
    return confirmation
  })
}
