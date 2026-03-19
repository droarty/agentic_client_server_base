import { Worker } from 'worker_threads';
import { join } from 'path';
import { InboundMessage } from '@multiplayer-base/shared-types';
import type { WorkerInput } from './EventProcessorTypes';

export class EventProcessor {
  private worker: Worker;

  constructor() {
    const workerPath = join(__dirname, 'EventProcessorWorker');
    const tsConfigPath = join(
      process.cwd(),
      process.env['TS_NODE_PROJECT'] || 'apps/api/tsconfig.app.json'
    );

    this.worker = new Worker(
      `
      require('ts-node').register({ project: '${tsConfigPath}', transpileOnly: true });
      require('tsconfig-paths/register');
      require('${workerPath}');
      `,
      { eval: true }
    );

    this.worker.on('error', (err) =>
      console.error('EventProcessor worker error:', err)
    );
  }

  // Fire and forget — the worker owns the full pipeline including Redis publish
  process(message: InboundMessage): void {
    this.worker.postMessage({ message } satisfies WorkerInput);
  }

  shutdown(): void {
    void this.worker.terminate();
  }
}
