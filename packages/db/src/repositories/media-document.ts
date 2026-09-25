/**
 * Phase 2B: Media & Document Repository
 * CRUD for media_assets, documents, license checks, source evidence
 */

import { prisma } from '../index'
import { LegalStatus } from '@prisma/client'

export const mediaRepo = {
  /** Register a media asset */
  async create(params: {
    entityType: 'ROBOT' | 'COMPANY'
    entityId: string
    s3Key: string
    originalUrl: string
    sourceLandingUrl?: string
    mimeType: string
    sizeBytes?: number
    width?: number
    height?: number
    hashSha256: string
    mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'ICON'
    licenseStatus?: LegalStatus
    owner?: string
    author?: string
    attribution?: string
    licenseUrl?: string
    isPrimary?: boolean
  }) {
    return prisma.media_assets.create({
      data: {
        entity_type: params.entityType,
        entity_id: params.entityId,
        s3_key: params.s3Key,
        original_url: params.originalUrl,
        source_landing_url: params.sourceLandingUrl ?? undefined,
        mime_type: params.mimeType,
        size_bytes: params.sizeBytes ?? undefined,
        width: params.width ?? undefined,
        height: params.height ?? undefined,
        hash_sha256: params.hashSha256,
        media_type: params.mediaType,
        license_status: params.licenseStatus ?? 'UNKNOWN',
        owner: params.owner ?? undefined,
        author: params.author ?? undefined,
        attribution: params.attribution ?? undefined,
        license_url: params.licenseUrl ?? undefined,
        is_primary: params.isPrimary ?? false,
      },
    })
  },

  /** List media for an entity */
  async listForEntity(entityType: string, entityId: string) {
    return prisma.media_assets.findMany({
      where: { entity_type: entityType, entity_id: entityId, hidden_at: null, takedown_at: null },
      orderBy: { is_primary: 'desc' },
    })
  },

  /** Hide/Takedown a media asset */
  async takedown(mediaId: string) {
    return prisma.media_assets.update({
      where: { id: mediaId },
      data: { takedown_at: new Date(), hidden_at: new Date() },
    })
  },
}

export const documentRepo = {
  async create(params: {
    entityType: 'ROBOT' | 'COMPANY'
    entityId: string
    type: 'DATASHEET' | 'MANUAL' | 'CERTIFICATE' | 'CASE_STUDY' | 'OTHER'
    sourceUrl: string
    s3Key?: string
    legalStatus?: LegalStatus
    language?: string
    version?: string
    publishedDate?: Date
    hashSha256?: string
  }) {
    return prisma.documents.create({
      data: {
        entity_type: params.entityType,
        entity_id: params.entityId,
        type: params.type,
        source_url: params.sourceUrl,
        s3_key: params.s3Key ?? undefined,
        legal_status: params.legalStatus ?? 'UNKNOWN',
        language: params.language ?? 'en',
        version: params.version ?? undefined,
        published_date: params.publishedDate ?? undefined,
        hash_sha256: params.hashSha256 ?? undefined,
      },
    })
  },
}

export const mediaLicenseRepo = {
  async recordCheck(params: {
    mediaId: string
    checkerType: 'AGENT' | 'ADMIN' | 'SOURCE_METADATA'
    decision: string
    evidenceUrl?: string
    notes?: string
  }) {
    return prisma.media_license_checks.create({
      data: {
        media_id: params.mediaId,
        checker_type: params.checkerType,
        decision: params.decision,
        evidence_url: params.evidenceUrl ?? undefined,
        notes: params.notes ?? undefined,
      },
    })
  },
}
