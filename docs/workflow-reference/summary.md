# Workflow Configuration Reference — Summary

This is a condensed cheat-sheet for writing workflow JSON configuration files in this project (`apps/api/src/app/config/workflows/<name>.json`). It covers the shape of every field at a glance. **Full detail for any topic below — exact schemas, every option, worked examples — is one `get_reference_section` tool call away.** Call it whenever you need more than this summary gives you; don't guess at exact field names or option lists.

A workflow config is a JSON file that defines how an artifact type behaves when it receives WebSocket messages. The engine matches inbound `message.type` to a handler by name and executes the handler's steps in order.

## Top-level shape

```json
{
  "name": "my-workflow",
  "displayName": "My Workflow",
  "version": "1.0.0",
  "initialState": { ... },
  "handlers": { "handlerName": { "condition": "...", "requiredAccess": "read|write|admin", "steps": [ ... ] } }
}
```
`name` must match the artifact `type` and filename. `initialState` seeds a new artifact's `state`. `handlers` maps message type → handler.

## Access control

Four levels, ascending: `none`(0) < `read`(1) < `write`(2) < `admin`(3). A handler's `requiredAccess` sets the floor; effective access = max(owner-shortcut, per-user ACL, group permissions). `permissionManagerMode` (`'owner'` | `'group_admin'`) is set at artifact creation and governs who can manage permissions.

## Steps and routes

Each step: `{ "route": "client" | "database" | ["client","database"] | "database-query" | "ai", ... }`
- **`client`** — sends an outbound message (a `transform`) to all channel subscribers.
- **`database`** — persists an `update-state` message's `actions` to MongoDB (only `$state.*` paths).
- **`["client","database"]`** — both at once; the common case.
- **`database-query`** — runs a named query (`query: { name, responseType }`), then invokes the handler named by `responseType` with the result merged in.
- **`ai`** — sends `message.text` to Claude; fire-and-forget. The AI's JSON response `type` field triggers another handler.

## Transform syntax (sigils)

| Sigil | Resolved by | Use in |
|---|---|---|
| `$message.x`, `$user.x`, `$uuid` | Server, at step execution | `transform` values, `condition`, `action.value` |
| `~{ jsonata expr }` | Server, JSONata eval against `{message,user,state}` (bare names, no `$` prefix inside) | same as above, for logic dot-paths can't express |
| `@state.x`, `@temp.x`, `@item.x` | Client, at render time | `layoutConfig` node `props` only — never in action `value` |
| `$map` object (`$map`,`$using`,`$prepend`,`$append`) | Server | array-mapping transform values |

`clientMessageType` in a `transform` is renamed to `type` in the outbound frame; valid values: `initialize-state`, `initialize-view`, `update-state`.

## Action types (`update-state` actions array)

`update` (set field) · `merge` (merge object keys) · `append` / `prepend` (array insert) · `upsert` (replace-or-append by `keys`) · `remove` (delete by `keys`, uses `$pull`) · `update-in` (`findKey`/`findValue`/`subPath` — update nested field in a matched array element) · `slice` (`start`/`end` — trim array).

## Named queries (`database-query`)

`get-document`, `get-document-summary`, `get-user-documents`, `get-reviewable-documents`, `get-available-types`, `get-users`, `create-document`, `get-workflow-logs`, `get-log-tree`, `rehydrate-workflow-logs`, `rehydrate-log-tree`. Each has its own required context fields and return shape — see the detail section for exact shapes before using an unfamiliar one.

## AI step configuration

```json
{ "route": "ai", "ai": { "model": "...", "maxTokens": 64, "systemPrompt": "...", "responseTypes": [...], "referenceDocs": [...], "historyPath": "...", "tools": [...], "maxTurns": 8 } }
```
`systemPrompt` supports `{{path.to.field}}` templating (double braces, no sigil). The AI must respond with JSON containing `type`; extra fields become `$message.*` in the triggered handler. `referenceDocs` inlines markdown files on every call (use sparingly — prefer `tools` for larger material). `historyPath` is a flat top-level key on the inbound message (not a dot-path) pointing to an array replayed as multi-turn history. `tools` names tools (see registry) the model may call — the engine loops tool-use rounds internally and only emits the model's final JSON once it stops calling tools. `maxTurns` (default `8`) caps that tool-use loop — raise it for steps whose tools get called many times per turn.

## initialize-state / initialize-view

Two distinct messages: `initialize-state` (`initialState`, seeds `DocState.state`) and `initialize-view` (`viewHandler`, `layoutConfig`, delivers a layout tree). The client gates rendering on both arriving; `update-state` messages before `initialize-state` are queued and replayed.

## Layout nodes

```json
{ "componentType": "...", "targetId": "...", "props": { ... }, "emits": { "eventName": "handler-name" }, "children": [ ... ] }
```
`componentType` must be a registered type or the pseudo-component `forEach` (iterates `props.source`, an `@state.*`/`@temp.*` array, exposing `@item.*` in children). String `props` starting with `@` resolve client-side against DocState; other values pass through as-is.

## Registered component types

`fullPanel`, `chatBody`, `chatInput`, `smartAccordion`, `logTreePanel`, `smartTab`/`smartTabs`, `documentList`, `newDocument`, `layoutDocumentView`, `twoColumnLayout`, `multiFieldInput`, `textDisplay`, `youtubePlayer`, `writingArea`. Each has its own prop set — don't guess a component's exact props; fetch `registered-component-types` for the one(s) you need.

## Emit system & state namespaces

`emits: { eventName: "handler-name" }` becomes an `onEventName` prop; calling it sends a WebSocket message with that handler name plus the payload spread in. `$state.*` paths persist to Mongo; `$temp.*` paths are ephemeral (client-only). `@state.*`/`@temp.*`/`@item.*` are client-side render bindings only.

## Standard handler patterns

Every config needs: `initializeState` (runs `get-document`, forwards to `initialize-state-document`), `initialize-state-document` (sends `initialize-state` to the client), and at least one view handler (conventionally `defaultView`, sends `initialize-view` with `layoutConfig`, optionally fanning out more `database-query` steps to populate `@temp.*` bindings).

## ChatMessage object format

`chatBody` renders an array of objects with a `messageType` discriminator: `display-text`, `display-colorful-text` (has `color`), `system`, `inappropriate-text`, `multi-field-input` (inline form, `id`/`inputs`/`emits`/`fields`), `multiple-choice-quiz` (`question`/`options`/`correctKey`/`answer`/`emits.answer`).

## Getting more detail

Call `get_reference_section` with one of these `section` values whenever you need exact schemas, full option lists, or worked examples beyond what's above:

| Section | Covers |
|---|---|
| `overview-and-top-level-fields` | Where configs live, precedence, reserved system types, top-level field table |
| `handler-definition-and-access-control` | Full handler shape, condition examples, access-level computation, permissionManagerMode, ACL REST endpoints |
| `steps-and-routes` | Full route reference with examples for `client`/`database`/`database-query`/`ai` |
| `transform-syntax-and-path-substitution` | Full sigil reference, JSONata pitfalls, `$map` directive details and examples |
| `action-types-update-state` | Full field tables and examples for every action type |
| `named-queries-database-query` | Required context and exact return shape for every named query |
| `ai-step-configuration` | Full `ai` field table (including `tools`), system prompt templating, response flow, available tools |
| `initialize-messages-and-layout-nodes` | Full initialize-state/view message shapes, client lifecycle, LayoutNode fields, forEach details |
| `registered-component-types` | Full prop tables and examples for every registered component |
| `emit-system-and-state-namespaces` | Full emit-to-prop mapping rules, full state namespace table |
| `standard-handler-patterns` | Conventional implementations of the required handlers |
| `chatmessage-object-format` | Full field examples for every ChatMessage subtype |
| `complete-annotated-example` | A full, annotated, working workflow config combining most features |
