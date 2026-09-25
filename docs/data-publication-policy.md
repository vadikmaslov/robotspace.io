# Data Publication Policy

**Status:** Accepted
**Date:** 2026-07-24

This policy defines when and how data becomes publicly visible on RobotSpace.

---

## 1. Publication rule

A field is published publicly when all conditions are met:

```
evidence_confidence >= threshold_for_field
AND freshness_status IN (FRESH, MANUALLY_LOCKED)
AND source is ACTIVE
AND legal policy permits publication OR owner risk override is active
AND no active kill switch affects this data
```

## 2. Public thresholds

| Field category | Threshold |
|---|---:|
| Robot/company identity (name, slug, manufacturer) | 0.85 |
| Technical specifications | 0.90 |
| Compatibility claims | 0.90 |
| News metadata (title, date, categories) | 0.80 |
| Trend statement | 0.90 + minimum observation count |
| Image display | Controlled by separate image policy |

## 3. Source caps

| Evidence type | Maximum confidence |
|---|---:|
| Manual admin correction | 1.00 + manual lock |
| Authorized manufacturer/partner feed | 0.98 |
| Official regulator/certification API | 0.97 |
| Crossref DOI identity | 0.97 |
| arXiv/OpenAlex bibliographic metadata | 0.93-0.95 |
| ROS identity/compatibility | 0.80 |
| RSS metadata | 0.85 |
| Event claim from one article | 0.60 |
| Wikidata identity/basic relation | 0.65 |
| Wikidata technical specification | 0.45 |
| AI-only unsupported inference | 0.30 (not published) |

## 4. Freshness defaults

| Data type | Maximum age |
|---|---|
| News RSS metadata | <= 2 hours |
| arXiv/research | <= 24 hours |
| Wikidata | <= 7 days |
| Manufacturer product status/specs | <= 30 days |
| Company identity | <= 90 days |
| Integrator location | <= 180 days |

## 5. Image policy

### Normal mode
- Display images with legal_status: ALLOWED, UNKNOWN, RESTRICTED
- TAKEDOWN never displayed

### Safe mode (Allowed images only)
- Display only ALLOWED images
- Toggle takes effect within 60 seconds via feature flag
- Impact preview shown before confirming switch

## 6. What happens when conditions fail

When a published field fails any condition:
1. Field hidden from public view (HTML and API).
2. Entity remains; no fake value substituted.
3. Exception created in admin queue.
4. Agents attempt to find new evidence.
5. Manual lock persists until admin explicitly unlocks.

## 7. Entity indexing

Only published entities with minimum verified fields are indexed:
- Robot: identity + at least one required technical attribute
- Company: identity + company type

Low-quality or empty entity pages receive `noindex`.

## 8. No fake data policy

- No numbers, companies, ratings, prices, or charts from HTML prototype.
- No extrapolated market data without label.
- Insufficient data shows honest empty state with explanation.
- Derived metrics have methodology page and source references.
