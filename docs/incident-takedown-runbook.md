# Incident Takedown Runbook

**Status:** Accepted
**Date:** 2026-07-24

Operational procedures for emergency data removal and kill switch activation.

---

## 1. Source kill switch (immediate)

### Trigger
- Legal notice received
- Source terms changed without approval
- Suspected data corruption affecting publication integrity
- Owner decision to remove source data

### Procedure

1. Navigate to `/admin/sources/[source_key]`
2. Click **Disable and unpublish derived-only data**
3. Confirm impact preview (count of fields/entities affected)
4. System executes atomically:
   - Source status → DISABLED
   - `policy_revision` incremented
   - All queued jobs with old revision cancelled
   - Canonical publication recalculated
5. Verify within 60 seconds:
   - Affected fields hidden from public HTML
   - Affected fields removed from public API
   - Media/documents with sole evidence from this source hidden
6. Check admin dashboard: exception count increased by expected amount

### If 60-second SLA not met
- System automatically enables **global safe publication mode**
- Critical notification sent to admin email
- Escalate to manual verification

## 2. Image emergency mode (immediate)

### Trigger
- Legal claim against images
- Copyright takedown notice
- Suspected license violation

### Procedure

1. Navigate to `/admin/settings`
2. Enable **Allowed images only** mode
3. Confirm impact preview (count of images hidden)
4. Verify within 60 seconds:
   - Only ALLOWED images displayed on all public pages
   - Image cache invalidated
5. All UNKNOWN and RESTRICTED images replaced with placeholder

## 3. Global pause (graceful)

### Trigger
- Suspected widespread data corruption
- AI provider outage affecting confidence calculations
- Owner decision to stop publication while investigating

### Options

| Action | Effect |
|---|---|
| Pause all ingestion | Stops new fetch jobs; running jobs complete normally |
| Stop publishing new data | Collection continues; no new canonical updates published |
| Disable all restricted-risk sources | Instant; same as source kill switch for each |
| Recalculate all canonical fields | Full reprocess; may take minutes on large dataset |

## 4. Legal takedown (permanent)

### Trigger
- Formal legal notice (DMCA, cease-and-desist)
- Court order
- Data protection authority request

### Procedure

1. Identify all affected entities/assertions via search
2. For media: set `legal_status = TAKEDOWN`
3. For text data: contact developer to execute targeted removal script
4. Document in audit log:
   - Legal notice reference
   - Date received
   - Affected data
   - Action taken
   - Admin responsible
5. Retain audit record indefinitely

## 5. Post-incident checklist

After any emergency action:

- [ ] Audit log contains all actions taken
- [ ] Affected data verified hidden from public
- [ ] Exception queue reviewed for any unhandled items
- [ ] Source contract updated with incident notes
- [ ] Owner notified of outcome
- [ ] Lessons learned recorded for future prevention

## 6. Contacts

| Role | Email | Purpose |
|---|---|---|
| Product owner | configured in admin settings | Final authority on legal decisions |
| System admin | configured in admin settings | Technical execution |
| Legal counsel | (to be configured) | Legal interpretation |
