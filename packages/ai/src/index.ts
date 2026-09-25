/**
 * Phase 4A: Adapter Registry + Exports
 * Maps adapter types to implementations
 */

export { openaiAdapter } from './adapters/openai'
export { AGENT_ROUTING_RULES, scopeForAgentRun } from './routing-policy'
export { routeRequest } from './routing'
export type {
  AIProviderAdapter,
  ProviderConfig,
  GenerateRequest,
  GenerateResponse,
  ModelDescriptor,
  NormalizedError,
  CostEstimate,
} from './adapter-interface'

import { openaiAdapter } from './adapters/openai'
import type { AIProviderAdapter } from './adapter-interface'

/**
 * Registry of all available adapters by type.
 * OpenAI-compatible providers use the same adapter.
 */
export const adapters: Record<string, AIProviderAdapter> = {
  openai: openaiAdapter,
  deepseek: openaiAdapter, // OpenAI-compatible API
  glm: openaiAdapter,      // OpenAI-compatible API
  openai_compatible: openaiAdapter,
}

/**
 * Get adapter for provider type
 */
export function getAdapter(adapterType: string): AIProviderAdapter {
  const adapter = adapters[adapterType.toLowerCase()]
  if (!adapter) {
    throw new Error(`Unknown adapter type: ${adapterType}. Available: ${Object.keys(adapters).join(', ')}`)
  }
  return adapter
}
