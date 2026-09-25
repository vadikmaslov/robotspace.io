/**
 * Phase 7.2: Entity Resolution
 *
 * Resolution priority:
 * 1. Exact external ID match (e.g., same Wikidata QID)
 * 2. Exact manufacturer + model code ("ABB" + "IRB6700")
 * 3. Exact normalized canonical name/alias
 * 4. Weighted trigram fuzzy candidate search
 * 5. AI ambiguous resolution (only when no exact candidate > threshold)
 *
 * Rules:
 * - Prevent cross-manufacturer merge without strong evidence (confidence >= 0.90 + manual admin)
 * - New entity when no candidate passes threshold (0.85)
 * - Merge reversible — stored in entity_merge_history with full payload
 */

import { prisma } from '@robotspace/db'
import { normalizeName, normalizeModelCode, hashPayload } from './utils'

export interface ResolutionCandidate {
  entityId: string
  entityType: string
  matchType: 'EXACT_EXTERNAL_ID' | 'EXACT_MFR_MODEL' | 'EXACT_ALIAS' | 'FUZZY_TRIGRAM' | 'AI_AMBIGUOUS'
  confidence: number
  slug: string
  canonicalName?: string
}

export interface ResolutionResult {
  match: ResolutionCandidate | null
  isNew: boolean
  candidates: ResolutionCandidate[]
}

/**
 * Resolve an entity — find existing match or determine if new entity is needed.
 */
export async function resolveEntity(params: {
  entityType: 'ROBOT' | 'COMPANY'
  externalId?: string
  externalSourceId?: string
  manufacturerName?: string
  modelCode?: string
  name: string
  aliases: string[]
}): Promise<ResolutionResult> {
  const normalized = {
    name: normalizeName(params.name),
    modelCode: normalizeModelCode(params.modelCode ?? ''),
    aliases: params.aliases.map(normalizeName),
  }

  const candidates: ResolutionCandidate[] = []

  // 1. Exact external ID match
  if (params.externalId && params.externalSourceId) {
    const existing = await prisma.external_references.findFirst({
      where: {
        source_id: params.externalSourceId,
        external_id: params.externalId,
        entity_type: params.entityType,
      },
      select: { entity: { select: { id: true, slug: true } } },
    })
    if (existing) {
      candidates.push({
        entityId: existing.entity.id,
        entityType: params.entityType,
        matchType: 'EXACT_EXTERNAL_ID',
        confidence: 0.97,
        slug: existing.entity.slug,
      })
    }
  }

  // 2. Exact manufacturer + model code
  if (params.manufacturerName && params.modelCode) {
    const mfrNorm = normalizeName(params.manufacturerName)
    const mfrEntities = await prisma.entities.findMany({
      where: {
        entity_type: 'COMPANY',
        OR: [
          { slug: { contains: mfrNorm.replace(/\s+/g, '-') } },
        ],
      },
      select: { id: true },
    })

    for (const mfr of mfrEntities) {
      const relations = await prisma.robot_company_relations.findMany({
        where: { company_entity_id: mfr.id, relation: 'MANUFACTURES' },
        select: { robot_entity_id: true },
      })

      for (const rel of relations) {
        const fields = await prisma.field_assertions.findMany({
          where: {
            entity_type: params.entityType,
            entity_id: rel.robot_entity_id,
            field_key: 'model_code',
            assertion_status: { in: ['CANDIDATE', 'ACCEPTED'] },
          },
        })

        for (const f of fields) {
          const storedCode = normalizeModelCode((f.raw_value_json as any)?.value ?? '')
          if (storedCode === normalized.modelCode) {
            const entity = await prisma.entities.findUnique({
              where: { id: rel.robot_entity_id },
              select: { slug: true, robots: true },
            })
            if (entity) {
              candidates.push({
                entityId: rel.robot_entity_id,
                entityType: params.entityType,
                matchType: 'EXACT_MFR_MODEL',
                confidence: 0.95,
                slug: entity.slug,
              })
            }
          }
        }
      }
    }
  }

  // 3. Exact normalized alias match
  const aliasMatches = await prisma.entity_aliases.findMany({
    where: {
      normalized_alias: { in: [normalized.name, ...normalized.aliases] },
      entity_type: params.entityType,
    },
    select: { entity_id: true },
  })
  for (const alias of aliasMatches) {
    const entity = await prisma.entities.findUnique({
      where: { id: alias.entity_id },
      select: { slug: true },
    })
    if (entity) {
      candidates.push({
        entityId: alias.entity_id,
        entityType: params.entityType,
        matchType: 'EXACT_ALIAS',
        confidence: 0.90,
        slug: entity.slug,
      })
    }
  }

  // 4. Weighted fuzzy trigram search
  if (candidates.length === 0) {
    const fuzzyResults = await prisma.$queryRawUnsafe<Array<{ id: string; slug: string; name: string; similarity: number }>>(
      `SELECT e.id, e.slug, rp.canonical_name as name, similarity(rp.canonical_name, $1) as similarity
       FROM entities e
       JOIN robot_public_projections rp ON rp.robot_entity_id = e.id
       WHERE e.entity_type = $2
       AND similarity(rp.canonical_name, $1) > 0.4
       ORDER BY similarity DESC
       LIMIT 5`,
      normalized.name, params.entityType,
    )

    for (const fz of fuzzyResults) {
      candidates.push({
        entityId: fz.id,
        entityType: params.entityType,
        matchType: 'FUZZY_TRIGRAM',
        confidence: Math.min(0.70, Number(fz.similarity)),
        slug: fz.slug,
        canonicalName: fz.name,
      })
    }
  }

  // 5. Select best candidate
  const sorted = candidates.sort((a, b) => b.confidence - a.confidence)
  const best = sorted[0] ?? null

  // No match above threshold → new entity
  if (!best || best.confidence < 0.85) {
    return { match: null, isNew: true, candidates: sorted }
  }

  return { match: best, isNew: false, candidates: sorted }
}

/**
 * Prevent cross-manufacturer merge — must have strong evidence.
 * Only ADMINS can force-merge entities from different manufacturers.
 */
export async function crossManufacturerMergeAllowed(
  entityAId: string,
  entityBId: string,
  adminOverride = false,
): Promise<{ allowed: boolean; reason?: string }> {
  if (adminOverride) return { allowed: true, reason: 'Admin override' }

  // Find manufacturers for both entities
  const [mfA, mfB] = await Promise.all([
    prisma.robot_company_relations.findFirst({
      where: { robot_entity_id: entityAId, relation: 'MANUFACTURES' },
      select: { company_entity_id: true },
    }),
    prisma.robot_company_relations.findFirst({
      where: { robot_entity_id: entityBId, relation: 'MANUFACTURES' },
      select: { company_entity_id: true },
    }),
  ])

  if (!mfA || !mfB) return { allowed: false, reason: 'Missing manufacturer info for one or both entities' }
  if (mfA.company_entity_id !== mfB.company_entity_id) {
    return { allowed: false, reason: 'Different manufacturers — requires admin approval or strong evidence (>=0.90 confidence)' }
  }

  return { allowed: true }
}

/**
 * Record merge in entity_merge_history (reversible)
 */
export async function recordMerge(params: {
  sourceId: string
  targetId: string
  reason: string
  confidence: number
  agentRunId?: string
  payload: unknown
}) {
  return prisma.entity_merge_history.create({
    data: {
      source_entity_id: params.sourceId,
      target_entity_id: params.targetId,
      reason: params.reason,
      confidence: params.confidence,
      actor_agent_run_id: params.agentRunId,
      merge_payload: params.payload as any,
    },
  })
}
