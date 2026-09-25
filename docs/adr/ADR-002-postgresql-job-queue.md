# ADR-002: PostgreSQL Job Queue Without Redis

**Status:** Accepted
**Date:** 2026-07-24
**Owner:** RobotSpace MVP Team

## Context

The RobotSpace MVP requires a reliable job queue for source ingestion, AI agent operations, publication recalculations, and notifications. The VPS has only 2 GB RAM. Adding Redis would consume significant memory (typically 150-300 MB) and infrastructure complexity. We must decide on the queue implementation strategy.

## Decision

Use a PostgreSQL-backed job queue via `pgboss` (or equivalent library) instead of Redis-backed queues like BullMQ or Sidekiq. All job tables live in the same PostgreSQL database as domain data.

Queues:
- `source` — periodic source fetch jobs
- `agent-simple` — SIMPLE-class AI operations
- `agent-complex` — COMPLEX-class AI operations
- `publication` — canonical field recalculation and projection invalidation
- `notifications` — email delivery jobs
- `maintenance` — backups, key rotation, anomaly detection

### Technical requirements

- Each job has an idempotency key to prevent duplicate processing.
- Workers renew leases before half of lease duration expires.
- Expired leases are recovered idempotently by other workers.
- Dead-lettered jobs reference terminal run/exception records.
- Concurrency limits per queue configured based on VPS capacity.

## Consequences

### Positive
- No additional infrastructure dependency; one less service to manage and secure.
- Jobs survive PostgreSQL container restarts (not volatile like Redis).
- Job state stored in same DB → can be queried alongside domain data in admin.
- Reduced memory footprint on 2 GB VPS (~250 MB saved vs. Redis + BullMQ).

### Negative
- PostgreSQL is not designed as a high-throughput message broker. Under very high load, Redis would perform better.
- Queue table growth must be managed with retention policies (90-day operational payload expiry).
- Advisory locks add contention under high concurrency.

### Mitigations
- Worker concurrency limited to 1 on 2 GB VPS profile (Phase 1).
- Operational payloads expire after 90 days unless needed for open incident.
- If throughput becomes a bottleneck post-MVP, migration to external queue is feasible with minimal app changes.
