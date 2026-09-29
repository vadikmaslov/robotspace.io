/**
 * Phase 4A: AI Provider Adapter Interface
 * Common interface for all AI providers: OpenAI, DeepSeek, GLM, OpenAI-compatible
 */

// ============================================================
// TYPES
// ============================================================

export interface ModelDescriptor {
  id: string
  name: string
  capabilities?: {
    text?: boolean
    jsonSchema?: boolean
    vision?: boolean
    embedding?: boolean
    longContext?: boolean
  }
  contextLimit?: number
  outputLimit?: number
}

export interface GenerateRequest {
  modelId: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  options?: {
    temperature?: number
    topP?: number
    maxTokens?: number
    responseFormat?: 'text' | 'json_object' | 'json_schema'
    jsonSchema?: Record<string, unknown>
    timeout?: number
  }
}

export interface GenerateResponse {
  id: string
  model: string
  content: string
  finishReason: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
}

export interface NormalizedError {
  type: 'TIMEOUT' | 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'AUTH_ERROR' | 'SERVER_ERROR' | 'CLIENT_ERROR' | 'NETWORK_ERROR' | 'VALIDATION_ERROR'
  statusCode?: number
  message: string
  retryable: boolean
  providerRawError?: unknown
}

export interface ProviderConfig {
  id: string
  adapterType: string
  baseUrl: string
  apiKey: string // decrypted at request boundary only
  enabled?: boolean
  requestTimeout?: number
}

export interface CostEstimate {
  inputCost: number
  outputCost: number
  totalCost: number
  currency: string
}

// ============================================================
// ADAPTER INTERFACE
// ============================================================

export interface AIProviderAdapter {
  /** Lightweight health check — returns provider status */
  testConnection(config: ProviderConfig): Promise<{ ok: boolean; message: string }>

  /** List available models from this provider */
  listModels(config: ProviderConfig): Promise<ModelDescriptor[]>

  /** Generate a completion */
  generate(config: ProviderConfig, request: GenerateRequest): Promise<GenerateResponse>

  /** Normalize provider-specific error to common format */
  normalizeError(error: unknown): NormalizedError

  /** Estimate cost for a request */
  estimateCost(usage: { promptTokens: number; completionTokens: number }, priceConfig: { inputPricePer1k: number; outputPricePer1k: number }): CostEstimate
}

// ============================================================
// EXTRACTION CAPS (performance tuning)
// ============================================================

export interface ExtractionCap {
  /** Maximum confidence source can provide via this extraction method */
  schemaValidDeterministic: number // 1.00
  schemaValidAIExtract: number    // 0.90
  partialAmbiguousExtract: number // 0.70
}
