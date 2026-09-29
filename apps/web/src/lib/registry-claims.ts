import type { PrismaClient } from '@robotspace/db'
import { awardReputation } from './registry-reputation'
import { normalizeGitHubRepository } from '@robotspace/db/registry-import'
import { freshGitHubGrant } from './registry-identity'

export class ClaimError extends Error {
  constructor(public code: 'DISABLED' | 'ACCOUNT' | 'TOKEN_EXPIRED' | 'PROJECT' | 'RATE_LIMIT' | 'DENIED' | 'REVIEW' | 'GITHUB_ERROR', message: string) { super(message) }
}

function githubRateLimited(response: Response) { return response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))) }

function environment() { return process.env.NODE_ENV === 'production' ? 'production' : 'development' }

async function claimsEnabled(db: PrismaClient) {
  const rows = await db.feature_flags.findMany({ where: { key: 'registry.claims', environment: { in: [environment(), 'all'] } }, select: { environment: true, enabled: true } })
  return (rows.find(row => row.environment === environment()) ?? rows.find(row => row.environment === 'all'))?.enabled === true
}

async function countAttempt(db: PrismaClient, userId: string) {
  const windowStart = new Date(Math.floor(Date.now() / 900_000) * 900_000)
  const rows = await db.$queryRaw<Array<{ attempt_count: number }>>`
    INSERT INTO registry_claim_attempts(user_id, window_start, attempt_count)
    VALUES (${userId}::uuid, ${windowStart}, 1)
    ON CONFLICT(user_id, window_start) DO UPDATE
      SET attempt_count = registry_claim_attempts.attempt_count + 1
      WHERE registry_claim_attempts.attempt_count < 5
    RETURNING attempt_count`
  if (!rows.length) throw new ClaimError('RATE_LIMIT', 'Too many claim attempts. Try again in 15 minutes.')
}

async function limitedJson(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new ClaimError('GITHUB_ERROR', 'GitHub returned an empty response')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > 256 * 1024) throw new ClaimError('GITHUB_ERROR', 'GitHub response is too large')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> }
  catch { throw new ClaimError('GITHUB_ERROR', 'GitHub returned invalid data') }
}

export async function verifyGitHubControl(token: string, accountId: string, repositoryUrl: string, expectedRepositoryId: bigint | null, fetcher: typeof fetch = fetch) {
  const normalized = normalizeGitHubRepository(repositoryUrl)
  const [owner, repo] = new URL(normalized).pathname.slice(1).split('/')
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'RobotSpace-Registry/1.0' }
  let identityResponse: Response, repositoryResponse: Response
  try {
    identityResponse = await fetcher('https://api.github.com/user', { headers, redirect: 'error', signal: AbortSignal.timeout(10_000) })
    if (githubRateLimited(identityResponse)) throw new ClaimError('RATE_LIMIT', 'GitHub rate limit reached. Try again later.')
    if (identityResponse.status === 403) throw new ClaimError('REVIEW', 'GitHub did not provide access to verify this account.')
    if (!identityResponse.ok) throw new ClaimError('TOKEN_EXPIRED', 'GitHub authorization expired. Sign in again.')
    const identity = await limitedJson(identityResponse)
    if (String(identity.id) !== accountId) throw new ClaimError('DENIED', 'GitHub account does not match your session.')
    repositoryResponse = await fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers, redirect: 'error', signal: AbortSignal.timeout(10_000) })
  } catch (error) {
    if (error instanceof ClaimError) throw error
    throw new ClaimError('GITHUB_ERROR', 'GitHub is unavailable. Try again later.')
  }
  if (githubRateLimited(repositoryResponse)) throw new ClaimError('RATE_LIMIT', 'GitHub rate limit reached. Try again later.')
  if (repositoryResponse.status === 403) throw new ClaimError('REVIEW', 'GitHub did not provide repository permissions.')
  if (repositoryResponse.status === 404) throw new ClaimError('PROJECT', 'GitHub repository was not found.')
  if (!repositoryResponse.ok) throw new ClaimError('GITHUB_ERROR', 'GitHub is unavailable. Try again later.')
  const repository = await limitedJson(repositoryResponse)
  if (!Number.isSafeInteger(repository.id) || repository.private !== false || typeof repository.html_url !== 'string' || normalizeGitHubRepository(repository.html_url) !== normalized || (expectedRepositoryId !== null && BigInt(repository.id as number) !== expectedRepositoryId)) throw new ClaimError('DENIED', 'Repository identity could not be confirmed.')
  const permissions = repository.permissions as Record<string, unknown> | undefined
  if (!permissions || typeof permissions.admin !== 'boolean') throw new ClaimError('REVIEW', 'GitHub did not provide repository permissions. This claim needs review.')
  if (permissions.admin !== true) throw new ClaimError('DENIED', 'Your GitHub account does not administer this repository.')
  return { repositoryId: BigInt(repository.id as number), repositoryUrl: normalized }
}

export async function claimProject(db: PrismaClient, userId: string, slug: string, fetcher: typeof fetch = fetch) {
  if (!await claimsEnabled(db)) throw new ClaimError('DISABLED', 'Project claims are not available yet.')
  if (!/^[a-z0-9][a-z0-9-]{0,254}$/.test(slug)) throw new ClaimError('PROJECT', 'Choose a valid project.')
  const account = await db.registry_accounts.findFirst({ where: { user_id: userId, provider: 'github' } })
  const user = await db.registry_users.findUnique({ where: { id: userId } })
  if (!account || user?.status !== 'ACTIVE') throw new ClaimError('ACCOUNT', 'An active GitHub account is required.')
  const entity = await db.entities.findFirst({ where: { slug, entity_type: 'PROJECT', archived_at: null } })
  const project = entity && await db.software_packages.findUnique({ where: { entity_id: entity.id } })
  if (!entity || !project?.repository_url || project.verification_status === 'REJECTED') throw new ClaimError('PROJECT', 'This project cannot be claimed.')
  let repositoryUrl: string
  try { repositoryUrl = normalizeGitHubRepository(project.repository_url) }
  catch { throw new ClaimError('PROJECT', 'This project has no supported GitHub repository.') }
  const token = await freshGitHubGrant(db, userId)
  if (!token) throw new ClaimError('TOKEN_EXPIRED', 'Sign in with GitHub again to confirm repository control.')
  await countAttempt(db, userId)
  let existing = await db.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: { in: ['PENDING', 'VERIFIED'] } }, orderBy: { created_at: 'desc' } })
  if (!existing) {
    try { existing = await db.entity_claims.create({ data: { entity_id: entity.id, claimant_id: userId, proof_url: repositoryUrl } }) }
    catch {
      existing = await db.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: { in: ['PENDING', 'VERIFIED'] } } })
      if (!existing) throw new ClaimError('GITHUB_ERROR', 'Could not create the claim. Try again.')
    }
  }
  let proof: Awaited<ReturnType<typeof verifyGitHubControl>>
  try {
    proof = await verifyGitHubControl(token, account.provider_account_id, repositoryUrl, project.github_repository_id, fetcher)
  } catch (error) {
    if (error instanceof ClaimError && (error.code === 'DENIED' || error.code === 'PROJECT') && existing?.status === 'VERIFIED') await revokeClaim(db, userId, existing.id, 'GITHUB_ACCESS_LOST')
    if (error instanceof ClaimError && (error.code === 'DENIED' || error.code === 'PROJECT') && existing?.status === 'PENDING') {
      await db.$transaction(async tx => {
        await tx.entity_claims.update({ where: { id: existing!.id }, data: { status: 'REJECTED', updated_at: new Date() } })
        await tx.registry_changes.create({ data: { claim_id: existing!.id, actor_id: userId, action: 'CLAIM_DENIED', after_value: { status: 'REJECTED', reason: error.code } } })
      })
    }
    if (error instanceof ClaimError && error.code === 'REVIEW' && existing?.status === 'PENDING') await db.registry_changes.create({ data: { claim_id: existing.id, actor_id: userId, action: 'CLAIM_REVIEW_REQUIRED', after_value: { status: 'PENDING' } } })
    throw error
  } finally {
    await db.registry_login_grants.deleteMany({ where: { user_id: userId } })
  }
  return db.$transaction(async tx => {
    let claim = existing!
    const evidence = await tx.registry_evidence.create({ data: { claim_id: claim.id, submitted_by: userId, url: proof.repositoryUrl, kind: 'REPOSITORY' } })
    if (project.github_repository_id === null) await tx.software_packages.update({ where: { id: project.id }, data: { github_repository_id: proof.repositoryId } })
    if (claim.status === 'PENDING') {
      claim = await tx.entity_claims.update({ where: { id: claim.id }, data: { status: 'VERIFIED', verification_method: 'GITHUB_REPOSITORY_ADMIN', checked_at: new Date(), updated_at: new Date() } })
      await awardReputation(tx, userId, 'CLAIM_VERIFIED', entity.id)
    }
    else claim = await tx.entity_claims.update({ where: { id: claim.id }, data: { checked_at: new Date(), updated_at: new Date() } })
    await tx.registry_roles.upsert({ where: { user_id_role: { user_id: userId, role: 'VERIFIED_DEVELOPER' } }, create: { user_id: userId, role: 'VERIFIED_DEVELOPER' }, update: {} })
    await tx.registry_changes.create({ data: { claim_id: claim.id, actor_id: userId, evidence_id: evidence.id, action: existing?.status === 'VERIFIED' ? 'CLAIM_RECHECKED' : 'CLAIM_VERIFIED', after_value: { status: 'VERIFIED', method: 'GITHUB_REPOSITORY_ADMIN' } } })
    return claim
  })
}

export async function revokeClaim(db: PrismaClient, userId: string, claimId: string, reason = 'USER_REVOKED') {
  return db.$transaction(async tx => {
    const claim = await tx.entity_claims.findFirst({ where: { id: claimId, claimant_id: userId, status: 'VERIFIED' } })
    if (!claim) throw new ClaimError('PROJECT', 'Active claim was not found.')
    const revoked = await tx.entity_claims.update({ where: { id: claim.id }, data: { status: 'REVOKED', updated_at: new Date() } })
    await tx.registry_changes.create({ data: { claim_id: claim.id, actor_id: userId, action: reason, before_value: { status: 'VERIFIED' }, after_value: { status: 'REVOKED' } } })
    const remaining = await tx.entity_claims.count({ where: { claimant_id: userId, status: 'VERIFIED' } })
    if (!remaining) await tx.registry_roles.deleteMany({ where: { user_id: userId, role: 'VERIFIED_DEVELOPER' } })
    return revoked
  })
}
