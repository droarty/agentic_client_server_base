# ChatMessage Object Format

`chatBody` renders an array of `ChatMessage` objects stored in state (bound via `@state.chatMessages` in the layout). Each object has a `messageType` discriminator:

### `display-text`

Plain text message.

```json
{ "messageType": "display-text", "text": "Hello world", "authorEmail": "user@example.com" }
```

### `display-colorful-text`

Colored text message (e.g., for system messages or error notices).

```json
{ "messageType": "display-colorful-text", "text": "Error!", "color": "red", "authorEmail": "user@example.com" }
```

Common `color` values: `"red"`, `"green"`, `"blue"`, `"yellow"`, `"gray"`.

### `system`

System/informational message, styled differently from user messages.

```json
{ "messageType": "system", "text": "Welcome! Fill out the form below." }
```

### `inappropriate-text`

Rendered as a warning that a message was blocked by moderation.

```json
{ "messageType": "inappropriate-text", "text": "inappropriate text", "color": "red", "authorEmail": "user@example.com" }
```

### `multi-field-input`

An inline form rendered inside the chat. When submitted, fires an `emits` action.

```json
{
  "id": "form-initial",
  "messageType": "multi-field-input",
  "inputs": null,
  "emits": { "submit": "submit-story-inputs" },
  "fields": [
    { "name": "name_of_character", "label": "Character Name", "placeholder": "e.g. Alex" },
    { "name": "setting",           "label": "Setting",        "placeholder": "e.g. Outer Space" }
  ],
  "submitLabel": "Generate Story"
}
```

- `id` — required when you need to later update it with `update-in` (e.g., to freeze submitted values). Use `"$uuid"` to generate a unique id server-side.
- `inputs` — if `null`, shows the editable form; if an object, shows read-only submitted values.
- `emits` — same structure as layout node `emits`. The submit payload includes all field values keyed by `name`.

### `multiple-choice-quiz`

A quiz question with radio-button options.

```json
{
  "messageType": "multiple-choice-quiz",
  "question": "What is the capital of France?",
  "options": [
    { "key": "a", "label": "Paris" },
    { "key": "b", "label": "London" },
    { "key": "c", "label": "Berlin" }
  ],
  "correctKey": "a",
  "answer": null,
  "emits": { "answer": "quiz-answer" }
}
```

- `answer` — `null` means unanswered; set to the chosen `key` once answered.
- `emits.answer` — fires when the user selects an option.
