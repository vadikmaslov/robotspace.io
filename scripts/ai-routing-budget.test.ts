import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { randomBytes } from 'node:crypto'

test('router accounts for rejection/retry and does not call providers when reservation or settlement fails', async () => {
  process.env.DATABASE_URL ||= 'postgresql://fixture:fixture@127.0.0.1:1/fixture'
  process.env.INTEGRATION_CREDENTIALS_KEYRING = JSON.stringify({ active: { id: 'fixture', key: randomBytes(32).toString('base64') }, previous: [] })
  const { prisma } = await import('../packages/db/src/index')
  const { encrypt } = await import('../packages/ai/src/encryption')
  const { openaiAdapter, routeRequest } = await import('../packages/ai/src/index')
  const blob = encrypt('fixture-credential')
  const credential = ['enc','v1',Buffer.from(blob.keyVersion).toString('base64url'),blob.nonceAuthTag.toString('base64url'),blob.ciphertext.toString('base64url')].join(':')
  const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002']
  let failReservation = false, failSettlement = false, calls = 0, transactions = 0, settled = 0
  let providerFailure = false
  const undo: (() => void)[] = []
  function replace(target: object, name: string, value: (...args: any[]) => unknown) {
    const before = Reflect.get(target, name)
    Reflect.set(target, name, value)
    undo.push(() => { Reflect.set(target, name, before) })
  }
  try {
    replace(prisma.ai_routes, 'findMany', async () => ids.map((id, rank) => ({ model_id:id, rank, max_attempts:3, cooldown_ms:1 })))
    replace(prisma.ai_models, 'findMany', async () => ids.map(id => ({ id, provider_id:ids[0], remote_model_id:'fixture' })))
    replace(prisma.ai_providers, 'findUnique', async () => ({ id:ids[0], enabled:true, adapter_type:'openai', base_url:'https://example.test', request_timeout_ms:100 }))
    replace(prisma.ai_provider_credentials, 'findFirst', async () => ({ api_key_plain:credential }))
    replace(prisma.exceptions, 'create', async () => ({}))
    replace(prisma, '$transaction', async () => {
      transactions++
      if (transactions % 2 === 1) {
        if (failReservation) throw new Error('Database unavailable')
        return { id:ids[0], micros:1000, inputPrice:1, outputPrice:1 }
      }
      settled++
      if (failSettlement) throw new Error('Database unavailable')
      return true
    })
    mock.method(openaiAdapter, 'generate', async (_config, request) => {
      calls++; assert.equal(request.options.maxTokens, 1600)
      if (providerFailure) throw { type:'TIMEOUT', message:'fixture timeout', retryable:true }
      return { id:'fixture',model:'fixture',content:'invalid',finishReason:'stop',latencyMs:1,usage:{promptTokens:1,completionTokens:1,totalTokens:2} }
    })
    const request = { modelId:'', messages:[{role:'user' as const,content:'fixture'}] }
    const run = (validateResponse = () => false) => routeRequest(request, { scope:'SIMPLE_DEFAULT', validateResponse })
    await run(); assert.equal(calls, 2); assert.equal(settled, 2)
    calls=0; settled=0; transactions=0; failReservation=true
    await assert.rejects(run()); assert.equal(calls,0)
    failReservation=false; failSettlement=true; transactions=0
    await assert.rejects(run(() => true)); assert.equal(calls,1)
    failSettlement=false; calls=0; settled=0; transactions=0; providerFailure=true
    await run(); assert.equal(calls,3); assert.equal(settled,3)
  } finally { mock.restoreAll(); undo.reverse().forEach(fn => fn()); await prisma.$disconnect() }
})
