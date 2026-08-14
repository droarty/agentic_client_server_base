# Action Types (update-state)

Actions appear in the `actions` array of an `update-state` message. Each action mutates one path in the client's DocState and (when route includes `"database"`) also in Postgres.

**Path rules for `action.path`:**
- `"$state.xxx"` — persisted to Postgres. The `$state.` prefix is stripped to derive the JSONB path within the artifact's `state` column. Client state at `DocState.state.xxx` is updated.
- `"$temp.xxx"` — **not** persisted. Persistor skips these. Client state at `DocState.temp.xxx` is updated ephemerally.

### `update` — set a field

Sets the field at `path` to `value`. Implemented via `jsonb_set`.

```json
{ "actionType": "update", "path": "$state.title", "value": "$message.text" }
{ "actionType": "update", "path": "$temp.isLoading", "value": false }
{ "actionType": "update", "path": "$state.activeDocId", "value": "$message.document._id" }
```

### `merge` — merge object fields

Merges the keys of `value` (an object) into the object at `path`. Implemented via `jsonb_set` combined with the `||` JSONB concatenation operator.

```json
{ "actionType": "merge", "path": "$state.config", "value": { "color": "blue", "count": 3 } }
```

### `append` — add to end of array

Appends `value` (a single item or array of items) to the end of the array at `path`. Implemented via `jsonb_set` concatenating the existing array with `value` using `||`.

```json
{ "actionType": "append", "path": "$state.chatMessages", "value": { "messageType": "display-text", "text": "$message.text" } }
{ "actionType": "append", "path": "$state.items", "value": ["$message.item1", "$message.item2"] }
```

### `prepend` — add to start of array

Inserts `value` (single item or array) at position 0 of the array at `path`. Implemented via `jsonb_set` concatenating `value` before the existing array using `||`.

```json
{ "actionType": "prepend", "path": "$state.notifications", "value": { "text": "New message" } }
```

### `upsert` — update-or-append by key

Finds the array element at `path` where all fields named in `keys` match the corresponding fields in `value`. If found, replaces that element; if not found, appends. `keys` must be a non-empty array. Implemented via the `jsonb_array_upsert` SQL function.

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

Removes all elements from the array at `path` where all fields named in `keys` match the corresponding fields in `value`. Implemented via the `jsonb_array_remove_by_keys` SQL function.

```json
{
  "actionType": "remove",
  "path": "$state.openDocs",
  "value": "$message",
  "keys": ["_id"]
}
```

### `update-in` — update a nested field within an array element

Finds every element in the array at `path` where `findKey === findValue`, then sets `subPath` on each matched element to `value`. Implemented via the `jsonb_array_update_in` SQL function.

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

Slices the array at `path` to keep elements from `start` to `end`, matching JavaScript `Array.prototype.slice` semantics. Implemented via the `jsonb_array_slice` SQL function. Omit `end` to slice from `start` to the end of the array. Negative `start` keeps the last N elements.

```json
{ "actionType": "slice", "path": "$state.openDocs", "start": -5 }
{ "actionType": "slice", "path": "$state.log", "start": 0, "end": 100 }
```
