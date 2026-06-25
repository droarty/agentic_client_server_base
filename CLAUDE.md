# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# agentic_client_server_base

Full-stack Nx monorepo — a base for agentic client-server applications built incrementally via numbered steps in `setup.md`.

## Stack
- **Monorepo:** Nx 20.x with pnpm workspaces
- **Backend:** Node.js + Express + TypeScript (ts-node in dev, nodemon watch)
- **Frontend:** React 19 + React Router v6, bundled with esbuild
- **Database:** MongoDB + Mongoose
- **Cache / PubSub:** Redis + ioredis
- **Auth:** JWT (email + userId in payload) + bcryptjs + Google OAuth 2.0
- **WebSockets:** `ws` library — EventManager (client), UserEventManager (server)
- **Worker threads:** EventProcessorWorker runs in a separate thread; owns the full Redis-publish pipeline
- **Shared types:** `libs/shared-types/src/` — imported by both api and web via path alias `@agentic-client-server-base/shared-types`

## Projects
| Name | Path | Purpose |
|------|------|---------|
| `api` | `apps/api/` | Express backend + WebSocket server |
| `web` | `apps/web/` | React SPA |
| `shared-types` | `libs/shared-types/` | Shared TypeScript interfaces |
| `api-e2e` | `apps/api-e2e/` | Jest + supertest integration tests |
| `web-e2e` | `apps/web-e2e/` | WebdriverIO e2e tests |

## Key commands
```bash
pnpm install           # install / update dependencies (npm install conflicts with pnpm layout)
npx nx serve api       # API dev server on :3000 (nodemon + ts-node)
npx nx serve web       # Web dev server on :4200 (esbuild watch)
npx nx build api       # Production build → dist/apps/api
npx nx build web       # Production build → dist/apps/web
npx nx test api        # Jest unit tests
npx nx test api-e2e    # Supertest integration tests (requires MongoDB)
npx nx e2e web-e2e     # WebdriverIO e2e tests (requires running servers)
```

## Starting / restarting servers

Always use the pnpm scripts — they kill the old process, start the new one, and verify it is responding before returning:

```bash
pnpm run restart:api    # restart API on :3000 (waits up to 30s for HTTP response)
pnpm run restart:web    # restart web on :4200 (waits up to 20s for HTTP response)
pnpm run restart:both   # restart both in parallel, verifies both
```

**These scripts are pre-approved — call them without asking the user for confirmation**, both when the user requests a restart and when one is needed (e.g. after shared-types changes, after API code changes). Never run the underlying `lsof`/`kill`/`npx nx serve` commands directly.

## Architecture

### Message flow
1. Client sends `WsClientMessage` (`auth` → `subscribe` → `channel-message`)
2. `UserEventManager` authenticates socket, injects `senderEmail` from JWT into inbound message
3. `EventProcessor` posts to worker thread (fire-and-forget)
4. `EventProcessorWorker` transforms inbound → outbound, looks up channel sockets in Redis, persists outbound message to MongoDB, publishes `DeliveryInstruction` to Redis pub/sub
5. All servers' `redisSub` receive the instruction and deliver frames to their local sockets

### Key message types (`libs/shared-types/src/message.types.ts`)
- **`initialize-client`** (server → client): carries `layoutConfig` (component tree for a view) and/or `initialState` (document state seed)
- **`update-state`** (server → client): carries `ActionItem[]` mutations applied to client-side `DocState`
- **`WsClientMessage`**: auth, subscribe, channel-message envelopes sent by the browser
- **`WsServerMessage`**: auth_success / auth_error / channel-message envelopes sent by the server

### Document / Channel model
- Each artifact (MongoDB) has a unique `currentChannelId` (UUID) — this is the WebSocket channel
- State is stored on the artifact as `state` (persisted via `$state.*` paths) and kept ephemerally as `temp` (`$temp.*` paths, never written to DB)
- Subscribing/unsubscribing updates Redis SETs: `channel:<uuid>` (socketIds) and `socket:<id>:channels`

### Workflow engine
Artifact behavior is fully driven by JSON workflow configs in `apps/api/src/app/config/workflows/` — one file per artifact type (`user-dashboard.json`, `configged-chat.json`, `log-review.json`).

Each config has:
- `initialState` — seeded into MongoDB when the artifact is created
- `handlers` map — keyed by message type; each handler is a sequence of steps

Step route values:
| Route | Effect |
|-------|--------|
| `client` | Send outbound message to all channel subscribers |
| `database` | Persist `update-state` actions to MongoDB |
| `database-query` | Run a named query, recursively invoke another handler with the result |
| `ai` | Send text to Claude for moderation; response type triggers another handler |

`WorkflowEngine` (`apps/api/src/app/websocket/WorkflowEngine.ts`) executes handlers. `EventProcessorWorker` (`apps/api/src/app/websocket/EventProcessorWorker.ts`) owns all queries, persistence, and Redis publishing.

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
- **Shared-types changes** require an API server restart (nodemon only watches `apps/api/src/`) — run `pnpm run restart:api` automatically, no confirmation needed
- **senderEmail** is injected server-side by `UserEventManager` — clients never set it
- **One-time OAuth codes**: 64-char hex, 60s TTL, single-use (stored in Redis)
- **React 19 ref pattern**: all `components/ui/` components accept `ref` as a regular prop — no `forwardRef`. For Radix UI wrappers use `ComponentPropsWithRef<T>` (includes `ref`); for HTML wrappers add `ref?: React.Ref<Element>` to the props interface
- **Dynamic imports**: always use `React.lazy` + `Suspense` for layout components registered in `layoutRegistry.ts`

## Step plan
Steps are defined in `setup.md`. Steps 1–17+ are complete.
