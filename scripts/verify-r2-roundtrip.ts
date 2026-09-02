import 'dotenv/config';
import { storageClient } from '../apps/event-processor/src/app/services/r2-storage.client';

// Proves the local dev storage path end-to-end — Worker routing in
// apps/r2-dev-gateway, the (locally emulated) R2 binding, disk persistence
// under .wrangler/state/v3/r2, and this axios-backed client — using zero
// Cloudflare credentials. Requires `pnpm run restart:r2-gateway` first.
async function main() {
  const key = `verify/roundtrip-${Date.now()}.txt`;
  const body = Buffer.from('hello r2');

  console.log(`Uploading ${key}...`);
  await storageClient.uploadObject(key, body, 'text/plain');

  console.log('Reading it back...');
  const read = await storageClient.getObject(key);
  if (!read || !read.equals(body)) {
    throw new Error(`getObject mismatch: expected ${body.toString()}, got ${read?.toString() ?? 'null'}`);
  }

  console.log('Listing with prefix...');
  const listed = await storageClient.listObjects('verify/');
  if (!listed.some((object) => object.key === key)) {
    throw new Error(`listObjects did not include ${key}`);
  }

  console.log('Deleting...');
  await storageClient.deleteObject(key);

  console.log('Confirming deletion...');
  const afterDelete = await storageClient.getObject(key);
  if (afterDelete !== null) {
    throw new Error(`getObject after delete expected null, got ${afterDelete.toString()}`);
  }

  console.log('PASS: R2 storage round trip succeeded');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
