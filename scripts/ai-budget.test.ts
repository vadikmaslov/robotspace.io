import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boundedRequest, costMicros, validUsage } from '../packages/ai/src/budget-math'

test('money rounds up to microdollars and invalid values fail closed', () => {
  assert.equal(costMicros(1000, 1000, 0.3, 1.2), 1500)
  assert.equal(costMicros(1, 0, 0.3, 1.2), 1)
  for (const n of [NaN, Infinity, -1, 0.1]) assert.throws(() => costMicros(n, 1, 1, 1))
  for (const price of [NaN, Infinity, -1, 0]) assert.throws(() => costMicros(1, 1, price, 1))
})
test('input, output and missing usage are bounded before accounting', () => {
  const request = { modelId: '', messages: [{ role: 'user' as const, content: 'Привет 🌍' }] }
  assert.ok(boundedRequest(request).input > Buffer.byteLength(request.messages[0].content))
  assert.equal(boundedRequest(request).output, 1600)
  for (const maxTokens of [0, -1, NaN, Infinity, 4097, 1.5]) assert.throws(() => boundedRequest({ ...request, options: { maxTokens } }))
  assert.throws(() => boundedRequest({ ...request, messages: [{ role: 'user', content: 'x'.repeat(131073) }] }))
  assert.equal(validUsage(undefined), false)
  assert.equal(validUsage({ promptTokens: 2, completionTokens: 3, totalTokens: 4 }), false)
  assert.equal(validUsage({ promptTokens: 2, completionTokens: 3, totalTokens: 5 }), true)
})
