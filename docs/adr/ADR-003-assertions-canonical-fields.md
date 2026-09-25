# ADR-003: Field Assertions + Canonical Fields Pattern

**Status:** Accepted
**Date:** 2026-07-24
**Owner:** RobotSpace MVP Team

## Context

RobotSpace must track provenance, confidence, and freshness at the level of every individual field. Multiple sources may provide conflicting values for the same entity attribute. Manual admin corrections must persist against future agent suggestions. We need a data model that guarantees auditability and deterministic selection without losing history.

## Decision

Use a two-table pattern:

1. **`field_assertions`** — immutable record of every observed value from every source/agent. Never modified except by status transitions (CANDIDATE → ACCEPTED/REJECTED/SUPERSEDED). Contains normalized value, raw value, source reference, evidence URL, observed_at, extraction method, confidence cap, legal status.

2. **`canonical_fields`** — thin overlay table pointing to `winning_assertion_id`. Deterministically selected from assertions by confidence algorithm (section 7.5 of plan). Domain public projections (`robot_public_projections`, `company_public_projections`) are rebuildable caches derived from canonical fields, never edited directly.

### Key rules

- `field_assertions` is the single source of factual values.
- `canonical_fields` only selects winning assertion.
- Typed attribute projections (`robot_attribute_values`) are rebuilt transactionally from canonical fields.
- Public projections are query cache tables; direct editing forbidden via separate DB role/service boundary.
- When schema changes, old assertions preserved; new version creates new assertions.
- Manual overrides create an ADMIN assertion with `confidence = 1.00` and `manual_lock = true`.

### Constraint enforcement

- CHECK constraint: exactly one field reference mode per row (fixed field_key OR attribute_definition_version_id).
- Unique constraints prevent duplicate active assertions for same entity+field.
- Partial unique indexes for fast lookup on `(entity_id, field_key, field_schema_version)`.

## Consequences

### Positive
- Full provenance chain preserved forever; no silent overwrites.
- Confidence algorithm can be re-run at any time; results always reproducible.
- Admin corrections persist against all future agent input.
- Schema evolution safe: old versions immutable, new assertions created under new version.
- Domain projections can be rebuilt if corruption detected.

### Negative
- More writes per ingestion run (assertion creation + canonical update + projection rebuild).
- Queries join more tables; requires careful indexing strategy.
- Developers must understand the three-layer model (assertions → canonical → projections).

### Mitigations
- All updates happen within a single database transaction per entity during publication recalculation.
- Critical indexes created upfront in Phase 2 migration.
- Repository layer abstracts the three layers; domain services hide complexity.
