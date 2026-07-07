# Emit System and State Path Namespaces

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
