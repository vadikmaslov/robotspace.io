/**
 * Phase 2B: Search normalization and ranking
 * 
 * Ranking rule: exact model code > exact name > alias > trigram
 * Null values always sort last, never converted to zero
 */

import { Prisma } from '@prisma/client'

/**
 * Normalize a robot name/alias/model-code for search comparison.
 * Lowercase, strip whitespace, remove special chars except hyphens/digits.
 */
export function normalizeSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\w\s\-]/g, '')
}

/**
 * Normalize a model code (more aggressive — strip everything non-alphanumeric).
 * e.g. "IRB-6700/2.55" → "irb6700255"
 */
export function normalizeModelCode(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Build a search WHERE clause for robots catalog.
 * Priority: exact model code → exact name → alias trigram → name trigram
 */
export function buildRobotSearchFilter(searchQuery: string): Prisma.sql {
  const normalized = normalizeSearch(searchQuery)
  const modelCodeNorm = normalizeModelCode(searchQuery)
  const tsQuery = normalized.split(' ').join(' & ') + ':*'

  return Prisma.sql`
    (
      -- exact match on entity slug
      entities.slug ILIKE ${`%${normalized.replace(/ /g, '-')}%`}
      OR
      -- trigram on canonical name
      similarity(robot_public_projections.canonical_name::text, ${normalized}) > 0.3
      OR
      -- trigram on aliases (via join)
      EXISTS (
        SELECT 1 FROM entity_aliases
        WHERE entity_aliases.entity_id = entities.id
        AND similarity(entity_aliases.normalized_alias, ${normalized}) > 0.3
      )
      OR
      -- trigram on model code in canonical fields
      EXISTS (
        SELECT 1 FROM field_assertions
        WHERE field_assertions.entity_id = entities.id
        AND field_assertions.field_key = 'model_code'
        AND similarity(field_assertions.raw_value_json->>'value', ${normalized}) > 0.3
      )
    )
  `
}

/**
 * Build ORDER BY clause for robot search results.
 * Score: exact model code match = 100, exact name match = 75, alias trigram > 0.6 = 50, fallback similarity.
 * NULL values always sort last.
 */
export function buildRobotSearchOrderBy(searchQuery: string): Prisma.sql {
  const normalized = normalizeSearch(searchQuery)
  const modelCodeNorm = normalizeModelCode(searchQuery)

  return Prisma.sql`
    CASE
      WHEN robot_public_projections.canonical_name IS NULL THEN 0
      WHEN lower(robot_public_projections.canonical_name) = lower(${normalized}) THEN 100
      WHEN EXISTS (
        SELECT 1 FROM entity_aliases
        WHERE entity_aliases.entity_id = entities.id
        AND similarity(entity_aliases.normalized_alias, ${normalized}) > 0.7
      ) THEN 70
      ELSE similarity(robot_public_projections.canonical_name::text, ${normalized}) * 100
    END DESC,
    robot_public_projections.canonical_name ASC NULLS LAST
  `
}

/**
 * Assertion: null numeric value never converts to zero.
 * Returns the raw value or null, never 0 when source value is null.
 */
export function safeNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const num = Number(value)
  if (isNaN(num)) return null
  return num
}

/**
 * Assertion: null text value never converts to empty string.
 * Returns the raw value or null, never '' when source value is null.
 */
export function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}
