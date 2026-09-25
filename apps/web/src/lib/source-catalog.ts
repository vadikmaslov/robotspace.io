export const SOURCE_AREAS = [
  'CATALOG',
  'RESEARCH',
  'INSIGHTS',
  'SAFETY',
  'SOFTWARE',
  'IMAGES',
  'INTEGRATORS',
  'MARKET',
  'GENERAL',
] as const

export const SOURCE_AREA_LABELS: Record<(typeof SOURCE_AREAS)[number], string> = {
  CATALOG: 'Catalog',
  RESEARCH: 'Research',
  INSIGHTS: 'Insights',
  SAFETY: 'Safety',
  SOFTWARE: 'Software',
  IMAGES: 'Images',
  INTEGRATORS: 'Integrators',
  MARKET: 'Market',
  GENERAL: 'General',
}

export const SOURCE_TYPES = ['API', 'RSS', 'SPARQL', 'SITEMAP', 'HTML', 'FILE_FEED', 'SUBMIT', 'MANUAL'] as const
export const SOURCE_STATUSES = ['PROPOSED', 'ACTIVE', 'PAUSED', 'DISABLED', 'BROKEN'] as const
export const SOURCE_LEGAL_STATUSES = ['ALLOWED', 'UNKNOWN', 'RESTRICTED_RISK', 'TAKEDOWN'] as const
export const SOURCE_TIERS = ['A', 'B', 'C', 'D'] as const

export type SourceCatalogRecord = {
  key: string
  display_name: string | null
  owner_name: string | null
  homepage_url: string | null
  logo_url: string | null
  content_area: string
  admin_description: string | null
  public_description: string | null
  is_public: boolean
  tier: string
  source_type: string
  status: string
  legal_status: string
  schedule: string | null
  rate_limit_rpm: number | null
  trust_default_confidence: number | string
  kill_switch: boolean
  last_success_at: string | Date | null
  last_error_at: string | Date | null
  contract_count?: number
  record_count?: number
}

export function isSourceKey(value: string) {
  return /^[a-z0-9][a-z0-9_-]{1,98}$/i.test(value)
}

export function sourceDisplayName(source: Pick<SourceCatalogRecord, 'display_name' | 'owner_name' | 'key'>) {
  return source.display_name || source.owner_name || source.key
}

function oneOf<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? value : fallback
}

function optionalText(value: unknown, maxLength: number) {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  if (text.length > maxLength) throw new Error(`Text must be ${maxLength} characters or fewer`)
  return text
}

function optionalUrl(value: unknown) {
  const url = optionalText(value, 2000)
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Enter a valid HTTPS URL')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    throw new Error('URL must use HTTPS without credentials or a custom port')
  }
  return parsed.toString()
}

export function parseSourceInput(body: unknown, create = false) {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const key = optionalText(data.key, 100)
  if (create && (!key || !isSourceKey(key))) {
    throw new Error('Key: 2–99 letters, numbers, hyphens, or underscores')
  }
  const rate = data.rate_limit_rpm == null || data.rate_limit_rpm === '' ? 10 : Number(data.rate_limit_rpm)
  const confidence = data.trust_default_confidence == null || data.trust_default_confidence === '' ? 0.5 : Number(data.trust_default_confidence)
  if (!Number.isInteger(rate) || rate < 0 || rate > 100000) throw new Error('Rate limit must be an integer from 0 to 100000')
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Default confidence must be between 0 and 1')

  return {
    ...(create ? { key: key! } : {}),
    display_name: optionalText(data.display_name, 255),
    owner_name: optionalText(data.owner_name, 255),
    homepage_url: optionalUrl(data.homepage_url),
    logo_url: optionalUrl(data.logo_url),
    content_area: oneOf(data.content_area, SOURCE_AREAS, 'GENERAL'),
    admin_description: optionalText(data.admin_description, 5000),
    public_description: optionalText(data.public_description, 1200),
    is_public: data.is_public === true || data.is_public === 'true',
    tier: oneOf(data.tier, SOURCE_TIERS, 'D'),
    source_type: oneOf(data.source_type, SOURCE_TYPES, 'MANUAL'),
    status: oneOf(data.status, SOURCE_STATUSES, 'PROPOSED'),
    legal_status: oneOf(data.legal_status, SOURCE_LEGAL_STATUSES, 'UNKNOWN'),
    schedule: optionalText(data.schedule, 100),
    rate_limit_rpm: rate,
    trust_default_confidence: confidence,
    kill_switch: data.kill_switch === true || data.kill_switch === 'true',
  }
}
