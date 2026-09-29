import { createHmac } from 'node:crypto'
import type { Prisma } from '@robotspace/db'

type Counter = { attempts: number }

export async function consumeAdminPasswordCounters(tx: Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>, digest: string): Promise<boolean> {
  await tx.$executeRaw`DELETE FROM admin_login_limits WHERE expires_at <= now()`
  const global = await tx.$queryRaw<Counter[]>`
    INSERT INTO admin_login_limits (key, attempts, expires_at)
    VALUES ('global', 1, now() + interval '1 minute')
    ON CONFLICT (key) DO UPDATE SET attempts = LEAST(admin_login_limits.attempts + 1, 61)
    RETURNING attempts`
  if (global[0].attempts > 60) return false
  const perAddress = await tx.$queryRaw<Counter[]>`
    INSERT INTO admin_login_limits (key, attempts, expires_at)
    VALUES (${digest}, 1, now() + interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET attempts = LEAST(admin_login_limits.attempts + 1, 6)
    RETURNING attempts`
  return perAddress[0].attempts <= 5
}

/** Persistent atomic counters; no plaintext IP addresses or passwords stored. */
export async function allowAdminPasswordAttempt(request: Request): Promise<boolean> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) return false
  try {
    const { prisma } = await import('@robotspace/db')
    // Only trust this header when the deployment explicitly guarantees that the
    // reverse proxy overwrites it and the application port is not public.
    const address = process.env.TRUST_PROXY_IP === 'true'
      ? request.headers.get('x-real-ip') ?? 'unknown'
      : 'unknown'
    const digest = createHmac('sha256', secret).update(address.slice(0, 256)).digest('hex')
    return await prisma.$transaction(tx => consumeAdminPasswordCounters(tx, digest))
  } catch {
    // Fail closed when the migration or database is unavailable.
    console.warn('[auth] Password sign-in rate limiter unavailable')
    return false
  }
}
