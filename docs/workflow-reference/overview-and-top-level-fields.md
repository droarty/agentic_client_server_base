# Overview and Top-Level Fields

## Overview

A workflow config is a JSON file that defines how an artifact type behaves when it receives WebSocket messages. The engine matches inbound `message.type` to a handler by name, then executes the handler's steps in order.

### Where configs live

| Location | Purpose |
|---|---|
| `apps/api/src/app/config/workflows/<name>.json` | **System** configs — shipped with the codebase; always loaded first |
| MongoDB `workflowconfigs` collection | **Custom / seed** configs — created by `scripts/seed-workflow-configs.js` or the API |

**Precedence:** filesystem is checked first. If no filesystem config matches the artifact's `type`, the engine falls back to the MongoDB `workflowconfigs` collection. A filesystem config **cannot** be overridden by a DB config with the same name.

### System types (reserved)

`user-dashboard` and `log-review` are system-only types. They are excluded from `get-available-types` and `get-user-documents` query results so users cannot accidentally create documents of these types.

### Artifact and channel

Each artifact document in MongoDB has a `currentChannelId` (UUID). When a browser connects and subscribes to that channel, the engine looks up the artifact's `type`, loads the matching workflow config, and routes every inbound message through it.

## Top-Level Fields

```json
{
  "name": "my-workflow",
  "displayName": "My Workflow",
  "version": "1.0.0",
  "initialState": { ... },
  "handlers": { ... }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Must match the artifact `type` field and the filename (without `.json`). Used as the lookup key. |
| `displayName` | string | no | Human-readable name shown in the UI. Defaults to `name` if omitted. Used by `get-available-types`. |
| `version` | string | no | Semantic version string. Defaults to `"1.0.0"`. Informational only. |
| `initialState` | object | yes | The default state object written to a new artifact's `state` field when it is created via `create-document`. Can contain arbitrary nested fields. |
| `handlers` | object | yes | Map of handler name → handler definition. Keys are matched against `message.type`. |
