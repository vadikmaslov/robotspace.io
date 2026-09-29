import { prisma } from '@robotspace/db'
import { rejectPendingClaim, revokeManufacturerClaimByAdmin } from './actions'

export const dynamic = 'force-dynamic'

export default async function RegistryClaimsPage() {
  let claims: Array<{ id: string; entity_id: string; claimant_id: string; proof_url: string; created_at: Date }> = []
  let manufacturerClaims: Array<{ id: string; entity_id: string; claimant_id: string; checked_at: Date | null }> = []
  try { claims = await prisma.entity_claims.findMany({ where: { status: 'PENDING' }, select: { id: true, entity_id: true, claimant_id: true, proof_url: true, created_at: true }, orderBy: { created_at: 'asc' }, take: 100 }) }
  catch { /* The Registry migrations may not be deployed yet. */ }
  try { manufacturerClaims = await prisma.entity_claims.findMany({ where: { status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER' }, select: { id: true, entity_id: true, claimant_id: true, checked_at: true }, orderBy: { checked_at: 'desc' }, take: 100 }) }
  catch { /* The migration may not be deployed yet. */ }
  const claimEntities = [...claims.map(c => c.entity_id), ...manufacturerClaims.map(c => c.entity_id)]
  const entities = claimEntities.length ? await prisma.entities.findMany({ where: { id: { in: claimEntities } }, select: { id: true, slug: true } }) : []
  const accounts = claims.length ? await prisma.registry_accounts.findMany({ where: { user_id: { in: claims.map(c => c.claimant_id) } }, select: { user_id: true, provider_account_id: true } }) : []
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Registry claims</h1><p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Pending project and company claims appear here. Reject unsupported claims; verified manufacturer access can be revoked below.</p></div>
    {claims.length === 0 ? <p className="rounded-lg border p-6 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>No claims need review.</p> : <div className="space-y-3">{claims.map(claim => <article key={claim.id} className="rounded-lg border p-4 flex flex-wrap justify-between gap-4" style={{ borderColor: 'var(--color-border-color)' }}><div><p className="font-medium">{entities.find(entity => entity.id === claim.entity_id)?.slug ?? claim.entity_id}</p><p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>GitHub account ID: {accounts.find(account => account.user_id === claim.claimant_id)?.provider_account_id ?? 'unknown'}</p><a href={claim.proof_url} target="_blank" rel="noopener noreferrer" className="text-xs underline break-all">{claim.proof_url}</a><p className="text-xs mt-1">Submitted {claim.created_at.toISOString().slice(0, 10)}</p></div><form action={rejectPendingClaim}><input type="hidden" name="claim" value={claim.id} /><button className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)' }}>Reject claim</button></form></article>)}</div>}
    <section className="space-y-3"><h2 className="text-lg font-medium">Verified manufacturers</h2>{manufacturerClaims.length ? manufacturerClaims.map(claim => <article key={claim.id} className="rounded-lg border p-4 flex flex-wrap justify-between gap-4" style={{ borderColor: 'var(--color-border-color)' }}><div><p className="font-medium">{entities.find(entity => entity.id === claim.entity_id)?.slug ?? claim.entity_id}</p><p className="text-xs mt-1">Verified {claim.checked_at?.toISOString().slice(0, 10) ?? 'unknown'}</p></div><form action={revokeManufacturerClaimByAdmin}><input type="hidden" name="claim" value={claim.id} /><button className="rounded-md border px-3 py-2 text-sm">Revoke access</button></form></article>) : <p className="text-sm">No verified manufacturer claims.</p>}</section>
  </div>
}
