# Transform Syntax and Path Substitution

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
| `$item.x` | `"$item._id"` | Server (WorkflowEngine, inside `$map`) | Current element's field while iterating a `$map` directive |
| `$map` object | `{ "$map": "...", "$using": {...} }` | Server (WorkflowEngine) | Maps a source array through a template; supports `$prepend`/`$append` |
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

### `$map` — array mapping directive

When a plain object in a transform value has a `$map` key, the engine treats it as an array mapping operation rather than a plain object. All keys are resolved recursively, so any value expression (`$message.*`, `$state.*`, `~{}`, literals) works inside them.

```json
{
  "$map": "$message.documents",
  "$using": {
    "_id": "$item._id",
    "name": "$item.name",
    "emits_msg": "select-group-document"
  },
  "$prepend": [
    { "name": "Pinned Item", "_id": "pinned", "emits_msg": "open-pinned" }
  ],
  "$append": [
    { "name": "Browse All", "_id": "browse-all", "emits_msg": "open-browser" },
    { "name": "Create New", "_id": "create",     "emits_msg": "create-new" }
  ]
}
```

| Key | Required | Description |
|---|---|---|
| `$map` | yes | Source array. Resolved like any other value (`$message.x`, `$state.x`, etc.). |
| `$using` | yes | Template object applied to each element. Use `$item.*` to reference the current element's fields (same dot-path resolution as `$message.*`). |
| `$prepend` | no | Array of items inserted **before** the mapped results. Each item is recursively resolved. |
| `$append` | no | Array of items inserted **after** the mapped results. Each item is recursively resolved. |

**Result order:** `[ ...$prepend, ...mapped, ...$append ]`

**Example — building sidebar sections from query results:**

```json
{
  "actionType": "update",
  "path": "$temp.sidebarItems",
  "value": [
    {
      "name": "My Documents",
      "collapsed": false,
      "children": {
        "$map": "$message.documents",
        "$using": { "_id": "$item._id", "name": "$item.name", "emits_msg": "select-document" },
        "$append": [
          { "name": "Browse All", "_id": "browse-all", "emits_msg": "open-browser" },
          { "name": "Create New", "_id": "create-new", "emits_msg": "create-document" }
        ]
      }
    }
  ]
}
```

Use `$map` instead of a `~{ ... }` JSONata expression whenever the transformation is array mapping with optional head/tail items. Reserve `~{}` for scalar operations like string concatenation (`"~{ '/group/' & message._id }"`).

### `clientMessageType` special key

In any `transform` object, the key `clientMessageType` is renamed to `type` in the final outbound message. This is the message discriminator that the client uses to route the message.

Valid values for `clientMessageType`:
- `"initialize-state"` — seeds initial document state into the client store
- `"initialize-view"` — delivers a layout tree for a named view
- `"update-state"` — applies mutations to client-side DocState
