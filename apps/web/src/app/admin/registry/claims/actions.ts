'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '../../../../auth'
import { prisma } from '@robotspace/db'

export async function rejectPendingClaim(formData: FormData) {
  const session = await auth()
  if (session?.user?.sessionKind !== 'admin') throw new Error('Administrator session required')
  const id = formData.get('claim')
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid claim')
  await prisma.$transaction(async tx => {
    const claim = await tx.entity_claims.findUnique({ where: { id } })
    if (claim?.status !== 'PENDING') throw new Error('Claim is no longer pending')
    await tx.entity_claims.update({ where: { id }, data: { status: 'REJECTED', updated_at: new Date() } })
    await tx.registry_changes.create({ data: { claim_id: id, action: 'CLAIM_MODERATOR_REJECTED', before_value: { status: 'PENDING' }, after_value: { status: 'REJECTED' } } })
    const entity = await tx.entities.findUnique({ where: { id: claim.entity_id }, select: { entity_type: true } })
    await tx.registry_notifications.create({ data: { user_id: claim.claimant_id, entity_id: claim.entity_id, kind: 'CLAIM_REJECTED', message: entity?.entity_type === 'COMPANY' ? 'Your company claim was not accepted. Check the official domain and create a new DNS challenge.' : 'Your project claim was not accepted. Reconnect GitHub and try again if you administer the repository.' } })
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: session.user?.email ?? 'admin', action: 'registry_claim_rejected', target_type: 'ENTITY_CLAIM', target_id: id } })
  })
  revalidatePath('/admin/registry/claims')
}

export async function revokeManufacturerClaimByAdmin(formData: FormData) {
  const session = await auth()
  if (session?.user?.sessionKind !== 'admin') throw new Error('Administrator session required')
  const id = formData.get('claim')
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid claim')
  await prisma.$transaction(async tx => {
    const claim = await tx.entity_claims.findUnique({ where: { id } })
    if (!claim || claim.status !== 'VERIFIED' || claim.verification_method !== 'DNS_TXT_MANUFACTURER') throw new Error('Verified manufacturer claim was not found')
    await tx.entity_claims.update({ where: { id }, data: { status: 'REVOKED', updated_at: new Date() } })
    const remaining = await tx.entity_claims.count({ where: { claimant_id: claim.claimant_id, status: 'VERIFIED', verification_method: 'DNS_TXT_MANUFACTURER' } })
    if (!remaining) await tx.registry_roles.deleteMany({ where: { user_id: claim.claimant_id, role: 'VERIFIED_MANUFACTURER' } })
    await tx.registry_changes.create({ data: { claim_id: id, action: 'MANUFACTURER_ADMIN_REVOKED', before_value: { status: 'VERIFIED' }, after_value: { status: 'REVOKED', reason: 'ADMIN_REVIEW' } } })
    await tx.registry_notifications.create({ data: { user_id: claim.claimant_id, entity_id: claim.entity_id, kind: 'MANUFACTURER_CLAIM_REVOKED', message: 'RobotSpace revoked manufacturer publishing access after review.' } })
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: session.user?.email ?? 'admin', action: 'manufacturer_claim_revoked', target_type: 'ENTITY_CLAIM', target_id: id } })
  })
  revalidatePath('/admin/registry/claims')
}
