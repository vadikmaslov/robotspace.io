# MVP security rollout (29 September 2026)

- Apply migration 45 before switching the web release. Password login fails closed without the counter table or signing secret. GitHub community login is unaffected.
- All admin API handlers require an admin session themselves, in addition to middleware. The development middleware bypass no longer bypasses API authentication.
- Password login allows five attempts per address per 15 minutes and 60 attempts globally per minute. Counters include successful attempts and expire without password-dependent resets. This is basic throttling, not MFA or distributed attack prevention.
- `TRUST_PROXY_IP=true` may be set only if the app listens on loopback and nginx overwrites `X-Real-IP` with `$remote_addr`. Otherwise all callers share a conservative unknown-address bucket. Do not expose port 3001 publicly.
- Proposed systemd override: reset `ExecStart`, then use `/opt/node-v24.18.0/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3001`. Add `Environment=TRUST_PROXY_IP=true`. Preserve all other service settings and keep a recoverable copy of any previous override.
- No personal mailbox is hardcoded. Private SMTP and account allowlists are deliberately preserved. New commits use the owner's GitHub noreply address; old Git history and cached pages require separate handling.
- Analytics, session recordings and Google Fonts requests are removed. Existing provider-side analytics data is not deleted. Fonts fall back to system fonts.
- Privacy text describes implementation limitations and links to the existing contact form. Operator identity, complete legal terms, retention/deletion processes and a dedicated privacy contact are still outstanding. This is not legal sign-off.
- `/admin/quotes` now shows saved quote/privacy requests independently of SMTP. Email retries/outbox are still outstanding; historic notification flags can be incomplete.
- Footer hides nonexistent Terms/Sources/Status pages and links quotes to `/quote`; this does not substitute for missing legal terms.

## Validation

Run `pnpm exec tsx --test scripts/mvp-security.test.ts`, `pnpm exec tsx scripts/test-admin-login-db.ts` (configured PostgreSQL; only a temporary table), secret scan, web lint/build and worker build.
After rollout check ready, public privacy HTML and assets, unauthenticated admin API 401, published robot/company details, sitemap entries, both systemd services and that external port 3001 is inaccessible. Do not claim a full authenticated browser test based on HTTP status alone.
