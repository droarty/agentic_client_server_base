# Registered Component Types

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
| `messages` | ChatMessage[] | Array of message objects. See [ChatMessage Object Format](./chatmessage-object-format.md). |
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

**Note:** `multiFieldInput` can also be embedded as a `ChatMessage` inside `chatBody` using `messageType: "multi-field-input"` — see [ChatMessage Object Format](./chatmessage-object-format.md).

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
