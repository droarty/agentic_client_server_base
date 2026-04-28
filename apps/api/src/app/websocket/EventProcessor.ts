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

    const openInspector =
      process.env['NODE_ENV'] !== 'production'
        ? `require('inspector').open(9230, '127.0.0.1', false);`
        : '';

    this.worker = new Worker(
      `
      ${openInspector}
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

  // Fire and forget — for inbound client messages
  process(message: InboundMessage): void {
    this.worker.postMessage({ message: message as unknown as Record<string, unknown> } satisfies WorkerInput);
  }

  // Fire a server-generated event with optional user context
  fire(message: Record<string, unknown>, user?: { id: string; email: string }): void {
    this.worker.postMessage({ message, user } satisfies WorkerInput);
  }

  shutdown(): void {
    void this.worker.terminate();
  }
}
