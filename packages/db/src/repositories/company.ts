/**
 * Phase 2B: Company Repository
 * CRUD for companies, company types, locations
 */

import { prisma } from '../index'
import { type Prisma } from '@prisma/client'

export const companyRepo = {
  async create(params: { slug: string }) {
    return prisma.$transaction(async (tx) => {
      const entity = await tx.entities.create({
        data: {
          entity_type: 'COMPANY',
          slug: params.slug,
          publication_status: 'DRAFT',
        },
      })
      const company = await tx.companies.create({
        data: { entity_id: entity.id },
      })
      return { entity, company }
    })
  },

  async findBySlug(slug: string) {
    return prisma.entities.findFirst({
      where: { slug, entity_type: 'COMPANY' },
      include: { companies: true },
    })
  },

  async findById(entityId: string) {
    return prisma.companies.findUnique({
      where: { entity_id: entityId },
      include: { entity: true },
    })
  },

  /** List published companies with optional type filter */
  async listPublished(params: {
    companyTypeId?: string
    skip?: number
    take?: number
  }) {
    const where: any = {}
    return prisma.company_public_projections.findMany({
      where,
      skip: params.skip ?? 0,
      take: params.take ?? 20,
      orderBy: { canonical_name: 'asc' },
    })
  },
}

export const companyTypeRepo = {
  async findByName(typeName: string) {
    return prisma.company_types.findFirst({ where: { type_name: typeName } })
  },

  async assignToCompany(companyEntityId: string, companyTypeId: string) {
    return prisma.company_type_assignments.create({
      data: {
        company_entity_id: companyEntityId,
        company_type_id: companyTypeId,
      },
    })
  },
}

export const companyLocationRepo = {
  async create(params: {
    companyEntityId: string
    type: 'HQ' | 'OFFICE' | 'SERVICE_CENTER' | 'SHOWROOM' | 'OTHER'
    city?: string
    countryCode?: string
    latitude?: number
    longitude?: number
    source?: string
  }) {
    return prisma.company_locations.create({
      data: {
        company_entity_id: params.companyEntityId,
        type: params.type,
        city: params.city ?? undefined,
        country_code: params.countryCode ?? undefined,
        latitude: params.latitude ?? undefined,
        longitude: params.longitude ?? undefined,
        source: params.source ?? undefined,
      },
    })
  },

  async listByCompany(companyEntityId: string) {
    return prisma.company_locations.findMany({
      where: { company_entity_id: companyEntityId },
      orderBy: { type: 'asc' },
    })
  },
}
