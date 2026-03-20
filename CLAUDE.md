# multiplayer_base

Full-stack Nx monorepo — a base for multiplayer applications built incrementally via numbered steps in `setup.md`.

## Stack
- **Monorepo:** Nx 20.x with npm workspaces
- **Backend:** Node.js + Express + TypeScript (ts-node in dev, nodemon watch)
- **Frontend:** React 18 + React Router v6, bundled with esbuild
- **Database:** MongoDB + Mongoose
- **Cache / PubSub:** Redis + ioredis
- **Auth:** JWT (email + userId in payload) + bcryptjs + Google OAuth 2.0
- **WebSockets:** `ws` library — EventManager (client), UserEventManager (server)
- **Worker threads:** EventProcessorWorker runs in a separate thread; owns the full Redis-publish pipeline
- **Shared types:** `libs/shared-types/src/` — imported by both api and web via path alias `@multiplayer-base/shared-types`

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
npx nx serve api        # API dev server on :3000 (nodemon + ts-node)
npx nx serve web        # Web dev server on :4200 (esbuild watch)
npx nx build api        # Production build → dist/apps/api
npx nx build web        # Production build → dist/apps/web
npx nx test api         # Jest unit tests
npx nx test api-e2e     # Supertest integration tests (requires MongoDB)
npx nx e2e web-e2e      # WebdriverIO e2e tests (requires running servers)
```

## Starting / restarting servers
```bash
# Kill and restart API (nodemon does NOT watch libs/shared-types — restart manually after shared-types changes)
lsof -ti :3000 | xargs kill -9
npx nx serve api > /tmp/api.log 2>&1 &

# Web rebuilds automatically via esbuild watch — no restart needed for frontend changes
```

## Architecture

### Message flow
1. Client sends `WsClientMessage` (`auth` → `subscribe` → `channel-message`)
2. `UserEventManager` authenticates socket, injects `senderEmail` from JWT into inbound message
3. `EventProcessor` posts to worker thread (fire-and-forget)
4. `EventProcessorWorker` transforms inbound → outbound, looks up channel sockets in Redis, persists outbound message to MongoDB, publishes `DeliveryInstruction` to Redis pub/sub
5. All servers' `redisSub` receive the instruction and deliver frames to their local sockets

### Message types (`libs/shared-types/src/message.types.ts`)
- **Inbound** (client → server): `AddTextMessage`, `AddColorfulTextMessage`
- **Outbound** (server → client): `DisplayTextMessage`, `DisplayColorfulTextMessage`
- **Protocol envelopes**: `WsClientMessage`, `WsServerMessage`

### Document / Channel model
- `ChatDocument` (MongoDB) has a unique `currentChannelId` (UUID) — this is the WebSocket channel
- Messages are persisted as embedded `OutboundMessage[]` on the document
- Subscribing/unsubscribing updates Redis SETs: `channel:<uuid>` (socketIds) and `socket:<id>:channels`

### Dynamic component registries (frontend)
- `documentRegistry.ts` — maps document `type` → `React.lazy` component (e.g. `'chat'` → `ChatDocumentView`)
- `messageRegistry.ts` — maps message `type` → `React.lazy` component (e.g. `'display-text'` → `DisplayTextMessage`)

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

## Key conventions
- **Shared-types changes** require a manual API server restart (nodemon only watches `apps/api/src/`)
- **senderEmail** is injected server-side by `UserEventManager` — clients never set it
- **One-time OAuth codes**: 64-char hex, 60s TTL, single-use (stored in Redis)
- **React Strict Mode** double-invokes effects — use `useRef` guards for one-shot operations (see `OAuthCallbackPage`)
- **Dynamic imports**: always use `React.lazy` + `Suspense` for document and message components

## Step plan
Steps are defined in `setup.md`. Steps 1–16 are complete. Current step: **17**.
