# Steps and Routes

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

See [Named Queries](./named-queries-database-query.md) for all available query names and their return shapes.

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

See [AI Step Configuration](./ai-step-configuration.md) for full details.
