/**
 * Phase 7.4: Autonomous Agent Operations
 *
 * Nine agent handlers with prompt version, schema, timeout, budget, and fixtures.
 * Each produces assertions through the canonicalization pipeline.
 *
 * Agent tool permissions are enforced by code — prompt cannot expand them.
 * Default policy: deny.
 */

import { prisma } from '@robotspace/db'
import { routeRequest } from '@robotspace/ai/src/routing'
import { scopeForAgentRun } from './routing-policy'
import type { GenerateRequest } from '@robotspace/ai/src/adapter-interface'
import { writeAuditEntry } from '@robotspace/db'

// ============================================================
// BASE AGENT
// ============================================================

interface AgentConfig {
  operation: string
  promptVersion: string
  maxTokens: number
  temperature: number
  timeout: number
}

async function runAgent(
  config: AgentConfig,
  messages: GenerateRequest['messages'],
): Promise<string> {
  const result = await routeRequest(
    {
      modelId: '', // filled by routing engine
      messages,
      options: {
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout: config.timeout,
      },
    },
    { scope: scopeForAgentRun(config.operation, messages.map(message => message.content).join('\n')) },
  )

  if (!result.response) {
    throw new Error(`Agent "${config.operation}" failed: ${result.error?.message}. Chain: ${result.fallbackChain.join(' → ')}`)
  }

  return result.response.content
}

// ============================================================
// 1. TAXONOMY CLASSIFIER
// ============================================================

export async function taxonomyClassifier(robotName: string, description: string, categories: string[]): Promise<{ categorySlug: string; confidence: number }> {
  const prompt = `Classify the following robot into the most specific category:
Robot: ${robotName}
Description: ${description}
Available categories: ${categories.join(', ')}

Respond with JSON: { "category_slug": "...", "confidence": 0.XX }`

  const content = await runAgent(
    { operation: 'taxonomy_classification', promptVersion: 'v1', maxTokens: 500, temperature: 0.1, timeout: 15_000 },
    [{ role: 'user', content: prompt }],
  )

  const result = JSON.parse(content) as { category_slug: string; confidence: number }
  return result
}

// ============================================================
// 2. SOURCE DISCOVERY AGENT
// ============================================================

export async function sourceDiscoveryAgent(category: string): Promise<Array<{ name: string; url: string; type: string }>> {
  const prompt = `Find official data sources for robotics category "${category}".
Look for: official manufacturer feeds, partner directories, certification databases, sitemaps.
Return JSON array: [{ "name": "...", "url": "...", "type": "API|RSS|SITEMAP|CATALOG" }]

IMPORTANT: Only return publicly documented, non-scraping, API/document endpoints.
Do NOT suggest bypassing auth, CAPTCHA, or robots.txt.`

  const content = await runAgent(
    { operation: 'source_discovery', promptVersion: 'v1', maxTokens: 2000, temperature: 0.2, timeout: 30_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// 3. SOURCE CONTRACT AUDITOR
// ============================================================

export async function sourceContractAuditor(sourceKey: string, endpoint: string): Promise<{ status: string; issues: string[] }> {
  const prompt = `Audit source contract for "${sourceKey}" at endpoint: ${endpoint}.
Check:
1. Is the endpoint accessible?
2. Does robots.txt allow crawling (if HTML)?
3. Are terms of service compatible?
4. Is there any API rate limit or license restriction?

Respond with JSON: { "status": "OK|NEEDS_REVIEW|BLOCKED", "issues": ["..."] }`

  const content = await runAgent(
    { operation: 'source_contract_assessment', promptVersion: 'v1', maxTokens: 1000, temperature: 0.1, timeout: 20_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// 4. AMBIGUOUS ENTITY RESOLVER
// ============================================================

export async function ambiguousEntityResolver(
  candidates: Array<{ entityId: string; name: string; slug: string }>,
  newCandidateData: { name: string; manufacturer?: string; modelCode?: string },
): Promise<{ matchEntityId: string | null; confidence: number; explanation: string }> {
  const prompt = `Resolve which existing entity matches the new candidate:
New candidate: ${JSON.stringify(newCandidateData)}
Existing candidates: ${JSON.stringify(candidates)}

IMPORTANT — supplementary reference: You may also have access to the Unibot catalog 
(unibot_catalog_cache table, entity_type='robot') which contains Russian-language 
robot names (name, brand_name, section_name). Use this as a HELPER, not primary source:
- Match by fuzzy name similarity (different transliterations: e.g. "Робот-собака" ≈ "Robot Dog")
- Cross-reference brand names (BRAND_NAME from Unibot vs manufacturer from Wikidata)
- Check section_name for category hints (SECTION_NAME like "Промышленные роботы" → "Industrial")
- COUNTRY field from Unibot brands is in Russian — convert to ISO code (Китай→CN, США→US, etc.)
- Never use Unibot as the sole evidence — always confirm with primary sources

Respond with JSON: { "match_entity_id": "uuid or null", "confidence": 0.XX, "explanation": "..." }
If none match, return match_entity_id: null.`

  const content = await runAgent(
    { operation: 'entity_resolution', promptVersion: 'v1', maxTokens: 800, temperature: 0.1, timeout: 20_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// 5. DUPLICATE RESOLVER
// ============================================================

export async function duplicateResolver(entityA: { name: string; manufacturer: string }, entityB: { name: string; manufacturer: string }): Promise<{ areDuplicates: boolean; confidence: number; explanation: string }> {
  const prompt = `Are these two robot entries duplicates of the same model?
Entity A: ${JSON.stringify(entityA)}
Entity B: ${JSON.stringify(entityB)}

Consider: name similarity (including different transliterations — Russian "Робот" ≈ English "Robot"), 
manufacturer, model codes, release dates.
IMPORTANT: Names may differ due to language (English vs Russian from Unibot catalog). 
Match if the core meaning is the same despite transliteration differences.
Respond with JSON: { "are_duplicates": true|false, "confidence": 0.XX, "explanation": "..." }`

  const content = await runAgent(
    { operation: 'duplicate_resolution', promptVersion: 'v1', maxTokens: 600, temperature: 0.1, timeout: 20_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// 6. CONFLICT ANALYZER
// ============================================================

export async function conflictAnalyzer(
  fieldKey: string,
  competingValues: Array<{ source: string; value: unknown; confidence: number }>,
): Promise<{ recommendedValue: unknown; recommendationReason: string }> {
  const prompt = `Analyze conflicting values for field "${fieldKey}":
Competing assertions: ${JSON.stringify(competingValues)}

Recommend the most reliable value based on source authority and value consistency.
Respond with JSON: { "recommended_value": ..., "recommendation_reason": "..." }`

  const content = await runAgent(
    { operation: 'conflict_analysis', promptVersion: 'v1', maxTokens: 800, temperature: 0.1, timeout: 20_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// 7. ARCHIVE DETECTOR
// ============================================================

export async function archiveDetector(robotName: string, signals: string[]): Promise<{ shouldArchive: boolean; confidence: number; evidence: string }> {
  const prompt = `Determine if the robot "${robotName}" should be archived (discontinued/EOL).
Signals: ${signals.join('; ')}

Respond with JSON: { "should_archive": true|false, "confidence": 0.XX, "evidence": "..." }
Only archive if there is strong evidence (manufacturer announcement, official feed, 2+ independent signals).`

  const content = await runAgent(
    { operation: 'archive_analysis', promptVersion: 'v1', maxTokens: 600, temperature: 0.1, timeout: 20_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// 8. MEDIA LICENSE ASSESSOR
// ============================================================

export async function mediaLicenseAssessor(imageUrl: string, metadata: Record<string, unknown>): Promise<{ licenseStatus: string; licenseUrl?: string; attribution?: string; confidence: number; notes: string }> {
  const prompt = `Assess the license status of this image:
URL: ${imageUrl}
Metadata: ${JSON.stringify(metadata)}

Categorize as: ALLOWED (explicit open license), UNKNOWN (unclear), RESTRICTED (requires permission), TAKEDOWN.
Check: explicit license field, Creative Commons indicators, copyright notices, terms of source.
Respond with JSON: { "license_status": "ALLOWED|UNKNOWN|RESTRICTED|TAKEDOWN", "license_url": "...", "attribution": "...", "confidence": 0.XX, "notes": "..." }`

  const content = await runAgent(
    { operation: 'license_assessment', promptVersion: 'v1', maxTokens: 800, temperature: 0.1, timeout: 20_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// 9. SUBMIT VERIFICATION AGENT
// ============================================================

export async function submitVerificationAgent(
  submissionType: string,
  submittedData: Record<string, unknown>,
): Promise<{ autoAccepted: boolean; verifiedFields: Record<string, { value: unknown; confidence: number }>; needsAdminReview: string[] }> {
  const prompt = `Verify user submission:
Type: ${submissionType}
Data: ${JSON.stringify(submittedData)}

Check: URL validity, manufacturer naming consistency, realistic specifications, no spam/abuse.
For high-confidence fields (>=0.90): auto-accept. For low-confidence: flag for admin review.
Respond with JSON: { "auto_accepted": true|false, "verified_fields": { "field_name": { "value": ..., "confidence": 0.XX } }, "needs_admin_review": ["field1", "field2"] }`

  const content = await runAgent(
    { operation: 'submission_verification', promptVersion: 'v1', maxTokens: 1500, temperature: 0.1, timeout: 30_000 },
    [{ role: 'user', content: prompt }],
  )

  return JSON.parse(content)
}

// ============================================================
// AGENT REGISTRY
// ============================================================

export const agents = {
  taxonomyClassifier,
  sourceDiscoveryAgent,
  sourceContractAuditor,
  ambiguousEntityResolver,
  duplicateResolver,
  conflictAnalyzer,
  archiveDetector,
  mediaLicenseAssessor,
  submitVerificationAgent,
}

/**
 * Change hash comparison — detect when source terms change.
 * Auditor calls this to verify robots.txt/terms hasn't changed since last check.
 */
export function hasContentChanged(oldHash: string, newContent: string): boolean {
  const { createHash } = require('node:crypto')
  const newHash = createHash('sha256').update(newContent).digest('hex').slice(0, 16)
  return oldHash !== newHash
}
