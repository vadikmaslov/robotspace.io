import { prisma } from '@robotspace/db'
import { rejectPendingClaim } from './actions'

export const dynamic = 'force-dynamic'

export default async function RegistryClaimsPage() {
  let claims: Array<{ id: string; entity_id: string; claimant_id: string; proof_url: string; created_at: Date }> = []
  try { claims = await prisma.entity_claims.findMany({ where: { status: 'PENDING' }, select: { id: true, entity_id: true, claimant_id: true, proof_url: true, created_at: true }, orderBy: { created_at: 'asc' }, take: 100 }) }
  catch { /* The Registry migrations may not be deployed yet. */ }
  const entities = claims.length ? await prisma.entities.findMany({ where: { id: { in: claims.map(c => c.entity_id) } }, select: { id: true, slug: true } }) : []
  const accounts = claims.length ? await prisma.registry_accounts.findMany({ where: { user_id: { in: claims.map(c => c.claimant_id) } }, select: { user_id: true, provider_account_id: true } }) : []
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Registry claims</h1><p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Claims GitHub could not verify remain pending. Reject unsupported claims here; the developer can reconnect GitHub and try again.</p></div>
    {claims.length === 0 ? <p className="rounded-lg border p-6 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>No claims need review.</p> : <div className="space-y-3">{claims.map(claim => <article key={claim.id} className="rounded-lg border p-4 flex flex-wrap justify-between gap-4" style={{ borderColor: 'var(--color-border-color)' }}><div><p className="font-medium">{entities.find(entity => entity.id === claim.entity_id)?.slug ?? claim.entity_id}</p><p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>GitHub account ID: {accounts.find(account => account.user_id === claim.claimant_id)?.provider_account_id ?? 'unknown'}</p><a href={claim.proof_url} target="_blank" rel="noopener noreferrer" className="text-xs underline break-all">{claim.proof_url}</a><p className="text-xs mt-1">Submitted {claim.created_at.toISOString().slice(0, 10)}</p></div><form action={rejectPendingClaim}><input type="hidden" name="claim" value={claim.id} /><button className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>Reject claim</button></form></article>)}</div>}
  </div>
}
