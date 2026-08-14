import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fork, type ChildProcess } from 'child_process';

export interface TestPostgresHandle {
  connectionString: string;
  stop(): Promise<void>;
}

// Spins up an isolated, real Postgres instance for one test file — the
// Postgres-side replacement for this repo's previous per-file
// MongoMemoryServer.create() convention. Runs embedded-postgres in a forked
// child process (see embedded-postgres-runner.mjs) rather than in-process,
// working around Jest's inability to dynamic-import ESM-only packages.
export async function startTestPostgres(dbName: string): Promise<TestPostgresHandle> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embedded-postgres-'));
  const port = 40000 + Math.floor(Math.random() * 20000);

  const child: ChildProcess = fork(
    path.join(__dirname, 'embedded-postgres-runner.mjs'),
    [JSON.stringify({ databaseDir: dataDir, port, dbName })],
    { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }
  );

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('embedded-postgres runner did not become ready in time')), 60000);
    child.once('message', (msg: { type: string }) => {
      if (msg?.type === 'ready') {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`embedded-postgres runner exited early with code ${code}`));
    });
  });

  return {
    connectionString: `postgres://postgres:postgres@localhost:${port}/${dbName}`,
    async stop() {
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.send({ type: 'stop' });
      });
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
