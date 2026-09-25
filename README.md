# RobotSpace.io

RobotSpace.io is a robotics discovery and registry project. The application includes a public catalog, company pages, market insights, an integrators map, and an emerging community registry for robot software projects.

## Stack

- Next.js 16 and React 19 (`apps/web`)
- PostgreSQL and Prisma (`packages/db`)
- Background ingestion worker (`apps/worker`)
- pnpm workspace

## Local development

Use Node.js 24.18 or newer in the 24.x line and pnpm 10.15. Copy `.env.example` into a local, untracked environment file and supply your own database and authentication settings. Never commit real credentials.

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm --filter @robotspace/app dev
```

For a local PostgreSQL instance, see `docker-compose.yml`. Run `pnpm build` to check the production web build and `pnpm security:secrets` before publishing changes.

GitHub project claims are disabled by default. Their OAuth setup and verification rules are documented in [`docs/registry/github-claims.md`](docs/registry/github-claims.md).

This repository contains a source snapshot of the RobotSpace application only. It does not include the parent Unibot workspace, its Git history, production environment, or deployment credentials.
