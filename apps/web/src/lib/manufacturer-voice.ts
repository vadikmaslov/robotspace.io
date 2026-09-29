import { randomBytes } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { PrismaClient } from '@robotspace/db'

export class ManufacturerError extends Error {
  constructor(public code: 'ACCOUNT' | 'COMPANY' | 'DOMAIN' | 'PROOF' | 'EXPIRED' | 'PERMISSION' | 'INPUT' | 'DISABLED' | 'RATE_LIMIT', message: string) { super(message) }
}

function domainOf(value: string) {
  try {
    const url = new URL(value)
    const domain = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(domain) || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain) || domain.length > 253) throw new Error()
    return domain
  } catch { throw new ManufacturerError('DOMAIN', 'The company needs a verified HTTPS website.') }
}

async function flagEnabled(db: PrismaClient, key: 'registry.claims' | 'registry.write') {
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development'
  const flags = await db.feature_flags.findMany({ where: { key, environment: { in: [environment, 'all'] } }, select: { environment: true, enabled: true } })
  return (flags.find(flag => flag.environment === environment) ?? flags.find(flag => flag.environment === 'all'))?.enabled === true
}

async function companyForClaim(db: PrismaClient, slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,254}$/.test(slug)) throw new ManufacturerError('COMPANY', 'Choose a published company.')
  const entity = await db.entities.findFirst({ where: { slug, entity_type: 'COMPANY', publication_status: 'PUBLISHED', archived_at: null } })
  const company = entity && await db.company_public_projections.findUnique({ where: { company_entity_id: entity.id } })
  if (!entity || !company?.official_url || !company.official_url_verified_at) throw new ManufacturerError('COMPANY', 'This company needs an editorially verified website before it can be claimed.')
  return { entity, company, domain: domainOf(company.official_url) }
}

async function activeUser(db: PrismaClient, userId: string) {
  const [user, account] = await Promise.all([
    db.registry_users.findUnique({ where: { id: userId } }),
    db.registry_accounts.findFirst({ where: { user_id: userId, provider: 'github' } }),
  ])
  if (user?.status !== 'ACTIVE' || !account) throw new ManufacturerError('ACCOUNT', 'Sign in with an active GitHub account.')
}

async function countClaimAttempt(db: PrismaClient, userId: string) {
  const windowStart = new Date(Math.floor(Date.now() / 900_000) * 900_000)
  const rows = await db.$queryRaw<Array<{ attempt_count: number }>>`
    INSERT INTO registry_claim_attempts(user_id, window_start, attempt_count)
    VALUES (${userId}::uuid, ${windowStart}, 1)
    ON CONFLICT(user_id, window_start) DO UPDATE
      SET attempt_count = registry_claim_attempts.attempt_count + 1
      WHERE registry_claim_attempts.attempt_count < 5
    RETURNING attempt_count`
  if (!rows.length) throw new ManufacturerError('RATE_LIMIT', 'Too many claim attempts. Try again in 15 minutes.')
}

export async function beginManufacturerClaim(db: PrismaClient, userId: string, slug: string) {
  if (!await flagEnabled(db, 'registry.claims')) throw new ManufacturerError('DISABLED', 'Manufacturer claims are not available yet.')
  await activeUser(db, userId)
  const { entity, company, domain } = await companyForClaim(db, slug)
  const existing = await db.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: { in: ['PENDING', 'VERIFIED'] } }, orderBy: { created_at: 'desc' } })
  if (existing?.status === 'VERIFIED') return { claim: existing, domain, token: null }
  await countClaimAttempt(db, userId)
  const token = `robotspace-claim=${randomBytes(24).toString('hex')}`
  const expiresAt = new Date(Date.now() + 48 * 60 * 60_000)
  return db.$transaction(async tx => {
    const claim = existing ? await tx.entity_claims.update({ where: { id: existing.id }, data: { proof_url: company.official_url!, updated_at: new Date() } }) : await tx.entity_claims.create({ data: { entity_id: entity.id, claimant_id: userId, proof_url: company.official_url! } })
    await tx.manufacturer_claim_proofs.upsert({ where: { claim_id: claim.id }, create: { claim_id: claim.id, domain, token, expires_at: expiresAt }, update: { domain, token, expires_at: expiresAt, verified_at: null } })
    await tx.registry_changes.create({ data: { claim_id: claim.id, actor_id: userId, action: 'MANUFACTURER_CHALLENGE_CREATED', after_value: { domain, expiresAt: expiresAt.toISOString() } } })
    return { claim, domain, token }
  })
}

export async function verifyManufacturerClaim(db: PrismaClient, userId: string, slug: string, resolver: typeof resolveTxt = resolveTxt) {
  if (!await flagEnabled(db, 'registry.claims')) throw new ManufacturerError('DISABLED', 'Manufacturer claims are not available yet.')
  await activeUser(db, userId)
  const { entity, domain } = await companyForClaim(db, slug)
  const claim = await db.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: 'PENDING' } })
  const proof = claim && await db.manufacturer_claim_proofs.findUnique({ where: { claim_id: claim.id } })
  if (!claim || !proof || proof.domain !== domain) throw new ManufacturerError('PROOF', 'Start a new company claim.')
  if (proof.expires_at <= new Date()) throw new ManufacturerError('EXPIRED', 'The DNS challenge expired. Start again.')
  await countClaimAttempt(db, userId)
  let records: string[][]
  try { records = await resolver(`_robotspace.${domain}`) }
  catch { throw new ManufacturerError('PROOF', 'The DNS TXT record was not found yet.') }
  if (!records.some(parts => parts.join('') === proof.token)) throw new ManufacturerError('PROOF', 'The DNS TXT record does not match this claim.')
  return db.$transaction(async tx => {
    const current = await tx.entity_claims.findUniqueOrThrow({ where: { id: claim.id } })
    const currentProof = await tx.manufacturer_claim_proofs.findUniqueOrThrow({ where: { claim_id: claim.id } })
    if (current.status !== 'PENDING' || currentProof.token !== proof.token || currentProof.expires_at <= new Date()) throw new ManufacturerError('EXPIRED', 'The claim changed. Start again.')
    await tx.manufacturer_claim_proofs.update({ where: { claim_id: claim.id }, data: { verified_at: new Date() } })
    const verified = await tx.entity_claims.update({ where: { id: claim.id }, data: { status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER', checked_at: new Date(), updated_at: new Date() } })
    await tx.registry_roles.upsert({ where: { user_id_role: { user_id: userId, role: 'VERIFIED_MANUFACTURER' } }, create: { user_id: userId, role: 'VERIFIED_MANUFACTURER' }, update: {} })
    await tx.registry_changes.create({ data: { claim_id: claim.id, actor_id: userId, action: 'MANUFACTURER_CLAIM_VERIFIED', after_value: { domain, method: 'DNS_TXT_MANUFACTURER' } } })
    await tx.registry_notifications.create({ data: { user_id: userId, entity_id: entity.id, kind: 'MANUFACTURER_CLAIM_VERIFIED', message: 'Your company claim was verified by DNS. You can now publish official statements for linked robots.' } })
    return verified
  })
}

export async function revokeManufacturerClaim(db: PrismaClient, userId: string, claimId: string) {
  await activeUser(db, userId)
  return db.$transaction(async tx => {
    const claim = await tx.entity_claims.findFirst({ where: { id: claimId, claimant_id: userId, status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER' } })
    if (!claim) throw new ManufacturerError('PERMISSION', 'Active manufacturer claim was not found.')
    const revoked = await tx.entity_claims.update({ where: { id: claim.id }, data: { status: 'REVOKED', updated_at: new Date() } })
    await tx.registry_changes.create({ data: { claim_id: claim.id, actor_id: userId, action: 'MANUFACTURER_CLAIM_REVOKED', before_value: { status: 'VERIFIED' }, after_value: { status: 'REVOKED' } } })
    const remaining = await tx.entity_claims.count({ where: { claimant_id: userId, status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER' } })
    if (!remaining) await tx.registry_roles.deleteMany({ where: { user_id: userId, role: 'VERIFIED_MANUFACTURER' } })
    await tx.registry_notifications.create({ data: { user_id: userId, entity_id: claim.entity_id, kind: 'MANUFACTURER_CLAIM_REVOKED', message: 'Your manufacturer claim was revoked. Official publishing access has ended.' } })
    return revoked
  })
}

export const manufacturerStatementTypes = ['DOCS', 'SDK', 'REPOSITORY', 'RELEASE', 'SPEC'] as const
type StatementType = typeof manufacturerStatementTypes[number]

export async function publishManufacturerStatement(db: PrismaClient, userId: string, input: { companySlug: string; robotId?: string; type: string; title: string; value?: string; url?: string; evidenceUrl: string }) {
  if (!await flagEnabled(db, 'registry.write')) throw new ManufacturerError('DISABLED', 'Manufacturer publishing is not available yet.')
  await activeUser(db, userId)
  const { entity, domain } = await companyForClaim(db, input.companySlug)
  const claim = await db.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER' } })
  const proof = claim && await db.manufacturer_claim_proofs.findUnique({ where: { claim_id: claim.id } })
  if (!claim || !proof?.verified_at || proof.domain !== domain) throw new ManufacturerError('PERMISSION', 'A current verified company claim is required.')
  const type = input.type as StatementType
  const title = input.title.trim()
  const value = input.value?.trim() || null
  const url = input.url?.trim() || null
  if (!manufacturerStatementTypes.includes(type) || !title || title.length > 255 || (type === 'SPEC' && (!value || value.length > 1000)) || (type !== 'SPEC' && !url)) throw new ManufacturerError('INPUT', 'Complete the official statement.')
  if (url) { try { domainOf(url) } catch { throw new ManufacturerError('INPUT', 'Use a public HTTPS resource URL.') } }
  let evidenceDomain: string
  try { evidenceDomain = domainOf(input.evidenceUrl) } catch { throw new ManufacturerError('INPUT', 'Use an HTTPS evidence URL on the company website.') }
  if (evidenceDomain !== domain || input.evidenceUrl.length > 2000 || (url && url.length > 2000)) throw new ManufacturerError('INPUT', 'Evidence must be on the verified company domain.')
  if (input.robotId) {
    const linked = await db.robot_company_relations.findFirst({ where: { robot_entity_id: input.robotId, company_entity_id: entity.id, relation: 'MANUFACTURES' } })
    const robot = linked && await db.entities.findFirst({ where: { id: input.robotId, entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null } })
    if (!robot) throw new ManufacturerError('PERMISSION', 'This robot is not linked to the company as manufacturer.')
  }
  return db.$transaction(async tx => {
    const statement = await tx.manufacturer_statements.create({ data: { company_entity_id: entity.id, robot_entity_id: input.robotId || null, claim_id: claim.id, actor_id: userId, statement_type: type, title, statement_value: value, url, evidence_url: input.evidenceUrl } })
    await tx.registry_changes.create({ data: { entity_id: input.robotId || entity.id, actor_id: userId, action: 'MANUFACTURER_STATEMENT_PUBLISHED', after_value: { statementId: statement.id, companyId: entity.id, claimId: claim.id, type, title, value, url, evidenceUrl: input.evidenceUrl } } })
    return statement
  })
}

export async function getManufacturerVoice(db: PrismaClient, companyEntityId: string, robotEntityId?: string) {
  const company = await db.company_public_projections.findUnique({ where: { company_entity_id: companyEntityId }, select: { official_url: true, official_url_verified_at: true } })
  if (!company?.official_url || !company.official_url_verified_at) return { verified: false, statements: [] as Awaited<ReturnType<typeof db.manufacturer_statements.findMany>> }
  let domain: string
  try { domain = domainOf(company.official_url) } catch { return { verified: false, statements: [] as Awaited<ReturnType<typeof db.manufacturer_statements.findMany>> } }
  const claims = await db.entity_claims.findMany({ where: { entity_id: companyEntityId, status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER' }, select: { id: true, claimant_id: true } })
  if (!claims.length) return { verified: false, statements: [] as Awaited<ReturnType<typeof db.manufacturer_statements.findMany>> }
  const [proofs, users] = await Promise.all([
    db.manufacturer_claim_proofs.findMany({ where: { claim_id: { in: claims.map(claim => claim.id) }, domain, verified_at: { not: null } }, select: { claim_id: true } }),
    db.registry_users.findMany({ where: { id: { in: claims.map(claim => claim.claimant_id) }, status: 'ACTIVE' }, select: { id: true } }),
  ])
  const activeUsers = new Set(users.map(user => user.id))
  const activeClaimIds = claims.filter(claim => activeUsers.has(claim.claimant_id) && proofs.some(proof => proof.claim_id === claim.id)).map(claim => claim.id)
  if (!activeClaimIds.length) return { verified: false, statements: [] as Awaited<ReturnType<typeof db.manufacturer_statements.findMany>> }
  const statements = await db.manufacturer_statements.findMany({ where: { company_entity_id: companyEntityId, claim_id: { in: activeClaimIds }, robot_entity_id: robotEntityId ?? null }, orderBy: { created_at: 'desc' }, take: 50 })
  return { verified: true, statements }
}
