# syntax=docker/dockerfile:1.7
# Build context: repository root.
FROM node:20-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM node:20-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so these must be
# build args. Anything the browser needs at run time (per-deployment config) is
# injected by the server layout instead — added in Phase 4.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN pnpm --filter @agri/web run build

FROM node:20-bookworm-slim AS runner
# HOSTNAME must be 0.0.0.0: the standalone server otherwise binds to the container's
# own hostname, which makes it unreachable from the healthcheck and from other containers.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10003 nextjs
COPY --from=builder --chown=nextjs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD curl -fsS http://localhost:3000/ || exit 1
CMD ["node", "apps/web/server.js"]
