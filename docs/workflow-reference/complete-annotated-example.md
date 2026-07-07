# Complete Annotated Example

Below is a minimal but complete workflow config that demonstrates all major features: state initialization, a view with two columns, a multi-field form, AI moderation, and database persistence.

```json
{
  "name": "feedback-collector",
  "displayName": "Feedback Collector",
  "version": "1.0.0",

  // initialState is seeded into a new artifact's state on creation.
  "initialState": {
    "feedbackItems": [],
    "inputValues": {
      "category": "",
      "message": ""
    }
  },

  "handlers": {

    // --- Required: load persisted state on channel mount ---
    "initializeState": {
      "steps": [
        {
          "route": "database-query",
          "query": { "name": "get-document", "responseType": "initialize-state-document" }
        }
      ]
    },

    // --- Required companion: send loaded state to client ---
    "initialize-state-document": {
      "steps": [
        {
          "route": "client",
          "transform": {
            "clientMessageType": "initialize-state",
            "initialState": "$message.document.state"
          }
        }
      ]
    },

    // --- Required: deliver the UI layout ---
    "defaultView": {
      "steps": [
        {
          "route": "client",
          "transform": {
            "clientMessageType": "initialize-view",
            "viewHandler": "defaultView",
            "layoutConfig": [
              {
                "componentType": "twoColumnLayout",
                "children": [
                  {
                    // Left column: a form for submitting feedback
                    // @state.inputValues is resolved client-side at render time
                    "componentType": "multiFieldInput",
                    "props": {
                      "fields": [
                        { "name": "category", "label": "Category", "placeholder": "e.g. Bug" },
                        { "name": "message",  "label": "Message",  "placeholder": "Describe the issue" }
                      ],
                      "submitLabel": "Submit Feedback",
                      "values": "@state.inputValues"
                    },
                    "emits": { "submit": "submit-feedback" }
                  },
                  {
                    // Right column: list of submitted feedback
                    "componentType": "chatBody",
                    "props": { "messages": "@state.feedbackItems" }
                  }
                ]
              }
            ]
          }
        }
      ]
    },

    // --- User action: submit the form ---
    // Guard: only proceed if message field is non-empty.
    "submit-feedback": {
      "condition": "$message.message",
      "steps": [
        {
          // Persist the input values and show a "processing" message
          "route": ["client", "database"],
          "transform": {
            "clientMessageType": "update-state",
            "actions": [
              {
                "actionType": "update",
                "path": "$state.inputValues",
                "value": {
                  "category": "$message.category",
                  "message": "$message.message"
                }
              },
              {
                "actionType": "append",
                "path": "$state.feedbackItems",
                "value": {
                  "messageType": "system",
                  "text": "Checking your feedback..."
                }
              }
            ]
          }
        },
        {
          // Send to AI for moderation
          "route": "ai",
          "ai": {
            "model": "claude-haiku-4-5-20251001",
            "maxTokens": 32,
            "systemPrompt": "You are a content moderator. Check if the following feedback message is appropriate.\n\nFeedback: {{message.message}}\n\nRespond ONLY with valid JSON:\n{\"type\":\"appropriate-feedback\"}\nor\n{\"type\":\"inappropriate-feedback\"}",
            "responseTypes": ["appropriate-feedback", "inappropriate-feedback"]
          }
        }
      ]
    },

    // --- AI response: feedback passed moderation ---
    "appropriate-feedback": {
      "steps": [
        {
          "route": ["client", "database"],
          "transform": {
            "clientMessageType": "update-state",
            "actions": [
              {
                "actionType": "append",
                "path": "$state.feedbackItems",
                "value": {
                  "messageType": "display-text",
                  "text": "$message.message",
                  "authorEmail": "$message.senderEmail"
                }
              }
            ]
          }
        }
      ]
    },

    // --- AI response: feedback blocked by moderation ---
    "inappropriate-feedback": {
      "steps": [
        {
          "route": ["client", "database"],
          "transform": {
            "clientMessageType": "update-state",
            "actions": [
              {
                "actionType": "append",
                "path": "$state.feedbackItems",
                "value": {
                  "messageType": "inappropriate-text",
                  "text": "Your feedback was flagged as inappropriate and was not saved.",
                  "color": "red"
                }
              }
            ]
          }
        }
      ]
    }

  }
}
```

> **Note:** JSON does not support comments. The `// ...` annotations above are for illustration only — remove them before using.
