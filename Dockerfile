FROM node:24.18-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

# Sitemap is dynamic, so the image build does not need production database access.
RUN pnpm build \
  && mkdir -p apps/web/.next/standalone/apps/web/.next \
  && cp -a apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
  && cp -a apps/web/public apps/web/.next/standalone/apps/web/public

FROM build AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app/apps/web/.next/standalone/apps/web

EXPOSE 3000

# The same immutable image is used for `pnpm --filter @robotspace/db db:deploy`
# before this server is started. It never builds code on the VPS.
CMD ["node", "server.js"]
