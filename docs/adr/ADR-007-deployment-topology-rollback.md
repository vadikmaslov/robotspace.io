# ADR-007: Deployment Topology and Rollback

**Status:** Accepted
**Date:** 2026-07-24
**Owner:** RobotSpace MVP Team

## Context

RobotSpace runs on a 2 GB VPS with PostgreSQL and S3 Beget storage. Production builds must not execute on the VPS. We need a deploy strategy that supports atomic image replacement, migration safety, and instant rollback without losing data.

## Decision

### Build and image

- GitHub Actions builds Docker image on every push to main branch.
- Image tagged with immutable commit SHA (not `latest`).
- No production build on VPS; only image digest pulled and started.
- Web and worker run as separate containers/processes sharing the same image.

### Deployment topology

```
Internet
  → Nginx on VPS
     → web container
     → worker container
     → PostgreSQL container/instance
     → S3 Beget
```

### Migration strategy

1. Pre-deploy backup always created.
2. Migrations applied before new container starts.
3. If migration is **expand-compatible** (additive), single release deploys normally.
4. If migration is **breaking** (removes columns, changes types), uses two-release strategy:
   - Release 1: expand (add new columns, dual-write).
   - Release 2: contract (drop old columns after all code uses new schema).
5. Rollback: previous image digest can be pulled and started; if data loss risk, restore from backup first.

### Rollback procedure

1. `docker pull <previous-image-digest>`
2. Stop current containers.
3. If breaking migration was applied: restore from pre-deploy backup.
4. Start previous image.
5. Record rollback in audit log.

### Monitoring

- External uptime check (cron job or service).
- `/health/live` returns 200 when process is running.
- `/health/ready` returns 200 when DB is reachable and all critical services healthy.
- Worker heartbeat writes timestamp to DB every 60 seconds.
- Queue age, source freshness, AI provider health, backup status all monitored.

## Consequences

### Positive
- VPS never executes build; all CI work happens in GitHub Actions.
- Rollback is a single image swap; data integrity guaranteed by backup.
- Breaking migrations handled safely via expand/contract.
- Separate web/worker containers allow independent scaling post-MVP.

### Negative
- Two-release strategy for breaking migrations adds deploy complexity.
- Image registry storage grows; old images must be pruned.
- 2 GB VPS limits container memory; requires careful resource limits.

### Mitigations
- Container memory limits profiled in Phase 1 smoke test under initial ceilings.
- Image retention policy: keep last 30 images in registry.
- Capacity gate in Phase 15 ensures VPS can handle production load before going live.
