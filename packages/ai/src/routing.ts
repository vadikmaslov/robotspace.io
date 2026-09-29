/** Ordered AI model routing with retries, cooldown and fallback. */
import { prisma } from '@robotspace/db'
import type { GenerateRequest, GenerateResponse, ProviderConfig, NormalizedError } from './adapter-interface'
import { getAdapter } from './index'
import { decryptStoredCredential } from './encryption'
import { reserveBudget, settleBudget, type Reservation } from './budget'
import { boundedRequest, BudgetDenied } from './budget-math'

type RouteScope = 'SIMPLE_DEFAULT' | 'COMPLEX_DEFAULT' | 'OPERATION_OVERRIDE'

type RouteEntry = {
  routeModelId: string
  remoteModelId: string
  providerId: string
  rank: number
  maxAttempts: number
  cooldownMs: number
}

interface RoutingOptions {
  scope: RouteScope
  operationName?: string
  budgetLimit?: number
  validateResponse?: (response: GenerateResponse) => boolean
}

interface RoutingResult {
  response: GenerateResponse | null
  routeEntry?: RouteEntry
  attempts: number
  fallbackChain: string[]
  error?: NormalizedError
}

const cooldownMap = new Map<string, number>()

export async function routeRequest(request: GenerateRequest, options: RoutingOptions): Promise<RoutingResult> {
  const bounds = boundedRequest(request)
  const entries = await loadRouteEntries(options.scope)
  if (!entries.length) return { response: null, attempts: 0, fallbackChain: [], error: { type: 'CLIENT_ERROR', message: `No enabled models in ${options.scope}`, retryable: false } }

  const fallbackChain: string[] = []
  let attempts = 0
  let lastError: NormalizedError | undefined
  let requestReserved = 0

  for (const entry of entries) {
    fallbackChain.push(entry.remoteModelId)
    if (inCooldown(entry.routeModelId)) continue
    const config = await buildProviderConfig(entry.providerId)
    if (!config) continue
    const adapter = getAdapter(config.adapterType)

    for (let attempt = 0; attempt < Math.min(entry.maxAttempts, 3) && attempts < 3; attempt++) {
      let reservation: Reservation
      try {
        reservation = await reserveBudget(entry.routeModelId, options.operationName || options.scope, request,
          options.budgetLimit === undefined ? undefined : options.budgetLimit - requestReserved / 1000000)
      } catch (error) {
        // Missing tariff may fall through to a priced model; infrastructure failures never do.
        if (!(error instanceof BudgetDenied)) throw error
        lastError = { type: 'CLIENT_ERROR', message: error.code, retryable: false }
        if (error.code === 'PRICE_MISSING_OR_EXPIRED') break
        return { response: null, attempts, fallbackChain, error: lastError }
      }
      requestReserved += reservation.micros
      attempts++
      let response: GenerateResponse
      try {
        response = await adapter.generate(config, {
          ...request,
          modelId: entry.remoteModelId,
          options: { ...request.options, maxTokens: bounds.output, timeout: Math.min(request.options?.timeout ?? 60000, config.requestTimeout ?? 60000, 60000) },
        })
      } catch (error) {
        lastError = adapter.normalizeError(error)
        // Timeout/error may still be billable. Never refund or retry without durable accounting.
        await settleBudget(reservation, undefined, false, lastError.type)
        if (lastError.type === 'AUTH_ERROR' || lastError.type === 'RATE_LIMITED') {
          if (lastError.type === 'RATE_LIMITED') cooldownMap.set(entry.routeModelId, Date.now() + entry.cooldownMs)
          break
        }
        if (!lastError.retryable || attempt === entry.maxAttempts - 1) break
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10_000)))
        continue
      }
      let accepted = true
      try { accepted = !options.validateResponse || options.validateResponse(response) }
      catch { accepted = false }
      const settled = await settleBudget(reservation, response, accepted, accepted ? 'INVALID_USAGE' : 'VALIDATION_ERROR')
      if (!settled) return { response: null, attempts, fallbackChain, error: { type: 'CLIENT_ERROR', message: 'AI_ACCOUNTING_REVIEW_REQUIRED', retryable: false } }
      if (!accepted) {
        lastError = { type: 'VALIDATION_ERROR', message: 'Model response failed validation', retryable: false }
        break
      }
      return { response, routeEntry: entry, attempts, fallbackChain }
    }
  }

  await prisma.exceptions.create({
    data: { type: 'AI_ROUTE_EXHAUSTED', severity: 'medium', state: 'OPEN', reason_summary: `All models failed for ${options.scope}. Chain: ${fallbackChain.join(' -> ')}`, dedup_key: `ai-route-${Date.now()}` },
  }).catch(() => undefined)
  return { response: null, attempts, fallbackChain, error: lastError }
}

async function loadRouteEntries(scope: RouteScope): Promise<RouteEntry[]> {
  const routes = await prisma.ai_routes.findMany({ where: { scope, enabled: true }, orderBy: { rank: 'asc' } }) as Array<{ model_id: string; rank: number | null; max_attempts: number | null; cooldown_ms: number | null }>
  if (!routes.length) return []
  const models = await prisma.ai_models.findMany({ where: { id: { in: routes.map(route => route.model_id) }, enabled: true } }) as Array<{ id: string; provider_id: string | null; remote_model_id: string }>
  const byId = new Map(models.filter(model => Boolean(model.provider_id)).map(model => [model.id, model]))
  return routes.flatMap(route => {
    const model = byId.get(route.model_id)
    return model?.provider_id ? [{ routeModelId: model.id, remoteModelId: model.remote_model_id, providerId: model.provider_id, rank: route.rank ?? 0, maxAttempts: route.max_attempts ?? 1, cooldownMs: route.cooldown_ms ?? 60_000 }] : []
  })
}

async function buildProviderConfig(providerId: string): Promise<ProviderConfig | null> {
  const [provider, credential] = await Promise.all([
    prisma.ai_providers.findUnique({ where: { id: providerId } }),
    prisma.ai_provider_credentials.findFirst({ where: { provider_id: providerId, status: 'ACTIVE' }, orderBy: { created_at: 'desc' } }),
  ])
  if (!provider?.enabled || !credential?.api_key_plain) return null
  return { id: provider.id, adapterType: provider.adapter_type, baseUrl: provider.base_url ?? '', apiKey: decryptStoredCredential(credential.api_key_plain), enabled: provider.enabled, requestTimeout: provider.request_timeout_ms ?? 60_000 }
}

function inCooldown(modelId: string) {
  const until = cooldownMap.get(modelId)
  if (!until) return false
  if (until <= Date.now()) { cooldownMap.delete(modelId); return false }
  return true
}
