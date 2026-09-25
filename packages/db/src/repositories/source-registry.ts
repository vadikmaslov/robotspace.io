/**
 * Phase 2B: Source Registry Repository
 * CRUD for sources, source contracts, credentials
 */

import { prisma } from '../index'

export const sourceRepo = {
  async findByKey(key: string) {
    return prisma.sources.findUnique({ where: { key } })
  },

  async listActive() {
    return prisma.sources.findMany({
      where: { status: 'ACTIVE', kill_switch: false },
    })
  },

  /** Disable source and increment policy revision (kill switch) */
  async disable(sourceKey: string) {
    return prisma.$transaction(async (tx) => {
      const source = await tx.sources.update({
        where: { key: sourceKey },
        data: {
          status: 'DISABLED',
          policy_revision: { increment: 1 },
        },
      })
      return source
    })
  },

  /** Update health stats after a run */
  async recordResult(sourceKey: string, success: boolean, errorCode?: string) {
    const now = new Date()
    return prisma.sources.update({
      where: { key: sourceKey },
      data: success
        ? { last_success_at: now }
        : { last_error_at: now },
    })
  },
}

export const sourceContractRepo = {
  async findActiveForSource(sourceKey: string) {
    return prisma.source_contracts.findFirst({
      where: { source_key: sourceKey },
      orderBy: { created_at: 'desc' },
    })
  },

  async create(params: {
    sourceKey: string
    canonicalEndpoint: string
    accessMode: string
    legalBasis: string
    allowedFields: unknown
    allowedOperations: unknown
    rawRetentionPolicy: string
    publicationPolicy: string
    rateLimitStrategy: string
    stableIdStrategy: string
  }) {
    return prisma.source_contracts.create({
      data: {
        source_key: params.sourceKey,
        canonical_endpoint: params.canonicalEndpoint,
        access_mode: params.accessMode,
        legal_basis: params.legalBasis,
        allowed_fields: params.allowedFields as any,
        allowed_operations: params.allowedOperations as any,
        raw_retention_policy: params.rawRetentionPolicy,
        publication_policy: params.publicationPolicy,
        rate_limit_strategy: params.rateLimitStrategy,
        stable_id_strategy: params.stableIdStrategy,
      },
    })
  },
}

export const sourceRecordRepo = {
  async upsert(params: {
    sourceId: string
    externalId?: string
    canonicalUrl: string
    sourceRevision: string
    payloadHash: string
  }) {
    return prisma.source_records.upsert({
      where: {
        source_id_external_id_source_revision: {
          source_id: params.sourceId,
          external_id: params.externalId ?? null,
          source_revision: params.sourceRevision,
        },
      },
      create: {
        source_id: params.sourceId,
        external_id: params.externalId ?? undefined,
        canonical_url: params.canonicalUrl,
        source_revision: params.sourceRevision,
        payload_hash: params.payloadHash,
      },
      update: {
        canonical_url: params.canonicalUrl,
        payload_hash: params.payloadHash,
        last_seen_at: new Date(),
      },
    })
  },
}
