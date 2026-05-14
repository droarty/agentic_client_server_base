# Agentic Client/Server Base
🚧🚧🚧 **Note: this is still very much a WIP**

This project is a demo of what I think might be some best practices for an agentic client/server stack.  The agentic part infers AI infused, but it is more than that.  Agentic also means flexible workflows, it means many data types, and it means reuseable components.  It also means lots of asynchronous data flows.  This last part, in particular, reminds me of a multiplayer game, which this design lends itself to.

To accommodate all these aspects of an agentic client/server stack there are several architectural decisions that I have long wanted to try out.  So this demo app is where I will experiement with it:
- We start with the MERN stack as a great way to manage data types across the frontend and backend.
- We use a websocket and events as the primary way of communicating from client to server.
- We use an event bus to organize data moving through services within the client and within server and on to third party services.
- We make the server be the source of truth for most data.  The client may have smart components that maintain internal state, but any data that matters is coming from the server, even if it originates from the client.
  - ie. the user types in some data we want persisted, the client model is not updated directly until it makes the round trip to the server and back.
  - I wrestle with the fact that this could be limiting offline features but that is a task for another day.
  - I also believe that this event structure will ultimately lend itself a future attempt to build off line event queueing and short circuited model updates.
- And at the core of all of this is workflow configuration.   The primary means of building a new UI, data persistence, third party data processing is all through a json file.
  - new workflows, think SPA sized apps, can be configured by developers, non-developers, and AI tools.
  - This requires that all UI components, persistence layer modules and third party services respond to events.
  - On the client the configuration defines a document model, component props and eventnames, and data transforms triggered by those named events.
  - Likewise, on the server, the configuration defines the chain of data transforms and named callbacks sent to backend services.
- Side benefits to the event bus and configuration include:
  - it allows us to easily track and debug complicated workflows as we can read through logs of every step in the process
  - it allows us to replay events on the client for debugging purposes
  - it allows us to easily incorporate multi-user features in workflows. ie. two users interacting with the same document cause model updates from one user to be broadcast to the client of the other user.

This work is about 20% done at the moment, but the pieces are falling in place (May 2026).

### Try it out
What can you do with it?  At the moment, not much.  I have hard coded three configured workflows.  One to manage documents, one to open a silly chat that checks for inappropriate content, and one to view the logs of the other two workflows.

Soon I will have more frontend components and backend services that will allow users to create new workflows of their own design.

For now you could describe a simple new workflow to Claude and see what it does.  There is enough precedent that it will easily configure the thing for you and might offer to create new components as needed.

<hr>

Below, I am letting Claude take over the summary and instructions for using the app.

## Stack
A full-stack monorepo built with Nx, React, Node.js/Express, and MongoDB.

| Layer | Technology |
|---|---|
| Monorepo | Nx 20, pnpm workspaces |
| Frontend | React 18, React Router v6, ESBuild |
| Backend | Node.js, Express, ESBuild |
| Database | MongoDB 8, Mongoose |
| Auth | JWT, bcrypt |
| Unit/Integration Tests | Jest, Supertest |
| E2E Tests | WebdriverIO 8 |

## Project Structure

```
apps/
  api/          # Express REST API (port 3000)
  api-e2e/      # Jest + Supertest integration tests
  web/          # React frontend (port 4200)
  web-e2e/      # WebdriverIO e2e tests
libs/
  shared-types/ # Shared TypeScript interfaces
tools/
  web-dev-server.mjs  # ESBuild dev server for frontend
```

## Prerequisites

- Node.js 20+
- MongoDB (see setup below)

## Setup

```bash
pnpm install
cp .env.example .env
```

## MongoDB

MongoDB binaries are not bundled. On macOS without Homebrew CLT, download and run manually:

```bash
# Download MongoDB 8.x arm64 (Apple Silicon)
curl -L https://fastdl.mongodb.org/osx/mongodb-macos-arm64-8.0.6.tgz -o /tmp/mongodb.tgz
tar -xzf /tmp/mongodb.tgz -C /tmp/
mkdir -p ~/bin && cp /tmp/mongodb-macos-arm64-8.0.6/bin/mongod ~/bin/mongod
chmod +x ~/bin/mongod

# Create data and log directories
mkdir -p ~/data/db ~/data/log
```

Once Homebrew CLT is updated, you can install the managed version instead:

```bash
brew tap mongodb/brew
brew install mongodb-community
```

## Starting the Servers

### 1. Start MongoDB

**Manual binary:**
```bash
~/bin/mongod --dbpath ~/data/db --logpath ~/data/log/mongod.log --fork --port 27017
```

**Homebrew (after install):**
```bash
brew services start mongodb/brew/mongodb-community
```

### 2. Start the API (port 3000)

```bash
npx nx serve api
```

### 3. Start the Web frontend (port 4200)

```bash
npx nx serve web
```

### Start everything at once

Open three terminal tabs and run each command above, or run them in the background:

```bash
~/bin/mongod --dbpath ~/data/db --logpath ~/data/log/mongod.log --fork --port 27017
npx nx serve api &
npx nx serve web &
```

## Stopping the Servers

### Stop MongoDB

**Manual binary:**
```bash
~/bin/mongod --dbpath ~/data/db --shutdown
```

**Homebrew:**
```bash
brew services stop mongodb/brew/mongodb-community
```

### Stop API and Web dev servers

If running in the foreground: `Ctrl+C` in each terminal.

If running in the background:
```bash
pkill -f "nodemon"
pkill -f "web-dev-server"
pkill -f "ts-node.*main.ts"
```

## Building for Production

```bash
npx nx build api    # outputs to dist/apps/api
npx nx build web    # outputs to dist/apps/web
# or both at once:
npx nx run-many --target=build --all
```

## Running Tests

```bash
# API integration tests (no MongoDB required — uses in-memory server)
npx nx test api-e2e

# Frontend unit tests
npx nx test web

# WebdriverIO e2e tests (requires both servers running)
npx nx e2e web-e2e
```

## Accessing MongoDB Directly

### Install mongosh (MongoDB Shell)

`mongosh` is not included in the manual binary download. Install it separately:

Download the latest `.zip` for **macOS arm64** from the [mongosh releases page](https://github.com/mongodb-js/mongosh/releases/latest), then:

```bash
unzip ~/Downloads/mongosh-*-darwin-arm64.zip -d /tmp/mongosh
cp /tmp/mongosh/mongosh-*/bin/mongosh ~/bin/mongosh
chmod +x ~/bin/mongosh
```

**Homebrew (after CLT update):**
```bash
brew install mongosh
```

### Connect

```bash
~/bin/mongosh mongodb://localhost:27017/multiplayer_base
```

### Common Commands

```js
// List all users
db.users.find().pretty()

// Find a specific user
db.users.findOne({ email: "you@example.com" })

// Promote a user to admin
db.users.updateOne(
  { email: "you@example.com" },
  { $set: { roles: ["user", "admin"] } }
)

// Give a user all roles
db.users.updateOne(
  { email: "you@example.com" },
  { $set: { roles: ["user", "author", "admin"] } }
)

// List all collections
show collections

// Exit
exit
```

### GUI Alternative

**MongoDB Compass** (official, free) — download from [mongodb.com/products/compass](https://www.mongodb.com/products/compass).
Connect with: `mongodb://localhost:27017`

## UI Components (shadcn/ui)

The frontend uses [shadcn/ui](https://ui.shadcn.com) — components are copied directly into `apps/web/src/components/ui/` and are fully owned by this repo. Tailwind CSS powers the styling.

### Adding a component

```bash
npx shadcn@latest add <component>
```

Examples:

```bash
npx shadcn@latest add dialog
npx shadcn@latest add input
npx shadcn@latest add dropdown-menu
```

Components land in `apps/web/src/components/ui/`. Each component is plain TypeScript/React — edit them freely.

### Importing components

```tsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
```

The `@/` alias resolves to `apps/web/src/`.

### The `cn()` utility

Use `cn()` to merge Tailwind classes safely (handles conflicts via `tailwind-merge`):

```tsx
import { cn } from '@/lib/utils';

<div className={cn('p-4 rounded', isActive && 'bg-primary text-primary-foreground')} />
```

### Adding new Radix UI primitives manually

Some shadcn components depend on `@radix-ui/react-*` packages not yet installed. Install them at the workspace root:

```bash
pnpm add -w @radix-ui/react-dialog
pnpm add -w @radix-ui/react-dropdown-menu
```

### CSS theme tokens

Colors are defined as CSS variables in `apps/web/src/app/styles/global.css` and mapped in `apps/web/tailwind.config.js`. To change the color scheme, update the `--primary`, `--secondary`, etc. values in the `:root` block. Dark mode variables live in the `.dark` block.

### Configuration

| File | Purpose |
|------|---------|
| `components.json` | shadcn CLI config (component output path, aliases, Tailwind config) |
| `apps/web/tailwind.config.js` | Tailwind config with shadcn color tokens |
| `apps/web/src/app/styles/global.css` | CSS variable tokens + Tailwind directives |
| `apps/web/src/lib/utils.ts` | `cn()` utility |
| `apps/web/src/components/ui/` | All shadcn component source files |

## API Endpoints

All routes prefixed with `/api`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `POST` | `/api/auth/register` | — | Register (email, password, confirmPassword) |
| `POST` | `/api/auth/login` | — | Login (email, password) |
| `GET` | `/api/users` | JWT | List all users |
| `GET` | `/api/users/me` | JWT | Get current user |
| `PATCH` | `/api/users/me` | JWT | Update email or password |
| `PATCH` | `/api/users/:id/roles` | JWT + admin | Set a user's roles |

## Environment Variables

See `.env.example` for all options. Key variables:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/multiplayer_base
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:4200
```
