# ADR-005: Legal-Risk Source Policy and Kill Switches

**Status:** Accepted
**Date:** 2026-07-24
**Owner:** RobotSpace MVP Team

## Context

Many useful robotics data sources (manufacturer catalogs, third-party directories) do not explicitly permit automated data collection. The product must ingest data responsibly while allowing the owner to explicitly acknowledge and manage legal risk on a per-source basis. We also need instant "kill switch" capability to unpublish all data derived from a source.

## Decision

### Source legal status hierarchy

Every source record carries a `legal_status` field:

| Status | Meaning |
|---|---|
| `ALLOWED` | Explicitly permitted by terms, API contract, or license |
| `UNKNOWN` | Terms unclear; not yet evaluated |
| `RESTRICTED_RISK` | Owner has acknowledged the risk explicitly |
| `TAKEDOWN` | Data removed following legal request or owner decision |

### Source contract requirement

No adapter may be activated without a complete source contract containing:
- `legal_basis` — why collection is believed lawful
- `terms_url` and `terms_checked_at`
- `allowed_fields` and `allowed_operations`
- `raw_retention_policy`
- `publication_policy`
- `confidence_caps_by_field`
- `kill_switch`

### Per-source kill switch

Each source has a monotonic `policy_revision` counter. When admin disables a source:
1. Status changes to DISABLED.
2. `policy_revision` incremented atomically.
3. All queued jobs with old revision cancelled.
4. In-flight workers check revision before fetch, persistence, assertion creation, and publication.
5. Old-revision persistence rejected by DB guard.
6. Canonical publication recalculated; fields derived only from disabled source hidden within 60 seconds.
7. If invalidation SLA exceeded, global safe publication mode enabled and critical alert sent.

### Evidence dependency tracking

When a source is disabled:
- Media/documents supported only by that source hidden; those with sufficient independent active evidence preserved.
- Evidence dependency graph (`evidence_dependency_edges`) used to determine which data survives.

### Global emergency controls

- "Disable all restricted-risk sources" — instant action.
- "Pause all ingestion" — stops new jobs, continues running ones.
- "Stop publishing new data while continuing collection" — separate toggle.

## Consequences

### Positive
- Owner has full visibility and control over legal risk per source.
- Kill switch acts within 60 seconds with verifiable SLA test.
- Evidence lineage preserved for future legal review.
- Cannot accidentally disable source and leave orphaned published data.

### Negative
- Complex state management across source → assertion → canonical → projection.
- 60-second SLA requires careful cache invalidation strategy.
- Evidence dependency graph adds operational complexity.

### Mitigations
- All kill switch operations tested by E2E tests (Phase 5 acceptance criteria).
- Global safe publication mode acts as automatic circuit breaker.
- Source contract UI shows impact preview before confirming disable.
