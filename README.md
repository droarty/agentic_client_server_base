# Multiplayer Base

A full-stack monorepo built with Nx, React, Node.js/Express, and MongoDB.

## Stack

| Layer | Technology |
|---|---|
| Monorepo | Nx 20, npm workspaces |
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
npm install
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

```bash
curl -L https://downloads.mongodb.org/osx/mongosh-2.3.9-darwin-arm64.zip -o /tmp/mongosh.zip
unzip /tmp/mongosh.zip -d /tmp/mongosh
cp /tmp/mongosh/mongosh-2.3.9-darwin-arm64/bin/mongosh ~/bin/mongosh
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
