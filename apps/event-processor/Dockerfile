# Build context is the repo root (Nx needs the whole workspace to build one
# app's dependency graph): docker build -f apps/event-processor/Dockerfile .
FROM node:24-alpine AS builder
WORKDIR /repo
RUN corepack enable
# A one-shot Docker build gets no benefit from Nx's persistent daemon, and its
# socket path can exceed the OS AF_UNIX length limit under a deep pnpm store
# path, hanging postinstall — disable it outright.
ENV NX_DAEMON=false CI=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec nx build event-processor

# @nx/esbuild bundles workspace source but leaves third-party deps external,
# emitting a minimal package.json + pnpm-lock.yaml alongside main.js — install
# just those into the runtime image instead of copying the whole monorepo's
# node_modules.
FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=builder /repo/dist/apps/event-processor ./
# WORKFLOW_CONFIG_DIR (libs/workflow-configs/src/index.ts) resolves relative
# to process.cwd() at runtime, not the bundled main.js's location — the
# esbuild bundle above doesn't inline these JSON files, so they must be
# copied in at this same relative path for that resolution to find them.
COPY --from=builder /repo/libs/workflow-configs/src/workflows ./libs/workflow-configs/src/workflows
RUN pnpm install --prod --frozen-lockfile
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "main.js"]
