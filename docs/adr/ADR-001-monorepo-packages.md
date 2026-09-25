# ADR-001: Monorepo Structure and Package Boundaries

**Status:** Accepted
**Date:** 2026-07-24
**Owner:** RobotSpace MVP Team

## Context

RobotSpace MVP requires a single repository containing both the public/admin web application (Next.js) and background worker processes. The project also needs shared domain logic (confidence scoring, canonical field resolution, publication rules), AI orchestration, source ingestion framework, observability utilities, and UI components.

We must decide between a monorepo approach with packages vs. separate repositories for web and worker.

## Decision

Use a pnpm workspaces monorepo under `robotspace-app/` with the following structure:

```
robotspace-app/
├── apps/
│   ├── web/                 # Next.js public + admin pages
│   └── worker/              # Background jobs, collectors, agents
├── packages/
│   ├── db/                  # Prisma schema, migrations, client
│   ├── ui/                  # Design system components
│   ├── config/              # Typed config and shared validation
│   ├── domain/              # Entities, confidence, publication rules
│   ├── ai/                  # Providers, routing, prompts, usage
│   ├── ingestion/           # Adapter interfaces and source contracts
│   └── observability/       # Logs, metrics, notifications
├── fixtures/                # Sanitized source fixtures for tests
├── docs/                    # Generated technical docs and ADRs
├── docker-compose.yml       # Local environment
└── pnpm-workspace.yaml
```

### Import boundaries

- `apps/*` may depend on any `packages/*`.
- `packages/*` may NOT depend on `apps/*`.
- Cross-package dependencies within `packages/` follow explicit arrows below:
  - `domain` → no internal packages (pure domain logic)
  - `db` → `domain`, `observability`
  - `ui` → `config`
  - `ai` → `config`, `observability`
  - `ingestion` → `domain`, `db`, `observability`
  - `observability` → no internal packages (pure utilities)

This prevents circular dependencies and ensures each package has a clear responsibility.

## Consequences

### Positive
- Single `git log` across everything; atomic changes across app/package boundaries.
- Shared domain logic cannot diverge from what web and worker use.
- One lockfile, one CI pipeline.
- Easy to refactor domain code when used in multiple places.

### Negative
- Build times increase slightly due to workspace compilation.
- Requires discipline in import boundaries; enforced by ESLint `import/no-restricted-paths`.
- New contributors need to understand workspaces concept.

### Mitigations
- ESLint import boundary rules enforced in CI.
- Clear documentation in each package's `README.md`.
- Root-level scripts (`pnpm build`, `pnpm test`) compile everything.
