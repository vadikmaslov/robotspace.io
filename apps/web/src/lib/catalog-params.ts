export type CatalogParams = Record<string, string | string[] | undefined>
const keys = ['q', 'country', 'category', 'sort', 'payload_min', 'payload_max', 'reach_min', 'reach_max'] as const
export function catalogParams(input: CatalogParams) {
  const values = Object.fromEntries(keys.map(key => [key, (typeof input[key] === 'string' ? input[key] : '').trim().slice(0, 120)])) as Record<typeof keys[number], string>
  const aliases: Record<string, string> = { 'United States': 'US', Germany: 'DE', Japan: 'JP', China: 'CN', 'South Korea': 'KR', Denmark: 'DK' }
  values.country = aliases[values.country] ?? values.country.toUpperCase()
  const errors: string[] = []
  if (values.country && !/^[A-Z]{2}$/.test(values.country)) errors.push('Choose a valid country.')
  for (const field of ['payload_min', 'payload_max', 'reach_min', 'reach_max'] as const) {
    if (values[field] && (!/^\d+(\.\d+)?$/.test(values[field]) || Number(values[field]) > 1_000_000)) errors.push('Ranges must be numbers between 0 and 1000000.')
  }
  for (const field of ['payload', 'reach'] as const) {
    if (values[`${field}_min`] && values[`${field}_max`] && Number(values[`${field}_min`]) > Number(values[`${field}_max`])) errors.push('Minimum must not exceed maximum.')
  }
  const rawPage = typeof input.page === 'string' ? input.page : '1'
  const page = /^\d+$/.test(rawPage) ? Math.min(10000, Math.max(1, Number(rawPage))) : 1
  return { values, page, error: errors[0] ?? null }
}
export function catalogPageUrl(path: string, values: Record<string, string>, page: number) {
  const query = new URLSearchParams()
  for (const key of keys) if (values[key]) query.set(key, values[key])
  query.set('page', String(page))
  return `${path}?${query}`
}
export function numberRange(min: string, max: string) {
  return { ...(min !== '' ? { gte: Number(min) } : {}), ...(max !== '' ? { lte: Number(max) } : {}) }
}
export function escapedLike(value: string) { return `%${value.replace(/[\\%_]/g, '\\$&')}%` }
