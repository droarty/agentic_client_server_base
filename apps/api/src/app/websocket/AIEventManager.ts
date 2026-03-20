import { Worker } from 'worker_threads';
import { join } from 'path';
import { ValidateTextMessage } from '@multiplayer-base/shared-types';

export class AIEventManager {
  publish(request: ValidateTextMessage): void {
    const workerPath = join(__dirname, 'AIWorker');
    const tsConfigPath = join(
      process.cwd(),
      process.env['TS_NODE_PROJECT'] || 'apps/api/tsconfig.app.json'
    );

    const worker = new Worker(
      `
      require('ts-node').register({ project: '${tsConfigPath}', transpileOnly: true });
      require('tsconfig-paths/register');
      require('${workerPath}');
      `,
      { eval: true }
    );

    worker.postMessage(request);

    worker.on('error', (err) => console.error('AIWorker error:', err));
  }
}
