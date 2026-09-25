# ADR-008: Registry foundation over existing software and evidence
Date: 2026-09-25. Phase 1. Status: implemented locally; public features disabled.

## Audit and scope
Code audit: migrations 01-35, schema.prisma, repositories, auth, migration runner and public robot/company routes.
Read-only audit of the local PostgreSQL 18.4 instance: 27 entities; no software packages,
releases, compatibility claims, field assertions or audit logs. These are LOCAL figures,
not production counts. Production was not queried or changed in this phase.
The local database predates the migration ledger and scheduled-agent tables; it is not
a production-equivalent snapshot. Tests therefore exercise (a) the complete migration chain
on an empty database and (b) migration 36 alone on an exact local dump.
A leftover empty directory 24_catalog_store_corrobation_policy is not a migration;
the test harness loads only directories containing migration.sql.

## Mapping and preservation
- Project IS software_packages, not a new competing projects table.
  entity_id equals existing software_packages.id. entities gets PROJECT with DRAFT visibility.
  Legacy slugs are deterministic project-<uuid>; no robot/company slug changes.
  A collision fails the migration transaction rather than stealing an existing identity.
- software_releases and all original package columns/IDs survive unchanged.
  New repository writes create the entity and package together.
  entity_id remains nullable only for backward-compatible legacy writers; those records
  are not public Registry projects until an explicit promotion is implemented.
- Compatibility IS compatibility_claims. New Project -> Robot records use typed FK columns
  project_id/robot_id plus the existing version-range columns.
  Legacy polymorphic relations and original statuses/evidence_url are preserved verbatim.
  No inferred compatibility promotion is performed.
- registry_evidence attaches exactly one of entity, compatibility, claim or field_assertion.
  It references existing sources(key) and evidence_origins(id); it does not duplicate source storage.
  HTTPS legacy compatibility URLs are linked with kind LEGACY, without assigning fabricated confidence.
  Other legacy URLs remain in evidence_url for explicit later review.
- Public accounts are registry_users/accounts/roles. They do not grant admin_users access.
  developer_profiles joins a user to a DEVELOPER entity. GitHub numeric account identity is
  independent of mutable handle. No OAuth token column is introduced.
- entity_claims represents ownership requests. Multiple verified maintainers are possible.
  Ownership is derived from active users' VERIFIED claims, not a single Project owner field.
  Claim proof is distinct from software compatibility evidence.
- registry_corrections stores review proposals. registry_changes is append-only history;
  triggers capture project, compatibility, claim and review changes even outside repositories.
  System changes have null actor; repository contribution events carry the actual user and evidence.
  Existing audit_logs is untouched; graph history is for field-level provenance, not admin audit replacement.
- compatibility_confirmations has one vote per user per compatibility revision.
  Evidence must point at the exact compatibility being confirmed.
- repository_snapshots stores dated observations; missing values remain NULL, not zero.
- Dependencies, follows/saves, detailed contribution scoring and additional developer metadata
  are deferred to their user-facing phases. No speculative marketplace/API tables.

## Status machines
Publication (entities) remains separate from verification and official/community classification.
Official classification is not granted by merely claiming ownership.

| Record | Allowed lifecycle |
| --- | --- |
| Project verification | DISCOVERED -> SUGGESTED or REJECTED; SUGGESTED -> VERIFIED or REJECTED; VERIFIED -> SUGGESTED or REJECTED; REJECTED -> SUGGESTED |
| New compatibility | DISCOVERED -> SUGGESTED or REJECTED; SUGGESTED -> VERIFIED or REJECTED; VERIFIED -> DEPRECATED or REJECTED; REJECTED -> SUGGESTED; DEPRECATED terminal |
| Legacy compatibility | Existing statuses remain usable; no automatic upgrade |
| Ownership claim | PENDING -> VERIFIED or REJECTED; VERIFIED -> REVOKED; rejected/revoked terminal, submit a new claim |
| Confirmation/correction review | PENDING -> ACCEPTED, REJECTED or WITHDRAWN; ACCEPTED -> WITHDRAWN; other terminal states stay terminal |

Project and compatibility verification requires evidence. Claim verification requires
proof URL, verification method and checked_at. SQL enforces state transitions, identity,
version immutability, foreign keys and evidence ownership.
Only future permission-checked services may perform privileged transitions; database checks
do not substitute for OAuth ownership verification or moderator authorization.
No new public auth handler or write endpoint is enabled in phase 1.

Compatibility scopes are immutable. A replacement is a new row with revision + 1 and
supersedes_id referring to the same project/robot pair. Existing confirmations stay attached
to the tested revision. Version range strings are retained, not interpreted as universal
semver: ROS distributions, firmware and hardware requirements need explicit phase-3 rules.

## Repositories and flags
registryRepository(db) supports flag checks, published project lookup, draft project creation,
evidence-backed suggested compatibility and verified-owner lookup.
Mutations require an ACTIVE public user and registry.write, and run atomically with history.
No create-user/OAuth/claim-verify API is implemented yet.
The flags registry.read, registry.write, registry.claims and registry.sync default to false.
Environment-specific overrides take precedence over all; missing flags deny access.
Repositories are internal server code. Never pass environment or authenticated userId directly
from untrusted request bodies.

## Migration and rollback
Use the existing checksummed migration runner; do not use prisma db push.
A repeat run skips already-applied migrations and rejects changed checksums.
Migration 36 is transactional. Failed application rolls back completely.
Before deployment audit production and its ledger separately; local counts are not release evidence.

rollback/36_registry_foundation.sql is a guarded downgrade, to run inside a transaction.
It is allowed only before new Registry data exists and with features disabled.
It restores legacy columns, entity types and compatibility values and removes the ledger entry.
If users, history, new compatibility or changed project metadata exist, it fails WITHOUT deletion.
After real contributions exist, rollback means disable flags and restore prior application code,
leaving additive schema and data in place. Never drop contributor data to achieve a downgrade.

## Verification and limits
pnpm --filter @robotspace/db test:registry creates only disposable
robotspace_registry_test_<uuid> databases on localhost, applies migrations, tests rollback
and reapplication, and removes exactly those databases in finally.
It requires CREATEDB and pg_dump for the clone test; --fresh-only skips pg_dump for CI.
Connection is REGISTRY_TEST_DATABASE_URL, then DIRECT_DATABASE_URL/DATABASE_URL,
then the selected DB setting from apps/web/.env.local. Secrets/dumps are never printed.
REGISTRY_PG_DUMP may override the executable path.

Checks include preservation fixtures for pre-existing releases/compatibility/evidence,
unchanged slugs, fail-closed feature flags, FK rejection, duplicate identities,
cross-relation evidence rejection, ownership reassignment rejection, forbidden status
jumps, immutable history, immutable compatibility scope and suspended-user denial.
Production build passes with new Prisma client. No visual/UI changes are part of this phase.
