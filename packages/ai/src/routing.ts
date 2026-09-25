/** Ordered AI model routing with retries, cooldown and fallback. */
import { prisma } from '@robotspace/db'
import type { GenerateRequest, GenerateResponse, ProviderConfig, NormalizedError } from './adapter-interface'
import { getAdapter } from './index'
import { decryptStoredCredential } from './encryption'

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
  const entries = await loadRouteEntries(options.scope)
  if (!entries.length) return { response: null, attempts: 0, fallbackChain: [], error: { type: 'CLIENT_ERROR', message: `No enabled models in ${options.scope}`, retryable: false } }

  const fallbackChain: string[] = []
  let attempts = 0
  let lastError: NormalizedError | undefined

  for (const entry of entries) {
    fallbackChain.push(entry.remoteModelId)
    if (inCooldown(entry.routeModelId)) continue
    const config = await buildProviderConfig(entry.providerId)
    if (!config) continue
    const adapter = getAdapter(config.adapterType)

    for (let attempt = 0; attempt < entry.maxAttempts; attempt++) {
      attempts++
      try {
        const response = await adapter.generate(config, {
          ...request,
          modelId: entry.remoteModelId,
          options: { ...request.options, timeout: config.requestTimeout },
        })
        if (options.validateResponse && !options.validateResponse(response)) {
          lastError = { type: 'VALIDATION_ERROR', message: `Model response failed validation for ${options.operationName || options.scope}`, retryable: false }
          break
        }
        await recordUsage(entry.providerId, entry.routeModelId, response)
        return { response, routeEntry: entry, attempts, fallbackChain }
      } catch (error) {
        lastError = adapter.normalizeError(error)
        if (lastError.type === 'AUTH_ERROR' || lastError.type === 'RATE_LIMITED') {
          if (lastError.type === 'RATE_LIMITED') cooldownMap.set(entry.routeModelId, Date.now() + entry.cooldownMs)
          break
        }
        if (!lastError.retryable || attempt === entry.maxAttempts - 1) break
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10_000)))
      }
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

async function recordUsage(providerId: string, modelId: string, response: GenerateResponse) {
  await prisma.ai_requests.create({
    data: { route_model_id: modelId, route_provider: providerId, idempotency_key: `route-${modelId}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`, status: 'SUCCEEDED', tokens_used: BigInt(response.usage.totalTokens), estimated_cost: 0, latency_ms: BigInt(response.latencyMs), started_at: new Date(), finished_at: new Date() },
  }).catch(() => undefined)
}
