# Standard Handler Patterns

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
