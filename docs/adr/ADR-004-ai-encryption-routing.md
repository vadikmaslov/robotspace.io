# ADR-004: AI Provider Encryption and Routing

**Status:** Accepted
**Date:** 2026-07-24
**Owner:** RobotSpace MVP Team

## Context

The application must support multiple AI providers (OpenAI, DeepSeek, GLM, OpenAI-compatible) with encrypted key storage, ordered fallback routing (SIMPLE/COMPLEX chains), and runtime health monitoring. Keys must never appear in plaintext in DB, logs, audit trail, or API responses.

## Decision

### Encryption
- Use AES-256-GCM (authenticated encryption) with a keyring stored only in environment variables.
- One `ACTIVE` key ID for new encryptions; previous keys kept for decrypt-only until rotation completes.
- Keys never stored in DB; only `key_id/version`, `nonce`, and `auth_tag` stored as ciphertext metadata.
- Plaintext decrypted only inside the provider request boundary, removed from memory as soon as practical.
- API contract: write-only for secrets; UI shows only last 4 characters and rotation date.
- All log/audit/trace payloads pass through redaction filter.

### Routing
- Two global chains: `SIMPLE` (cheap operations) and `COMPLEX` (expensive operations).
- Per-operation overrides possible (e.g., `article_preview` uses SIMPLE; `conflict_analysis` uses COMPLEX).
- Each chain is ordered list of models with rank, max_attempts, timeout, cooldown.
- Fallback algorithm: try each model in order, skipping disabled/unhealthy/cooldown models, falling back on transient error, 401/403 (credential invalid), 429 (cooldown), invalid structured output (one repair then next).
- Chain exhaustion creates exception + notification job; no silent data publication.

### Health
- At provider save, on manual Test button, and every 15 minutes (lightweight check) when available.
- Health states: UNKNOWN, HEALTHY, DEGRADED, DOWN, AUTH_ERROR, RATE_LIMITED.

### SSRF protection
- Base URL must be HTTPS outside local development.
- Reject loopback/private/link-local/metadata IP ranges at connection boundary.
- Re-resolve hostname before each connection (DNS rebinding protection).
- Authorization header never forwarded after redirect to another origin.

## Consequences

### Positive
- Keys cannot leak via DB backup, logs, or API response.
- Key rotation possible without application restart.
- Fallback ensures graceful degradation when one provider is down.
- SSRF protection prevents key forwarding to attacker-controlled endpoints.

### Negative
- More complex encryption infrastructure than simple hashing.
- Key rotation job must be idempotent and restartable.
- Health check frequency adds AI API cost for monitoring.

### Mitigations
- Keyring rotation documented in runbook; recovery from backup tested with key IDs.
- Health check uses lightweight ping (no full generation) when possible.
- All credential operations logged in audit trail (redacted).
