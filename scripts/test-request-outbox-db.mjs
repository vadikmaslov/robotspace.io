import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { deliverRequest, requestMessage } from './alerts/request-delivery.mjs'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { Client } = require('pg')
const options = { connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL }
const clients = [new Client(options), new Client(options)]
const schema = `request_outbox_test_${randomUUID().replaceAll('-', '')}`
let created = false
try {
  await Promise.all(clients.map(client => client.connect()))
  const [db, other] = clients
  await db.query(`CREATE SCHEMA "${schema}"`)
  created = true
  for (const client of clients) await client.query(`SET search_path TO "${schema}"`)
  await db.query(`CREATE TABLE submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE quote_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_sent boolean DEFAULT false, sent_at timestamptz);`)
  await db.query('INSERT INTO submissions DEFAULT VALUES')
  await db.query(await readFile(new URL('../packages/db/migrations/48_request_email_outbox/migration.sql', import.meta.url), 'utf8'))
  const count = async () => (await db.query('SELECT count(*)::int n FROM request_email_outbox')).rows[0].n
  assert.equal(await count(), 0, 'no historical replay')
  await db.query('BEGIN')
  await db.query('INSERT INTO submissions DEFAULT VALUES')
  assert.equal(await count(), 1)
  await db.query('ROLLBACK')
  assert.equal(await count(), 0, 'request and queue roll back together')
  const quote = (await db.query('INSERT INTO quote_requests DEFAULT VALUES RETURNING id')).rows[0].id
  assert.equal(await count(), 1)
  await assert.rejects(db.query('INSERT INTO request_email_outbox(quote_id) VALUES ($1)', [quote]), { code: '23505' })
  await deliverRequest(db, async () => { throw new Error('private SMTP failure') })
  let row = (await db.query('SELECT * FROM request_email_outbox')).rows[0]
  assert.equal(row.state, 'QUEUED')
  assert.equal(row.attempts, 1)
  assert.equal(row.last_error, 'SMTP_NOT_ACCEPTED')
  assert.equal((await db.query('SELECT notification_sent FROM quote_requests')).rows[0].notification_sent, false)
  assert.equal(await deliverRequest(db, async () => assert.fail('backoff ignored')), false)
  await db.query("UPDATE request_email_outbox SET next_attempt_at=now()-interval '1 second'")
  let sends = 0
  await Promise.all(clients.map(client => deliverRequest(client, async message => {
    sends++
    assert.match(message.text, new RegExp(`/admin/quotes\\?id=${quote}`))
    await new Promise(resolve => setTimeout(resolve, 40))
    return true
  })))
  assert.equal(sends, 1, 'only one concurrent worker claims a message')
  row = (await db.query('SELECT * FROM request_email_outbox')).rows[0]
  assert.equal(row.state, 'SENT')
  assert.equal(row.attempts, 2)
  assert.equal(row.lease_token, null)
  const saved = (await db.query('SELECT * FROM quote_requests')).rows[0]
  assert.equal(saved.notification_sent, true)
  assert.equal(saved.sent_at.toISOString(), row.sent_at.toISOString())
  assert.equal(await deliverRequest(other, async () => assert.fail('sent twice')), false)
  const submission = (await db.query('INSERT INTO submissions DEFAULT VALUES RETURNING id')).rows[0].id
  await db.query("UPDATE request_email_outbox SET state='SENDING', lease_token=gen_random_uuid(), lease_until=now()+interval '2 minutes' WHERE submission_id=$1", [submission])
  assert.equal(await deliverRequest(db, async () => assert.fail('active lease stolen')), false)
  await db.query("UPDATE request_email_outbox SET lease_until=now()-interval '1 second' WHERE submission_id=$1", [submission])
  assert.equal(await deliverRequest(db, async message => {
    assert.match(message.text, new RegExp(`/admin/submissions\\?id=${submission}`))
    return true
  }), true, 'recover abandoned lease')
  const message = requestMessage({ id: randomUUID(), submission_id: submission, created_at: new Date(), email: 'private@example.test', payload_json: 'untrusted user text' })
  assert.doesNotMatch(JSON.stringify(message), /private@example|untrusted user/)
  assert.equal(requestMessage(row).messageId, requestMessage(row).messageId, 'stable Message-ID on retry')
  assert.notEqual(message.messageId, requestMessage(row).messageId, 'different requests have different Message-IDs')
  const stolen = (await db.query('INSERT INTO submissions DEFAULT VALUES RETURNING id')).rows[0].id
  await deliverRequest(db, async () => {
    // A delayed sender must not overwrite a newer lease after losing its claim.
    await other.query('UPDATE request_email_outbox SET lease_token=gen_random_uuid() WHERE submission_id=$1', [stolen])
    return true
  })
  assert.equal((await db.query('SELECT state FROM request_email_outbox WHERE submission_id=$1', [stolen])).rows[0].state, 'SENDING')
  await db.query('DELETE FROM submissions WHERE id=$1', [stolen])
  await db.query('DELETE FROM quote_requests WHERE id=$1', [quote])
  assert.equal(await count(), 1, 'request deletion removes its outbox record')
  // Failure to enqueue must also fail the original request INSERT.
  await db.query('BEGIN')
  await db.query("ALTER TABLE request_email_outbox ADD CONSTRAINT test_failure CHECK (false) NOT VALID")
  await assert.rejects(db.query('INSERT INTO submissions DEFAULT VALUES'), { code: '23514' })
  await db.query('ROLLBACK')
  console.log('Request outbox: atomicity, no replay, retry, concurrent claim, lease recovery, flags and privacy passed')
} finally {
  await Promise.all(clients.map(client => client.query('ROLLBACK').catch(() => undefined)))
  if (created && /^request_outbox_test_[0-9a-f]{32}$/.test(schema)) await clients[0].query(`DROP SCHEMA "${schema}" CASCADE`)
  await Promise.all(clients.map(client => client.end().catch(() => undefined)))
}
