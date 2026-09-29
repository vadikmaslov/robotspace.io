import 'server-only'
import { Prisma, prisma } from '@robotspace/db'

export const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Delivery = { request_id: string; state: string; attempts: number; sent_at: Date | null }

// Call only after the page's admin session check. No email addresses are stored here.
export async function requestEmailStatuses(ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const rows = await prisma.$queryRaw<Delivery[]>(Prisma.sql`
    SELECT coalesce(submission_id, quote_id)::text AS request_id, state, attempts, sent_at
    FROM request_email_outbox
    WHERE coalesce(submission_id, quote_id) IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})
  `)
  return new Map(rows.map(row => [row.request_id,
    row.state === 'SENT' ? `Accepted by mail server (${row.sent_at?.toISOString()}); inbox delivery not guaranteed`
      : row.state === 'SENDING' ? `Sending (attempt ${row.attempts})`
        : row.attempts ? `Waiting for retry (${row.attempts} attempts)` : 'Queued for email',
  ]))
}
