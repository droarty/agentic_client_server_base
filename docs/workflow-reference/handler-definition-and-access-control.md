# Handler Definition and Access Control

## Handler Definition

```json
"handlerName": {
  "condition": "$message.text",
  "steps": [ ... ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `condition` | string | no | Evaluated before any steps run. If falsy, the entire handler is skipped. Supports all value syntaxes (`$`, `@`, `~{}`). |
| `requiredAccess` | `"read" \| "write" \| "admin"` | no | Minimum access level the caller must hold. If the caller's effective level is lower, the handler is skipped and an error is logged. Omit to allow any authenticated user. See [Access Control](#access-control). |
| `steps` | array | yes | Ordered list of step definitions executed sequentially. |

### Condition examples

```json
"condition": "$message.text"                       // truthy if message.text is non-empty
"condition": "$message.documentId"                 // truthy if message.documentId exists
"condition": "~{ $count(message.items) > 0 }"     // JSONata: truthy if items array is non-empty
```

### requiredAccess example

```json
"save-note": {
  "requiredAccess": "write",
  "steps": [
    {
      "route": ["client", "database"],
      "transform": {
        "clientMessageType": "update-state",
        "actions": [
          { "actionType": "update", "path": "$state.note", "value": "$message.text" }
        ]
      }
    }
  ]
}
```

## Access Control

Every WebSocket message is evaluated against the caller's effective access level for the artifact. The engine computes the level once per message (cached in-process for 10 minutes) and passes it through `WorkflowContext`. Handlers can declare a `requiredAccess` floor; the engine enforces it before running any steps.

### Access levels

Four levels in ascending order:

| Level | Rank | Meaning |
|-------|------|---------|
| `none` | 0 | No access — message is not processed |
| `read` | 1 | Can read state and receive view layouts |
| `write` | 2 | Can mutate state and persist to the database |
| `admin` | 3 | Full access, including permission management |

### How effective access is computed

For each message the engine resolves the caller's access level in this order — the **first match wins** for the owner shortcut, then the **maximum** of user ACL and group permissions:

1. **Owner shortcut** — if `permissionManagerMode` is `'owner'` and the caller is the artifact's `userId`, effective access is `admin` immediately.
2. **User-level ACL** (`userPermissions[]`) — explicit per-user grants stored on the artifact. Each entry is `{ userId, access }`.
3. **Group-based permissions** (`permissions[]`) — grants tied to groups. The engine resolves all groups the caller belongs to (including ancestor groups via the group hierarchy) and takes the highest matching access level.
4. **Effective access** = `max(userACLLevel, groupLevel)`.

### permissionManagerMode

Every artifact has a `permissionManagerMode` that determines who can call the permission management endpoints:

| Mode | Set when | Who can manage permissions |
|------|----------|---------------------------|
| `'owner'` | User creates a document for themselves (no `targetUserId`) | Only the artifact's `userId` (the creator) |
| `'group_admin'` | Group admin creates a document for a target user (requires `groupId` + `targetUserId`) | Any member with `admin` or `owner` role in the artifact's owning group |

The mode is set at creation time and cannot be changed. In `'owner'` mode the creator is always implicitly `admin`; in `'group_admin'` mode the creator is not automatically an admin — access flows through group membership.

### REST endpoints for managing user-level ACL

These endpoints let an authorized caller grant or revoke per-user access on a specific artifact. All require that `canManagePermissions` passes for the caller (i.e. the caller satisfies the `permissionManagerMode` rules above).

| Method | Path | Body | Effect |
|--------|------|------|--------|
| `PATCH` | `/api/documents/:id/user-permissions` | `{ userId, access: "read" \| "write" \| "admin" }` | Create or update the named user's access on this artifact |
| `DELETE` | `/api/documents/:id/user-permissions/:userId` | — | Remove the named user's explicit ACL entry |

**Escalation guard:** a caller cannot grant a level higher than their own effective access. For example, a `write`-level caller cannot grant `admin` to another user.
