/**
 * Structured logger utilities for observability
 * Re-exported from shared logic in worker package
 */

/**
 * Redact known secret patterns from an object for logging
 * Duplicate of worker/logger for cross-package access
 */
const KNOWN_SECRET_KEYS = [
  'api_key',
  'secret',
  'password',
  'token',
  'authorization',
  'apikey',
]

export function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  
  const result: Record<string, unknown> = {}
  const source = obj as Record<string, unknown>
  
  for (const [key, value] of Object.entries(source)) {
    const lowerKey = key.toLowerCase()
    const isSecret = KNOWN_SECRET_KEYS.some(pattern => lowerKey.includes(pattern))
    
    if (isSecret) {
      if (typeof value === 'string' && value.length > 0) {
        result[key] = `***REDACTED (${value.length} chars)***`
      } else {
        result[key] = '***REDACTED***'
      }
    } else {
      result[key] = value
    }
  }
  
  return result
}
