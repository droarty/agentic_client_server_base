# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# agentic_client_server_base

Full-stack Nx monorepo — a base for agentic client-server applications built incrementally via numbered steps in `setup.md`.

## Stack
- **Monorepo:** Nx 20.x with pnpm workspaces
- **Backend:** Node.js + Express + TypeScript (ts-node in dev, nodemon watch)
- **Frontend:** React 19 + React Router v6, bundled with esbuild
- **Database:** PostgreSQL + Drizzle ORM (`node-postgres` driver)
- **Cache / PubSub:** Redis + ioredis
- **Auth:** JWT (email + userId in payload) + bcryptjs + Google OAuth 2.0
- **WebSockets:** `ws` library — EventManager (client), UserEventManager (server, in the `api` gateway)
- **Event processing:** `apps/event-processor/` — a separate long-running service that owns `WorkflowEngine`, all Postgres queries/persistence, and the Anthropic API calls; the gateway hands it inbound messages over HTTP (`POST /internal/events`, bearer-token authenticated), and it replies asynchronously via Redis pub/sub
- **Shared types:** `libs/shared-types/src/` — imported by api, event-processor, and web via path alias `@agentic-client-server-base/shared-types`
- **Also shared:** `libs/access-control/` (permission levels, used by both `api` and `event-processor`), `libs/workflow-configs/` (the JSON workflow definitions, read by both), `libs/db-schema/` (shared Drizzle schema + migrations, used by both)

## Projects
| Name | Path | Purpose |
|------|------|---------|
| `api` | `apps/api/` | Express gateway: REST routes + WebSocket connection handling |
| `event-processor` | `apps/event-processor/` | Workflow engine, persistence, AI calls — receives events from `api` over HTTP |
| `web` | `apps/web/` | React SPA |
| `shared-types` | `libs/shared-types/` | Shared TypeScript interfaces |
| `access-control` | `libs/access-control/` | Access-level types + cache, shared by `api` and `event-processor` |
| `workflow-configs` | `libs/workflow-configs/` | JSON workflow definitions, shared by `api` and `event-processor` |
| `db-schema` | `libs/db-schema/` | Shared Drizzle schema, migrations, and Postgres test helpers (`embedded-postgres`), used by both `api` and `event-processor` |
| `api-e2e` | `apps/api-e2e/` | Jest + supertest integration tests |
| `event-processor-e2e` | `apps/event-processor-e2e/` | Jest integration tests for the workflow engine |
| `web-e2e` | `apps/web-e2e/` | WebdriverIO e2e tests |

## Key commands
```bash
pnpm install                    # install / update dependencies (npm install conflicts with pnpm layout)
npx nx serve api                # gateway dev server on :3000 (nodemon + ts-node)
npx nx serve event-processor    # event-processor dev server on :3001 (nodemon + ts-node)
npx nx serve web                # Web dev server on :4200 (esbuild watch)
npx nx build api                # Production build → dist/apps/api
npx nx build event-processor    # Production build → dist/apps/event-processor
npx nx build web                # Production build → dist/apps/web
npx nx test api                 # Jest unit tests
npx nx test event-processor     # Jest unit tests
npx nx test api-e2e             # Supertest integration tests (spins up embedded-postgres)
npx nx test event-processor-e2e # Workflow engine integration tests (spins up embedded-postgres)
npx nx e2e web-e2e              # WebdriverIO e2e tests (requires running servers)
```

## Starting / restarting servers

Always use the pnpm scripts — they kill the old process, start the new one, and verify it is responding before returning:

```bash
pnpm run restart:api         # restart gateway on :3000 (waits up to 30s for HTTP response)
pnpm run restart:processor   # restart event-processor on :3001 (waits up to 30s for HTTP response)
pnpm run restart:web         # restart web on :4200 (waits up to 20s for HTTP response)
pnpm run restart:all         # restart all three in parallel, verifies all
```

**These scripts are pre-approved — call them without asking the user for confirmation**, both when the user requests a restart and when one is needed (e.g. after shared-types changes, after gateway or event-processor code changes). Never run the underlying `lsof`/`kill`/`npx nx serve` commands directly.

## Architecture

### Message flow
1. Client sends `WsClientMessage` (`auth` → `subscribe` → `channel-message`)
2. `UserEventManager` (gateway, `apps/api`) authenticates socket, injects `senderEmail` from JWT into inbound message
3. Gateway's `processor.client.ts` posts the message to `event-processor`'s `POST /internal/events` (bearer-token authenticated, fire-and-forget — the gateway does not await the workflow's completion)
4. `event-processor`'s `handleInboundEvent` runs `WorkflowEngine`, which transforms inbound → outbound, looks up channel sockets in Redis, persists outbound message to Postgres, and publishes a `DeliveryInstruction` to Redis pub/sub
5. All gateway instances' `redisSub` receive the instruction and deliver frames to their local sockets

An AI-triggered follow-up (the `ai` step) re-enters `handleInboundEvent` via a direct in-process function call inside `event-processor` once the Anthropic response resolves — not a second HTTP round-trip back through the gateway.

### Key message types (`libs/shared-types/src/message.types.ts`)
- **`initialize-client`** (server → client): carries `layoutConfig` (component tree for a view) and/or `initialState` (document state seed)
- **`update-state`** (server → client): carries `ActionItem[]` mutations applied to client-side `DocState`
- **`WsClientMessage`**: auth, subscribe, channel-message envelopes sent by the browser
- **`WsServerMessage`**: auth_success / auth_error / channel-message envelopes sent by the server

### Document / Channel model
- Each artifact (`artifacts` table) is joined to its WebSocket channel via a separate `channels` row (`channels.artifact_id` FK, `ON DELETE CASCADE`); the channel's public `channel_id` (UUID) is what the client subscribes to
- State is stored on the artifact as JSONB `state` (persisted via `$state.*` paths) and kept ephemerally as `temp` (`$temp.*` paths, never written to DB)
- Subscribing/unsubscribing updates Redis SETs: `channel:<uuid>` (socketIds) and `socket:<id>:channels`

### Workflow engine
Artifact behavior is fully driven by JSON workflow configs in `libs/workflow-configs/src/workflows/` — one file per artifact type (`user-dashboard.json`, `workflow-builder.json`, `log-review.json`). Both `api` and `event-processor` read this shared directory (resolved via `WORKFLOW_CONFIG_DIR` from `@agentic-client-server-base/workflow-configs`). Custom/seeded configs not on the filesystem fall back to the Postgres `workflow_configs` table.

Each config has:
- `initialState` — seeded into Postgres when the artifact is created
- `handlers` map — keyed by message type; each handler is a sequence of steps

Step route values:
| Route | Effect |
|-------|--------|
| `client` | Send outbound message to all channel subscribers |
| `database` | Persist `update-state` actions to Postgres (JSONB `state` column, via `libs/db-schema`'s `jsonb_array_*` SQL functions for array-mutating action types) |
| `database-query` | Run a named query, recursively invoke another handler with the result |
| `ai` | Send text to Claude for moderation; response type triggers another handler |

`WorkflowEngine` (`apps/event-processor/src/app/WorkflowEngine.ts`) executes handlers. `apps/event-processor/src/main.ts` wires up all queries, persistence, and Redis publishing, and exposes `handleInboundEvent` — the single entry point invoked both by `POST /internal/events` and by the AI re-entry path.

**Transforms** use simple dot-path references: `$message.*`, `$state.*`, `$temp.*`, `$document.*`. `$state.*` paths are persisted; `$temp.*` are ephemeral.

### Artifact loading (client)
When `LayoutDocumentView` mounts on a channel it sends **two independent messages**:

1. **`initializeState`** — sent once per channel; triggers `initializeState` handler in the workflow JSON, which fetches the document and responds with `initialize-client` carrying `initialState`
2. **view handler** (e.g. `defaultView`, `userManagementView`) — sent once per channel+view; triggers the corresponding handler, which responds with `initialize-client` carrying `layoutConfig`

`documentModelStore.ts` gates rendering until both `stateInitialized` and a layout for the requested viewHandler have been received. `update-state` messages that arrive before `initialize-client` (state) are queued in `pendingUpdates` and replayed in order once state is initialized.

### Layout component registry
`apps/web/src/app/registry/layoutRegistry.ts` maps `componentType` strings from workflow JSON `layoutConfig` nodes to `React.lazy` components. `LayoutRenderer` (`apps/web/src/components/LayoutRenderer.tsx`) walks the layout tree, resolves `$state.*` / `$temp.*` prop references against live `DocState`, and renders the component tree.

## API routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Register with email + password |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/auth/google` | No | Start Google OAuth flow |
| GET | `/api/auth/google/callback` | No | Google OAuth callback |
| POST | `/api/auth/exchange` | No | Exchange one-time code for JWT |
| GET | `/api/users` | JWT | List all users |
| GET | `/api/users/me` | JWT | Current user profile |
| PATCH | `/api/users/me` | JWT | Update email / password |
| PATCH | `/api/users/:id/roles` | JWT | Update user roles |
| GET | `/api/documents` | JWT | List chat documents |
| POST | `/api/documents` | JWT | Create chat document |
| GET | `/api/documents/:id` | JWT | Get document (includes messages) |

## Workflow conventions
- **Plan mode**: When finished planning, show the plan contents, then call ExitPlanMode. Once the user approves, the very first actions before writing any code must be: (1) create a GitHub issue, (2) create and checkout a feature branch (`issue-N-short-description`). Never begin implementation without doing these two steps first.
- **Branch rule**: ALL code changes must be made on a feature branch. Never commit or make edits directly on main.
- **GitHub issues**: Always paste the entire plan into the issue body.
- **PR merges**: Never merge a PR into main. Only the user can merge via GitHub.

## Key conventions
- **Shared-types / access-control / workflow-configs / db-schema changes** require restarting both `api` and `event-processor` (nodemon only watches each app's own `src/`) — run `pnpm run restart:all` automatically, no confirmation needed
- **`libs/db-schema` schema changes** need a migration: `pnpm run db:generate` (writes a new file under `libs/db-schema/drizzle/`) then `pnpm run db:migrate` (applies it to the local Postgres) — migrations are never applied automatically on app boot
- **`INTERNAL_SERVICE_TOKEN`** must be set to the same value in both `api` and `event-processor`'s env — it authenticates the gateway's calls to `POST /internal/events`. Empty in production is refused at boot.
- **senderEmail** is injected server-side by `UserEventManager` — clients never set it
- **One-time OAuth codes**: 64-char hex, 60s TTL, single-use (stored in Redis)
- **React 19 ref pattern**: all `components/ui/` components accept `ref` as a regular prop — no `forwardRef`. For Radix UI wrappers use `ComponentPropsWithRef<T>` (includes `ref`); for HTML wrappers add `ref?: React.Ref<Element>` to the props interface
- **Dynamic imports**: always use `React.lazy` + `Suspense` for layout components registered in `layoutRegistry.ts`

## Step plan
Steps are defined in `setup.md`. Steps 1–17+ are complete.
