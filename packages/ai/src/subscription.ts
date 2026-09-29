import type { ProviderConfig } from './adapter-interface'

/** Explicit user decision: no direct pay-as-you-go fallback. Not admin-editable. */
export function isSubscriptionProvider(config: Pick<ProviderConfig, 'baseUrl' | 'apiKey'>) {
  return isSubscriptionEndpoint(config.baseUrl) && config.apiKey.startsWith('sk-sp-')
}
export function isSubscriptionEndpoint(baseUrl: string) {
  try {
    const url = new URL(baseUrl)
    return url.origin === 'https://token-plan.ap-southeast-1.maas.aliyuncs.com'
      && url.pathname.replace(/\/$/, '') === '/compatible-mode/v1'
      && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}

export function isQuotaExhausted(status: number, body: string) {
  if (![400, 402, 403, 429].includes(status)) return false
  // Only classify locally; never persist/email raw provider body (may contain prompts/keys).
  return /insufficient_quota|(?:allocated|monthly|weekly|token.plan|subscription)[\s\S]{0,80}quota[\s\S]{0,50}(?:exhausted|exceeded)|quota[\s\S]{0,50}(?:exhausted|exceeded|insufficient)/i.test(body.slice(0,8192))
}
