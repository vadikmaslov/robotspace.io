/**
 * Phase 2B: Taxonomy Repository
 * CRUD for categories, attribute definitions, taxonomy/category schema versions, category_attributes
 */

import { prisma } from '../index'

// ============================================================
// CATEGORIES
// ============================================================

export const taxonomyRepo = {
  /** Get active categories sorted by sort_order */
  async listActive() {
    return prisma.categories.findMany({
      where: { is_active: true, archived_at: null },
      orderBy: { sort_order: 'asc' },
      include: { children: { where: { is_active: true }, orderBy: { sort_order: 'asc' } } },
    })
  },

  async findBySlug(slug: string) {
    return prisma.categories.findUnique({ where: { slug } })
  },

  async findById(id: string) {
    return prisma.categories.findUnique({ where: { id } })
  },

  /** Get all category paths for display (breadcrumb chain) */
  async ancestryPath(categoryId: string): Promise<string[]> {
    const result: string[] = []
    let current = await prisma.categories.findUnique({ where: { id: categoryId } })
    while (current) {
      result.unshift(current.slug as string)
      if (!current.parent_id) break
      current = await prisma.categories.findUnique({ where: { id: current.parent_id } })
    }
    return result
  },
}

// ============================================================
// TAXONOMY SCHEMA VERSIONS
// ============================================================

export const taxonomyVersionRepo = {
  /** Get the current published taxonomy version */
  async currentPublished() {
    return prisma.taxonomy_schema_versions.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { version_number: 'desc' },
    })
  },
}

// ============================================================
// CATEGORY SCHEMA VERSIONS
// ============================================================

export const categorySchemaVersionRepo = {
  async findByCategoryAndTaxonomy(categoryId: string, taxonomyVersionId: string) {
    return prisma.category_schema_versions.findFirst({
      where: { category_id: categoryId, taxonomy_schema_version_id: taxonomyVersionId, status: 'PUBLISHED' },
    })
  },

  /** Get all attributes mapped to a category schema version */
  async attributesForCategorySchema(categorySchemaVersionId: string) {
    return prisma.category_attributes.findMany({
      where: { category_schema_version_id: categorySchemaVersionId },
      include: {
        attr_version: {
          include: { attribute_def: true },
        },
      },
      orderBy: { display_order: 'asc' },
    })
  },
}

// ============================================================
// ATTRIBUTE DEFINITIONS
// ============================================================

export const attributeRepo = {
  async findByKey(key: string) {
    return prisma.attribute_definitions.findUnique({ where: { key } })
  },

  async findVersion(attributeDefId: string, taxonomyVersionId: string) {
    return prisma.attribute_definition_versions.findFirst({
      where: {
        attribute_definition_id: attributeDefId,
        taxonomy_schema_version_id: taxonomyVersionId,
      },
    })
  },
}
