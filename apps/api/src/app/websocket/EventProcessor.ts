import { WebSocket } from 'ws';
import { Worker } from 'worker_threads';
import { join } from 'path';
import { AnyMessage } from '@multiplayer-base/shared-types';
import type { WorkerInput, WorkerOutput } from './EventProcessorWorker';

export class EventProcessor {
  private worker: Worker;

  constructor(private localSockets: Map<string, WebSocket>) {
    // ts-node doesn't compile worker files automatically — bootstrap it inside
    // the worker via eval so it can load the TypeScript source directly.
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

    this.worker.on('message', ({ frame, socketIds }: WorkerOutput) => {
      for (const socketId of socketIds) {
        const ws = this.localSockets.get(socketId);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(frame);
        }
      }
    });

    this.worker.on('error', (err) =>
      console.error('EventProcessor worker error:', err)
    );
  }

  process(channel: string, message: AnyMessage): void {
    this.worker.postMessage({ channel, message } satisfies WorkerInput);
  }

  shutdown(): void {
    void this.worker.terminate();
  }
}
