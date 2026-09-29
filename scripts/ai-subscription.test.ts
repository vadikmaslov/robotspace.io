import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isQuotaExhausted, isSubscriptionProvider } from '../packages/ai/src/subscription'

test('only the dedicated subscription endpoint and subscription credential are allowed', () => {
  const baseUrl = 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
  assert.equal(isSubscriptionProvider({ baseUrl, apiKey:'sk-sp-fixture' }), true)
  assert.equal(isSubscriptionProvider({ baseUrl, apiKey:'ordinary-key' }), false)
  for (const url of ['https://api.openai.com/v1','https://api.deepseek.com',baseUrl+'?redirect=paid',baseUrl.replace('https:','http:'),baseUrl.replace('.com/', '.com.evil.test/'),baseUrl.replace('https://','https://user:pass@')]) {
    assert.equal(isSubscriptionProvider({ baseUrl:url, apiKey:'sk-sp-fixture' }), false)
  }
})
test('exhausted quota is distinct from temporary request throttling', () => {
  for (const body of ['{"error":{"code":"insufficient_quota"}}','Your token-plan quota has been exhausted','Allocated quota exceeded','QuotaExceeded']) assert.equal(isQuotaExhausted(429, body), true)
  assert.equal(isQuotaExhausted(429, 'Requests rate limit exceeded'), false)
  assert.equal(isQuotaExhausted(200, 'insufficient_quota'), false)
})
