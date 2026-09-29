import { randomUUID } from 'node:crypto'

export async function deliverRequest(client, send) {
  const token = randomUUID()
  const { rows: [request] } = await client.query(`WITH candidate AS (
    SELECT id FROM request_email_outbox WHERE state <> 'SENT' AND next_attempt_at <= now()
      AND (lease_until IS NULL OR lease_until < now()) ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE request_email_outbox o SET state='SENDING', lease_token=$1,
      lease_until=now()+interval '2 minutes', attempts=attempts+1
      FROM candidate c WHERE o.id=c.id RETURNING o.*`, [token])
  if (!request) return false
  let accepted = false
  try { accepted = await send(requestMessage(request)) }
  catch { /* Do not log SMTP errors or personal data. */ }
  if (accepted) {
    // The database trigger updates the legacy quote delivery flag in this same transaction.
    await client.query("UPDATE request_email_outbox SET state='SENT', sent_at=now(), lease_until=NULL, lease_token=NULL, last_error=NULL WHERE id=$1 AND lease_token=$2", [request.id, token])
  } else {
    const delay = Math.min(3600, 60 * 2 ** Math.min(request.attempts - 1, 6))
    await client.query("UPDATE request_email_outbox SET state='QUEUED', next_attempt_at=now()+$3*interval '1 second', lease_until=NULL, lease_token=NULL, last_error='SMTP_NOT_ACCEPTED' WHERE id=$1 AND lease_token=$2", [request.id, token, delay])
  }
  return true
}

export function requestMessage(request) {
  const isQuote = Boolean(request.quote_id)
  const id = request.quote_id || request.submission_id
  const section = isQuote ? 'quotes' : 'submissions'
  return {
    subject: isQuote ? '[RobotSpace] New contact request' : '[RobotSpace] New data submission',
    text: `A new request has been saved. Sign in as administrator to read and process it.\nhttps://robotspace.io/admin/${section}?id=${id}\n\nRequest ID: ${id}\nCreated: ${new Date(request.created_at).toISOString()}\n\nPersonal details are available only in the protected admin area.`,
    messageId: `<robotspace-request-${request.id}@robotspace.io>`,
  }
}
