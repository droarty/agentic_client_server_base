# Deployment

Short-term stack, chosen for cost (~$6–12/month total) while keeping every
piece swappable later without app code changes — see GitHub issue #279 for
the full rationale.

| Piece | Provider |
|---|---|
| `web` (static SPA) | Cloudflare Workers (static assets) |
| `api` + `event-processor` (Node services) | Fly.io |
| Postgres | Neon |
| Redis | Upstash |
| Object storage (assets) | Cloudflare R2 |

**Node version:** both Dockerfiles use `node:24-alpine` — the repo's `engines`/`.npmrc` (`engine-strict=true`) require Node ≥24, and CI's `setup-node` is pinned to match.

## One-time account setup

1. **Neon** — create a project, copy its pooled connection string as `DATABASE_URL`.
2. **Upstash** — create a Redis database, copy its connection string as `REDIS_URL` (use the `rediss://` TLS URL, ioredis supports it natively).
3. **Cloudflare R2** — create a bucket, then create an R2 API token (dashboard: R2 → Manage R2 API Tokens) scoped to it. Note the account ID, access key ID, secret access key, and bucket name — these become `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`. This is a *different* bucket from local dev's Wrangler-simulated one (`apps/r2-dev-gateway`, `dev-storage-bucket`) — production always talks to the real R2 endpoint via `@aws-sdk/client-s3` (`apps/event-processor/src/app/services/r2-storage.client.ts`).
4. **Fly.io** — `fly auth login`, then from the repo root:
   ```
   fly apps create <your-api-app-name>
   fly apps create <your-event-processor-app-name>
   ```
   Update the `app = "..."` line in `fly.api.toml` and `fly.event-processor.toml` to match.
5. **Cloudflare Workers** — create a Cloudflare API token (dashboard: My Profile → API Tokens → Create Token, "Edit Cloudflare Workers" permission template) scoped to your account, and note your Account ID (dashboard sidebar). `web` deploys via `wrangler` from CI rather than Cloudflare's dashboard git integration — the latter expects a `wrangler.jsonc` already declaring the build output for framework auto-detection, which doesn't fit this Nx monorepo's custom build (`tools/web-build.mjs`, no per-app `package.json`). Rename `change-me-acsb-web` in `apps/web/wrangler.jsonc` to your chosen Worker name (same convention as the Fly app names above — lowercase, alphanumeric and dashes only, per Cloudflare's naming rules).
6. **Google Cloud Console** — under the same OAuth 2.0 Client ID used for login, add the deployed `GOOGLE_PHOTOS_CALLBACK_URL` as an authorized redirect URI alongside `GOOGLE_CALLBACK_URL`, and make sure the Google Photos Picker API is enabled for the project.

## Secrets

Set as Fly secrets (`fly secrets set KEY=value --config fly.api.toml`, likewise for event-processor) — **never** commit these or bake them into the Docker image (the `.env`-copy-into-build-output behavior in `apps/api/project.json`/`apps/event-processor/project.json` is dev-only; `.dockerignore` deliberately excludes `.env` files from the build context so this can't happen by accident):

- Both apps: `DATABASE_URL`, `REDIS_URL`, `INTERNAL_SERVICE_TOKEN` (same value on both), `AI_SERVICE_TYPE`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (event-processor needs its own copy to refresh a user's Google Photos access token before calling the Picker API — see `google-photos-picker.client.ts`)
- `api` only: `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `CLIENT_URL` (the deployed Cloudflare Workers URL), `GOOGLE_CALLBACK_URL`, `GOOGLE_PHOTOS_CALLBACK_URL`, `EVENT_PROCESSOR_URL` (the deployed event-processor's Fly URL)
- `event-processor` only: `STORAGE_BACKEND=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. **`apps/event-processor/src/app/config/env.ts` refuses to boot in production if `STORAGE_BACKEND` isn't `r2` or any of these are missing** — you cannot accidentally ship pointed at the local Wrangler dev gateway.

`API_URL`/`WS_URL` for `web` are **not runtime env vars** — they're baked in at build time (`tools/web-build.mjs`), so set them as GitHub Actions repository **variables** (`WEB_API_URL`/`WEB_WS_URL`, Settings → Secrets and variables → Actions → Variables — not secrets, since they're just public URLs) pointing at the deployed `api` app's hostname. The `deploy-web` job in `.github/workflows/deploy.yml` passes them into the build as `API_URL`/`WS_URL`.

GitHub Actions (`.github/workflows/deploy.yml`) needs its own copies as repo secrets: `FLY_API_TOKEN` (from `fly tokens create deploy`), `DATABASE_URL` (for the migration job), and `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (for the `deploy-web` job's `wrangler deploy`).

## Deploying

Before the first deploy, verify the real R2 credentials work end-to-end (no Fly deploy needed for this — it runs locally against the real endpoint):
```
STORAGE_BACKEND=r2 R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=... pnpm run verify:r2
```

First deploy, from the repo root:
```
fly deploy --config fly.api.toml
fly deploy --config fly.event-processor.toml
pnpm run db:migrate   # against the Neon DATABASE_URL — run once before first boot
```
`web` doesn't need a manual first deploy — `wrangler deploy` creates the Worker on first run, so once `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`WEB_API_URL`/`WEB_WS_URL` are set, the first push to `main` deploys it.

After that, pushes to `main` deploy automatically via `.github/workflows/deploy.yml` (build+test → migrate → deploy both Fly apps in parallel, and deploy `web` via `wrangler` in parallel with the Fly deploys). Drizzle tracks applied migrations, so running `db:migrate` on every deploy is a safe no-op when there's nothing new.

## Hardening once it's running

- `event-processor` is exposed publicly for simplicity at launch (its only real route, `POST /internal/events`, is already bearer-token authenticated). Once both apps are up, consider moving it to Fly's private networking (6PN/flycast, reachable at `<app-name>.internal` from `api`) and dropping its public `http_service` so the port isn't internet-facing at all.
- Scaling `api` to multiple Fly machines works today with no code changes (WebSocket state already lives in Redis). **Do not** scale `event-processor` beyond one instance yet — `WorkflowEngine`'s config/channel caches are process-local with no cross-instance invalidation; fix that first.

## Notes on the dev-only R2 gateway

`apps/r2-dev-gateway` (a Cloudflare Worker run via `wrangler dev`) only exists so local dev can exercise Wrangler's local R2 emulation — it's never deployed and has no `build` target, so it's automatically skipped by `nx run-many --target=build` in CI. `wrangler`'s `workerd` dependency doesn't have a working native binary under Alpine/musl (its postinstall logs a warning, not an error, so `pnpm install` still succeeds) — harmless, since neither `wrangler` nor `workerd` are runtime dependencies of `api` or `event-processor` and never ship in their Docker images.
