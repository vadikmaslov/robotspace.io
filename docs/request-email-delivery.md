# Request notifications

Public `/submit` and `/quote` requests are saved in PostgreSQL. Migration 48 adds AFTER INSERT triggers which insert into `request_email_outbox` in the same transaction. If enqueueing fails, the request is not accepted. SMTP is never part of the public HTTP request.

The existing `robotspace-ai-alerts.timer` also drains this separate queue once per minute, up to five AI alerts and five request notifications per run. Recipients: private `OPERATIONS_ALERT_EMAIL`, falling back to `SMTP_EMAIL`; AI alerts retain `AI_ALERT_EMAIL` / `SMTP_EMAIL`. SMTP configuration is the existing private `EMAIL_TRANSPORT_URL`. Do not publish these values. Messages contain only a request ID and authenticated admin link, not the user's contact details or message.

Delivery uses an atomic claim, two-minute lease, a per-claim token and exponential retry delays from one minute to one hour. Failed attempts are retained with a safe error code. A crashed sender's lease expires and another run retries. SMTP acceptance marks the record SENT and, for quotes, atomically updates `notification_sent` and `sent_at`. Acceptance does not prove inbox delivery; bounces/spam filtering remain possible. Delivery is at least once: a crash after SMTP acceptance but before database confirmation can cause a duplicate. A stable Message-ID helps correlation but is not an exactly-once guarantee.

Admin `/admin/quotes` and `/admin/submissions` show saved requests and delivery states, 50 per page. Email links filter by `?id=<uuid>` and still require an admin session. User content is rendered as escaped text, never HTML. Submission review/publication remains the existing manual process; email acceptance does not mean the user's suggestion has been approved.

Existing records are NOT backfilled: previous delivery is unknown and replay could spam the administrator. Their admin status explicitly says legacy/unknown. Deleting a request cascades to its queue record. The raw SQL table/functions are migration-managed, like the AI alert ledger, and intentionally not accessed through generated Prisma models.

## Operations

- `systemctl status robotspace-ai-alerts.timer robotspace-ai-alerts.service`
- `systemctl start robotspace-ai-alerts.service` for an immediate pass.
- Check private logs with `journalctl -u robotspace-ai-alerts.service`; the runner logs only counts and generic failures, not recipients or SMTP errors.
- Persistent queued/retry states mean SMTP/configuration or delivery needs attention. There is no independent external monitor for timer downtime yet.
- Integration test: `pnpm exec tsx scripts/test-request-outbox-db.mjs` with the private database environment loaded. It applies the real request-table migration and outbox migration in one uniquely named test schema, checks all three public submission labels against database codes, uses fake SMTP, then removes only its schema. It never sends real mail or modifies real requests.

Deployment: take a backup, apply migration 48 before switching to new web code. The old web sends directly, so pause incoming form POSTs during the migration/symlink transition or stop web briefly to avoid duplicate notifications in that window. Do not roll back to the old synchronous sender while keeping queue triggers active without first stopping request processing and resolving queued records.
