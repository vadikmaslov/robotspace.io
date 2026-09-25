# RobotSpace MVP — audit implementation (2026-07-27)

## Scope and method

Checked `git log`, source routes and metadata declarations.  HTTP smoke testing was attempted against `http://localhost:3000`, but the server listened on port 3000 and did not return `/` within 8 seconds.  It must not be treated as a successful route-render check.

The working tree was already dirty before this audit; no application code was changed.  Only the Phase 12–14 status lines in the plan were reconciled with their implementation commit `76b7f75c`.

## Phase status from Git

| Phase | Commit evidence | Audit result |
| --- | --- | --- |
| 1 | `6c9c9b77` | Implemented commit exists; workspace configuration is currently broken, so the phase gate is not met. |
| 2 | `2eb544a5` | Implemented commit exists; no migration/seed test was run. |
| 3 | `ba6d4bd9` | Implemented commit exists; authentication was not exercised. |
| 4 | `c3327539`, `ed2eddf5` | Implemented commit exists; provider flow was not exercised. |
| 5 | `7bcfc814` | Implemented commit exists; queue/ingestion runtime not exercised. |
| 6 | `bbf5f6dc` | Implemented commit exists; collectors not exercised. |
| 7 | `552ee81e` | Implemented commit exists; agents and exceptions not exercised. |
| 8 | `c1c201c5`, `0ec90fc0` | Implemented commit exists; visual/a11y gate not exercised. |
| 9 | `ca689e03` | Routes exist, but rendering is blocked by the unresponsive dev server; home contains demo cards. |
| 10 | `864875f7` | Route files exist; forms are presentational only (no submit action/handler). |
| 11 | `f58bc377` | Compare route exists; PDF/share are still placeholders per commit and source. |
| 12 | `76b7f75c` | Insight routes exist; plan status updated to implemented. Pipeline/readiness criteria remain unverified. |
| 13 | `76b7f75c` | Market and integrator routes exist; plan status updated to implemented. Readiness criteria remain unverified. |
| 14 | `76b7f75c` | Legal/SEO route work exists; plan status updated to implemented. Hardening gate is not met. |

## Route and metadata audit

| Group | Result |
| --- | --- |
| Public route files | All requested route files exist: `/`, `/robots`, `/robots/[slug]`, `/companies`, `/companies/[slug]`, `/compare`, `/insights`, `/insights/[slug]`, `/market`, `/integrators`, `/submit`, `/quote`, `/privacy`, `/methodology`. |
| Public HTTP rendering | **Blocked:** `/` timed out after 8 seconds. The Next process on port 3000 used about 1.3 GiB RAM at the time. Do not mark any URL smoke test complete. |
| Admin route files | All requested route files exist: `/admin`, `/admin/robots`, `/admin/companies`, `/admin/articles`, `/admin/unibot`, `/admin/ai/providers`. HTTP/auth checks are blocked by the same server issue. |
| Public metadata | All requested public routes except `/` declare `generateMetadata` or a page-level `metadata` export. `/` relies only on root-layout metadata and has no page-specific declaration. |
| Admin metadata | None of the requested admin pages declares page metadata. An admin layout has no `noindex` metadata declaration. |

## Implementation beyond the plan

| Item | Evidence | Result |
| --- | --- | --- |
| Unibot integration | `admin/unibot` and `/api/admin/unibot/*` route files, raw SQL usage | Present in the working tree; runtime not tested. |
| Articles CRUD and images | `admin/articles` and `/api/admin/articles/*` | Present in the working tree; runtime not tested. |
| Insights prototype | `insights` routes | Present. |
| Robot image fallback | `robots/robot-image.tsx` | Present. |
| Integrators SVG map | `integrators/world-map.tsx`, `world-map-data.ts` | Present. |
| Brand links in catalog | Robot and company page routes | Present. |
| Updated AI-agent prompts | `packages/ai/src/agents.ts` is modified | Present but uncommitted; not behavior-tested. |

## Deviations and blockers

1. **P0 — dev server is not renderable.** Port 3000 is open but `/` times out. The Next server process held about 1.3 GiB RAM. All requested HTTP route and admin checks remain unverified.
2. **P0 — pnpm workspace is invalid.** `pnpm-workspace.yaml` has no `packages:` list. `pnpm -r list` discovers only the root and `pnpm --filter @robotspace/app typecheck` finds no project. This invalidates the Phase 1 build/typecheck gate.
3. **P0 — public forms do not submit.** `/submit` and `/quote` contain plain forms without an `action`, server action, client handler, API call, CAPTCHA, rate limit or persistence.
4. **P0 — no-hard-delete rule is violated.** `app/api/admin/robots/[id]/route.ts` calls `prisma.robots.delete(...)`; the plan requires archived robots instead of deletion.
5. **P1 — home page uses demo data.** It renders fixed Atlas/UR5e/Spot/Digit cards, fixed category count and other hard-coded values, violating the Phase 9 requirement to avoid demo values.
6. **P1 — SEO is incomplete.** `/` lacks page-specific metadata; no `sitemap` or `robots.txt` route was found; admin pages have no explicit `noindex` metadata.
7. **P1 — plan checkboxes largely disagree with commits.** Phases 1–11 have completion commits/status but their detailed checklists remain mostly unchecked. They should be reconciled item-by-item only after executable verification; this audit did not mark them completed without evidence.
8. **P1 — repository is dirty.** The workspace has many modified and untracked implementation files, including all extra Unibot/admin work. Their behavior is not represented by the phase commits and requires a reviewable commit before release verification.
9. **P2 — dependency discipline mismatch.** `package.json` uses `^` ranges for critical runtime dependencies and requests Node `^24.18.0`, while the environment runs Node 24.15.0.

## Recommended next steps

1. Restore `packages:` globs in `pnpm-workspace.yaml`, then run `pnpm install`, `pnpm typecheck`, `pnpm lint` and a production build.
2. Diagnose/restart the dev server and repeat all public/admin HTTP smoke tests with status, title and redirect assertions.
3. Connect submit/quote forms to validated persistence, anti-abuse controls and notification jobs; add E2E tests.
4. Replace hard delete with archive state and test that deletion is impossible through the admin API.
5. Remove home-page demo cards, add page metadata for `/`, sitemap/robots routes and `noindex` for admin.
6. Commit the currently untracked/modified Unibot and admin implementation separately, then reconcile plan checkboxes against tests rather than commit messages alone.

## Remediation update (2026-07-27)

P0 and P1 were subsequently addressed in the same working tree:

- Restored pnpm workspace discovery, pinned the Prisma runtime/CLI/adapter to 6.7.0, and made `typecheck` plus production build pass.
- Replaced the unstable Turbopack dev workflow with webpack; a process storm of 928 orphan Next workers was removed. Public page smoke now passes and admin/API denial is verified (`307` / `401`).
- Added server-side submit and quote persistence with validation, honeypot and per-process rate limiting; replaced robot/company hard-delete actions with archiving.
- Added root metadata, `robots.txt`, dynamic `sitemap.xml`, canonical base URL and admin `noindex`; removed fixed robot/KPI demo values from the home page.
- Moved migrations to the directory Prisma resolves for the root schema and added migration 07 for Unibot tables, IDs and image fields. A fresh isolated DB successfully applied all seven migrations and ran the seed twice without duplicates.
- Ran the real Unibot sync twice: both completed with 586 cached records (488 robots, 98 brands), zero inserts on the existing cache and stable totals. Country mapping filled 86 of 87 brand country values.

The repository is still pre-existingly dirty and includes overlapping changes, so no aggregate commit was made during remediation.

## G-F MVP hardening update (2026-07-27)

The Phase 14 launch gate has been reduced to evidence appropriate for an MVP, while preserving the controls that block a staging deployment.

| Control | MVP implementation / evidence | Status |
| --- | --- | --- |
| Public exposure and admin boundary | All primary public routes returned `200`; `/admin` redirected unauthenticated users (`307`) and an admin API returned `401`. | Passed locally |
| SEO eligibility | `sitemap.xml` now joins public projections to `entities` and includes only unarchived `PUBLISHED` robots/companies plus published articles. | Implemented |
| Dependency vulnerabilities | Updated `next-auth` from beta.25 to beta.32 and pinned patched `sharp`/`postcss` transitives. `pnpm audit --prod --audit-level high` returned no known vulnerabilities. | Passed locally |
| SSRF and remote images | Image proxy uses exact HTTPS host allowlisting, rejects redirects, limits responses to 5 MB and verifies magic bytes. Unibot feed/image sync uses the same restrictions; a `unibot.ru.evil.example` request returned `400`. | Passed locally |
| Admin file upload | Robot, company and article uploads validate UUID paths, request/file size (5 MB), MIME type and JPEG/PNG/WebP/GIF signatures; SVG and arbitrary extensions are rejected. | Implemented |
| AI credentials | New credentials are AES-256-GCM encrypted with `INTEGRATION_CREDENTIALS_KEYRING`; plaintext values are rejected at use time. Migration 08 widens the legacy storage column and `pnpm ai:migrate-credentials` converts any existing rows without logging secrets. | Implemented; run the conversion only if existing provider credentials are retained |
| Database deployment | Added an idempotent, checksummed SQL migration runner (`pnpm db:migrate` / `db:deploy`) because the historical SQL directories are not Prisma-Migrate format. Fresh temporary DB: migrations 01–08, seed and database-invariant suite all passed. | Passed locally |
| CI gate | CI no longer ignores failures. It runs secret scan, Prisma client generation, checksummed migrations, seed/invariants, typecheck, static checks, production build, and high/critical dependency audit. | Implemented |
| Browser security headers | CSP, frame denial, MIME sniffing protection, referrer policy, permissions policy and cross-origin resource policy are sent. | Passed locally |

The migration/invariant run also exposed and fixed `safeNumeric('')` returning `0`; it now returns `null` as required by the canonical data model.

### MVP substitutions and remaining release work

| Original enterprise gate | MVP substitute | Decision |
| --- | --- | --- |
| Managed migration platform / Prisma migration history | Checksummed in-repo SQL runner plus a clean-database migration, seed and invariant run in CI. | Accept for MVP |
| Full external uptime and load-test programme | Production build, route/auth smoke checks, dependency/secret scan, and hosting-provider health/rollback setup. | Defer load testing until traffic exists |
| Full end-to-end browser suite, Axe and Lighthouse thresholds | Manual keyboard/mobile review plus a Lighthouse/Axe pass on staging before opening public traffic. | Required staging checklist, not automated yet |
| S3/object-storage migration | Keep validated local uploads only for a single-instance MVP; do not scale horizontally until media moves to object storage. | Accept only for single instance |
| Distributed rate limiting and CAPTCHA | Current forms have validation, honeypot and process-local rate limiting. Add edge rate limiting/CAPTCHA if public form abuse appears or before paid acquisition. | Accept for closed/low-traffic MVP |

Before an actual staging/prod deploy, the operator must: use Node `24.18.x` (local verification used `24.15.0`), provide production secrets and Google OAuth callback URLs, run one positive OAuth allowlist login, configure HTTPS/HSTS and backups/rollback in the host, and run `pnpm ai:migrate-credentials` if any pre-existing AI provider key remains. The remaining Next warnings (deprecated `middleware` name, Prisma generator output path, and broad file tracing from the local image-sync route) are non-blocking for a single-instance staging release but should be scheduled before scaling.
