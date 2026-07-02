# Workflow Configuration Reference

This document is a complete reference for writing workflow JSON configuration files in this project. It covers every field, every option, every constraint, and every named value the engine understands. Use it as context when generating a new workflow config.

---

## Table of Contents

1. [Overview](#overview)
2. [Top-Level Fields](#top-level-fields)
3. [Handler Definition](#handler-definition)
4. [Access Control](#access-control)
5. [Steps and Routes](#steps-and-routes)
6. [Transform Syntax and Path Substitution](#transform-syntax-and-path-substitution)
7. [Action Types (update-state)](#action-types-update-state)
8. [Named Queries (database-query)](#named-queries-database-query)
9. [AI Step Configuration](#ai-step-configuration)
10. [initialize-state and initialize-view Messages](#initialize-state-and-initialize-view-messages)
11. [Layout Node Structure](#layout-node-structure)
12. [Registered Component Types](#registered-component-types)
13. [Emit System](#emit-system)
14. [State Path Namespaces](#state-path-namespaces)
15. [Standard Handler Patterns](#standard-handler-patterns)
16. [ChatMessage Object Format](#chatmessage-object-format)
17. [Complete Annotated Example](#complete-annotated-example)

---

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

---

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

---

## Handler Definition

```json
"handlerName": {
  "condition": "$message.text",
  "steps": [ ... ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `condition` | string | no | Evaluated before any steps run. If falsy, the entire handler is skipped. Supports all value syntaxes (`$`, `@`, `~{}`). |
| `requiredAccess` | `"read" \| "write" \| "admin"` | no | Minimum access level the caller must hold. If the caller's effective level is lower, the handler is skipped and an error is logged. Omit to allow any authenticated user. See [Access Control](#access-control). |
| `steps` | array | yes | Ordered list of step definitions executed sequentially. |

### Condition examples

```json
"condition": "$message.text"                       // truthy if message.text is non-empty
"condition": "$message.documentId"                 // truthy if message.documentId exists
"condition": "~{ $count(message.items) > 0 }"     // JSONata: truthy if items array is non-empty
```

### requiredAccess example

```json
"save-note": {
  "requiredAccess": "write",
  "steps": [
    {
      "route": ["client", "database"],
      "transform": {
        "clientMessageType": "update-state",
        "actions": [
          { "actionType": "update", "path": "$state.note", "value": "$message.text" }
        ]
      }
    }
  ]
}
```

---

## Access Control

Every WebSocket message is evaluated against the caller's effective access level for the artifact. The engine computes the level once per message (cached in-process for 10 minutes) and passes it through `WorkflowContext`. Handlers can declare a `requiredAccess` floor; the engine enforces it before running any steps.

### Access levels

Four levels in ascending order:

| Level | Rank | Meaning |
|-------|------|---------|
| `none` | 0 | No access — message is not processed |
| `read` | 1 | Can read state and receive view layouts |
| `write` | 2 | Can mutate state and persist to the database |
| `admin` | 3 | Full access, including permission management |

### How effective access is computed

For each message the engine resolves the caller's access level in this order — the **first match wins** for the owner shortcut, then the **maximum** of user ACL and group permissions:

1. **Owner shortcut** — if `permissionManagerMode` is `'owner'` and the caller is the artifact's `userId`, effective access is `admin` immediately.
2. **User-level ACL** (`userPermissions[]`) — explicit per-user grants stored on the artifact. Each entry is `{ userId, access }`.
3. **Group-based permissions** (`permissions[]`) — grants tied to groups. The engine resolves all groups the caller belongs to (including ancestor groups via the group hierarchy) and takes the highest matching access level.
4. **Effective access** = `max(userACLLevel, groupLevel)`.

### permissionManagerMode

Every artifact has a `permissionManagerMode` that determines who can call the permission management endpoints:

| Mode | Set when | Who can manage permissions |
|------|----------|---------------------------|
| `'owner'` | User creates a document for themselves (no `targetUserId`) | Only the artifact's `userId` (the creator) |
| `'group_admin'` | Group admin creates a document for a target user (requires `groupId` + `targetUserId`) | Any member with `admin` or `owner` role in the artifact's owning group |

The mode is set at creation time and cannot be changed. In `'owner'` mode the creator is always implicitly `admin`; in `'group_admin'` mode the creator is not automatically an admin — access flows through group membership.

### REST endpoints for managing user-level ACL

These endpoints let an authorized caller grant or revoke per-user access on a specific artifact. All require that `canManagePermissions` passes for the caller (i.e. the caller satisfies the `permissionManagerMode` rules above).

| Method | Path | Body | Effect |
|--------|------|------|--------|
| `PATCH` | `/api/documents/:id/user-permissions` | `{ userId, access: "read" \| "write" \| "admin" }` | Create or update the named user's access on this artifact |
| `DELETE` | `/api/documents/:id/user-permissions/:userId` | — | Remove the named user's explicit ACL entry |

**Escalation guard:** a caller cannot grant a level higher than their own effective access. For example, a `write`-level caller cannot grant `admin` to another user.

---

## Steps and Routes

Each step is an object with a `route` field plus route-specific fields.

```json
{
  "route": "client" | "database" | ["client", "database"] | "database-query" | "ai",
  "transform": { ... },   // for client / database routes
  "query":     { ... },   // for database-query route
  "ai":        { ... }    // for ai route
}
```

### `"client"` — send message to all subscribers

Publishes an outbound message to every WebSocket socket subscribed to the channel. The message is packed with msgpackr and delivered via Redis pub/sub.

Required: a `transform` object. The `clientMessageType` key is renamed to `type` in the outbound frame.

```json
{
  "route": "client",
  "transform": {
    "clientMessageType": "initialize-view",
    "viewHandler": "defaultView",
    "layoutConfig": [ ... ]
  }
}
```

### `"database"` — persist state to MongoDB

Writes an `update-state` message's `actions` to the artifact document in the `artifacts` collection. Only actions with `path` starting with `$state.` are persisted; `$temp.*` paths are silently skipped.

Requires `clientMessageType` to be `"update-state"` and an `actions` array. Usually combined with `"client"`.

```json
{
  "route": "database",
  "transform": {
    "clientMessageType": "update-state",
    "actions": [ { "actionType": "update", "path": "$state.title", "value": "$message.text" } ]
  }
}
```

### `["client", "database"]` — send and persist simultaneously

The most common combination. The same `update-state` message is sent to the client **and** persisted to MongoDB in parallel.

```json
{
  "route": ["client", "database"],
  "transform": {
    "clientMessageType": "update-state",
    "actions": [ ... ]
  }
}
```

### `"database-query"` — run a named query, invoke next handler

Executes a named query against MongoDB, then recursively invokes the handler named by `responseType` with the query result merged into the message context. Blocks until the query completes. The query result is spread into a new message:

```
{ type: responseType, channel, timestamp, ...queryResult }
```

```json
{
  "route": "database-query",
  "query": {
    "name": "get-document",
    "responseType": "initialize-state-document"
  }
}
```

See [Named Queries](#named-queries-database-query) for all available query names and their return shapes.

### `"ai"` — send to AI service (fire-and-forget)

Sends the current message's `text` field to the Anthropic API via AiService. Returns immediately — the AI response arrives later as a new inbound message whose `type` is the value of the `type` field in the AI's JSON response. That response type must match a handler name in the config.

```json
{
  "route": "ai",
  "ai": {
    "model": "claude-haiku-4-5-20251001",
    "maxTokens": 64,
    "systemPrompt": "...",
    "responseTypes": ["valid-text", "inappropriate-text"]
  }
}
```

See [AI Step Configuration](#ai-step-configuration) for full details.

---

## Transform Syntax and Path Substitution

The `transform` object is a template that the engine resolves before dispatching the outbound message. String values use one of three sigils to declare where and how they are resolved:

### Sigil reference

| Sigil | Example | Resolved by | When |
|---|---|---|---|
| `$message.x` | `"$message.text"` | Server (WorkflowEngine) | At step execution — substituted with live value |
| `$user.x` | `"$user.email"` | Server (WorkflowEngine) | At step execution — substituted with live value |
| `$uuid` | `"$uuid"` | Server (WorkflowEngine) | At step execution — generates a new UUID v4 |
| `~{ expr }` | `"~{ message.items[0].id }"` | Server (JSONata eval) | At step execution — full JSONata expression |
| `@state.x` | `"@state.chatMessages"` | Client (LayoutRenderer) | At render time — use only in `layoutConfig` props |
| `@temp.x` | `"@temp.documentList"` | Client (LayoutRenderer) | At render time — use only in `layoutConfig` props |
| `@item.x` | `"@item.name"` | Client (LayoutRenderer, forEach) | At render time — current forEach iteration element |
| Any other string | `"hello"` | Not resolved | Literal value passed through unchanged |

**Rule:** `$` and `~{}` are for server-side resolution in `transform` values, `condition`, and `action.value` fields. `@` is for client-side prop bindings in `layoutConfig` nodes. Never use `@state.*` or `@temp.*` in action `value` fields — they will be stored as literal strings.

### `~{ expr }` — JSONata expressions

Wrap a [JSONata](https://jsonata.org) expression in `~{` and `}` to evaluate it server-side against the context object `{ message, user, state }`. Use for filtering, arithmetic, string operations, or conditional logic that dot-path substitution cannot express. Falls back to `undefined` on evaluation error.

```json
"value": "~{ message.items[count > 0].id }"
"condition": "~{ $count(state.openDocs) < 10 }"
"value": "~{ $uppercase(message.text) }"
```

> **Pitfall:** Do not use `$message`, `$state`, or `$user` inside `~{}` expressions. Inside JSONata, `$` refers to the entire context root — `$message` resolves to `undefined`. Use bare `message`, `state`, and `user` instead.
>
> ```json
> // WRONG — $message is undefined inside ~{}
> "value": "~{ $message.groups.{ 'id': _id } }"
>
> // CORRECT
> "value": "~{ message.groups.{ 'id': _id } }"
> ```

### Arrays and objects in transforms

Arrays are resolved element-by-element. Objects are resolved key-by-key recursively. Nested structures are fully traversed:

```json
"value": {
  "messageType": "display-text",
  "text": "$message.text",
  "authorEmail": "$message.senderEmail"
}
```

### `clientMessageType` special key

In any `transform` object, the key `clientMessageType` is renamed to `type` in the final outbound message. This is the message discriminator that the client uses to route the message.

Valid values for `clientMessageType`:
- `"initialize-state"` — seeds initial document state into the client store
- `"initialize-view"` — delivers a layout tree for a named view
- `"update-state"` — applies mutations to client-side DocState

---

## Action Types (update-state)

Actions appear in the `actions` array of an `update-state` message. Each action mutates one path in the client's DocState and (when route includes `"database"`) also in MongoDB.

**Path rules for `action.path`:**
- `"$state.xxx"` — persisted to MongoDB. The `$state.` prefix is stripped to derive the MongoDB dot-path. Client state at `DocState.state.xxx` is updated.
- `"$temp.xxx"` — **not** persisted. Persistor skips these. Client state at `DocState.temp.xxx` is updated ephemerally.

### `update` — set a field

Sets the field at `path` to `value`. Equivalent to `$set`.

```json
{ "actionType": "update", "path": "$state.title", "value": "$message.text" }
{ "actionType": "update", "path": "$temp.isLoading", "value": false }
{ "actionType": "update", "path": "$state.activeDocId", "value": "$message.document._id" }
```

### `merge` — merge object fields

Merges the keys of `value` (an object) into the object at `path`. Each key-value pair is written with `$set` using dot notation.

```json
{ "actionType": "merge", "path": "$state.config", "value": { "color": "blue", "count": 3 } }
```

### `append` — add to end of array

Appends `value` (a single item or array of items) to the end of the array at `path`. Uses MongoDB `$push` with `$each`.

```json
{ "actionType": "append", "path": "$state.chatMessages", "value": { "messageType": "display-text", "text": "$message.text" } }
{ "actionType": "append", "path": "$state.items", "value": ["$message.item1", "$message.item2"] }
```

### `prepend` — add to start of array

Inserts `value` (single item or array) at position 0 of the array at `path`. Uses MongoDB `$push` with `$position: 0`.

```json
{ "actionType": "prepend", "path": "$state.notifications", "value": { "text": "New message" } }
```

### `upsert` — update-or-append by key

Finds the array element at `path` where all fields named in `keys` match the corresponding fields in `value`. If found, replaces that element; if not found, appends. `keys` must be a non-empty array.

```json
{
  "actionType": "upsert",
  "path": "$state.openDocs",
  "value": "$message.document",
  "keys": ["_id"]
}
```

Multi-key example:
```json
{ "actionType": "upsert", "path": "$state.items", "value": { "userId": "u1", "role": "admin", "name": "Alice" }, "keys": ["userId", "role"] }
```

### `remove` — remove array element(s) by key

Removes all elements from the array at `path` where all fields named in `keys` match the corresponding fields in `value`. Uses MongoDB `$pull`.

```json
{
  "actionType": "remove",
  "path": "$state.openDocs",
  "value": "$message",
  "keys": ["_id"]
}
```

### `update-in` — update a nested field within an array element

Finds the first element in the array at `path` where `findKey === findValue`, then sets `subPath` on that element to `value`. Uses MongoDB `arrayFilters` with a positional operator.

```json
{
  "actionType": "update-in",
  "path": "$state.chatMessages",
  "findKey": "id",
  "findValue": "$message.formId",
  "subPath": "inputs",
  "value": { "name_of_character": "$message.name_of_character" }
}
```

| Field | Required | Description |
|---|---|---|
| `findKey` | yes | Field name on array elements to match |
| `findValue` | yes | Value to match (supports path substitution) |
| `subPath` | yes | Dot-path relative to the matched element to update |
| `value` | yes | New value for `subPath` |

### `slice` — trim an array to a range

Slices the array at `path` to keep elements from `start` to `end`. Uses MongoDB aggregation `$slice` semantics (same as JavaScript `Array.prototype.slice`). Omit `end` to slice from `start` to the end of the array. Negative `start` keeps the last N elements.

```json
{ "actionType": "slice", "path": "$state.openDocs", "start": -5 }
{ "actionType": "slice", "path": "$state.log", "start": 0, "end": 100 }
```

---

## Named Queries (database-query)

Use `"route": "database-query"` with one of these `name` values. The engine calls the query with the full context (`message`, `user`, `state`), then merges the result into a new message and invokes the handler named by `responseType`.

### `get-document`

Fetches the full artifact document (including `state`) by document ID or channel.

**Required context:**
- `context.user.id`
- `context.message.documentId` (ObjectId string) **OR** `context.message.channel` (channel UUID)

**Returns:**
```json
{ "document": { "_id": "...", "name": "...", "type": "...", "userId": "...", "currentChannelId": "...", "state": { ... }, "createdAt": "...", "updatedAt": "..." } }
```

**Common use:** `initializeState` handler — load the persisted state to seed the client.

```json
{ "route": "database-query", "query": { "name": "get-document", "responseType": "initialize-state-document" } }
```

### `get-document-summary`

Same as `get-document` but excludes the `state` field.

**Required context:** same as `get-document`.

**Returns:** same shape minus `state`.

### `get-user-documents`

Lists all artifacts owned by the current user, excluding the `user-dashboard` type.

**Required context:** `context.user.id`

**Returns:**
```json
{ "documents": [ { "_id": "...", "name": "...", "type": "...", "currentChannelId": "...", "createdAt": "...", "updatedAt": "..." } ] }
```

### `get-reviewable-documents`

Same as `get-user-documents` but also excludes the `log-review` type. Used by the log-review workflow to avoid circular self-reference.

**Required context:** `context.user.id`

**Returns:** same as `get-user-documents`.

### `get-available-types`

Lists all workflow type names available for document creation. Combines filesystem configs and MongoDB `workflowconfigs`, excluding system types (`user-dashboard`, `log-review`).

**Required context:** none.

**Returns:**
```json
{ "availableTypes": ["configged-chat", "story-generator", "my-custom-type"] }
```

### `get-users`

Lists all users in the system.

**Required context:** none.

**Returns:**
```json
{ "users": [ { "_id": "...", "email": "...", "roles": [...] } ] }
```

### `create-document`

Creates a new artifact. The new document's `state` is seeded from the workflow config's `initialState`.

**Required context:**
- `context.user.id`
- `context.message.name` (non-empty string, trimmed)
- `context.message.documentType` (optional; defaults to `"configged-chat"`)

**Returns:**
```json
{
  "document": { "_id": "...", "name": "...", "type": "...", "currentChannelId": "...", "state": { ... }, "createdAt": "...", "updatedAt": "..." },
  "documents": [ ... ]
}
```

`documents` is the refreshed list of user's documents (same as `get-user-documents`).

**Guard with condition:** call this only after validating `$message.name` is non-empty:
```json
"condition": "$message.name"
```

### `get-workflow-logs`

Fetches root-level workflow handler log entries for a given artifact.

**Required context:**
- `context.user.id`
- `context.message.id` (artifact `_id`)

**Returns:**
```json
{ "id": "<artifact _id>", "workflowLogs": [ { "_id": "...", "handlerName": "...", "executionId": "...", "createdAt": "...", ... } ] }
```

### `get-log-tree`

Builds a nested execution tree starting from a specific log entry.

**Required context:**
- `context.user.id`
- `context.message.id` (log entry `_id`)

**Returns:**
```json
{
  "id": "<log _id>",
  "treeData": [
    { "id": "...", "name": "handler: add-text", "rawData": { ... }, "children": [
      { "id": "...", "name": "[0] route: ai", "rawData": { ... }, "children": [] }
    ]}
  ]
}
```

### `rehydrate-workflow-logs`

Same as `get-workflow-logs` but reads the artifact ID from `context.message.document.state.selectedDocumentId` instead of `context.message.id`. Used when state changes trigger a log refresh.

**Required context:**
- `context.user.id`
- `context.message.document.state.selectedDocumentId`

**Returns:** `{ "workflowLogs": [ ... ] }`

### `rehydrate-log-tree`

Same as `get-log-tree` but reads the log entry ID from `context.message.document.state.selectedLogId`.

**Required context:**
- `context.user.id`
- `context.message.document.state.selectedLogId`

**Returns:** `{ "treeData": [ ... ] }`

---

## AI Step Configuration

A step with `"route": "ai"` sends the inbound message's `text` field to Claude (Anthropic API) and returns immediately. When the AI responds, its response is parsed as JSON and the `type` field becomes the new `message.type`, triggering the matching handler.

```json
{
  "route": "ai",
  "ai": {
    "model": "claude-haiku-4-5-20251001",
    "maxTokens": 64,
    "systemPrompt": "...",
    "responseTypes": ["handler-name-a", "handler-name-b"]
  }
}
```

### `ai` object fields

| Field | Type | Default | Description |
|---|---|---|---|
| `model` | string | `"claude-haiku-4-5-20251001"` | Anthropic model ID |
| `maxTokens` | number | `64` | Maximum tokens in the AI response |
| `systemPrompt` | string | required | System prompt. Supports `{{expr}}` template substitution (not `$` patterns). |
| `responseTypes` | string[] | optional | List of expected `type` values in the AI JSON response. Each must match a handler name. |

### System prompt templating

Use `{{path.to.field}}` syntax (double braces) in `systemPrompt` to inject live values. The path is a dot-path relative to the context object `{ message, user, state }` — no leading sigil needed.

```json
"systemPrompt": "Generate a story about character '{{message.name_of_character}}' in setting '{{message.setting}}' who faces '{{message.problem_the_character_is_facing}}'."
```

### AI response format

The AI **must** respond with valid JSON containing a `type` field. The engine parses this and routes to the matching handler. Instruct the AI clearly in the system prompt:

```
Respond ONLY with valid JSON (no markdown, no code blocks, no extra text):
{"type":"handler-name-a"}
or
{"type":"handler-name-b","text":"<content>"}
```

Any additional fields in the AI's JSON object are merged into the message and accessible as `$message.*` in the triggered handler.

### AI response flow

```
inbound message (type: "add-text")
  → handler "add-text" → step route "ai"
    → AiService sends text to Claude
    → AI responds: {"type":"valid-text"}
      → engine invokes handler "valid-text" with:
           message.type = "valid-text"
           message.channel = original channel
           message.text = original text (passed through)
           message.senderEmail = original senderEmail
```

**Important:** `ai` steps are fire-and-forget. The calling handler does not wait for the AI response. Subsequent steps in the same handler run immediately after the AI step.

---

## initialize-state and initialize-view Messages

Initialization uses two distinct message types — one for state, one for layout. Neither carries the other's fields.

### `initialize-state` — seed document state

Sent once per channel session (by the `initialize-state-document` handler). Delivers the persisted `DocState` to the client.

```json
{
  "route": "client",
  "transform": {
    "clientMessageType": "initialize-state",
    "initialState": "$message.document.state"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `clientMessageType` | `"initialize-state"` | Required |
| `initialState` | object \| path string | Initial `DocState.state`. Typically `"$message.document.state"`. |

### `initialize-view` — deliver a layout tree

Sent once per channel+view (by view handlers like `defaultView`). Delivers the layout for a specific named view.

```json
{
  "route": "client",
  "transform": {
    "clientMessageType": "initialize-view",
    "viewHandler": "defaultView",
    "layoutConfig": [ ... ]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `clientMessageType` | `"initialize-view"` | Required |
| `viewHandler` | string | Required — names which layout slot this tree fills. |
| `layoutConfig` | LayoutNode[] | The layout tree. Must be non-empty. |

### Lifecycle on the client

`documentModelStore` gates rendering until **both** of these have been received for a given channel+view:
1. An `initialize-state` message → sets `DocState.state`, drains any queued `update-state` messages.
2. An `initialize-view` message for the requested `viewHandler` → stores the layout.

`update-state` messages that arrive before state is initialized are queued and replayed in order once `initialize-state` is received.

**Re-render on new layout:** If `initialize-view` arrives when state is already initialized (e.g. a second view mounts on the same channel), the client renders immediately without waiting for a new `initialize-state`.

---

## Layout Node Structure

A `layoutConfig` is an array of `LayoutNode` objects. The LayoutRenderer recursively walks the tree and renders each node as a React component.

```json
{
  "componentType": "fullPanel",
  "targetId": "my-panel",
  "locationId": "my-panel",
  "props": {
    "someStateProp": "@state.myField",
    "literalProp": "hello"
  },
  "emits": {
    "select": "handler-name"
  },
  "children": [ ... ]
}
```

### LayoutNode fields

| Field | Type | Required | Description |
|---|---|---|---|
| `componentType` | string | yes | Must be a registered type (see [Registered Component Types](#registered-component-types)) or `"forEach"` |
| `targetId` | string | no | Sets the HTML `id` attribute on the rendered element |
| `locationId` | string | no | Not used by the renderer; available for server-side logic |
| `props` | object | no | Props passed to the component. String values starting with `@` are resolved against live DocState. |
| `emits` | object | no | Map of camelCase event names → handler message type strings |
| `children` | LayoutNode[] | no | Child nodes passed as the `children` prop to the component |

### Prop resolution

String prop values starting with `@` are resolved by the client LayoutRenderer:
- `"@state.fieldName"` → `DocState.state.fieldName`
- `"@temp.fieldName"` → `DocState.temp.fieldName`
- `"@item.fieldName"` → current `forEach` iteration item's `fieldName`
- Non-`@` strings → literal values

Non-string values (numbers, booleans, objects, arrays) are passed as-is.

### `forEach` — iteration node

`forEach` is a special pseudo-component (not in the registry) that renders its `children` template once per element in a source array.

```json
{
  "componentType": "forEach",
  "props": { "source": "@state.openDocs" },
  "children": [
    {
      "componentType": "smartTab",
      "props": { "id": "@item._id", "title": "@item.name" },
      "emits": { "close": "close-tab" },
      "children": [ ... ]
    }
  ]
}
```

- `props.source` must be an `@state.*` or `@temp.*` path pointing to an array.
- Inside `children`, use `@item.fieldName` to access the current element's fields.
- Each iteration receives its own scoped state: `{ ...docState, item: currentElement }`.

---

## Registered Component Types

These are the exact `componentType` strings the LayoutRenderer recognizes. Any other string is ignored.

### `fullPanel`

A full-height scrollable wrapper div. Useful as the top-level container.

```json
{ "componentType": "fullPanel", "targetId": "main", "children": [ ... ] }
```

Props: `targetId` (html id), `children`.

---

### `chatBody`

Renders a scrolling list of chat messages. Supports multiple message subtypes.

```json
{
  "componentType": "chatBody",
  "props": {
    "messages": "@state.chatMessages",
    "inputValues": "@state.inputs"
  }
}
```

Props:
| Prop | Type | Description |
|---|---|---|
| `messages` | ChatMessage[] | Array of message objects. See [ChatMessage Object Format](#chatmessage-object-format). |
| `inputValues` | Record\<string, string\> | Persistent input values — passed to `multi-field-input` messages to preserve typed values across re-renders. |

---

### `chatInput`

A text input bar that emits `add-text` messages when the user submits.

```json
{
  "componentType": "chatInput",
  "emits": { "addText": "add-text" }
}
```

Emits `addText` with payload `{ text: string }`. The `emits` key `"addText"` maps to message type `"add-text"` (or whatever you wire it to).

---

### `smartAccordion`

An accordion list. Each item renders as an expandable row. Children are rendered inside the expanded row.

```json
{
  "componentType": "smartAccordion",
  "props": {
    "items": "@state.config.documentSection",
    "idField": "@state.config.sectionIdField",
    "triggerFields": "@state.config.sectionTriggerFields",
    "selectedId": "@state.openAccordions.documents"
  },
  "emits": { "select": "save-documents-accordion" },
  "children": [ ... ]
}
```

Props:
| Prop | Type | Description |
|---|---|---|
| `items` | object[] | Array of data objects to render as accordion rows |
| `idField` | string | Field name on each item used as the unique key (e.g. `"_id"`, `"id"`) |
| `triggerFields` | string[] | Field names to display in the accordion header |
| `selectedId` | string \| null | Currently expanded item's id |

Emits `select` with payload `{ id: string | null }` when a row is toggled.

---

### `logTreePanel`

Renders a nested tree of workflow execution log entries. Used by `log-review`.

```json
{
  "componentType": "logTreePanel",
  "props": { "treeData": "@temp.selectedLogTree" }
}
```

Props: `treeData` — array of tree nodes as returned by `get-log-tree`.

---

### `smartTab` and `smartTabs`

A tabbed workspace. `smartTabs` is the container; `smartTab` is each individual tab. Must be used together.

```json
{
  "componentType": "smartTabs",
  "props": { "selectedId": "@state.activeDocId" },
  "children": [
    {
      "componentType": "smartTab",
      "props": { "id": "fixed-tab", "title": "Dashboard" },
      "children": [ ... ]
    }
  ]
}
```

**`smartTabs` props:**
| Prop | Type | Description |
|---|---|---|
| `selectedId` | string | ID of the currently active tab |

**`smartTab` props:**
| Prop | Type | Description |
|---|---|---|
| `id` | string | Unique tab identifier. Omit for static tabs (auto-generated). Use `"@item._id"` in forEach. |
| `title` | string | Tab label |

`smartTab` emits `close` with payload `{ _id: string }` when a tab's close button is clicked.

---

### `documentList`

Renders a list of artifact documents. Each row shows the document name and type. Emits `select` when a row is clicked.

```json
{
  "componentType": "documentList",
  "props": { "items": "@temp.documentList" },
  "emits": { "select": "select-document" }
}
```

Props: `items` — array of document summary objects (shape returned by `get-user-documents`).

Emits `select` with payload `{ documentId: string }`.

---

### `newDocument`

A form to create a new document. Shows a text input for name and a dropdown for type.

```json
{
  "componentType": "newDocument",
  "props": { "availableTypes": "@temp.availableTypes" },
  "emits": { "create": "create-document" }
}
```

Props: `availableTypes` — array of type name strings (from `get-available-types`).

Emits `create` with payload `{ name: string, documentType: string }`.

---

### `layoutDocumentView`

Embeds another document's layout inside the current layout. The embedded document sends its own WebSocket subscribe and view-handler messages.

```json
{
  "componentType": "layoutDocumentView",
  "props": {
    "channelId": "@temp._channelId",
    "viewHandler": "@state.config.userManagementViewHandler"
  }
}
```

Props:
| Prop | Type | Description |
|---|---|---|
| `channelId` | string | The `currentChannelId` of the document to embed |
| `viewHandler` | string | The view handler name to request (optional; defaults to `"defaultView"`) |

---

### `twoColumnLayout`

A two-column flex layout. Pass exactly two children: the left column and the right column.

```json
{
  "componentType": "twoColumnLayout",
  "children": [
    { "componentType": "chatBody", "props": { "messages": "@state.chatMessages" } },
    { "componentType": "textDisplay", "props": { "text": "@state.storyHtml" } }
  ]
}
```

Props: `leftWidth` (CSS width string, default `"40%"`). Right column takes remaining space.

---

### `multiFieldInput`

A multi-field form. When submitted, emits all field values plus a formatted `text` string.

```json
{
  "componentType": "multiFieldInput",
  "props": {
    "fields": [
      { "name": "character", "label": "Character Name", "placeholder": "e.g. Alex" },
      { "name": "setting", "label": "Setting", "placeholder": "e.g. Outer Space" }
    ],
    "submitLabel": "Generate",
    "inputs": null
  },
  "emits": { "submit": "handle-form-submit" }
}
```

Props:
| Prop | Type | Description |
|---|---|---|
| `fields` | `{ name, label, placeholder? }[]` | Field definitions |
| `submitLabel` | string | Button label (default: `"Submit"`) |
| `inputs` | Record\<string, string\> \| null | If non-null, shows read-only submitted values instead of a live form |
| `values` | Record\<string, string\> | Persistent input values across re-renders |

Emits `submit` with payload containing all field values keyed by `name`, plus `text` (a formatted concatenation of all values).

**Note:** `multiFieldInput` can also be embedded as a `ChatMessage` inside `chatBody` using `messageType: "multi-field-input"` — see [ChatMessage Object Format](#chatmessage-object-format).

---

### `textDisplay`

Renders a block of text with `white-space: pre-wrap`.

```json
{
  "componentType": "textDisplay",
  "props": {
    "text": "@state.storyHtml",
    "placeholder": "Nothing here yet."
  }
}
```

Props: `text` (string), `placeholder` (string, shown when text is empty).

---

### `youtubePlayer`

Embeds a YouTube player. Fires `videoEnd` when playback ends.

```json
{
  "componentType": "youtubePlayer",
  "props": { "videoId": "dQw4w9WgXcQ" },
  "emits": { "videoEnd": "video-ended" }
}
```

Props: `videoId` — the 11-character YouTube video ID.

Emits `videoEnd` with an empty payload when the video ends.

---

## Emit System

`emits` in a layout node maps camelCase event names to message type strings:

```json
"emits": {
  "select": "select-document",
  "create": "create-document",
  "close":  "close-tab"
}
```

The LayoutRenderer converts each key to a prop name by capitalizing the first letter and prepending `"on"`:
- `"select"` → `onSelect` prop
- `"addText"` → `onAddText` prop
- `"videoEnd"` → `onVideoEnd` prop

When the component calls its `onX` callback, the LayoutRenderer calls `emit(messageType, payload)`, which sends a WebSocket message to the server with:
- `type`: the message type from `emits`
- `channel`: current channel
- All payload fields spread into the message
- `senderEmail`: injected server-side by `UserEventManager` (never set by client)

The handler for the emitted message type receives this payload as `context.message`.

---

## State Path Namespaces

| Namespace | Where used | Persisted to DB | Description |
|---|---|---|---|
| `$state.*` in `action.path` | `transform` → `actions[].path` | Yes | DB path target. Tells the persistor which MongoDB field to write. Prefix is stripped before the update. |
| `$temp.*` in `action.path` | `transform` → `actions[].path` | No | Ephemeral path target. Persistor skips these. Client applies the mutation to `DocState.temp.*`. |
| `@state.*` | `layoutConfig` props only | N/A | Client-side binding. LayoutRenderer resolves at render time to `DocState.state.*`. |
| `@temp.*` | `layoutConfig` props only | N/A | Client-side binding. LayoutRenderer resolves at render time to `DocState.temp.*`. |
| `@item.*` | `layoutConfig` props in `forEach` | N/A | Client-side binding. Resolves to the current forEach iteration element's field. |
| `$message.*` | `transform` values, `condition` | N/A | Server-resolved. Substituted with inbound message field at step execution time. |
| `$user.*` | `transform` values, `condition` | N/A | Server-resolved. Substituted with authenticated user field at step execution time. |
| `$uuid` | `transform` values | N/A | Server-resolved. Generates a new UUID v4 at step execution time. |
| `~{ expr }` | `transform` values, `condition` | N/A | Server-resolved JSONata expression evaluated against `{ message, user, state }`. Inside the expression use bare `message`, `user`, `state` — no `$` prefix. |

**Rule of thumb:**
- Use `$state.*` in `action.path` for anything that must survive a page reload.
- Use `$temp.*` in `action.path` for lists loaded from queries. Re-fetch them in view handlers using `database-query` steps.
- Use `@state.*` and `@temp.*` only in `layoutConfig` node `props` — never in `action.value` fields.
- Never use `@temp.*` paths in `"database"` route actions — the DB persistor silently ignores them anyway, but the intent should be expressed with `$temp.*` in `action.path`.

---

## Standard Handler Patterns

Every workflow config should implement these handlers. The client sends specific messages that expect these handlers to exist.

### `initializeState` (required)

Called by the client once per channel on mount. Should load the document's persisted state and send it back.

**Conventional implementation:**
```json
"initializeState": {
  "steps": [
    {
      "route": "database-query",
      "query": { "name": "get-document", "responseType": "initialize-state-document" }
    }
  ]
}
```

### `initialize-state-document` (required companion)

Called by the query executor when `get-document` completes. Sends `initialize-state` with the loaded state.

**Conventional implementation:**
```json
"initialize-state-document": {
  "steps": [
    {
      "route": "client",
      "transform": {
        "clientMessageType": "initialize-state",
        "initialState": "$message.document.state"
      }
    }
  ]
}
```

### View handlers (at least one required)

Called by the client once per channel+view on mount. Should send `initialize-view` with `layoutConfig`. The default view handler is `"defaultView"`.

**Conventional implementation:**
```json
"defaultView": {
  "steps": [
    {
      "route": "client",
      "transform": {
        "clientMessageType": "initialize-view",
        "viewHandler": "defaultView",
        "layoutConfig": [ ... ]
      }
    }
  ]
}
```

A view handler can also fan out additional `database-query` steps to pre-populate `@temp.*` bindings immediately after delivering the layout:

```json
"defaultView": {
  "steps": [
    { "route": "client", "transform": { "clientMessageType": "initialize-view", "viewHandler": "defaultView", "layoutConfig": [ ... ] } },
    { "route": "database-query", "query": { "name": "get-user-documents", "responseType": "document-list-result" } },
    { "route": "database-query", "query": { "name": "get-available-types", "responseType": "available-types-result" } }
  ]
}
```

Multiple `database-query` steps in a single handler are executed sequentially (each waits for the previous to complete).

---

## ChatMessage Object Format

`chatBody` renders an array of `ChatMessage` objects stored in state (bound via `@state.chatMessages` in the layout). Each object has a `messageType` discriminator:

### `display-text`

Plain text message.

```json
{ "messageType": "display-text", "text": "Hello world", "authorEmail": "user@example.com" }
```

### `display-colorful-text`

Colored text message (e.g., for system messages or error notices).

```json
{ "messageType": "display-colorful-text", "text": "Error!", "color": "red", "authorEmail": "user@example.com" }
```

Common `color` values: `"red"`, `"green"`, `"blue"`, `"yellow"`, `"gray"`.

### `system`

System/informational message, styled differently from user messages.

```json
{ "messageType": "system", "text": "Welcome! Fill out the form below." }
```

### `inappropriate-text`

Rendered as a warning that a message was blocked by moderation.

```json
{ "messageType": "inappropriate-text", "text": "inappropriate text", "color": "red", "authorEmail": "user@example.com" }
```

### `multi-field-input`

An inline form rendered inside the chat. When submitted, fires an `emits` action.

```json
{
  "id": "form-initial",
  "messageType": "multi-field-input",
  "inputs": null,
  "emits": { "submit": "submit-story-inputs" },
  "fields": [
    { "name": "name_of_character", "label": "Character Name", "placeholder": "e.g. Alex" },
    { "name": "setting",           "label": "Setting",        "placeholder": "e.g. Outer Space" }
  ],
  "submitLabel": "Generate Story"
}
```

- `id` — required when you need to later update it with `update-in` (e.g., to freeze submitted values). Use `"$uuid"` to generate a unique id server-side.
- `inputs` — if `null`, shows the editable form; if an object, shows read-only submitted values.
- `emits` — same structure as layout node `emits`. The submit payload includes all field values keyed by `name`.

### `multiple-choice-quiz`

A quiz question with radio-button options.

```json
{
  "messageType": "multiple-choice-quiz",
  "question": "What is the capital of France?",
  "options": [
    { "key": "a", "label": "Paris" },
    { "key": "b", "label": "London" },
    { "key": "c", "label": "Berlin" }
  ],
  "correctKey": "a",
  "answer": null,
  "emits": { "answer": "quiz-answer" }
}
```

- `answer` — `null` means unanswered; set to the chosen `key` once answered.
- `emits.answer` — fires when the user selects an option.

---

## Complete Annotated Example

Below is a minimal but complete workflow config that demonstrates all major features: state initialization, a view with two columns, a multi-field form, AI moderation, and database persistence.

```json
{
  "name": "feedback-collector",
  "displayName": "Feedback Collector",
  "version": "1.0.0",

  // initialState is seeded into a new artifact's state on creation.
  "initialState": {
    "feedbackItems": [],
    "inputValues": {
      "category": "",
      "message": ""
    }
  },

  "handlers": {

    // --- Required: load persisted state on channel mount ---
    "initializeState": {
      "steps": [
        {
          "route": "database-query",
          "query": { "name": "get-document", "responseType": "initialize-state-document" }
        }
      ]
    },

    // --- Required companion: send loaded state to client ---
    "initialize-state-document": {
      "steps": [
        {
          "route": "client",
          "transform": {
            "clientMessageType": "initialize-state",
            "initialState": "$message.document.state"
          }
        }
      ]
    },

    // --- Required: deliver the UI layout ---
    "defaultView": {
      "steps": [
        {
          "route": "client",
          "transform": {
            "clientMessageType": "initialize-view",
            "viewHandler": "defaultView",
            "layoutConfig": [
              {
                "componentType": "twoColumnLayout",
                "children": [
                  {
                    // Left column: a form for submitting feedback
                    // @state.inputValues is resolved client-side at render time
                    "componentType": "multiFieldInput",
                    "props": {
                      "fields": [
                        { "name": "category", "label": "Category", "placeholder": "e.g. Bug" },
                        { "name": "message",  "label": "Message",  "placeholder": "Describe the issue" }
                      ],
                      "submitLabel": "Submit Feedback",
                      "values": "@state.inputValues"
                    },
                    "emits": { "submit": "submit-feedback" }
                  },
                  {
                    // Right column: list of submitted feedback
                    "componentType": "chatBody",
                    "props": { "messages": "@state.feedbackItems" }
                  }
                ]
              }
            ]
          }
        }
      ]
    },

    // --- User action: submit the form ---
    // Guard: only proceed if message field is non-empty.
    "submit-feedback": {
      "condition": "$message.message",
      "steps": [
        {
          // Persist the input values and show a "processing" message
          "route": ["client", "database"],
          "transform": {
            "clientMessageType": "update-state",
            "actions": [
              {
                "actionType": "update",
                "path": "$state.inputValues",
                "value": {
                  "category": "$message.category",
                  "message": "$message.message"
                }
              },
              {
                "actionType": "append",
                "path": "$state.feedbackItems",
                "value": {
                  "messageType": "system",
                  "text": "Checking your feedback..."
                }
              }
            ]
          }
        },
        {
          // Send to AI for moderation
          "route": "ai",
          "ai": {
            "model": "claude-haiku-4-5-20251001",
            "maxTokens": 32,
            "systemPrompt": "You are a content moderator. Check if the following feedback message is appropriate.\n\nFeedback: {{message.message}}\n\nRespond ONLY with valid JSON:\n{\"type\":\"appropriate-feedback\"}\nor\n{\"type\":\"inappropriate-feedback\"}",
            "responseTypes": ["appropriate-feedback", "inappropriate-feedback"]
          }
        }
      ]
    },

    // --- AI response: feedback passed moderation ---
    "appropriate-feedback": {
      "steps": [
        {
          "route": ["client", "database"],
          "transform": {
            "clientMessageType": "update-state",
            "actions": [
              {
                "actionType": "append",
                "path": "$state.feedbackItems",
                "value": {
                  "messageType": "display-text",
                  "text": "$message.message",
                  "authorEmail": "$message.senderEmail"
                }
              }
            ]
          }
        }
      ]
    },

    // --- AI response: feedback blocked by moderation ---
    "inappropriate-feedback": {
      "steps": [
        {
          "route": ["client", "database"],
          "transform": {
            "clientMessageType": "update-state",
            "actions": [
              {
                "actionType": "append",
                "path": "$state.feedbackItems",
                "value": {
                  "messageType": "inappropriate-text",
                  "text": "Your feedback was flagged as inappropriate and was not saved.",
                  "color": "red"
                }
              }
            ]
          }
        }
      ]
    }

  }
}
```

> **Note:** JSON does not support comments. The `// ...` annotations above are for illustration only — remove them before using.
