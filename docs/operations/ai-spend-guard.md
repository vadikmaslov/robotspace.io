# AI spending guard

## Active policy: subscription only (owner decision, 2026-09-29)

Direct pay-as-you-go fallback is forbidden, regardless of route ordering or saved
tariffs. Routing accepts only the exact dedicated Alibaba Token Plan HTTPS endpoint
`token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` and a subscription
credential (`sk-sp-` prefix). No query, userinfo, other path or other origin is
accepted. This check does not establish account entitlement or plan usage terms;
the operator must comply with the subscription edition's terms. No automatic
top-up, subscription purchase or renewal is performed by RobotSpace.

Subscription attempts are marked `SUBSCRIPTION`, counted with their reported
token usage, and are **not USD cost estimates or free requests**. Their zero
values in USD-only columns mean not applicable. Alibaba enforces the actual
Credits quota. USD tariff/budget controls below are retained for the inactive
paid mode; setting a price does not enable paid routing. Historical subscriptions
and usage in other applications cannot be reconstructed from this ledger.

Quota-exhaustion responses (including `insufficient_quota`) atomically settle the
attempt, disable new AI reservations, and enqueue an admin email. A plain rate
limit is temporary: stop this invocation, notify, allow later scheduled runs.
No paid API is tried in either case. Quota exhaustion requires **manual resume**
at `/admin/ai/usage` after checking that quota has renewed. In-flight requests
already admitted before the stop may finish. No date of quota renewal is guessed.

Official source for quota/error behavior:
https://www.alibabacloud.com/help/en/model-studio/token-plan-team-faq
https://www.alibabacloud.com/help/en/model-studio/token-plan-overview

## Admin email outbox

Migration 47 adds `ai_admin_alerts`. Reasons are fixed safe codes; prompts,
credentials, provider error bodies and private recipient addresses are not stored
in alerts. Deduplication is one alert per reason per UTC day, shared across all
processes. Email goes to private `AI_ALERT_EMAIL` or existing `SMTP_EMAIL` via
`EMAIL_TRANSPORT_URL`; the recipient never appears on public pages or in source.

Install `deploy/robotspace-ai-alerts.service` and `.timer` into systemd, then run
`systemctl enable --now robotspace-ai-alerts.timer`. The independent timer checks
the queue each minute using `scripts/deliver-ai-alerts.sh`. SMTP uses TLS and
bounded timeouts. Failed attempts retry after 1, 2, 4, ... minutes (maximum one
hour), without dropping the alert. Atomic claims, a two-minute lease and lease
tokens prevent concurrent normal sends; expired leases recover after a crash.
Delivery is at-least-once: a crash after SMTP acceptance but before DB confirmation
can still duplicate a message. Stable Message-ID is used, but exactly-once email
is not promised. SENT means SMTP accepted the recipient, **not** confirmed inbox
placement. Delivery state/attempt count is visible on the admin usage page.

If PostgreSQL, the VPS or the timer itself is down, this mechanism cannot send.
External uptime checks and backup-failure alerts remain separate unfinished work.
Never test quota exhaustion by consuming the actual subscription; use isolated
SQL tests and mocked providers. One `DELIVERY_TEST` outbox record can verify SMTP
without stopping production AI.

The guard covers current text generation through `routeRequest` (agents and
internal Insights summaries). It is an application-side conservative estimate,
**not a guarantee of the provider invoice**, not an account-wide spending limit,
and not accounting for subscriptions, tax, tools, images or other applications.
Keep provider-side prepaid balance/spend controls as a second boundary.

## Admin controls

`/admin/ai/usage` requires an admin session, independently of middleware. It shows
daily/monthly budget consumption, unresolved reservations, tariffs and the latest
50 attempts. Its API also authenticates every write. Default ceilings are USD 1
per UTC day and USD 10 per UTC calendar month. Zero stops spending. `Stop AI now`
disables new reservations globally without restart. Already admitted calls may
finish. Server env `AI_EMERGENCY_STOP=true` adds an independent stop after restart.

For the inactive paid mode, tariffs are USD per million input/output tokens, separately for each configured
model/provider. Enter a verified HTTPS pricing source and the conservative highest
applicable rates (no cache/off-peak discounts). A tariff expires in 30 days and
must be reviewed. Missing/expired tariffs block that model; only another already
configured and priced route may run. No model or provider is substituted silently.
Do not enter a fictitious zero tariff for a subscription. Token Plan quotas and
permission for paid fallback need an explicit operator decision before activation.

## Accounting semantics

Migration `46_ai_spend_guard` adds independent policy, tariff and attempt tables.
Old `ai_requests` rows remain untouched: their historical zero costs were not
reliable; the new page does not reinterpret them as free usage. Existing costs
before activation are not included in the new ceilings.

Before EACH HTTP attempt, a transaction locks the singleton policy row, checks
enabled state/tariff/both limits and inserts a durable reservation. Concurrent
web/worker processes therefore cannot spend the same remaining application budget.
Input is text-only, at most 128 KiB serialized with schema, up to 100 messages;
the reserve uses UTF-8 byte length plus 4096 tokens of overhead and the requested
output cap (default 1600, maximum 4096). This deliberately conservative estimate
is not a tokenizer contract for arbitrary OpenAI-compatible providers.

Maximum three HTTP generation attempts across the whole fallback chain, maximum
60-second timeout per attempt. Non-read-only redirects are refused to avoid a
second unreserved POST. Logical-request `budgetLimit` is respected cumulatively
using reservation amounts. API health/model listing remains read-only and does
not consume this text-generation ledger.

Every valid usage report is charged at the tariff snapshot taken before the call,
including a response rejected by JSON/business validation. Unknown usage, HTTP
errors and timeouts retain the full reserve as `UNCERTAIN`; process death leaves
`RESERVED`. Neither is automatically refunded, even after UTC day/month rollover.
Settlement failures stop routing, rather than allowing an unrecorded retry.
If reported cost exceeds its reservation, the actual reported estimate is recorded
and further AI calls are globally disabled for investigation.

## Reconciliation and limits

Unresolved rows require manual reconciliation against provider billing. Do not
delete them or blanket-reset counters to unblock a queue. A future reconciliation
UI/outbox is not included. The stop switch does not cancel remote requests already
in flight and cannot protect against changed provider prices, ignored output caps,
stolen credentials used elsewhere, or direct calls outside this router.

No prompts, responses, credentials or raw provider errors are stored in this new
ledger. Only identifiers, operation, usage, tariff snapshot, state and safe error
code are retained. Read the source URL before trusting a tariff; storing a URL
alone is not automatic verification.

## Verification without spending money

```sh
pnpm exec tsx --test scripts/ai-budget.test.ts scripts/ai-routing-budget.test.ts
pnpm exec tsx scripts/test-ai-budget-db.ts
```

The SQL test creates a uniquely named isolated schema on the configured database,
uses two connections to race real reservations, then drops only that schema in
`finally`. It never changes production tables or invokes a paid API. Unit tests
mock provider calls and database failures. The integration tests cover missing and
expired tariffs, UTC carry-over of uncertain amounts, both ceilings, emergency
stop, repeated settlement, rejected responses and reservation overrun.

## Documentation reviewed on 2026-09-29

OpenAI Docs informed the output cap: `max_completion_tokens` includes non-visible
tokens, so visible answer length is not a cost limit:
https://developers.openai.com/api/docs/guides/token-counting

DeepSeek pricing currently documents peak/non-peak rates and the legacy
`deepseek-v4-flash` alias. Do not reuse that tariff for an Alibaba endpoint:
https://api-docs.deepseek.com/quick_start/pricing/

Alibaba Token Plan has separate subscription/quota terms. Public pay-as-you-go
model prices do not establish this account's subscription or fallback permissions:
https://www.alibabacloud.com/en/campaign/ai-landing-page-token
