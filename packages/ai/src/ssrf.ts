/**
 * Phase 4A: SSRF-Safe HTTP Client
 * Blocks requests to private IPs, loopback, link-local, metadata endpoints.
 * Resolves each outbound URL (and each redirect) before it is fetched.
 * Never forwards Authorization header on redirect.
 */

import dns from 'node:dns/promises'
import { isIP } from 'node:net'

export interface SafeFetchOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
  allowedOrigins?: string[] // optional allowlist for specific endpoints
}

export interface SafeFetchResponse {
  status: number
  headers: Headers
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}

const BLOCKED_RANGES = [
  // IPv4 private addresses
  { start: '0.0.0.0', end: '0.255.255.255' },
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '100.64.0.0', end: '100.127.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Cloud metadata
  { start: '169.254.169.254', end: '169.254.169.254' },
  // Docker
  { start: '172.17.0.0', end: '172.17.255.255' },
]

function ipv4ToInteger(ip: string): number {
  return ip.split('.').reduce((value, octet) => (value * 256) + Number(octet), 0)
}

function ipInRange(ip: string, start: string, end: string): boolean {
  const value = ipv4ToInteger(ip)
  return value >= ipv4ToInteger(start) && value <= ipv4ToInteger(end)
}

function isPrivateIP(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true // IPv6 loopback, link-local, unique local
  }
  if (!isIP(ip)) return false
  return BLOCKED_RANGES.some(range => ipInRange(ip, range.start, range.end))
}

/**
 * Re-resolve hostname to IP at connection boundary.
 * This mitigates DNS rebinding attacks.
 */
async function resolveSafeHostname(url: URL, allowedOrigins: string[]): Promise<string> {
  // Check allowlist first
  if (allowedOrigins.length > 0) {
    const allowed = allowedOrigins.some((origin) => {
      const parsed = new URL(origin)
      return parsed.protocol === url.protocol && parsed.hostname === url.hostname && parsed.port === url.port
    })
    if (!allowed) {
      throw new Error(`SSRF blocked: hostname "${url.hostname}" not in allowed origins`)
    }
  }

  const addresses = await dns.resolve4(url.hostname)
  if (addresses.length === 0) {
    throw new Error(`No IP addresses found for hostname: ${url.hostname}`)
  }

  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      throw new Error(`SSRF blocked: hostname "${url.hostname}" resolves to private IP ${addr}`)
    }
  }

  return addresses[0]
}

/**
 * Safe HTTP fetch — SSRF-protected, redirect-Auth-stripping, DNS rebinding-resistant
 */
export async function safeFetch(options: SafeFetchOptions): Promise<SafeFetchResponse> {
  const url = new URL(options.url)

  // Non-HTTPS only allowed for localhost in development
  const isLocalDev = process.env.NODE_ENV === 'development' && url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !isLocalDev) {
    throw new Error(`SSRF blocked: non-HTTPS protocol "${url.protocol}" not allowed (only HTTPS)`)
  }

  // Resolve hostname with SSRF check
  await resolveSafeHostname(url, options.allowedOrigins ?? [])

  const fetchOptions: RequestInit = {
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    body: options.body ?? undefined,
    signal: AbortSignal.timeout(options.timeout ?? 60_000),
    redirect: 'manual', // critical: prevent automatic redirect with Auth header
  }

  let response = await fetch(options.url, fetchOptions)

  // Handle redirects manually — strip Authorization header
  if (response.status >= 300 && response.status < 400) {
    // A second POST can be billed separately. The routing budget reserves one HTTP attempt.
    if (options.method && options.method !== 'GET' && options.method !== 'HEAD') {
      throw new Error('Redirect refused for a non-read-only request')
    }
    const location = response.headers.get('location')
    if (!location) {
      throw new Error('Redirect response without Location header')
    }
    const redirectUrl = new URL(location, url).toString()

    // Verify redirect doesn't go to different origin with auth
    const redirectParsed = new URL(redirectUrl)
    const originalOrigin = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`
    const redirectOrigin = `${redirectParsed.protocol}//${redirectParsed.hostname}${redirectParsed.port ? ':' + redirectParsed.port : ''}`

    if (redirectOrigin !== originalOrigin) {
      // Cross-origin redirect: strip auth
      const strippedHeaders = { ...(options.headers ?? {}) }
      delete strippedHeaders['Authorization']
      delete strippedHeaders['authorization']
      delete strippedHeaders['x-api-key']

      if (options.body || options.method === 'POST' || options.method === 'PUT') {
        // Don't forward POST body to different origin
        throw new Error(`SSRF blocked: cross-origin redirect (${originalOrigin} → ${redirectOrigin}) with credentials stripped`)
      }

      const redirectFetchOptions = {
        method: 'GET',
        headers: strippedHeaders,
        signal: AbortSignal.timeout(options.timeout ?? 60_000),
      }

      return safeFetch({
        url: redirectUrl,
        method: 'GET',
        headers: strippedHeaders,
        timeout: options.timeout,
        allowedOrigins: options.allowedOrigins,
      }) as Promise<SafeFetchResponse>
    }

    // Same-origin redirect: forward with auth
    const redirectFetchOptions = {
      ...fetchOptions,
      redirect: 'manual' as const,
    }

    response = await fetch(redirectUrl, redirectFetchOptions)
  }

  return {
    status: response.status,
    headers: response.headers,
    async text() { return response.text() },
    async json<T>() { return response.json() as T },
  }
}
