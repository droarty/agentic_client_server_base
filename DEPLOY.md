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
4. **Fly.io** — install the `flyctl` CLI if you don't have it (`brew install flyctl`, or `curl -L https://fly.io/install.sh | sh`; confirm with `fly version`), then `fly auth login`, then from the repo root:
   ```
   fly apps create <your-api-app-name>
   fly apps create <your-event-processor-app-name>
   ```
   You don't need to edit `fly.api.toml`/`fly.event-processor.toml` — the app name is passed with `--app` at deploy time instead (see Secrets/Deploying below), sourced from the `FLY_API_APP_NAME`/`FLY_EVENT_PROCESSOR_APP_NAME` GitHub Actions variables.
5. **Cloudflare Workers** — create an **account-scoped** API token (dashboard: Manage Account → Account API Tokens → Create Custom Token, `Workers Scripts:Edit` permission), and note your Account ID (same page, or the dashboard sidebar). Account tokens are preferred over user tokens for CI/CD (not tied to a specific person) — `wrangler` normally auto-detects the account by calling Cloudflare's `/memberships` endpoint, which requires a permission only user tokens have, but that call is skipped entirely once an account ID is provided explicitly, which the `deploy-web` job already does via `CLOUDFLARE_ACCOUNT_ID`. `web` deploys via `wrangler` from CI rather than Cloudflare's dashboard git integration — the latter expects a `wrangler.jsonc` already declaring the build output for framework auto-detection, which doesn't fit this Nx monorepo's custom build (`tools/web-build.mjs`, no per-app `package.json`). `CLOUDFLARE_WORKER_NAME` is any name you choose (lowercase, alphanumeric and dashes — same rule as the Fly app names above) — it doesn't need to be created in the Cloudflare dashboard first, `wrangler deploy` creates the Worker under that name on first run. You don't need to edit `apps/web/wrangler.jsonc` — the name is passed with `--name` at deploy time instead, sourced from that variable.
6. **Google Cloud Console** — under the same OAuth 2.0 Client ID used for login, add the deployed `GOOGLE_PHOTOS_CALLBACK_URL` as an authorized redirect URI alongside `GOOGLE_CALLBACK_URL`, and make sure the Google Photos Picker API is enabled for the project.

## Secrets

Set as Fly secrets (`fly secrets set KEY=value --config fly.api.toml`, likewise for event-processor) — **never** commit these or bake them into the Docker image (the `.env`-copy-into-build-output behavior in `apps/api/project.json`/`apps/event-processor/project.json` is dev-only; `.dockerignore` deliberately excludes `.env` files from the build context so this can't happen by accident):

- Both apps: `DATABASE_URL`, `REDIS_URL`, `INTERNAL_SERVICE_TOKEN` (same value on both), `AI_SERVICE_TYPE`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (event-processor needs its own copy to refresh a user's Google Photos access token before calling the Picker API — see `google-photos-picker.client.ts`)
- `api` only: `JWT_SECRET` (generate a random value locally — e.g. `openssl rand -hex 32` — never ship the `.env.example`/dev-default placeholder), `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `CLIENT_URL` (the deployed Cloudflare Workers URL — see below for where to find it), `GOOGLE_CALLBACK_URL`, `GOOGLE_PHOTOS_CALLBACK_URL`, `EVENT_PROCESSOR_URL` (the deployed event-processor's Fly URL)
- `event-processor` only: `STORAGE_BACKEND=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. **`apps/event-processor/src/app/config/env.ts` refuses to boot in production if `STORAGE_BACKEND` isn't `r2` or any of these are missing** — you cannot accidentally ship pointed at the local Wrangler dev gateway.

The Cloudflare Workers URL for `CLIENT_URL`/`CORS_ORIGIN` isn't known until `web`'s first deploy: it defaults to `https://<worker-name>.<your-account-subdomain>.workers.dev` (the `deploy-web` job's `wrangler deploy` step prints it, and it's also shown on the Worker's Overview page in the Cloudflare dashboard under Workers & Pages), or your own custom domain if you've attached one there.

`API_URL`/`WS_URL` for `web` are **not runtime env vars** — they're baked in at build time (`tools/web-build.mjs`), so set them as GitHub Actions repository **variables** (`WEB_API_URL`/`WEB_WS_URL`, Settings → Secrets and variables → Actions → Variables — not secrets, since they're just public URLs) pointing at the deployed `api` app's hostname, e.g. `WEB_API_URL=https://<your-api-app-name>.fly.dev` and `WEB_WS_URL=wss://<your-api-app-name>.fly.dev` — same host, since `api` serves both REST and WebSocket traffic from one Express + `http` server (`apps/api/src/main.ts`), just different URL schemes. The `deploy-web` job in `.github/workflows/deploy.yml` passes them into the build as `API_URL`/`WS_URL`.

GitHub Actions (`.github/workflows/deploy.yml`) needs its own copies as repo secrets:
- `FLY_API_TOKEN` — an app-scoped deploy token for `api`: `fly tokens create deploy --app <your-api-app-name>`
- `FLY_EVENT_PROCESSOR_TOKEN` — the same, for `event-processor`: `fly tokens create deploy --app <your-event-processor-app-name>` (a single token can't deploy both apps — `fly tokens create deploy` tokens are scoped to one app)
- `DATABASE_URL` (for the migration job)
- `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (for the `deploy-web` job's `wrangler deploy`)

And repo **variables**: `FLY_API_APP_NAME`, `FLY_EVENT_PROCESSOR_APP_NAME`, `CLOUDFLARE_WORKER_NAME` (the app/worker names chosen above — passed to `--app`/`--name` at deploy time instead of being hardcoded in `fly.*.toml`/`wrangler.jsonc`), plus `WEB_API_URL`/`WEB_WS_URL` from above.

## Deploying

Before the first deploy, verify the real R2 credentials work end-to-end (no Fly deploy needed for this — it runs locally against the real endpoint):
```
STORAGE_BACKEND=r2 R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=... pnpm run verify:r2
```

First deploy, from the repo root:
```
fly deploy --config fly.api.toml --app <your-api-app-name>
fly deploy --config fly.event-processor.toml --app <your-event-processor-app-name>
pnpm run db:migrate   # against the Neon DATABASE_URL — run once before first boot
```
`web` doesn't need a manual first deploy — `wrangler deploy` creates the Worker on first run, so once `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_WORKER_NAME`/`WEB_API_URL`/`WEB_WS_URL` are set, the first push to `main` deploys it.

After that, pushes to `main` deploy automatically via `.github/workflows/deploy.yml` (build+test → migrate → deploy both Fly apps in parallel, and deploy `web` via `wrangler` in parallel with the Fly deploys). Drizzle tracks applied migrations, so running `db:migrate` on every deploy is a safe no-op when there's nothing new.

## Hardening once it's running

- `event-processor` is exposed publicly for simplicity at launch (its only real route, `POST /internal/events`, is already bearer-token authenticated). Once both apps are up, consider moving it to Fly's private networking (6PN/flycast, reachable at `<app-name>.internal` from `api`) and dropping its public `http_service` so the port isn't internet-facing at all.
- Scaling `api` to multiple Fly machines works today with no code changes (WebSocket state already lives in Redis). **Do not** scale `event-processor` beyond one instance yet — `WorkflowEngine`'s config/channel caches are process-local with no cross-instance invalidation; fix that first.

## Notes on the dev-only R2 gateway

`apps/r2-dev-gateway` (a Cloudflare Worker run via `wrangler dev`) only exists so local dev can exercise Wrangler's local R2 emulation — it's never deployed and has no `build` target, so it's automatically skipped by `nx run-many --target=build` in CI. `wrangler`'s `workerd` dependency doesn't have a working native binary under Alpine/musl (its postinstall logs a warning, not an error, so `pnpm install` still succeeds) — harmless, since neither `wrangler` nor `workerd` are runtime dependencies of `api` or `event-processor` and never ship in their Docker images.
