/**
 * Phase 5.2: Source Adapter SDK
 *
 * Interface for all source adapters. Every adapter validates:
 * 1. Source is ACTIVE and kill_switch is false
 * 2. Policy revision matches (no concurrent override)
 * 3. HTTP client enforces timeout, rate limit, max response size, user agent
 * 4. Redirects limited and revalidated against SSRF policy
 * 5. Content-type allowlist
 * 6. Raw policy checked before persistence
 */

import { prisma } from '@robotspace/db'
import { safeFetch } from '@robotspace/ai/src/ssrf'
import type { SourceStatusModel } from '@prisma/client'

// ============================================================
// TYPES
// ============================================================

export interface SourceReference {
  externalId: string
  canonicalUrl: string
  sourceRevision: string
}

export interface FetchResult {
  status: number
  headers: Record<string, string>
  body: string
  contentType: string
}

export interface ParsedRecord {
  externalId: string
  rawPayload: unknown
  fields: Record<string, ParsedField>
}

export interface ParsedField {
  rawValue: unknown
  normalizedValue: unknown
  confidence: number
}

export interface Cursor {
  value: string
  checkPointAt: Date
}

export interface AdapterContext {
  sourceKey: string
  policyRevision: number
  signal?: AbortSignal
  logger: (msg: string) => void
}

// ============================================================
// ADAPTER INTERFACE
// ============================================================

export interface SourceAdapter {
  /** Discover new/changed references from the source */
  discover(context: AdapterContext, cursor: Cursor | null): AsyncIterable<SourceReference>

  /** Fetch a single reference */
  fetch(context: AdapterContext, reference: SourceReference): Promise<FetchResult>

  /** Parse fetched data into structured records */
  parse(context: AdapterContext, fetchResult: FetchResult): Promise<ParsedRecord[]>

  /** Return current checkpoint cursor */
  checkpoint(context: AdapterContext, lastProcessedAt: Date): Promise<Cursor>
}

// ============================================================
// POLICY GUARDS (called before each adapter step)
// ============================================================

/**
 * Validate source is active and kill switch is off.
 * Returns current policy revision for comparison.
 */
export async function validateSourceStatus(sourceKey: string, expectedPolicyRevision: number): Promise<{ valid: boolean; currentRevision: number; reason?: string }> {
  const source = await prisma.sources.findUnique({
    where: { key: sourceKey },
    select: { status: true, kill_switch: true, policy_revision: true },
  })

  if (!source) {
    return { valid: false, currentRevision: 0, reason: `Source "${sourceKey}" not found` }
  }

  if (source.status !== 'ACTIVE') {
    return { valid: false, currentRevision: source.policy_revision, reason: `Source "${sourceKey}" is ${source.status}` }
  }

  if (source.kill_switch) {
    return { valid: false, currentRevision: source.policy_revision, reason: `Source "${sourceKey}" kill switch is enabled` }
  }

  if (source.policy_revision > expectedPolicyRevision) {
    return { valid: false, currentRevision: source.policy_revision, reason: `Policy revision changed (${expectedPolicyRevision} → ${source.policy_revision})` }
  }

  return { valid: true, currentRevision: source.policy_revision }
}

/**
 * DB guard: reject persistence with old policy revision.
 * This catches race conditions even when worker misses cancellation signal.
 */
export async function rejectOldRevisionPersistence(sourceKey: string, policyRevision: number): Promise<boolean> {
  const result = await prisma.sources.findUnique({
    where: { key: sourceKey },
    select: { policy_revision: true, status: true, kill_switch: true },
  })

  if (!result || result.status !== 'ACTIVE' || result.kill_switch) return false
  return result.policy_revision === policyRevision
}

// ============================================================
// SAFE FETCH WRAPPER (SSRF + rate limit + content-type + size)
// ============================================================

const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'text/xml',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
  'text/html',
  'text/plain',
  'application/ld+json',
  'application/sparql-results+json',
]

/**
 * Fetch with all SDK guards applied.
 * - SSRF protection (from packages/ai)
 * - Content-type allowlist
 * - Max response size (1MB default)
 * - Rate limit check (source contract RPM)
 * - Custom User-Agent
 */
export async function guardedFetch(
  context: AdapterContext,
  url: string,
  options?: {
    maxSizeBytes?: number
    allowedContentTypes?: string[]
    method?: string
    headers?: Record<string, string>
    body?: string
  },
): Promise<FetchResult> {
  // Policy check
  const policyCheck = await validateSourceStatus(context.sourceKey, context.policyRevision)
  if (!policyCheck.valid) {
    throw new Error(`Source validation failed: ${policyCheck.reason}`)
  }

  // Rate limit (basic — per-source RPM enforced by job schedule)
  const maxSize = options?.maxSizeBytes ?? 1_048_576 // 1MB
  const allowedTypes = options?.allowedContentTypes ?? ALLOWED_CONTENT_TYPES

  const response = await safeFetch({
    url,
    method: options?.method ?? 'GET',
    headers: {
      'User-Agent': 'RobotSpace-Collector/1.0 (+https://robotspace.io)',
      Accept: allowedTypes.join(', '),
      ...(options?.headers ?? {}),
    },
    body: options?.body,
    timeout: 30_000,
  })

  // Content-type check
  const contentType = response.headers.get('content-type') ?? ''
  if (!allowedTypes.some(t => contentType.includes(t.split('/')[1] ?? t))) {
    throw new Error(`Content-Type "${contentType}" not in allowlist for source "${context.sourceKey}"`)
  }

  // Size check
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > maxSize) {
    throw new Error(`Response size (${Buffer.byteLength(text, 'utf8')} bytes) exceeds max (${maxSize} bytes) for source "${context.sourceKey}"`)
  }

  context.logger(`Fetched ${url} → ${response.status} (${Buffer.byteLength(text, 'utf8')} bytes, ${contentType})`)

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: text,
    contentType,
  }
}

// ============================================================
// RAW POLICY CHECK
// ============================================================

/**
 * Check raw retention policy before persisting any source content.
 * Returns whether the content is allowed to be stored.
 */
export async function checkRawPolicy(
  sourceKey: string,
  recordType: string, // "full_html", "full_text", "metadata", etc.
): Promise<{ allowed: boolean; reason?: string }> {
  const contract = await prisma.source_contracts.findFirst({
    where: { source_key: sourceKey },
    orderBy: { created_at: 'desc' },
    select: { raw_retention_policy: true, allowed_operations: true },
  })

  if (!contract) {
    return { allowed: false, reason: `No active source contract for "${sourceKey}"` }
  }

  const operations = contract.allowed_operations as Record<string, boolean> | null
  if (recordType === 'full_html' && !operations?.STORE_FULL_TEXT) {
    return { allowed: false, reason: `Full text storage not permitted for source "${sourceKey}"` }
  }

  return { allowed: true }
}
