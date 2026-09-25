import { createHash } from 'node:crypto'

export type AgentRoutingRule = {
  operation: string
  label: string
  simplePercent: number
  complexPercent: number
}

/**
 * Cost/quality policy for the autonomous agents. The selected scope is stable
 * for identical input, which makes runs reproducible while keeping the stated
 * SIMPLE/COMPLEX mix over a stream of work.
 */
export const AGENT_ROUTING_RULES: AgentRoutingRule[] = [
  { operation: 'taxonomy_classification', label: 'Taxonomy classifier', simplePercent: 90, complexPercent: 10 },
  { operation: 'source_discovery', label: 'Source discovery', simplePercent: 20, complexPercent: 80 },
  { operation: 'source_contract_assessment', label: 'Source contract auditor', simplePercent: 30, complexPercent: 70 },
  { operation: 'entity_resolution', label: 'Entity resolver', simplePercent: 40, complexPercent: 60 },
  { operation: 'duplicate_resolution', label: 'Duplicate resolver', simplePercent: 65, complexPercent: 35 },
  { operation: 'conflict_analysis', label: 'Conflict analyzer', simplePercent: 35, complexPercent: 65 },
  { operation: 'archive_analysis', label: 'Archive detector', simplePercent: 60, complexPercent: 40 },
  { operation: 'license_assessment', label: 'Media license assessor', simplePercent: 50, complexPercent: 50 },
  { operation: 'submission_verification', label: 'Submission verifier', simplePercent: 30, complexPercent: 70 },
]

export function scopeForAgentRun(operation: string, input: string): 'SIMPLE_DEFAULT' | 'COMPLEX_DEFAULT' {
  const rule = AGENT_ROUTING_RULES.find(item => item.operation === operation)
  if (!rule || rule.complexPercent === 0) return 'SIMPLE_DEFAULT'
  if (rule.simplePercent === 0) return 'COMPLEX_DEFAULT'
  const bucket = createHash('sha256').update(`${operation}:${input}`).digest()[0] % 100
  return bucket < rule.simplePercent ? 'SIMPLE_DEFAULT' : 'COMPLEX_DEFAULT'
}
