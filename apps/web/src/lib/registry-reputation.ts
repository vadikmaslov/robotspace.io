import type { Prisma } from '@robotspace/db'

export const reputationPoints = {
  CLAIM_VERIFIED: 2,
  CORRECTION_ACCEPTED: 1,
  COMPATIBILITY_SUGGESTION_ACCEPTED: 1,
  COMPATIBILITY_CONFIRMATION_ACCEPTED: 1,
  COMPATIBILITY_DISPUTE_ACCEPTED: 1,
} as const

export type ReputationEventType = keyof typeof reputationPoints

export async function awardReputation(tx: Prisma.TransactionClient, userId: string, eventType: ReputationEventType, referenceId: string) {
  return tx.registry_reputation_events.upsert({
    where: { user_id_event_type_reference_id: { user_id: userId, event_type: eventType, reference_id: referenceId } },
    create: { user_id: userId, event_type: eventType, reference_id: referenceId, points: reputationPoints[eventType] },
    update: {},
  })
}
