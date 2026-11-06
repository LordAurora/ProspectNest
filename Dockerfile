# syntax=docker/dockerfile:1.7
# One image recipe, two runtime targets: `web` (Next.js standalone) and `worker`.

FROM node:22.21-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS source
COPY . .
RUN pnpm db:generate

FROM source AS web-build
RUN pnpm --filter @prospectnest/web build

FROM node:22.21-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN useradd --system --uid 1001 app
COPY --from=web-build --chown=app /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=app /app/apps/web/.next/static ./apps/web/.next/static
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# The worker and the one-shot migrate/seed/admin commands run from source via tsx.
FROM source AS worker
ENV NODE_ENV=production
RUN useradd --system --uid 1001 app && chown -R app /app
USER app
CMD ["pnpm", "--filter", "@prospectnest/worker", "start"]
