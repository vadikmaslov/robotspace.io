/**
 * Structured logger with correlation ID support
 * All logs output JSON format, redact known secret fields
 */

const KNOWN_SECRET_KEYS = [
  'api_key',
  'secret',
  'password',
  'token',
  'authorization',
  'apikey',
]

/**
 * Redact known secret patterns from an object for logging
 */
export function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  
  const result: Record<string, unknown> = {}
  const source = obj as Record<string, unknown>
  
  for (const [key, value] of Object.entries(source)) {
    const lowerKey = key.toLowerCase()
    
    // Check if key matches a secret pattern
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

/**
 * Create a logger instance with built-in correlation ID
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
}

export function createLogger(requestId: string): Logger {
  return {
    info(message: string, meta?: Record<string, unknown>) {
      log('info', message, requestId, meta)
    },
    error(message: string, meta?: Record<string, unknown>) {
      log('error', message, requestId, meta)
    },
    warn(message: string, meta?: Record<string, unknown>) {
      log('warn', message, requestId, meta)
    },
  }
}

function log(level: string, message: string, requestId: string, meta?: Record<string, unknown>) {
  const entry = {
    level,
    message,
    request_id: requestId,
    timestamp: new Date().toISOString(),
    ...redactSecrets(meta),
  }
  
  try {
    console.log(JSON.stringify(entry))
  } catch {
    // Fallback if JSON stringify fails
    console.log(`[${level}] ${message} [req:${requestId}]`)
  }
}
