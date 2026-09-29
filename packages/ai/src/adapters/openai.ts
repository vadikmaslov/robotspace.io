/**
 * Phase 4A: OpenAI Adapter
 * Implements AIProviderAdapter for OpenAI-compatible APIs
 */

import type {
  AIProviderAdapter,
  ProviderConfig,
  GenerateRequest,
  GenerateResponse,
  ModelDescriptor,
  NormalizedError,
  CostEstimate,
} from '../adapter-interface'
import { safeFetch } from '../ssrf'
import { isQuotaExhausted } from '../subscription'

export const openaiAdapter: AIProviderAdapter = {
  // --------------------------------------------------
  // HEALTH CHECK
  // --------------------------------------------------
  async testConnection(config: ProviderConfig) {
    try {
      const apiKey = config.apiKey // already decrypted by routing engine
      const response = await safeFetch({
        url: `${config.baseUrl}/models`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      })

      if (response.status === 200) {
        return { ok: true, message: 'Connected' }
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: 'Authentication failed' }
      }
      return { ok: false, message: `Unexpected status: ${response.status}` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
    }
  },

  // --------------------------------------------------
  // LIST MODELS
  // --------------------------------------------------
  async listModels(config: ProviderConfig): Promise<ModelDescriptor[]> {
    const apiKey = config.apiKey
    const response = await safeFetch({
      url: `${config.baseUrl}/models`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 15_000,
    })

    if (response.status !== 200) {
      throw new Error(`Failed to list models: ${response.status}`)
    }

    const data = (await response.json()) as { data?: Array<{ id: string; owned_by?: string }> }
    return (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.id,
    }))
  },

  // --------------------------------------------------
  // GENERATE
  // --------------------------------------------------
  async generate(config: ProviderConfig, request: GenerateRequest): Promise<GenerateResponse> {
    const apiKey = config.apiKey
    const start = Date.now()

    const payload: Record<string, unknown> = {
      model: request.modelId,
      messages: request.messages,
      stream: false,
    }

    const usesCompletionTokens = /^(gpt-5|o[1-9])(?:[.-]|$)/i.test(request.modelId)
    if (request.options?.temperature !== undefined && !usesCompletionTokens) payload.temperature = request.options.temperature
    if (request.options?.topP !== undefined) payload.top_p = request.options.topP
    if (request.options?.maxTokens !== undefined) {
      if (usesCompletionTokens) payload.max_completion_tokens = request.options.maxTokens
      else payload.max_tokens = request.options.maxTokens
    }

    // JSON Schema support
    if (request.options?.responseFormat === 'json_object') {
      payload.response_format = { type: 'json_object' }
    } else if (request.options?.responseFormat === 'json_schema' && request.options?.jsonSchema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: request.options.jsonSchema,
      }
    }

    const response = await safeFetch({
      url: `${config.baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: request.options?.timeout ?? config.requestTimeout ?? 60_000,
    })

    const latencyMs = Date.now() - start

    if (response.status !== 200) {
      const text = await response.text()
      if (isQuotaExhausted(response.status, text)) {
        throw { type: 'QUOTA_EXHAUSTED', statusCode: response.status, message: 'Subscription quota exhausted', retryable: false } satisfies NormalizedError
      }
      if (response.status === 429) {
        const err: NormalizedError = {
          type: 'RATE_LIMITED',
          statusCode: 429,
          message: text.slice(0, 500),
          retryable: true,
        }
        throw err
      }
      if (response.status === 401 || response.status === 403) {
        const err: NormalizedError = {
          type: 'AUTH_ERROR',
          statusCode: response.status,
          message: text.slice(0, 500),
          retryable: false,
        }
        throw err
      }
      const err: NormalizedError = {
        type: response.status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
        statusCode: response.status,
        message: text.slice(0, 500),
        retryable: response.status >= 500,
      }
      throw err
    }

    const data = (await response.json()) as {
      id: string
      model: string
      choices: Array<{ message: { content: string }; finish_reason: string }>
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    return {
      id: data.id,
      model: data.model,
      content: data.choices[0]?.message?.content ?? '',
      finishReason: data.choices[0]?.finish_reason ?? 'stop',
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      latencyMs,
    }
  },

  // --------------------------------------------------
  // NORMALIZE ERROR
  // --------------------------------------------------
  normalizeError(error: unknown): NormalizedError {
    if (error && typeof error === 'object' && 'type' in error) {
      return error as NormalizedError
    }

    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return { type: 'TIMEOUT', message, retryable: true }
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return { type: 'RATE_LIMITED', message, retryable: true }
    }
    if (message.includes('401') || message.includes('unauthorized') || message.includes('403')) {
      return { type: 'AUTH_ERROR', message, retryable: false }
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('DNS')) {
      return { type: 'NETWORK_ERROR', message, retryable: true }
    }

    return { type: 'SERVER_ERROR', message, retryable: false }
  },

  // --------------------------------------------------
  // ESTIMATE COST
  // --------------------------------------------------
  estimateCost(
    usage: { promptTokens: number; completionTokens: number },
    priceConfig: { inputPricePer1k: number; outputPricePer1k: number },
  ): CostEstimate {
    const inputCost = (usage.promptTokens / 1000) * priceConfig.inputPricePer1k
    const outputCost = (usage.completionTokens / 1000) * priceConfig.outputPricePer1k

    return {
      inputCost: Math.round(inputCost * 1_000_000) / 1_000_000,
      outputCost: Math.round(outputCost * 1_000_000) / 1_000_000,
      totalCost: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000,
      currency: 'USD',
    }
  },
}
