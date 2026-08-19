# Named Queries (database-query)

Use `"route": "database-query"` with one of these `name` values. The engine calls the query with the full context (`message`, `user`, `state`, `groupId`, `targetChannelId`), then merges the result into a new message and invokes the handler named by `responseType`.

### `get-available-types`

Lists all workflow type names available for document creation. Combines filesystem configs and the Postgres `workflow_configs` table, excluding system types.

**Required context:** none.

**Returns:**
```json
{ "availableTypes": ["configged-chat", "story-generator", "my-custom-type"] }
```

### `get-user-documents`

Lists all artifacts owned by the current user, excluding the `user-dashboard` type.

**Required context:** `context.user.id`

**Returns:**
```json
{ "documents": [ { "_id": "...", "name": "...", "type": "...", "userId": "...", "parentId": "...", "currentChannelId": "...", "createdAt": "...", "updatedAt": "..." } ] }
```

### `get-document`

Fetches the full artifact (including `state`, `permissions`, `userPermissions`, `permissionManagerMode`) by document ID or channel, scoped to the caller.

**Required context:**
- `context.user.id`
- `context.message.documentId` (UUID string) **OR** `context.message.channel` (channel UUID)

**Returns:**
```json
{ "document": { "_id": "...", "name": "...", "type": "...", "userId": "...", "groupId": "...", "parentId": "...", "currentChannelId": "...", "permissions": [...], "userPermissions": [...], "permissionManagerMode": "owner|group_admin", "state": { ... }, "createdAt": "...", "updatedAt": "..." } }
```

**Common use:** `initializeState` handler — load the persisted state to seed the client.

```json
{ "route": "database-query", "query": { "name": "get-document", "responseType": "initialize-state-document" } }
```

### `get-document-summary`

Same as `get-document` but excludes `state`, `permissions`, `userPermissions`, and `permissionManagerMode`.

**Required context:** same as `get-document`.

### `get-users`

Lists all users in the system.

**Required context:** none.

**Returns:**
```json
{ "users": [ { "_id": "...", "email": "..." } ] }
```

### `create-workflow-builder-document`

Creates a new `workflow-builder`-type artifact (and its channel) for the current user, seeded from `workflow-builder.json`'s `initialState`.

**Required context:** `context.user.id`

**Returns:**
```json
{ "channelId": "..." }
```

### `create-document`

Creates a new artifact (and its channel). The new document's `state` is seeded from the workflow config's `initialState` (checked on the filesystem first, then the `workflow_configs` table).

**Required context:**
- `context.user.id`
- `context.message.name` (non-empty string, trimmed)
- `context.message.documentType` (optional; defaults to `"configged-chat"`)
- `context.message.parentId` (optional; must reference an existing artifact or the query returns `null`)

**Returns:**
```json
{
  "document": { "_id": "...", "name": "...", "type": "...", "userId": "...", "parentId": "...", "currentChannelId": "...", "createdAt": "...", "updatedAt": "..." },
  "documents": [ ... ]
}
```

`documents` is the refreshed list of the user's documents (same shape as `get-user-documents`, excluding `user-dashboard`/`log-review`).

**Guard with condition:** call this only after validating `$message.name` is non-empty:
```json
"condition": "$message.name"
```

### `get-workflow-builder-context`

Reads the workflow-builder artifact's current `plan` and `draftConfig` (resolved via `context.message.channel`). Used as a plain context fetcher before each of the workflow-builder's three AI steps (`run-chat-step`, `run-planning-step`, `run-config-step`) — each call site declares its own static `responseType`; this query does not decide routing.

**Required context:** `context.message.channel`

**Returns:**
```json
{
  "text": "...", "senderEmail": "...",
  "plan": "...",
  "draftConfig": null
}
```

### `publish-workflow-config`

Publishes the workflow-builder artifact's `state.draftConfig` into the `workflow_configs` table (upsert by `name`; patch-bumps `version` on update, ownership-checked against `created_by`).

**Required context:**
- `context.message.channel`
- `context.user.id`

**Returns:**
```json
{ "type": "workflow-published", "publishedName": "...", "publishedVersion": "1.0.1" }
```
or, if the draft is missing a name/handlers or belongs to another user:
```json
{ "type": "workflow-publish-error", "errorMessage": "..." }
```

### `get-channel-log-tree`

Builds the nested execution tree (`workflow_logs` rows, root handlers down through routes/tools/sub-handlers) for a channel, scoped to whoever owns the underlying artifact (or, for stateless channels, the channel itself).

**Required context:**
- `context.user.id`
- `context.targetChannelId`

**Returns:**
```json
{
  "treeData": [
    { "id": "...", "name": "handler: add-text", "rawData": { ... }, "children": [
      { "id": "...", "name": "[0] route: ai", "rawData": { ... }, "children": [] }
    ]}
  ],
  "artifactState": { ... }
}
```

### `get-user-groups`

Lists the root-level (`parentGroupId: null`) groups the current user is a member of.

**Required context:** `context.user.id`

**Returns:**
```json
{ "groups": [ { "_id": "...", "name": "...", "parentGroupId": "...", "ancestors": [...] } ] }
```

### `get-subgroups`

Lists the direct child groups of `context.groupId`.

**Required context:** `context.groupId`

**Returns:** same shape as `get-user-groups`.

### `get-channel-document`

Fetches the full artifact (same hydration as `get-document`) backing a given channel, without an ownership check.

**Required context:** `context.message.channel`

### `get-or-create-workflow-channel`

Finds the channel for `(workflowType, userId, groupId)`, creating one if none exists.

**Required context:**
- `context.message.workflowType`
- `context.user.id`
- `context.groupId` (optional; falls back to `context.message.groupId`)

**Returns:**
```json
{ "channelId": "..." }
```

### `create-subgroup-with-permission`

Creates a child group under `context.groupId` (caller must have `admin`/`owner` role in the parent) and makes the caller its owner.

**Required context:**
- `context.user.id`
- `context.groupId`
- `context.message.groupName`

**Returns:**
```json
{ "newGroup": { "_id": "...", "name": "..." }, "result": "Group '...' created!" }
```
`newGroup` is `null` and `result` explains why on any guard failure (missing fields, insufficient permissions, parent not found).

### `get-group-members`

Lists every member of `context.groupId` with their roles, plus whether the caller is an admin/owner.

**Required context:**
- `context.user.id`
- `context.groupId`

**Returns:**
```json
{ "members": [ { "_id": "...", "email": "...", "roles": ["member"] } ], "isAdmin": false }
```

### `add-group-member`

Adds the user with `context.message.email` to `context.groupId` as a `member` (caller must be `admin`/`owner`).

**Required context:**
- `context.user.id`
- `context.groupId`
- `context.message.email`

**Returns:** `{ "result": "..." }` (human-readable outcome string, success or reason for failure).

### `update-group-member-role`

Sets `context.message._id`'s role in `context.groupId` to `context.message.role` (`admin` or `member`). Refuses to demote the last remaining owner.

**Required context:**
- `context.user.id`
- `context.groupId`
- `context.message._id`, `context.message.role`

**Returns:** `{ "result": "..." }`

### `remove-group-member`

Removes `context.message._id`'s membership from `context.groupId`. Refuses to remove the last remaining owner.

**Required context:**
- `context.user.id`
- `context.groupId`
- `context.message._id`

**Returns:** `{ "result": "..." }`

### `get-recent-user-documents`

Lists the caller's most recently created documents (excluding dashboard/log-review types), capped by `state.config.recentDocumentLimit` (default `10`).

**Required context:** `context.user.id`

**Returns:** same shape as `get-user-documents`.

### `get-group-documents`

Lists the caller's documents scoped to `context.groupId` (or, if omitted, documents with no group at all).

**Required context:** `context.user.id`

**Returns:** same shape as `get-user-documents`.

### `get-child-documents`

Lists the caller's documents whose `parentId` matches `context.message.parentId`.

**Required context:**
- `context.user.id`
- `context.message.parentId`

**Returns:** same shape as `get-user-documents`.

### `rename-artifact`

Renames the artifact `context.message._id` (caller must be the owner).

**Required context:**
- `context.user.id`
- `context.message._id`, `context.message.name`

**Returns:** `{ "result": "..." }`

### `delete-artifact`

Deletes the artifact `context.message._id` (caller must be the owner). Its channel is removed automatically via `ON DELETE CASCADE`.

**Required context:**
- `context.user.id`
- `context.message._id`

**Returns:** `{ "result": "..." }`
