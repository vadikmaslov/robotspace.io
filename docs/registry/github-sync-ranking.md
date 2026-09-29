# GitHub refresh and ecosystem ranking

Phase 8 adds a durable worker job, `registry-github-sync`, for published and
verified Registry projects that point to a public GitHub repository. The job is
created by migration 42 and is gated by the `registry.sync` feature flag. With
the flag disabled it makes no GitHub requests.

## Refresh behaviour

The scheduled job runs at `20 3 * * *` in the worker host's local time. A run
selects at most 12 projects that have not been checked for 24 hours. Within that
set, projects with more recent known repository activity are handled first, then
the least recently checked project. This keeps the public GitHub API load small:
normally no more than two requests per selected project in a day.

Each attempt records a repository snapshot. Matching observations share a
SHA-256 fingerprint, so a repeat run updates only `checked_at` instead of
creating another identical row. A changed observation keeps a new historical
snapshot. The worker stores stars, forks, open issues, latest release and last
commit activity. It also records `RATE_LIMITED`, `UNAVAILABLE` or `NOT_FOUND`
with a short error code and the GitHub rate-limit reset time when available.

Public pages always read the newest successful (`OK`) snapshot for repository
facts. A failed later check is still shown as a temporary GitHub status; it
never removes the last verified release or activity from a page.

There is intentionally no per-visitor tracking or artificial "views" signal in
this MVP. The job prioritises published projects by real repository activity and
staleness only. If product analytics is introduced later, it must be designed
as a separate privacy-reviewed signal rather than silently changing ranking.

## Ranking scope and formula

`robot-ecosystem-v1` orders projects only inside one robot's ecosystem. It is
not a site-wide RobotSpace Score, does not rank companies or robots, and never
overrides editorial verification or moderation.

Every displayed project already has a verified compatibility record. The stable
formula uses these factors:

- verified compatibility: 40 points;
- recent GitHub activity: 25 / 15 / 6 points for activity within 30 / 90 / 365 days;
- GitHub refresh freshness: 15 / 8 points for a check within 7 / 30 days;
- repository signals: up to 15 points from logarithmic stars and forks;
- accepted community confirmations: up to 8 points;
- accepted community disputes: subtract up to 8 points.

Ties are broken by latest activity and then immutable project ID, so identical
inputs always produce the same order. The score itself is intentionally not
shown. The robot ecosystem page shows rank, formula version and the human
readable reasons that contributed to its order.

## Operations

1. Apply migration 42.
2. Enable `registry.sync` for the target environment only when GitHub refresh
   should start.
3. Check the `registry-github-sync` scheduled-agent run and its log after the
   first scheduled pass.
4. On a GitHub incident or rate limit, leave the feature enabled: the next run
   will retry after its normal interval and public data remains intact.
