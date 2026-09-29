import type { PrismaClient } from '@robotspace/db'
import { awardReputation } from './registry-reputation'

type Decision = 'ACCEPTED' | 'REJECTED'
type Metadata = { name: string; description: string | null; homepage: string | null; license: string | null }

function projectMetadata(value: unknown): Metadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metadata')
  const data = value as Record<string, unknown>
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 255 || (data.description !== null && (typeof data.description !== 'string' || data.description.length > 4000)) || (data.homepage !== null && (typeof data.homepage !== 'string' || !/^https:\/\/[^\s@]+$/.test(data.homepage) || data.homepage.length > 2000)) || (data.license !== null && (typeof data.license !== 'string' || data.license.length > 100))) throw new Error('Invalid metadata')
  return data as Metadata
}

export async function moderateCorrection(db: PrismaClient, correctionId: string, verdict: Decision, actor: string) {
  return db.$transaction(async tx => {
    const correction = await tx.registry_corrections.findUnique({ where: { id: correctionId } })
    if (correction?.status !== 'PENDING') throw new Error('Correction is no longer pending')
    const entity = await tx.entities.findUniqueOrThrow({ where: { id: correction.entity_id } })
    const proposal = correction.proposed_value as Record<string, unknown>
    const metadata = proposal.kind === 'PROJECT_METADATA'
    if (proposal.kind !== 'PROJECT_METADATA' && proposal.kind !== 'TEXT_CORRECTION') throw new Error('Unknown correction type')
    if (verdict === 'ACCEPTED' && metadata) {
      if (entity.entity_type !== 'PROJECT' || entity.publication_status !== 'PUBLISHED') throw new Error('Project is no longer published')
      const before = projectMetadata(proposal.before)
      const after = projectMetadata(proposal.after)
      const project = await tx.software_packages.findUniqueOrThrow({ where: { entity_id: entity.id } })
      const current = { name: project.canonical_name, description: project.description, homepage: project.homepage_url, license: project.license_id }
      if (current.name !== before.name || current.description !== before.description || current.homepage !== before.homepage || current.license !== before.license) throw new Error('Project metadata changed after this proposal; request a new correction')
      await tx.software_packages.update({ where: { id: project.id }, data: { canonical_name: after.name, description: after.description, homepage_url: after.homepage, license_id: after.license, updated_at: new Date() } })
    }
    await tx.registry_corrections.update({ where: { id: correction.id }, data: { status: verdict } })
    if (verdict === 'ACCEPTED') await awardReputation(tx, correction.user_id, 'CORRECTION_ACCEPTED', correction.id)
    await tx.registry_changes.create({ data: { entity_id: entity.id, evidence_id: correction.evidence_id, action: verdict === 'ACCEPTED' ? 'CORRECTION_ACCEPTED' : 'CORRECTION_REJECTED', after_value: { correctionId, metadataApplied: verdict === 'ACCEPTED' && metadata } } })
    await tx.registry_notifications.create({ data: { user_id: correction.user_id, entity_id: entity.id, kind: verdict === 'ACCEPTED' ? 'CORRECTION_ACCEPTED' : 'CORRECTION_REJECTED', message: verdict === 'ACCEPTED' ? metadata ? 'Your project metadata update was accepted.' : 'Your correction was accepted as evidence for editorial review; public data was not changed.' : 'Your correction was not accepted.' } })
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: actor, action: `registry_correction_${verdict.toLowerCase()}`, target_type: 'REGISTRY_CORRECTION', target_id: correction.id } })
  })
}

export async function moderateConfirmation(db: PrismaClient, confirmationId: string, verdict: Decision, actor: string) {
  return db.$transaction(async tx => {
    const confirmation = await tx.compatibility_confirmations.findUnique({ where: { id: confirmationId } })
    if (confirmation?.status !== 'PENDING') throw new Error('Confirmation is no longer pending')
    const compatibility = await tx.compatibility_claims.findUniqueOrThrow({ where: { id: confirmation.compatibility_id } })
    if (!compatibility.project_id || !['SUGGESTED', 'VERIFIED'].includes(compatibility.claim_status)) throw new Error('Compatibility is no longer reviewable')
    await tx.compatibility_confirmations.update({ where: { id: confirmation.id }, data: { status: verdict } })
    if (verdict === 'ACCEPTED') await awardReputation(tx, confirmation.user_id, confirmation.verdict === 'CONFIRMED' ? 'COMPATIBILITY_CONFIRMATION_ACCEPTED' : 'COMPATIBILITY_DISPUTE_ACCEPTED', confirmation.id)
    await tx.registry_changes.create({ data: { compatibility_id: compatibility.id, evidence_id: confirmation.evidence_id, action: verdict === 'ACCEPTED' ? 'COMPATIBILITY_CONFIRMATION_ACCEPTED' : 'COMPATIBILITY_CONFIRMATION_REJECTED', after_value: { confirmationId, status: verdict } } })
    const opinion = confirmation.verdict === 'CONFIRMED' ? 'confirmation' : 'dispute'
    await tx.registry_notifications.create({ data: { user_id: confirmation.user_id, compatibility_id: compatibility.id, kind: verdict === 'ACCEPTED' ? 'COMPATIBILITY_ACCEPTED' : 'COMPATIBILITY_REJECTED', message: verdict === 'ACCEPTED' ? `Your compatibility ${opinion} was accepted as a community report.` : `Your compatibility ${opinion} was not accepted.` } })
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: actor, action: `registry_compatibility_${verdict.toLowerCase()}`, target_type: 'COMPATIBILITY_CONFIRMATION', target_id: confirmation.id } })
  })
}

export async function moderateCompatibilitySuggestion(db: PrismaClient, compatibilityId: string, verdict: Decision, actor: string) {
  return db.$transaction(async tx => {
    const compatibility = await tx.compatibility_claims.findUnique({ where: { id: compatibilityId } })
    if (!compatibility?.project_id || compatibility.claim_status !== 'SUGGESTED') throw new Error('Suggestion is no longer pending')
    const proof = await tx.registry_evidence.findFirst({ where: { compatibility_id: compatibility.id }, orderBy: { observed_at: 'asc' }, select: { id: true } })
    if (!proof) throw new Error('Compatibility evidence is required')
    await tx.compatibility_claims.update({ where: { id: compatibility.id }, data: { claim_status: verdict === 'ACCEPTED' ? 'VERIFIED' : 'REJECTED', checked_at: new Date() } })
    if (verdict === 'ACCEPTED' && compatibility.created_by) await awardReputation(tx, compatibility.created_by, 'COMPATIBILITY_SUGGESTION_ACCEPTED', compatibility.id)
    await tx.registry_changes.create({ data: { compatibility_id: compatibility.id, evidence_id: proof.id, action: verdict === 'ACCEPTED' ? 'COMPATIBILITY_SUGGESTION_ACCEPTED' : 'COMPATIBILITY_SUGGESTION_REJECTED', after_value: { status: verdict } } })
    if (compatibility.created_by) await tx.registry_notifications.create({ data: { user_id: compatibility.created_by, compatibility_id: compatibility.id, kind: verdict === 'ACCEPTED' ? 'COMPATIBILITY_ACCEPTED' : 'COMPATIBILITY_REJECTED', message: verdict === 'ACCEPTED' ? 'Your robot compatibility suggestion was verified.' : 'Your robot compatibility suggestion was not accepted.' } })
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: actor, action: `registry_compatibility_suggestion_${verdict.toLowerCase()}`, target_type: 'COMPATIBILITY_CLAIM', target_id: compatibility.id } })
  })
}
