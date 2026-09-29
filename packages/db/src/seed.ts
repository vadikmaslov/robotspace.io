/**
 * Phase 2B: Database Seed — initial taxonomy, attributes, thresholds, settings
 * Idempotent: re-running produces no duplicates
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================================
// CATEGORIES
// ============================================================

const INITIAL_CATEGORIES: Array<{
  slug: string
  name_en: string
  description_en: string
  icon_key: string
  parent_slug: string | null
}> = [
  { slug: 'industrial', name_en: 'Industrial', description_en: 'Industrial robots for manufacturing, welding, assembly, and material handling', icon_key: 'factory', parent_slug: null },
  { slug: 'humanoid', name_en: 'Humanoid', description_en: 'Humanoid and bipedal robots', icon_key: 'humanoid', parent_slug: null },
  { slug: 'service', name_en: 'Service', description_en: 'Service robots for hospitality, retail, cleaning, and customer interaction', icon_key: 'service', parent_slug: null },
  { slug: 'medical', name_en: 'Medical', description_en: 'Medical robots for surgery, rehabilitation, diagnostics, and patient care', icon_key: 'medical', parent_slug: null },
  { slug: 'logistics', name_en: 'Logistics', description_en: 'Autonomous mobile robots (AMRs), warehouse automation, and delivery robots', icon_key: 'logistics', parent_slug: null },
  { slug: 'agriculture', name_en: 'Agriculture', description_en: 'Robots for farming, harvesting, planting, and agricultural monitoring', icon_key: 'agriculture', parent_slug: null },
  { slug: 'defense', name_en: 'Defense', description_en: 'Military, security, surveillance, and defense robotics', icon_key: 'defense', parent_slug: null },
  { slug: 'education', name_en: 'Education', description_en: 'Educational robots for STEM learning and research platforms', icon_key: 'education', parent_slug: null },
  { slug: 'other', name_en: 'Other', description_en: 'Other robots not fitting the above categories', icon_key: 'other', parent_slug: null },
]

// ============================================================
// ATTRIBUTES (initial set: payload, reach, DOF, weight, etc.)
// ============================================================

const INITIAL_ATTRIBUTES: Array<{
  key: string
  label_en: string
  description_en: string
  data_type: 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ENUM' | 'TEXT' | 'DATE' | 'RANGE'
  dimension: 'MASS' | 'LENGTH' | 'SPEED' | 'TIME' | 'ANGLE' | 'TEMPERATURE' | 'CURRENCY' | 'NONE'
  canonical_unit: string | null
  is_filterable: boolean
  is_sortable: boolean
  is_comparable: boolean
  higher_is_better: boolean | null
  absolute_tolerance: number | null
  relative_tolerance: number | null
}> = [
  {
    key: 'payload_kg',
    label_en: 'Payload Capacity',
    description_en: 'Maximum payload the robot can handle, in kilograms',
    data_type: 'NUMBER', dimension: 'MASS', canonical_unit: 'kg',
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: true, absolute_tolerance: 0.1, relative_tolerance: 0.05,
  },
  {
    key: 'reach_mm',
    label_en: 'Reach',
    description_en: 'Maximum horizontal reach of the robot arm, in millimeters',
    data_type: 'NUMBER', dimension: 'LENGTH', canonical_unit: 'mm',
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: null, absolute_tolerance: 1, relative_tolerance: 0.01,
  },
  {
    key: 'axes_dof',
    label_en: 'Degrees of Freedom',
    description_en: 'Number of axes or degrees of freedom',
    data_type: 'INTEGER', dimension: 'NONE', canonical_unit: null,
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: null, absolute_tolerance: 0, relative_tolerance: null,
  },
  {
    key: 'weight_kg',
    label_en: 'Robot Weight',
    description_en: 'Total weight of the robot, in kilograms',
    data_type: 'NUMBER', dimension: 'MASS', canonical_unit: 'kg',
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: false, absolute_tolerance: 0.5, relative_tolerance: 0.05,
  },
  {
    key: 'repeatability_mm',
    label_en: 'Repeatability',
    description_en: 'Positional repeatability of the robot, in millimeters',
    data_type: 'NUMBER', dimension: 'LENGTH', canonical_unit: 'mm',
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: false, absolute_tolerance: 0.001, relative_tolerance: 0.1,
  },
  {
    key: 'speed_mm_s',
    label_en: 'Maximum Speed',
    description_en: 'Maximum linear speed of the robot, in mm/s',
    data_type: 'NUMBER', dimension: 'SPEED', canonical_unit: 'mm/s',
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: true, absolute_tolerance: 10, relative_tolerance: 0.05,
  },
  {
    key: 'autonomy_level',
    label_en: 'Autonomy Level',
    description_en: 'Level of autonomous operation (0=teleoperated, 5=fully autonomous)',
    data_type: 'INTEGER', dimension: 'NONE', canonical_unit: null,
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: true, absolute_tolerance: 0, relative_tolerance: null,
  },
  {
    key: 'environment_ip_rating',
    label_en: 'IP Rating',
    description_en: 'Ingress Protection rating (e.g., IP67)',
    data_type: 'TEXT', dimension: 'NONE', canonical_unit: null,
    is_filterable: true, is_sortable: false, is_comparable: false,
    higher_is_better: null, absolute_tolerance: null, relative_tolerance: null,
  },
  {
    key: 'power_supply_v',
    label_en: 'Power Supply Voltage',
    description_en: 'Required power supply voltage in volts',
    data_type: 'NUMBER', dimension: 'NONE', canonical_unit: 'V',
    is_filterable: true, is_sortable: false, is_comparable: false,
    higher_is_better: null, absolute_tolerance: 0.5, relative_tolerance: null,
  },
  {
    key: 'battery_runtime_hours',
    label_en: 'Battery Runtime',
    description_en: 'Battery runtime in continuous operation, in hours',
    data_type: 'NUMBER', dimension: 'TIME', canonical_unit: 'h',
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: true, absolute_tolerance: 0.1, relative_tolerance: 0.1,
  },
  {
    key: 'release_date',
    label_en: 'Release Date',
    description_en: 'Date when this model was first released',
    data_type: 'DATE', dimension: 'NONE', canonical_unit: null,
    is_filterable: true, is_sortable: true, is_comparable: true,
    higher_is_better: false, absolute_tolerance: null, relative_tolerance: null,
  },
  {
    key: 'lifecycle_status',
    label_en: 'Lifecycle Status',
    description_en: 'Current lifecycle status: ACTIVE, EOL, ARCHIVED',
    data_type: 'ENUM', dimension: 'NONE', canonical_unit: null,
    is_filterable: true, is_sortable: false, is_comparable: false,
    higher_is_better: null, absolute_tolerance: null, relative_tolerance: null,
  },
]

// ============================================================
// AI OPERATIONS (13 operations from plan section 9.3)
// ============================================================

const AI_OPERATIONS = [
  { operation: 'structured_extraction', default_class: 'SIMPLE' },
  { operation: 'taxonomy_classification', default_class: 'SIMPLE' },
  { operation: 'article_preview', default_class: 'SIMPLE' },
  { operation: 'mention_linking', default_class: 'SIMPLE' },
  { operation: 'entity_resolution', default_class: 'SIMPLE' },
  { operation: 'duplicate_resolution', default_class: 'COMPLEX' },
  { operation: 'conflict_analysis', default_class: 'COMPLEX' },
  { operation: 'archive_analysis', default_class: 'COMPLEX' },
  { operation: 'license_assessment', default_class: 'COMPLEX' },
  { operation: 'trend_analysis', default_class: 'COMPLEX' },
  { operation: 'submission_verification', default_class: 'COMPLEX' },
  { operation: 'source_discovery', default_class: 'COMPLEX' },
  { operation: 'source_contract_assessment', default_class: 'COMPLEX' },
]

// ============================================================
// SETTINGS DEFAULTS
// ============================================================

const DEFAULT_SETTINGS: Array<{ key: string; value: Record<string, unknown> }> = [
  {
    key: 'recipients',
    value: {
      notification_email: process.env.SMTP_EMAIL ?? '',
      quote_email: process.env.SMTP_EMAIL ?? '',
    },
  },
  {
    key: 'confidence_thresholds',
    value: {
      identity: 0.85,
      technical_spec: 0.90,
      compatibility: 0.90,
      news_metadata: 0.80,
      trend_statement: 0.90,
      conflict_margin: 0.10,
    },
  },
  {
    key: 'image_publication',
    value: {
      mode: 'normal', // 'normal' | 'allowed_only'
      policy_revision: 1,
    },
  },
  {
    key: 'pii_retention',
    value: {
      quote_submission_months: 12,
      ip_captcha_evidence_days: 30,
    },
  },
  {
    key: 'market_readiness',
    value: {
      min_sources: 3,
      min_observations: 30,
      publish_threshold: 0.80,
    },
  },
  {
    key: 'map_readiness',
    value: {
      min_locations: 10,
      min_countries: 3,
    },
  },
]

// ============================================================
// COMPANY TYPES (section 6.4)
// ============================================================

const COMPANY_TYPES = [
  'MANUFACTURER',
  'INTEGRATOR',
  'COMPONENT_SUPPLIER',
  'SOFTWARE_PROVIDER',
  'RESEARCH_ORGANIZATION',
  'DISTRIBUTOR',
  'OTHER',
]

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function seedCategories(): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>()
  const parentMap = new Map<string | null, string[]>()
  
  for (const cat of INITIAL_CATEGORIES) {
    const key = cat.parent_slug ?? null
    let list = parentMap.get(key)
    if (!list) { list = []; parentMap.set(key, list) }
    list.push(cat.slug)
  }
  
  // First pass: parent categories (parent_slug=null)
  for (const cat of INITIAL_CATEGORIES.filter(c => c.parent_slug === null)) {
    const existing = await prisma.categories.findUnique({ where: { slug: cat.slug } })
    if (existing) {
      slugToId.set(cat.slug, existing.id)
      continue
    }
    const created = await prisma.categories.create({
      data: {
        slug: cat.slug,
        name_en: cat.name_en,
        description_en: cat.description_en,
        icon_key: cat.icon_key,
        sort_order: INITIAL_CATEGORIES.findIndex(c => c.slug === cat.slug),
        is_active: true,
      },
    })
    slugToId.set(cat.slug, created.id)
  }
  
  return slugToId
}

async function seedAttributes(): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>()
  
  for (const attr of INITIAL_ATTRIBUTES) {
    const existing = await prisma.attribute_definitions.findUnique({ where: { key: attr.key } })
    if (existing) {
      keyToId.set(attr.key, existing.id)
      continue
    }
    const created = await prisma.attribute_definitions.create({
      data: { key: attr.key },
    })
    keyToId.set(attr.key, created.id)
  }
  
  return keyToId
}

async function seedTaxonomyVersion(): Promise<string> {
  // Check if published version already exists
  const existing = await prisma.taxonomy_schema_versions.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { version_number: 'desc' },
  })
  if (existing) return existing.id

  // Create immutable published version
  const contentHash = `v1-categories-${INITIAL_CATEGORIES.length}-attrs-${INITIAL_ATTRIBUTES.length}`
  return (await prisma.taxonomy_schema_versions.create({
    data: {
      version_number: 1,
      content_hash: contentHash,
      status: 'PUBLISHED',
      published_at: new Date(),
    },
  })).id
}

async function seedCategorySchemaVersions(
  categorySlugToId: Map<string, string>,
  taxonomySchemaVersionId: string,
) {
  for (const [slug, categoryId] of categorySlugToId.entries()) {
    const existing = await prisma.category_schema_versions.findFirst({
      where: { category_id: categoryId, status: 'PUBLISHED' },
    })
    if (existing) continue

    await prisma.category_schema_versions.create({
      data: {
        category_id: categoryId,
        taxonomy_schema_version_id: taxonomySchemaVersionId,
        category_local_version: 1,
        content_hash: `cat-v1-${slug}`,
        status: 'PUBLISHED',
        published_at: new Date(),
      },
    })
  }
}

async function seedAttributeDefinitionVersions(
  attrKeyToId: Map<string, string>,
  taxonomySchemaVersionId: string,
): Promise<Map<string, string>> {
  const attrIdToVersionId = new Map<string, string>()

  for (const attr of INITIAL_ATTRIBUTES) {
    const attrDefId = attrKeyToId.get(attr.key)
    if (!attrDefId) continue

    const existing = await prisma.attribute_definition_versions.findFirst({
      where: { attribute_definition_id: attrDefId, taxonomy_schema_version_id: taxonomySchemaVersionId },
    })
    if (existing) {
      attrIdToVersionId.set(attrDefId, existing.id)
      continue
    }

    const created = await prisma.attribute_definition_versions.create({
      data: {
        attribute_definition_id: attrDefId,
        taxonomy_schema_version_id: taxonomySchemaVersionId,
        label_en: attr.label_en,
        description_en: attr.description_en,
        data_type: attr.data_type,
        dimension: attr.dimension,
        canonical_unit: attr.canonical_unit,
        is_filterable: attr.is_filterable,
        is_sortable: attr.is_sortable,
        is_comparable: attr.is_comparable,
        higher_is_better: attr.higher_is_better,
        absolute_tolerance: attr.absolute_tolerance,
        relative_tolerance: attr.relative_tolerance,
      },
    })
    attrIdToVersionId.set(attrDefId, created.id)
  }

  return attrIdToVersionId
}

async function seedCompanyTypes() {
  for (const typeName of COMPANY_TYPES) {
    const existing = await prisma.company_types.findFirst({ where: { type_name: typeName } })
    if (existing) continue
    await prisma.company_types.create({ data: { type_name: typeName } })
  }
}

async function seedSettings() {
  for (const setting of DEFAULT_SETTINGS) {
    const existing = await prisma.system_settings.findFirst({ where: { key: setting.key } })
    if (existing) continue
    await prisma.system_settings.create({
      data: {
        key: setting.key,
        value_json: setting.value as any,
        schema_version: 1,
      },
    })
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('[seed] Starting idempotent seed...')

  console.log('[seed] Seeding categories...')
  const catIds = await seedCategories()
  console.log(`[seed] Categories: ${catIds.size} seeded`)

  console.log('[seed] Seeding attributes...')
  const attrIds = await seedAttributes()
  console.log(`[seed] Attributes: ${attrIds.size} seeded`)

  console.log('[seed] Seeding company types...')
  await seedCompanyTypes()
  console.log(`[seed] Company types: ${COMPANY_TYPES.length} seeded`)

  console.log('[seed] Seeding taxonomy schema version 1...')
  const taxonomyVersionId = await seedTaxonomyVersion()
  console.log(`[seed] Taxonomy version: ${taxonomyVersionId}`)

  console.log('[seed] Seeding category schema versions...')
  await seedCategorySchemaVersions(catIds, taxonomyVersionId)
  console.log('[seed] Category schema versions: done')

  console.log('[seed] Seeding attribute definition versions...')
  await seedAttributeDefinitionVersions(attrIds, taxonomyVersionId)
  console.log('[seed] Attribute definition versions: done')

  console.log('[seed] Seeding settings...')
  await seedSettings()
  console.log(`[seed] Settings: ${DEFAULT_SETTINGS.length} seeded`)

  console.log('[seed] Seed complete.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error('[seed] Error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
