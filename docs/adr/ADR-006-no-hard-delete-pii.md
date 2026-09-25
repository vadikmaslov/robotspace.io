# ADR-006: No Hard Delete and PII Anonymization Exception

**Status:** Accepted
**Date:** 2026-07-24
**Owner:** RobotSpace MVP Team

## Context

RobotSpace collects long-lived domain data (robots, companies, articles, assertions) and short-lived personal data (quote contacts, submission emails, IP addresses). Domain data must never be silently deleted because it represents investment in provenance and historical record. Personal data must comply with retention policies and GDPR-style anonymization requirements.

## Decision

### Domain data: no hard delete

- `robots`, `companies`, `articles`, `field_assertions`, `source_records`, `media_assets`, `documents` are **never physically deleted** by normal operations.
- Discontinued robots receive `status = ARCHIVED` and public label `Archived model`.
- Archived entities remain queryable but excluded from default active filters.
- Deletion is only permitted for:
  - TAKEDOWN media files
  - Malicious uploads
  - Legal takedown orders (with audit trail)
  - Raw snapshot retention expiry

### PII: retention and anonymization

- Quote and submission PII retained for configurable period (default 12 months).
- IP/rate-limit/CAPTCHA evidence retained separately for maximum 30 days by default.
- After retention period, anonymization job replaces email/phone/name with irreversible tombstone values.
- Non-PII domain contribution (robot data, status counts, entity relationships) preserved.
- Admin notes included in anonymization policy.

### Implementation

- `admin_users` table: `DISABLED` status for deactivated admins (not hard deleted).
- `admin_users` table: last ACTIVE admin cannot be disabled (bootstrap lifecycle rule).
- `canonical_fields`: `manual_lock = false` can be set to `true` via override; unlock creates audit event and triggers recalculation.
- `audit_logs`: append-only; no UPDATE or DELETE allowed on rows.
- DB user role has INSERT only on audit_logs; UPDATE/DELETE blocked by trigger.

### GDPR subject requests

- Early export and anonymization workflow available in admin.
- Export includes only records belonging to subject.
- Anonymization irreversible: no recovery of original PII values.

## Consequences

### Positive
- Domain history fully preserved for confidence/provenance review.
- Archived robots remain accessible via explicit filter.
- PII lifecycle managed automatically after retention period.
- Audit trail integrity guaranteed by DB-level constraints.

### Negative
- Domain DB grows over time; requires retention-aware queries.
- Anonymization job adds operational complexity.
- Must handle "restore from backup after anonymization" edge case carefully.

### Mitigations
- Query filters on `archived_at IS NULL` for default active views.
- Anonymization job idempotent; can be re-run safely.
- Backup restore runbook documents handling of PII retention vs. backup timestamps.
