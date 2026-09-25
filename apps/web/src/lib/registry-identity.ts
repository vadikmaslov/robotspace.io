import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@robotspace/db'

const GRANT_MINUTES = 10

function encryptionKey() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET is required for Registry sign-in')
  return createHash('sha256').update('robotspace-registry-github-grant-v1').update(secret).digest()
}

export async function registerGitHubIdentity(db: PrismaClient, providerAccountId: string, accessToken: string) {
  if (!/^\d+$/.test(providerAccountId) || !accessToken) throw new Error('GitHub identity is invalid')
  let account = await db.registry_accounts.findUnique({ where: { provider_provider_account_id: { provider: 'github', provider_account_id: providerAccountId } } })
  if (!account) {
    try {
      account = await db.$transaction(async tx => {
        const user = await tx.registry_users.create({ data: {} })
        await tx.registry_roles.create({ data: { user_id: user.id, role: 'USER' } })
        return tx.registry_accounts.create({ data: { user_id: user.id, provider: 'github', provider_account_id: providerAccountId } })
      })
    } catch (error) {
      // A concurrent OAuth callback may have created the same GitHub account.
      account = await db.registry_accounts.findUnique({ where: { provider_provider_account_id: { provider: 'github', provider_account_id: providerAccountId } } })
      if (!account) throw error
    }
  }
  const user = await db.registry_users.findUnique({ where: { id: account.user_id } })
  if (user?.status !== 'ACTIVE') throw new Error('Registry account is inactive')
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce)
  const ciphertext = Buffer.concat([cipher.update(accessToken, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const expiresAt = new Date(Date.now() + GRANT_MINUTES * 60_000)
  await db.registry_login_grants.upsert({ where: { user_id: user.id }, create: { user_id: user.id, ciphertext, nonce, auth_tag: authTag, expires_at: expiresAt }, update: { ciphertext, nonce, auth_tag: authTag, expires_at: expiresAt, created_at: new Date() } })
  return user.id
}

export async function registryUserForGitHub(db: PrismaClient, providerAccountId: string) {
  const account = await db.registry_accounts.findUnique({ where: { provider_provider_account_id: { provider: 'github', provider_account_id: providerAccountId } } })
  return account?.user_id ?? null
}

export async function freshGitHubGrant(db: PrismaClient, userId: string) {
  const grant = await db.registry_login_grants.findUnique({ where: { user_id: userId } })
  if (!grant) return null
  if (grant.expires_at <= new Date()) {
    await db.registry_login_grants.deleteMany({ where: { user_id: userId, expires_at: { lte: new Date() } } })
    return null
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), grant.nonce)
    decipher.setAuthTag(grant.auth_tag)
    return Buffer.concat([decipher.update(grant.ciphertext), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
