# Production deployment (single VPS)

The deployment uses Caddy rather than a hand-managed Certbot setup. Caddy is free, obtains a Let's Encrypt certificate automatically, renews it, and redirects HTTP to HTTPS. It requires the DNS `A` record for `ROBOTSPACE_DOMAIN` to already point to this VPS and ports 80/443 to be reachable.

## One-time server preparation

1. Install Docker Engine with the Compose plugin.
2. Create `/opt/robotspace` and copy this `deploy/` directory there.
3. Copy `.env.production.example` to `.env.production`, fill it with production secrets, and set `NEXT_PUBLIC_SITE_URL=https://<domain>`.
4. Point the domain's DNS `A` record to the VPS and wait until it resolves publicly.

## Per-release procedure

The image must be built in CI, tagged with an immutable commit SHA and pulled by the VPS. Do not use `docker compose build` on the VPS.

```bash
cd /opt/robotspace
docker compose --env-file .env.production -f docker-compose.production.yml pull
docker compose --env-file .env.production -f docker-compose.production.yml run --rm --no-deps -w /app web pnpm --filter @robotspace/db db:deploy
docker compose --env-file .env.production -f docker-compose.production.yml up -d --remove-orphans
curl -fsS https://$ROBOTSPACE_DOMAIN/api/health/ready
```

The first `up` starts Caddy, which obtains and renews the certificate automatically. If provider credentials already exist in the database, run the credential conversion once with the configured keyring:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm --no-deps -w /app web pnpm ai:migrate-credentials
```

The hosting backup is the restore point before migration. Keep the previous immutable image tag for rollback.
