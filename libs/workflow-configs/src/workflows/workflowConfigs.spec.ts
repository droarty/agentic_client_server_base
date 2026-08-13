import * as fs from 'fs';
import * as path from 'path';

interface StepDefinition {
  route: string | string[];
  query?: { name: string; responseType: string };
  queries?: Array<{ name: string; key: string }>;
  responseType?: string;
  ai?: { responseTypes?: string[] };
}

interface HandlerDefinition {
  steps: StepDefinition[];
}

interface WorkflowConfig {
  name?: string;
  handlers: Record<string, HandlerDefinition>;
}

const configDir = __dirname;
const configFiles = fs.readdirSync(configDir).filter((f) => f.endsWith('.json'));

describe('workflow config files', () => {
  test.each(configFiles)('%s parses as valid JSON', (file) => {
    expect(() => JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf-8'))).not.toThrow();
  });

  test.each(configFiles)('%s: every referenced responseType has a matching handler', (file) => {
    const config = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf-8')) as WorkflowConfig;
    const handlerNames = new Set(Object.keys(config.handlers ?? {}));

    for (const [handlerName, handler] of Object.entries(config.handlers ?? {})) {
      for (const step of handler.steps ?? []) {
        if (step.query?.responseType) {
          expect(handlerNames.has(step.query.responseType)).toBe(true);
        }
        if (step.responseType) {
          expect(handlerNames.has(step.responseType)).toBe(true);
        }
        for (const responseType of step.ai?.responseTypes ?? []) {
          expect(handlerNames.has(responseType)).toBe(true);
        }
        void handlerName;
      }
    }
  });
});
