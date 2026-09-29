/** Runs the real limiter SQL against a connection-local temporary table only. */
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { consumeAdminPasswordCounters } from '../apps/web/src/lib/admin-login-limit'

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('CREATE TEMP TABLE admin_login_limits (key text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL) ON COMMIT DROP')
    const query = async (parts: TemplateStringsArray, ...values: unknown[]) => client.query(parts.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''), values)
    const tx = {
      $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => (await query(parts, ...values)).rowCount,
      $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => (await query(parts, ...values)).rows,
    } as unknown as Parameters<typeof consumeAdminPasswordCounters>[0]
    for (let i = 0; i < 5; i++) assert.equal(await consumeAdminPasswordCounters(tx, 'test-address'), true)
    assert.equal(await consumeAdminPasswordCounters(tx, 'test-address'), false)
    assert.equal(await consumeAdminPasswordCounters(tx, 'another-address'), true)
    await client.query("UPDATE pg_temp.admin_login_limits SET expires_at = now() - interval '1 second'")
    assert.equal(await consumeAdminPasswordCounters(tx, 'test-address'), true)
    await client.query("UPDATE pg_temp.admin_login_limits SET attempts = 60 WHERE key = 'global'")
    assert.equal(await consumeAdminPasswordCounters(tx, 'new-address'), false)
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_temp.admin_login_limits WHERE key = 'new-address'")).rows[0].n, 0)
    console.log('Admin login SQL: per-address limit, expiry, independent addresses and global ceiling OK (temporary table, rollback)')
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
}
main().catch(() => { console.error('Admin login SQL test failed'); process.exitCode = 1 })
