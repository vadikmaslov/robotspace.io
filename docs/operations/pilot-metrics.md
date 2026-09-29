# Pilot measurement contract

`/admin/pilot` requires an admin session, independently of middleware. No new analytics, cookies, visitor IDs, IP logs, tracking or external requests are added. The report reads existing Registry records; it never rewrites audit history or changes the fixed cohort.

Configure private `PILOT_TEAM_GITHUB_IDS` as comma-separated numeric GitHub account IDs for the owner, team and test accounts. Use immutable provider IDs, not profile handles or personal emails. Registry MODERATOR accounts are also excluded automatically. Missing or invalid configuration hides participation metrics instead of presenting team activity as external demand. Restart web after changing its environment. The dashboard shows the number of matched team accounts, never their IDs. An exclusion is not a permission change.

An external participant is an ACTIVE Registry account with a GitHub identity, outside the configured exclusions and moderator roles. This is not a guarantee of a unique person or independent organization. Unknown/inactive actors are reported separately; null actors are system/editorial events. Additional test accounts must be added explicitly, not guessed from email/name.

## Definitions

- Windows start at the earliest cohort `added_at`; 30/60/90 days are cumulative, not rolling. Events satisfy `start <= created_at < min(start + window, now)`. Future events are excluded. Empty cohorts return no participation.
- Scope: currently published, non-archived ACTIVE cohort robots, their currently published non-archived projects connected by verified compatibility rows created before the cutoff, and their manufacturers. Superseded compatibility revisions before the cutoff are excluded. Software package IDs are resolved to project entities explicitly.
- Externally claimed projects: distinct scoped project entities with a currently VERIFIED ownership request submitted by an external account during the window. Multiple maintainers, versions and links do not multiply the count. This measures submission dates with current outcomes, not historical verification dates.
- Participating developers: distinct external users with a currently published developer profile and an in-scope audit event during the window. Multiple events do not create additional people. It is not identity verification or a site-wide sign-up count.
- Independent compatibility reports: distinct `(robot, project, user)` tuples in the window, PENDING or ACCEPTED, excluding project owners, compatibility authors and team. Rejected/withdrawn reports are excluded. A pending report is participation, not proof that compatibility works.
- Robots with 3+ claimed projects: at least three distinct externally claimed project entities under the same rules. Denominator is the original cohort size, even if a robot is later hidden. Version rows cannot meet the threshold by themselves.
- Manufacturer claims: distinct published non-archived manufacturers represented in the cohort, with a currently VERIFIED DNS claim submitted by an external account during the window.
- Audit events: event volume within the current cohort scope and window, split into external / team-or-system / unknown-or-inactive. This is neither unique people nor accepted contributions. Pending projects outside the current published/verified graph are not included.

Publication, ownership, roles and moderation states are current. Earlier window reports can change after moderation, deletion, exclusion changes or publication changes; they are not immutable historical snapshots. These counters alone cannot establish product-market fit. Traffic, repeat visits and GitHub transitions are unavailable while visitor analytics remain disabled, not zero.

## Regression test

With an up-to-date database environment: `pnpm exec tsx scripts/test-pilot-metrics-db.ts`. It copies real table structures/checks/indexes into a uniquely named temporary schema (no production rows or FK triggers copied), tests the actual parameterized report query, and removes only that schema. CI runs it after all migrations. An old developer database without migration 44 cannot run this test until updated; do not replace real schema constraints with invented stubs.
