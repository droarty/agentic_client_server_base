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

### `writingArea`

A multiline textarea for longer free-text writing (e.g. student responses/essays). Defaults to a 10-line-tall box that grows as the student types; can be configured to more/fewer lines or locked to a fixed height with internal scrolling.

```json
{
  "componentType": "writingArea",
  "props": {
    "value": "@state.essayDraft",
    "placeholder": "Start writing...",
    "rows": 10
  },
  "emits": { "change": "save-draft" }
}
```

Props:
| Prop | Type | Description |
|---|---|---|
| `value` | string | Initial text (e.g. bound to `@state.*`/`@temp.*`). Only seeds the field on mount — not resynced on later state pushes, to avoid clobbering in-progress typing. |
| `placeholder` | string | Placeholder text shown when empty |
| `rows` | number | Visible line count (default `10`) |
| `fixedHeight` | boolean | If `true`, height stays fixed at `rows` lines with internal scrolling. If `false` (default), the box grows to fit content as the student types, with no upper bound. |
| `debounceSeconds` | number | Seconds of no typing before the change is emitted (default `2`) |

Emits `change` with payload `{ text: string }`, debounced so it only fires once the student has paused for more than `debounceSeconds` (default 2s) — not on a fixed interval during continuous typing, and not on every keystroke, since each emit is a real WebSocket call to the backend. A final flush also fires on unmount so a pause-in-progress edit isn't lost. Wire it to a handler that persists to `$temp.*` (cheap, for autosave-while-typing) and/or `$state.*` (for durable persistence) as needed.

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

---

### `progressBar`

Displays workflow completion. Two modes, chosen by which props are set: a
labeled step mode (`labels` + `completionState`), or a percent mode
(`percentComplete`). Read-only/display-only — no `emits`.

Labeled steps:
```json
{
  "componentType": "progressBar",
  "props": {
    "labels": ["Step 1", "Step 2", "Step 3"],
    "completionState": "@state.myCompletionState"
  }
}
```

Percent:
```json
{
  "componentType": "progressBar",
  "props": {
    "percentComplete": "@state.pctComplete"
  }
}
```

Props: `labels` (string array, typically a static literal) — step labels;
`completionState` (number, zero-based) — steps before this index render as
completed, the step at this index as active, steps after as pending; defaults
to `0` if unset. `percentComplete` (number, 0–100) — used instead of
`labels`/`completionState` for a plain percentage bar; clamped to `[0, 100]`
and rounded for display. If `labels` is a non-empty array, step mode takes
precedence over percent mode.

---

### `actionButton`

A button that emits a message with an empty payload when clicked — the standard way to trigger a handler from a UI action instead of chat input.

```json
{
  "componentType": "actionButton",
  "props": { "label": "Publish Workflow" },
  "emits": { "click": "publish-workflow" }
}
```

Props: `label` (string) — button text.

Emits `click` with an empty payload `{}` when clicked. Wire it to whichever handler name should run (e.g. `"publish-workflow"`, `"generate-workflow"`).

---

### `jsonView`

Renders a JSON object as a formatted, read-only `<pre>` block. Useful for previewing draft config/state.

```json
{
  "componentType": "jsonView",
  "props": {
    "config": "@state.draftConfig",
    "emptyMessage": "Nothing to display yet."
  }
}
```

Props: `config` (object | null) — the JSON value to render; `emptyMessage` (string) — shown instead of the `<pre>` block when `config` is null/falsy.

---

### `simpleTimer`

A headless (no visible UI) timer. While `active`, fires an emit every `duration`
seconds, up to `repeats` times, then stops until reactivated.

```json
{
  "componentType": "simpleTimer",
  "props": { "active": "@state.timerRunning", "duration": 10, "repeats": 3 },
  "emits": { "complete": "timer-tick" }
}
```

Props:
| Prop | Type | Description |
|---|---|---|
| `active` | boolean | Turns the timer on/off (default `false`). Toggling off clears any pending firing and resets the repeat count; toggling back on always restarts from repeat 1. |
| `duration` | number | Seconds between firings (default `10`). |
| `repeats` | number | Total number of firings before the timer stops on its own (default `1`). |

Emits `complete` with payload `{ repeat: number, repeatsTotal: number }` each time
`duration` elapses, where `repeat` is the 1-indexed firing count — compare it to
`repeatsTotal` in the triggered handler to detect the final firing.

---

### `showIf` / `showIfNot` / `showIfItems` / `showIfEmpty`

Conditional-rendering pseudo-components. They are not looked up in the component registry — `LayoutRenderer` handles them specially and renders their `children` (or not) based on a resolved `state`/`temp` value, with no wrapper element of their own.

```json
{
  "componentType": "showIf",
  "props": { "source": "@state.requirementsReady" },
  "children": [
    { "componentType": "actionButton", "props": { "label": "Generate Workflow" }, "emits": { "click": "generate-workflow" } }
  ]
}
```

- `showIf` — renders `children` when `Boolean(source)` is `true`.
- `showIfNot` — renders `children` when `Boolean(source)` is `false`.
- `showIfItems` — `source` must resolve to an array; renders `children` when the array is non-empty.
- `showIfEmpty` — `source` must resolve to an array; renders `children` when the array is empty (or missing).

Props: `source` (string, `@state.*`/`@temp.*` path) — the value to test. `showIf`/`showIfNot` do plain truthiness checks only — they cannot do string/enum equality directly; for a multi-value enum, maintain a separate boolean flag alongside the enum and gate on that instead.
