// Runs in a genuinely separate Node process, forked from
// embedded-postgres.ts's startTestPostgres(). embedded-postgres ships ESM-only,
// and Jest's dynamic-import support (even via process.send/import()) is blocked
// without --experimental-vm-modules — a real Jest limitation, not something
// fixable from inside a jest-runtime-managed test file. Being a standalone
// .mjs process invoked via child_process.fork() sidesteps jest-runtime
// entirely, since Node treats this file as ESM regardless of the parent
// process's module system.
import EmbeddedPostgres from 'embedded-postgres';

const { databaseDir, port, dbName } = JSON.parse(process.argv[2]);

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'postgres',
  password: 'postgres',
  persistent: false,
});

await pg.initialise();
await pg.start();
await pg.createDatabase(dbName);

process.send({ type: 'ready' });

process.on('message', async (msg) => {
  if (msg?.type === 'stop') {
    await pg.stop();
    process.send({ type: 'stopped' });
    process.exit(0);
  }
});
