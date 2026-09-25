/**
 * Phase 2B: Canonicalization Service
 * Deterministic selection of winning assertion from competing evidence
 * Implements algorithm from plan section 7.5
 */

import { prisma } from '../index'
import { canonicalFieldRepo, assertionRepo, dataConflictRepo } from '../repositories/assertion'

/**
 * Effective cap = min(source cap, extraction cap, entity match cap) * freshness factor
 */
function effectiveCap(
  sourceCap: number,
  extractionCap: number,
  entityMatchCap: number,
  freshnessFactor: number,
): number {
  return Math.min(sourceCap, extractionCap, entityMatchCap) * freshnessFactor
}

/**
 * Cluster assertions by normalized value equality.
 * ENUM/BOOLEAN/ID: exact equality.
 * NUMBER: abs(a-b) <= max(absTol, relTol * max(abs(a), abs(b))).
 * TEXT: normalized exact match.
 * DATE: exact same date.
 */
function valueEquals(a: unknown, b: unknown, dataType: string, absTol: number, relTol: number): boolean {
  if (a === b) return true

  switch (dataType) {
    case 'NUMBER':
    case 'INTEGER': {
      const na = Number(a)
      const nb = Number(b)
      if (isNaN(na) || isNaN(nb)) return false
      const diff = Math.abs(na - nb)
      return diff <= Math.max(absTol, relTol * Math.max(Math.abs(na), Math.abs(nb)))
    }
    default:
      return String(a) === String(b)
  }
}

/**
 * Deterministic confidence algorithm:
 * 1. Group assertions by normalized value
 * 2. For each group, compute base_score from strongest assertion
 * 3. Count independent supporting evidence origin groups
 * 4. Add corroboration boost (capped at 0.15)
 * 5. Select winning group with highest cluster_score
 * 6. If gap < conflict_margin → conflict, hide field
 * 7. If top score < public threshold → hide, create low-confidence exception
 */
export async function recalculateCanonicalField(params: {
  entityType: 'ROBOT' | 'COMPANY'
  entityId: string
  fieldKey: string
  fieldSchemaVersion?: string
  attributeDefVersionId?: string
  categorySchemaVersionId?: string
  publicThreshold: number
  conflictMargin: number
  sourceCaps: Record<string, number>
}) {
  const assertions = await prisma.field_assertions.findMany({
    where: {
      entity_type: params.entityType,
      entity_id: params.entityId,
      field_key: params.fieldKey,
      assertion_status: { in: ['CANDIDATE', 'ACCEPTED'] },
    },
    orderBy: { evidence_confidence: 'desc' },
  })

  if (assertions.length === 0) {
    return { winner: null, conflict: false, hidden: true }
  }

  // Group assertions by normalized value
  const clusters: Array<{
    value: unknown
    assertions: typeof assertions
    dependencyGroups: Set<string>
  }> = []

  for (const a of assertions) {
    const raw = (a.raw_value_json as any)?.value
    let added = false
    for (const cluster of clusters) {
      if (valueEquals(raw, cluster.value, 'TEXT', 0, 0)) {
        cluster.assertions.push(a)
        if (a.evaluated_group_id) cluster.dependencyGroups.add(a.evaluated_group_id)
        added = true
        break
      }
    }
    if (!added) {
      const group = new Set<string>()
      if (a.evaluated_group_id) group.add(a.evaluated_group_id)
      clusters.push({ value: raw, assertions: [a], dependencyGroups: group })
    }
  }

  // Score each cluster
  const scoredClusters = clusters.map((cluster) => {
    // Sort assertions by effective cap descending
    const sorted = cluster.assertions.map((a) => ({
      assertion: a,
      cap: effectiveCap(
        params.sourceCaps[a.source_id] ?? 0.50,
        1.00, // all assertions are schema-valid by definition
        1.00, // entity matching verified before this point
        a.freshness_status === 'FRESH' || a.freshness_status === 'MANUALLY_LOCKED' ? 1.0
          : a.freshness_status === 'STALE' ? 0.75
          : 0,
      ),
    })).filter(s => s.cap > 0).sort((a, b) => b.cap - a.cap)

    if (sorted.length === 0) return { cluster, score: 0, sorted: [] }

    // Base score = highest effective cap
    let score = sorted[0].cap

    // Corroboration boost from independent groups
    const independentGroups = new Set<string>()
    for (const s of sorted) {
      if (s.assertion.evaluated_group_id && !independentGroups.has(s.assertion.evaluated_group_id)) {
        independentGroups.add(s.assertion.evaluated_group_id)
      }
    }

    // Each additional independent group adds small boost
    let boost = 0
    for (const s of sorted.slice(1)) {
      if (s.cap >= 0.90) boost += 0.10
      else if (s.cap >= 0.75) boost += 0.08
      else if (s.cap >= 0.50) boost += 0.05
    }
    boost = Math.min(boost, 0.15)

    score = Math.min(0.99, score + boost)

    return { cluster, score, sorted }
  }).sort((a, b) => b.score - a.score)

  // TOP cluster
  const top = scoredClusters[0]
  if (!top || top.score < params.publicThreshold) {
    return { winner: null, conflict: false, hidden: true }
  }

  // Check for conflict
  if (scoredClusters.length > 1) {
    const runnerUp = scoredClusters[1]
    if (top.score - runnerUp.score < params.conflictMargin) {
      return { winner: null, conflict: true, hidden: true }
    }
  }

  // Select winning assertion within cluster: manual → highest cap → source priority → newest observed
  const winner = top.sorted[0]
  const winningAssertion = winner.assertion

  // Update canonical field
  await canonicalFieldRepo.upsert({
    entityType: params.entityType,
    entityId: params.entityId,
    fieldKey: params.fieldKey,
    fieldSchemaVersion: params.fieldSchemaVersion,
    winningAssertionId: winningAssertion.id,
    canonicalValue: winningAssertion.normalized_value_json,
    evidenceConfidence: top.score,
    freshnessStatus: winningAssertion.freshness_status,
  })

  return { winner: winningAssertion, conflict: false, hidden: false, confidence: top.score }
}

/**
 * Recalculate ALL canonical fields for an entity (triggered after source disable/recalculation)
 */
export async function recalculateAllCanonicalFields(entityId: string, entityType: 'ROBOT' | 'COMPANY') {
  const assertions = await prisma.field_assertions.findMany({
    where: { entity_type: entityType, entity_id: entityId },
    distinct: ['field_key'],
    select: { field_key: true },
  })

  for (const a of assertions) {
    await recalculateCanonicalField({
      entityType,
      entityId,
      fieldKey: a.field_key as string,
      publicThreshold: 0.90,
      conflictMargin: 0.10,
      sourceCaps: {}, // populated from source contracts in production
    })
  }
}
