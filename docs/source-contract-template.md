# Source Contract Template

**Status:** Accepted
**Date:** 2026-07-24

This template defines all mandatory fields for a source contract. No adapter may be activated without a completed contract approved by the owner or admin.

---

## Source Contract

```yaml
source_key:                    # immutable string identifier
owner_contact:                 # email of source owner or admin responsible
canonical_endpoint:            # primary API/URL
access_mode:                   # PUBLIC | API_KEY | AUTHENTICATED | SUBSCRIPTION

# Legal basis
legal_basis:                   # explicit permission | terms compliant | RESTRICTED_RISK acknowledged
terms_url:                     # link to terms of service
terms_checked_at:              # ISO datetime
terms_content_hash:            # SHA-256 of terms content at check time

# Data scope
allowed_fields:                # list of fields allowed to be collected
allowed_operations:            # list of operations (FETCH, AI_PROCESSING, SEND_TO_EXTERNAL_AI, STORE_FULL_TEXT)
raw_retention_policy:         # days or specific retention rule
publication_policy:            # what data may be published and under what conditions

# Credentials
source_credential_binding_id:  # reference to encrypted credential binding

# Rate and concurrency
rate_limit_strategy:           # requests per minute, backoff on 429
stable_id_strategy:            # how to derive stable external ID (QID, DOI, arXiv ID, etc.)
cursor_or_watermark:           # pagination strategy for incremental fetch

# Parser and schema
parser_version:                # semver
schema_version:                # taxonomy schema version

# Quality
freshness_sla:                 # max acceptable age of data
confidence_caps_by_field:      # map of field -> max confidence this source can provide
derived_from_sources:          # list of sources this source derives from (for dependency detection)

# Attribution
attribution_template:          # text template for source attribution

# Control
kill_switch:                   # boolean; if true, all queued jobs cancelled immediately
```

### Mandatory validation

Before a source can be set to ACTIVE status, the following must be verified:

- [ ] `source_key` is unique and non-empty
- [ ] `canonical_endpoint` is valid HTTPS URL
- [ ] `legal_basis` is not empty
- [ ] `terms_url` is accessible (HTTP GET returns 2xx)
- [ ] `terms_checked_at` is within last 90 days
- [ ] `allowed_fields` is non-empty list
- [ ] `allowed_operations` contains at least `FETCH`
- [ ] `source_credential_binding_id` exists and credential is ACTIVE
- [ ] `parser_version` and `schema_version` are specified
- [ ] `kill_switch` defaults to `false`

### Restricted-risk additions

For sources with `legal_status = RESTRICTED_RISK`, the contract must additionally include:

```yaml
risk_acknowledged_by:          # admin email who acknowledged risk
risk_acknowledged_at:          # ISO datetime
risk_notes:                    # free-text explanation of accepted risk
```

### Change log

| Date | Admin | Change |
|---|---|---|
| 2026-07-24 | system | Initial template created |
