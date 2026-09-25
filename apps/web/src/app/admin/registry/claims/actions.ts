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
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: session.user?.email ?? 'admin', action: 'registry_claim_rejected', target_type: 'ENTITY_CLAIM', target_id: id } })
  })
  revalidatePath('/admin/registry/claims')
}
