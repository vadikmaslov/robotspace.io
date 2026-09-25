/**
 * Phase 2B: Assertion Repository
 * CRUD for field_assertions, canonical_fields, manual_overrides, data_conflicts
 */

import { prisma } from '../index'
import { LegalStatus, type Prisma } from '@prisma/client'

export const assertionRepo = {
  /** Create a new field assertion from source ingestion */
  async create(params: {
    entityType: 'ROBOT' | 'COMPANY'
    entityId: string
    fieldKey?: string
    fieldSchemaVersion?: string
    attributeDefVersionId?: string
    categorySchemaVersionId?: string
    normalizedValue: unknown
    rawValue: unknown
    sourceId: string
    sourceRecordId?: string
    evidenceUrl?: string
    observedAt: Date
    evidenceConfidence: number
    extractionMethod: string
    extractionVersion?: string
    evidenceOriginId?: string
  }) {
    return prisma.field_assertions.create({
      data: {
        entity_type: params.entityType,
        entity_id: params.entityId,
        field_key: params.fieldKey ?? undefined,
        field_schema_version: params.fieldSchemaVersion ?? undefined,
        attribute_definition_version_id: params.attributeDefVersionId ?? undefined,
        category_schema_version_id: params.categorySchemaVersionId ?? undefined,
        normalized_value_json: params.normalizedValue as any,
        raw_value_json: params.rawValue as any,
        source_id: params.sourceId,
        source_record_id: params.sourceRecordId ?? undefined,
        evidence_url: params.evidenceUrl ?? undefined,
        observed_at: params.observedAt,
        evidence_confidence: params.evidenceConfidence,
        extraction_method: params.extractionMethod,
        extraction_version: params.extractionVersion ?? undefined,
        assertion_status: 'CANDIDATE',
        evidence_origin_id: params.evidenceOriginId ?? undefined,
      },
    })
  },

  /** Find competing assertions for a field */
  async findCompeting(entityType: string, entityId: string, fieldKey: string) {
    return prisma.field_assertions.findMany({
      where: {
        entity_type: entityType,
        entity_id: entityId,
        field_key: fieldKey,
        assertion_status: { in: ['CANDIDATE', 'ACCEPTED'] },
      },
      orderBy: { evidence_confidence: 'desc' },
    })
  },

  /** Mark assertion as superseded (winning assertion takes over) */
  async supersede(assertionId: string) {
    return prisma.field_assertions.update({
      where: { id: assertionId },
      data: { assertion_status: 'SUPERSEDED' },
    })
  },

  /** Mark assertion as accepted */
  async accept(assertionId: string) {
    return prisma.field_assertions.update({
      where: { id: assertionId },
      data: { assertion_status: 'ACCEPTED' },
    })
  },
}

export const canonicalFieldRepo = {
  /** Upsert a winning assertion into canonical_fields table */
  async upsert(params: {
    entityType: 'ROBOT' | 'COMPANY'
    entityId: string
    fieldKey?: string
    fieldSchemaVersion?: string
    attributeDefVersionId?: string
    categorySchemaVersionId?: string
    winningAssertionId: string
    canonicalValue: unknown
    evidenceConfidence: number
    freshnessStatus: string
    manualLock?: boolean
  }) {
    const key = params.fieldKey
      ? {
          entity_type: params.entityType,
          entity_id: params.entityId,
          field_key: params.fieldKey,
          field_schema_version: params.fieldSchemaVersion,
        }
      : {
          entity_type: params.entityType,
          entity_id: params.entityId,
          attribute_definition_version_id: params.attributeDefVersionId,
          category_schema_version_id: params.categorySchemaVersionId,
        }

    return prisma.canonical_fields.upsert({
      where: key as any,
      create: {
        ...key,
        winning_assertion_id: params.winningAssertionId,
        canonical_value_json: params.canonicalValue as any,
        evidence_confidence: params.evidenceConfidence,
        freshness_status: params.freshnessStatus,
        manual_lock: params.manualLock ?? false,
      },
      update: {
        winning_assertion_id: params.winningAssertionId,
        canonical_value_json: params.canonicalValue as any,
        evidence_confidence: params.evidenceConfidence,
        freshness_status: params.freshnessStatus,
        last_calculated_at: new Date(),
      },
    })
  },

  /** Find canonical fields for an entity */
  async listForEntity(entityType: string, entityId: string) {
    return prisma.canonical_fields.findMany({
      where: { entity_type: entityType, entity_id: entityId },
      orderBy: { field_key: 'asc' },
    })
  },

  /** Unhide all fields for an entity (when source re-enabled) */
  async publishAll(entityType: string, entityId: string) {
    return prisma.canonical_fields.updateMany({
      where: { entity_type: entityType, entity_id: entityId, publication_status: 'HIDDEN' },
      data: { publication_status: 'PUBLISHED' },
    })
  },
}

export const manualOverrideRepo = {
  /** Record admin manual override with confidence 1.00 + lock */
  async create(params: {
    adminAssertionId: string
    previousWinningId?: string
    newAdminValue: unknown
    reason: string
    adminEmail: string
  }) {
    return prisma.$transaction(async (tx) => {
      // Create override record
      const override = await tx.manual_overrides.create({
        data: {
          admin_assertion_id: params.adminAssertionId,
          previous_winning_id: params.previousWinningId ?? undefined,
          new_admin_value_json: params.newAdminValue as any,
          reason: params.reason,
          admin_email: params.adminEmail,
        },
      })

      // Lock the canonical field
      await tx.canonical_fields.update({
        where: { id: params.adminAssertionId },
        data: {
          manual_lock: true,
          evidence_confidence: 1.00,
          freshness_status: 'MANUALLY_LOCKED',
        },
      })

      return override
    })
  },
}

export const dataConflictRepo = {
  /** Record a conflict between competing assertions */
  async create(params: {
    competingAssertionIds: string[]
    conflictType: string
    severity?: string
  }) {
    return prisma.data_conflicts.create({
      data: {
        competing_assertion_ids: params.competingAssertionIds as any,
        conflict_type: params.conflictType,
        severity: params.severity ?? 'medium',
      },
    })
  },

  /** List unresolved conflicts */
  async listUnresolved() {
    return prisma.data_conflicts.findMany({
      where: { resolved_at: null },
      orderBy: { created_at: 'desc' },
    })
  },
}
