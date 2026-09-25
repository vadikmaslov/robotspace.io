/**
 * Phase 7.1: Deterministic Processing Utils
 * URL/country/date/unit normalization, schema validation, change hashing
 */

import crypto from 'node:crypto'

// ============================================================
// URL NORMALIZATION
// ============================================================

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.toLowerCase().trim())
    // Remove trailing slash, default port, fragment
    url.hash = ''
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1)
    }
    if ((url.protocol === 'https:' && url.port === '443') ||
        (url.protocol === 'http:' && url.port === '80')) {
      url.port = ''
    }
    return url.toString()
  } catch {
    return raw.toLowerCase().trim()
  }
}

// ============================================================
// COUNTRY/LANGUAGE/DATE NORMALIZATION
// ============================================================

const COUNTRY_MAP: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'united states of america': 'US',
  'germany': 'DE', 'deutschland': 'DE',
  'japan': 'JP', 'nippon': 'JP', 'nihon': 'JP',
  'china': 'CN', "people's republic of china": 'CN',
  'south korea': 'KR', 'korea': 'KR',
  'france': 'FR', 'russia': 'RU', 'uk': 'GB', 'united kingdom': 'GB',
  'italy': 'IT', 'canada': 'CA', 'australia': 'AU', 'switzerland': 'CH',
  'sweden': 'SE', 'netherlands': 'NL', 'denmark': 'DK', 'norway': 'NO',
}

export function normalizeCountry(input: string): string | null {
  const cleaned = input.toLowerCase().trim()
  // If already ISO code
  if (/^[a-z]{2}$/.test(cleaned)) return cleaned.toUpperCase()
  return COUNTRY_MAP[cleaned] ?? null
}

export function normalizeDate(input: string | Date): string | null {
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

// ============================================================
// UNIT CONVERSION — with provenance
// ============================================================

const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  length: {
    mm: 1, cm: 10, m: 1000, km: 1_000_000,
    inch: 25.4, ft: 304.8, yard: 914.4,
  },
  mass: {
    g: 1, kg: 1000, tonne: 1_000_000,
    lb: 453.592, oz: 28.3495,
  },
  speed: {
    'mm/s': 1, 'cm/s': 10, 'm/s': 1000,
  },
  time: {
    s: 1, min: 60, h: 3600,
  },
}

export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
  dimension: string,
): { value: number; originalValue: number; originalUnit: string } | null {
  const conversions = UNIT_CONVERSIONS[dimension]
  if (!conversions) return null

  const fromFactor = conversions[fromUnit]
  const toFactor = conversions[toUnit]
  if (!fromFactor || !toFactor) return null

  // Convert via base unit
  const baseValue = value * fromFactor
  const converted = baseValue / toFactor

  return {
    value: Math.round(converted * 1_000_000) / 1_000_000,
    originalValue: value,
    originalUnit: fromUnit,
  }
}

// ============================================================
// NAME / MODEL CODE NORMALIZATION
// ============================================================

export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/\(.*?\)/g, '')    // remove parentheticals
    .replace(/[^a-z0-9\s\-]/g, '') // strip special chars except hyphen
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeModelCode(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // strip everything non-alphanumeric
}

// ============================================================
// SCHEMA VALIDATION + CHANGE HASHING
// ============================================================

export function validateSchema(value: unknown, schema: { type: string; min?: number; max?: number; pattern?: string }): boolean {
  switch (schema.type) {
    case 'number': {
      const n = Number(value)
      if (isNaN(n)) return false
      if (schema.min !== undefined && n < schema.min) return false
      if (schema.max !== undefined && n > schema.max) return false
      return true
    }
    case 'string': {
      const s = String(value)
      if (schema.min !== undefined && s.length < schema.min) return false
      if (schema.max !== undefined && s.length > schema.max) return false
      if (schema.pattern && !new RegExp(schema.pattern).test(s)) return false
      return true
    }
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false'
    default:
      return true
  }
}

export function hashPayload(input: unknown): string {
  const str = JSON.stringify(input, Object.keys(input as object).sort())
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12)
}

export function hashDiff(a: unknown, b: unknown): { hashA: string; hashB: string; changed: boolean } {
  const hA = hashPayload(a)
  const hB = hashPayload(b)
  return { hashA: hA, hashB: hB, changed: hA !== hB }
}
