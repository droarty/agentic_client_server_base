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
| `$item.x` | `"$item._id"` | Server (WorkflowEngine, inside `$map`) | Current element's (or entry's) field while iterating a `$map` directive |
| `$key` | `"$key"` | Server (WorkflowEngine, inside `$map`) | Current array index, or object property name when `$map`'s source is a plain object |
| `$map` object | `{ "$map": "...", "$using": {...} }` | Server (WorkflowEngine) | Maps a source array or object's entries through a template; supports `$where`/`$prepend`/`$append` |
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

### `$map` — array/object mapping directive

When a plain object in a transform value has a `$map` key, the engine treats it as a
mapping operation rather than a plain object. All keys are resolved recursively, so any
value expression (`$message.*`, `$state.*`, `~{}`, literals) works inside them.

`$map`'s source can be either an **array** or a plain **object**:
- Array source: iterates elements; `$key` is the numeric index.
- Object source: iterates `Object.entries()`; `$key` is the property name, `$item` is
  the value. This is how you extract/reshape entries out of a JSON object keyed by
  name (e.g. a `handlers` map keyed by handler name) rather than an array of records.

```json
{
  "$map": "$message.documents",
  "$where": "~{ item.archived != true }",
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
| `$map` | yes | Source array or object. Resolved like any other value (`$message.x`, `$state.x`, etc.). |
| `$where` | no | Predicate applied per entry before mapping — entries where it resolves falsy are dropped. Same `$item`/`$key` binding as `$using`. Typically a `~{ }` JSONata boolean expression for anything beyond a simple truthy check. |
| `$using` | yes | Template object applied to each surviving element/entry. Use `$item.*` for the current value's fields and `$key` for its index/property name (same dot-path resolution as `$message.*`). |
| `$prepend` | no | Array of items inserted **before** the mapped results. Each item is recursively resolved. |
| `$append` | no | Array of items inserted **after** the mapped results. Each item is recursively resolved. |

**Result order:** `[ ...$prepend, ...mapped(after $where), ...$append ]`

> **Pitfall:** `$where`'s value is usually a `~{ ... }` JSONata expression — inside it,
> the same rule from the [`~{ expr }` pitfall above](#-expr----jsonata-expressions)
> applies: use bare `item`/`key`, not `$item`/`$key`. `$item`/`$key` (with the dollar
> sign) is only correct *outside* `~{}`, e.g. directly inside `$using`.
>
> ```json
> // WRONG — $item is undefined inside ~{}
> "$where": "~{ $item.steps[route='ai'] }"
>
> // CORRECT
> "$where": "~{ item.steps[route='ai'] }"
> ```

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

**Example — filtering an object's entries (extracting matching handlers from a
workflow config into tree nodes):**

```json
{
  "$map": "$message.document.state.draftConfig.handlers",
  "$where": "~{ item.steps[route='ai' or ($type(route)='array' and 'ai' in route)] }",
  "$using": { "id": "$key", "name": "$key", "rawData": "$item", "children": [] }
}
```

Here `draftConfig.handlers` is a plain object (`{ handlerName: { steps: [...] }, ... }`),
not an array — `$map` iterates its entries, `$where` keeps only the ones with at least
one `ai`-route step, and `$using` reshapes each surviving `[key, item]` pair into a
tree node.

Use `$map` instead of a `~{ ... }` JSONata expression whenever the transformation is
iterating a collection (array or object) with optional filtering and/or head/tail
items — it's the reusable, declarative building block for that shape of problem.
Reserve bare `~{}` for scalar operations like string concatenation
(`"~{ '/group/' & message._id }"`) or, as shown above, a per-entry boolean predicate
inside `$where`.

### `clientMessageType` special key

In any `transform` object, the key `clientMessageType` is renamed to `type` in the final outbound message. This is the message discriminator that the client uses to route the message.

Valid values for `clientMessageType`:
- `"initialize-state"` — seeds initial document state into the client store
- `"initialize-view"` — delivers a layout tree for a named view
- `"update-state"` — applies mutations to client-side DocState
