/** Isolated, uniquely named schema; no production tables or paid API calls. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client, types } from 'pg'
import { reserveInTransaction, settleInTransaction } from '../packages/ai/src/budget'

async function main() {
  // Match Prisma's bigint decoding in this pg-based transaction harness.
  types.setTypeParser(20, value => BigInt(value))
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL
  const clients = [new Client({ connectionString }), new Client({ connectionString })]
  const schema = `ai_budget_test_${randomUUID().replaceAll('-', '')}`
  let created = false
  const model = randomUUID()
  const request = { modelId: '', messages: [{ role: 'user' as const, content: 'fixture' }], options: { maxTokens: 10 } }
  const tx = (client: Client) => {
    const query = (parts: TemplateStringsArray, ...values: unknown[]) => client.query(parts.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''), values)
    return { $queryRaw: async (...args: Parameters<typeof query>) => (await query(...args)).rows, $executeRaw: async (...args: Parameters<typeof query>) => (await query(...args)).rowCount } as unknown as Parameters<typeof reserveInTransaction>[0]
  }
  const transaction = async <T>(client: Client, run: () => Promise<T>) => {
    await client.query('BEGIN')
    try { const value = await run(); await client.query('COMMIT'); return value }
    catch (error) { await client.query('ROLLBACK'); throw error }
  }
  try {
    await Promise.all(clients.map(client => client.connect()))
    await clients[0].query(`CREATE SCHEMA "${schema}"`); created = true
    for (const client of clients) await client.query(`SET search_path TO "${schema}"`)
    const db = clients[0], adapter = tx(db)
    await db.query('CREATE TABLE ai_models(id uuid PRIMARY KEY)')
    await db.query(await readFile(new URL('../packages/db/migrations/46_ai_spend_guard/migration.sql', import.meta.url), 'utf8'))
    await db.query('INSERT INTO ai_models(id) VALUES ($1)', [model])
    const reserve = () => reserveInTransaction(adapter, model, 'test', request)
    await assert.rejects(transaction(db, reserve), /PRICE_MISSING/)
    await db.query("INSERT INTO ai_budget_prices VALUES ($1,1,1,'https://example.test',now(),now()+interval '1 day')", [model])
    const first = await transaction(db, reserve)
    await transaction(db, () => settleInTransaction(adapter, first, { id:'test', model:'test', content:'invalid JSON', finishReason:'stop', latencyMs:1, usage:{promptTokens:2,completionTokens:3,totalTokens:5} }, false, 'VALIDATION_ERROR'))
    const rejected = (await db.query('SELECT * FROM ai_budget_attempts WHERE id=$1', [first.id])).rows[0]
    assert.equal(rejected.state, 'REJECTED'); assert.equal(Number(rejected.charged_micros), 5)
    await assert.rejects(transaction(db, () => settleInTransaction(adapter, first)), /SETTLEMENT_CONFLICT/)
    // Exactly one reservation fits; a second connection must observe its committed charge.
    await db.query('UPDATE ai_budget_policy SET daily_micros=$1, monthly_micros=$1', [first.micros + 5])
    const results = await Promise.allSettled(clients.map(client => transaction(client, () => reserveInTransaction(tx(client), model, 'parallel', request))))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    const winner = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<typeof first>
    await transaction(db, () => settleInTransaction(adapter, winner.value, undefined, false, 'TIMEOUT'))
    await db.query("UPDATE ai_budget_attempts SET created_at=now()-interval '40 days' WHERE id=$1", [winner.value.id])
    await assert.rejects(transaction(db, reserve), /BUDGET_EXCEEDED/)
    await db.query('UPDATE ai_budget_policy SET daily_micros=1000000, monthly_micros=0')
    await assert.rejects(transaction(db, reserve), /BUDGET_EXCEEDED/)
    await db.query('UPDATE ai_budget_policy SET monthly_micros=1000000, enabled=false')
    await assert.rejects(transaction(db, reserve), /AI_DISABLED/)
    await db.query('UPDATE ai_budget_policy SET enabled=true')
    await assert.rejects(transaction(db, () => reserveInTransaction(adapter, model, 'test', request, 0)), /REQUEST_BUDGET_EXCEEDED/)
    const excess = await transaction(db, reserve)
    assert.equal(await transaction(db, () => settleInTransaction(adapter, excess, { id:'test',model:'test',content:'',finishReason:'stop',latencyMs:1,usage:{promptTokens:100000,completionTokens:1,totalTokens:100001} }, true)), false)
    await assert.rejects(transaction(db, reserve), /AI_DISABLED/)
    await db.query('UPDATE ai_budget_policy SET enabled=true')
    await db.query("UPDATE ai_budget_prices SET verified_at=now()-interval '2 days',valid_until=now()-interval '1 day'")
    await assert.rejects(transaction(db, reserve), /PRICE_MISSING/)
    console.log('AI budget SQL passed: concurrent reservations, daily/monthly stop, retained timeout, rejected response billing, idempotent settlement, price expiry, overage stop')
  } finally {
    if (created) {
      for (const client of clients) await client.query('ROLLBACK').catch(() => undefined)
      // Generated identifier, created only by this test; never a user schema.
      assert.match(schema, /^ai_budget_test_[a-f0-9]{32}$/)
      await clients[0].query(`DROP SCHEMA "${schema}" CASCADE`)
    }
    await Promise.all(clients.map(client => client.end().catch(() => undefined)))
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'AI budget SQL test failed'); process.exitCode = 1 })
