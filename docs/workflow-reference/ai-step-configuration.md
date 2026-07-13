# AI Step Configuration

A step with `"route": "ai"` sends the inbound message's `text` field to Claude (Anthropic API) and returns immediately. When the AI responds, its response is parsed as JSON and the `type` field becomes the new `message.type`, triggering the matching handler.

```json
{
  "route": "ai",
  "ai": {
    "model": "claude-haiku-4-5-20251001",
    "maxTokens": 64,
    "systemPrompt": "...",
    "responseTypes": ["handler-name-a", "handler-name-b"]
  }
}
```

### `ai` object fields

| Field | Type | Default | Description |
|---|---|---|---|
| `model` | string | `"claude-haiku-4-5-20251001"` | Anthropic model ID |
| `maxTokens` | number | `64` | Maximum tokens in the AI response |
| `systemPrompt` | string | required | System prompt. Supports `{{expr}}` template substitution (not `$` patterns). |
| `responseTypes` | string[] | optional | List of expected `type` values in the AI JSON response. Each must match a handler name. |
| `referenceDocs` | string[] | optional | Paths (relative to the repo root) to markdown files whose content is read from disk and prepended to `systemPrompt` on every call. Use for always-needed context that's small enough to inline on every turn — for larger reference material, prefer `tools` (see below) so the model fetches detail only when it needs it. |
| `historyPath` | string | optional | Dot-path to an array of prior chat messages to replay as multi-turn conversation history — resolved with the **same rules as `{{expr}}`** below: relative to the context object `{ message, user, state }`, `.`-separated segments, optional leading `$`, missing segments resolve to nothing rather than throwing. `"state.chatMessages"` and `"message.chatMessages"` are both valid. **`state.*` is always safe to use here**: immediately before every `ai` call, the engine re-fetches the artifact's persisted state fresh from the database (not the `context.state` snapshotted once at the top of the handler chain), so it reflects any `$state.*` mutations earlier steps in the same handler just persisted. `message.*` reflects whatever the triggering message or a preceding `database-query` result carries at that point. The array's entries are replayed as multi-turn conversation history: `messageType: "user-text"` becomes a `user` turn, `messageType: "ai-reply"` becomes an `assistant` turn. Omit for single-shot (no history) steps. |
| `tools` | string[] | optional | Names of tools (resolved via the tool registry, `apps/api/src/app/websocket/tools/registry.ts`) the model may call before producing its final JSON response. The engine runs a bounded multi-round tool-use loop: whenever the model requests a tool, the engine executes it locally and feeds the result back, repeating until the model returns a final plain-text response. Omit entirely for existing single-shot steps (e.g. content moderation) — behavior is unchanged when `tools` is absent. |
| `maxTurns` | number | `8` | Caps the tool-use loop described above — the number of Claude round-trips allowed before the step fails with "AI tool loop exceeded N rounds without a final response". Only relevant when `tools` is set; irrelevant for single-shot steps, which always complete in one round. Raise this for steps whose tools are called many times per turn (e.g. `run-config-ai-step`, which fetches several `get_reference_section` sections while drafting a workflow config, uses `20`). |

### Text-or-history invariant

Every `ai` step must resolve either a non-empty inbound `message.text` **or** a non-empty
`historyPath` array — Claude needs at least one of the two to have anything to respond to.
If `historyPath` is set but resolves to nothing, or if neither `text` nor history is
present, the engine logs a `logType: "error"` entry to `workflowlogs` and (in the
neither-present case) skips the AI call entirely rather than sending an empty request.

### System prompt templating

Use `{{path.to.field}}` syntax (double braces) in `systemPrompt` to inject live values. The path is a dot-path relative to the context object `{ message, user, state }` — no leading sigil needed.

```json
"systemPrompt": "Generate a story about character '{{message.name_of_character}}' in setting '{{message.setting}}' who faces '{{message.problem_the_character_is_facing}}'."
```

### AI response format

The AI **must** respond with valid JSON containing a `type` field. The engine parses this and routes to the matching handler. Instruct the AI clearly in the system prompt:

```
Respond ONLY with valid JSON (no markdown, no code blocks, no extra text):
{"type":"handler-name-a"}
or
{"type":"handler-name-b","text":"<content>"}
```

Any additional fields in the AI's JSON object are merged into the message and accessible as `$message.*` in the triggered handler.

**If `tools` is set:** the JSON-only rule applies only to the model's *final* message. The model may call tools in intermediate turns (these are handled entirely by the engine and are invisible to the rest of the workflow); once it stops calling tools, its last message must still be exactly one of the expected JSON shapes.

### AI response flow

```
inbound message (type: "add-text")
  → handler "add-text" → step route "ai"
    → AiService sends text to Claude
    → AI responds: {"type":"valid-text"}
      → engine invokes handler "valid-text" with:
           message.type = "valid-text"
           message.channel = original channel
           message.text = original text (passed through)
           message.senderEmail = original senderEmail
```

**Important:** `ai` steps are fire-and-forget. The calling handler does not wait for the AI response (including any tool-use rounds, which happen entirely within the engine before the AI response is emitted). Subsequent steps in the same handler run immediately after the AI step.

### Available tools

| Tool name | Description |
|---|---|
| `get_reference_section` | Fetches the full markdown content of one section of the workflow config reference (see [Registered Component Types](./registered-component-types.md) and friends) by name. Takes `{ "section": "<slug>" }`; valid slugs are listed in `docs/workflow-reference/summary.md`'s "Getting more detail" list. Returns an error string (not a thrown error) for an unrecognized slug. |
