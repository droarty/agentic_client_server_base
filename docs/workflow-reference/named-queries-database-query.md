# Named Queries (database-query)

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
