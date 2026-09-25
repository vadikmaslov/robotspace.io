/**
 * Phase 2B: Robot Repository
 * CRUD for robots, robot_variants, robot_company_relations
 */

import { prisma } from '../index'
import { EntityType, PublicationStatus, type Prisma } from '@prisma/client'

export const robotRepo = {
  /** Create a new robot entity + robot record in transaction */
  async create(params: { slug: string; createdBy?: string }) {
    return prisma.$transaction(async (tx) => {
      const entity = await tx.entities.create({
        data: {
          entity_type: 'ROBOT',
          slug: params.slug,
          publication_status: 'DRAFT',
        },
      })
      const robot = await tx.robots.create({
        data: {
          entity_id: entity.id,
          created_by: params.createdBy,
        },
      })
      return { entity, robot }
    })
  },

  /** Find robot by slug */
  async findBySlug(slug: string) {
    return prisma.entities.findFirst({
      where: { slug, entity_type: 'ROBOT' },
      include: { robots: true },
    })
  },

  /** Find robot by entity ID */
  async findById(entityId: string) {
    return prisma.robots.findUnique({
      where: { entity_id: entityId },
      include: { entity: true },
    })
  },

  /** List published robots with pagination */
  async listPublished(params: {
    categoryId?: string
    manufacturerId?: string
    status?: 'ACTIVE' | 'ARCHIVED'
    skip?: number
    take?: number
    orderBy?: Prisma.robot_public_projectionsOrderByInput
  }) {
    const where: any = {
      lifecycle_status: params.status ?? 'ACTIVE',
    }
    if (params.categoryId) {
      where.category_id = params.categoryId
    }
    if (params.manufacturerId) {
      where.manufacturer_entity_id = params.manufacturerId
    }

    return prisma.robot_public_projections.findMany({
      where,
      skip: params.skip ?? 0,
      take: params.take ?? 20,
      orderBy: params.orderBy ?? { canonical_name: 'asc' },
    })
  },

  /** Archive a robot (never delete) */
  async archive(entityId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.entities.update({
        where: { id: entityId },
        data: { archived_at: new Date() },
      })
      await tx.robot_public_projections.update({
        where: { robot_entity_id: entityId },
        data: { lifecycle_status: 'ARCHIVED' },
      })
    })
  },

  /** Get canonical attribute values for a robot */
  async canonicalAttributes(robotEntityId: string) {
    return prisma.canonical_fields.findMany({
      where: {
        entity_type: 'ROBOT',
        entity_id: robotEntityId,
      },
      include: {
        // winning assertion with source info
      },
    })
  },
}

export const robotVariantRepo = {
  /** Create variant under a parent robot */
  async create(params: { parentRobotEntityId: string; slug: string }) {
    return prisma.$transaction(async (tx) => {
      const entity = await tx.entities.create({
        data: {
          entity_type: 'ROBOT_VARIANT',
          slug: params.slug,
          publication_status: 'DRAFT',
        },
      })
      const variant = await tx.robot_variants.create({
        data: {
          entity_id: entity.id,
          robot_entity_id: params.parentRobotEntityId,
        },
      })
      return { entity, variant }
    })
  },

  /** List variants for a robot */
  async listForRobot(robotEntityId: string) {
    return prisma.robot_variants.findMany({
      where: { robot_entity_id: robotEntityId },
      include: { entity: true },
    })
  },
}

export const robotCompanyRelationRepo = {
  /** Assign a company relationship to a robot */
  async create(params: {
    robotEntityId: string
    companyEntityId: string
    relation: 'MANUFACTURES' | 'INTEGRATES' | 'DISTRIBUTES' | 'SERVICES'
    evidenceUrl?: string
  }) {
    return prisma.robot_company_relations.create({
      data: {
        robot_entity_id: params.robotEntityId,
        company_entity_id: params.companyEntityId,
        relation: params.relation,
        evidence_url: params.evidenceUrl,
      },
    })
  },

  /** Get manufacturer for a robot */
  async findManufacturer(robotEntityId: string) {
    return prisma.robot_company_relations.findFirst({
      where: {
        robot_entity_id: robotEntityId,
        relation: 'MANUFACTURES',
      },
    })
  },
}
