import type { GenerateRequest, GenerateResponse } from './adapter-interface'

export class BudgetDenied extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'BudgetDenied' }
}
export function costMicros(input: number, output: number, inputPrice: number, outputPrice: number) {
  if (![input, output].every(n => Number.isSafeInteger(n) && n >= 0) || ![inputPrice, outputPrice].every(n => Number.isFinite(n) && n > 0)) throw new BudgetDenied('INVALID_USAGE_OR_PRICE')
  const micros = Math.ceil(input * inputPrice + output * outputPrice)
  if (!Number.isSafeInteger(micros) || micros < 0) throw new BudgetDenied('INVALID_COST')
  return micros
}
export function boundedRequest(request: GenerateRequest) {
  if (!request.messages.length || request.messages.length > 100 || request.messages.some(m => typeof m.content !== 'string')) throw new BudgetDenied('INVALID_INPUT')
  const bytes = Buffer.byteLength(JSON.stringify({ messages: request.messages, schema: request.options?.jsonSchema }), 'utf8')
  if (bytes > 131072) throw new BudgetDenied('INPUT_TOO_LARGE')
  const output = request.options?.maxTokens ?? 1600
  if (!Number.isSafeInteger(output) || output < 1 || output > 4096) throw new BudgetDenied('INVALID_OUTPUT_LIMIT')
  // Conservative text-only estimate, NOT a provider invoice guarantee. No images/tools.
  return { input: bytes + 4096, output }
}
export function validUsage(usage: GenerateResponse['usage'] | undefined) {
  return Boolean(usage && [usage.promptTokens, usage.completionTokens, usage.totalTokens].every(n => Number.isSafeInteger(n) && n >= 0)
    && usage.totalTokens > 0 && usage.totalTokens === usage.promptTokens + usage.completionTokens)
}
