# initialize-state / initialize-view Messages and Layout Node Structure

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
| `componentType` | string | yes | Must be a registered type (see [Registered Component Types](./registered-component-types.md)) or `"forEach"` |
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
