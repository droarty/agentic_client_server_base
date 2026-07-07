import * as fs from 'fs';
import * as path from 'path';

export interface AiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

// Filename stems under docs/workflow-reference/ — kept in sync manually with
// that directory's contents (see docs/workflow-reference/summary.md).
const REFERENCE_SECTIONS = [
  'overview-and-top-level-fields',
  'handler-definition-and-access-control',
  'steps-and-routes',
  'transform-syntax-and-path-substitution',
  'action-types-update-state',
  'named-queries-database-query',
  'ai-step-configuration',
  'initialize-messages-and-layout-nodes',
  'registered-component-types',
  'emit-system-and-state-namespaces',
  'standard-handler-patterns',
  'chatmessage-object-format',
  'complete-annotated-example',
] as const;

const TOOLS: Record<string, AiTool> = {
  get_reference_section: {
    name: 'get_reference_section',
    description:
      'Fetch the full documentation for one section of the workflow config reference. Call this when you need exact schemas, full option lists, or worked examples beyond the always-provided summary.',
    input_schema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: [...REFERENCE_SECTIONS],
          description: 'Which reference section to retrieve.',
        },
      },
      required: ['section'],
    },
    execute: async (input) => {
      const section = String(input['section'] ?? '');
      if (!(REFERENCE_SECTIONS as readonly string[]).includes(section)) {
        return `Unknown section "${section}". Valid sections: ${REFERENCE_SECTIONS.join(', ')}`;
      }
      const filePath = path.join(process.cwd(), 'docs', 'workflow-reference', `${section}.md`);
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch {
        return `Failed to read reference section "${section}".`;
      }
    },
  },
};

export function resolveTools(names: string[]): AiTool[] {
  return names.map((name) => TOOLS[name]).filter((tool): tool is AiTool => !!tool);
}
