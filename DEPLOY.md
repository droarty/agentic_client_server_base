# Deployment

Short-term stack, chosen for cost (~$6–12/month total) while keeping every
piece swappable later without app code changes — see GitHub issue #279 for
the full rationale.

| Piece | Provider |
|---|---|
| `web` (static SPA) | Cloudflare Pages |
| `api` + `event-processor` (Node services) | Fly.io |
| Postgres | Neon |
| Redis | Upstash |
| Object storage (future assets) | Cloudflare R2 — not wired up yet, see below |

## One-time account setup

1. **Neon** — create a project, copy its pooled connection string as `DATABASE_URL`.
2. **Upstash** — create a Redis database, copy its connection string as `REDIS_URL` (use the `rediss://` TLS URL, ioredis supports it natively).
3. **Fly.io** — `fly auth login`, then from the repo root:
   ```
   fly apps create <your-api-app-name>
   fly apps create <your-event-processor-app-name>
   ```
   Update the `app = "..."` line in `fly.api.toml` and `fly.event-processor.toml` to match.
4. **Cloudflare Pages** — connect the GitHub repo in the Cloudflare dashboard. Build command `pnpm nx build web`, output directory `dist/apps/web`. Cloudflare's own git integration handles rebuild-on-push automatically — no CI step needed for this piece.

## Secrets

Set as Fly secrets (`fly secrets set KEY=value --config fly.api.toml`, likewise for event-processor) — **never** commit these or bake them into the Docker image (the `.env`-copy-into-build-output behavior in `apps/api/project.json`/`apps/event-processor/project.json` is dev-only; `.dockerignore` deliberately excludes `.env` files from the build context so this can't happen by accident):

- Both apps: `DATABASE_URL`, `REDIS_URL`, `INTERNAL_SERVICE_TOKEN` (same value on both), `AI_SERVICE_TYPE`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`
- `api` only: `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `CLIENT_URL` (the deployed Cloudflare Pages URL), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `EVENT_PROCESSOR_URL` (the deployed event-processor's Fly URL)

`API_URL`/`WS_URL` for `web` are **not runtime env vars** — they're baked in at build time (`tools/web-build.mjs`), so set them as Cloudflare Pages build-time environment variables pointing at the deployed `api` app's hostname.

GitHub Actions (`.github/workflows/deploy.yml`) needs its own copies as repo secrets: `FLY_API_TOKEN` (from `fly tokens create deploy`) and `DATABASE_URL` (for the migration job).

## Deploying

First deploy, from the repo root:
```
fly deploy --config fly.api.toml
fly deploy --config fly.event-processor.toml
pnpm run db:migrate   # against the Neon DATABASE_URL — run once before first boot
```
After that, pushes to `main` deploy automatically via `.github/workflows/deploy.yml` (build+test → migrate → deploy both Fly apps in parallel). Drizzle tracks applied migrations, so running `db:migrate` on every deploy is a safe no-op when there's nothing new.

## Hardening once it's running

- `event-processor` is exposed publicly for simplicity at launch (its only real route, `POST /internal/events`, is already bearer-token authenticated). Once both apps are up, consider moving it to Fly's private networking (6PN/flycast, reachable at `<app-name>.internal` from `api`) and dropping its public `http_service` so the port isn't internet-facing at all.
- Scaling `api` to multiple Fly machines works today with no code changes (WebSocket state already lives in Redis). **Do not** scale `event-processor` beyond one instance yet — `WorkflowEngine`'s config/channel caches are process-local with no cross-instance invalidation; fix that first.

## Object storage (not yet wired up)

When the asset-storage feature is built, use `@aws-sdk/client-s3` pointed at a Cloudflare R2 bucket's S3-compatible endpoint (`https://<account-id>.r2.cloudflarestorage.com`) rather than the AWS SDK's default S3 endpoint. Because the wire protocol is identical, this is a drop-in swap to real AWS S3 later if ever needed — just the endpoint and credentials change, not the client code.
