import * as path from 'path';

// Both the gateway and event-processor apps are launched with cwd = repo (or
// worktree) root, whether via `nx serve` in dev or the restart scripts —
// same assumption AiService's docs/workflow-reference tool lookups already
// rely on. Resolving from process.cwd() avoids fragile __dirname-relative
// climbing that would differ per call site depth once this directory moved
// out from under apps/api.
export const WORKFLOW_CONFIG_DIR = path.join(process.cwd(), 'libs', 'workflow-configs', 'src', 'workflows');
