import * as path from 'path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createDb, toPgTextArray, type Database } from './index';
import { startTestPostgres, type TestPostgresHandle } from './test-helpers/embedded-postgres';

let pgHandle: TestPostgresHandle;
let db: Database;
let pool: Pool;

beforeAll(async () => {
  pgHandle = await startTestPostgres('sql_functions_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', 'drizzle') });
}, 60000);

afterAll(async () => {
  await pool?.end();
  await pgHandle?.stop();
}, 30000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function jsonbArrayUpsert(target: unknown, arrayPath: string[], keys: string[], item: unknown): Promise<any> {
  const result = await db.execute(sql`
    SELECT jsonb_array_upsert(${JSON.stringify(target)}::jsonb, ${toPgTextArray(arrayPath)}::text[], ${toPgTextArray(keys)}::text[], ${JSON.stringify(item)}::jsonb) AS result
  `);
  return result.rows[0]?.['result'];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function jsonbArrayUpdateIn(target: unknown, arrayPath: string[], findKey: string, findValue: string, subPath: string[], value: unknown): Promise<any> {
  const result = await db.execute(sql`
    SELECT jsonb_array_update_in(${JSON.stringify(target)}::jsonb, ${toPgTextArray(arrayPath)}::text[], ${findKey}, ${findValue}, ${toPgTextArray(subPath)}::text[], ${JSON.stringify(value)}::jsonb) AS result
  `);
  return result.rows[0]?.['result'];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function jsonbArraySlice(target: unknown, arrayPath: string[], startIdx: number, endIdx: number | null): Promise<any> {
  const result = await db.execute(sql`
    SELECT jsonb_array_slice(${JSON.stringify(target)}::jsonb, ${toPgTextArray(arrayPath)}::text[], ${startIdx}, ${endIdx}) AS result
  `);
  return result.rows[0]?.['result'];
}

describe('jsonb_array_upsert', () => {
  // Ported 1:1 from DatabasePersistor.spec.ts's 'upsert action' cases — the
  // "keys is missing" guard case isn't ported since that's a JS-level
  // validation in DatabasePersistor.ts (Phase 4), not something the SQL
  // function itself needs to handle (keys is always supplied here).
  test('appends item when no match exists', async () => {
    const result = await jsonbArrayUpsert({ items: [] }, ['items'], ['id'], { id: 'a', name: 'Alpha' });
    expect(result.items).toEqual([{ id: 'a', name: 'Alpha' }]);
  });

  test('updates item in place when single key matches', async () => {
    const target = { items: [{ id: 'a', name: 'Old' }, { id: 'b', name: 'Beta' }] };
    const result = await jsonbArrayUpsert(target, ['items'], ['id'], { id: 'a', name: 'New' });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ id: 'a', name: 'New' });
    expect(result.items[1]).toEqual({ id: 'b', name: 'Beta' });
  });

  test('uses multi-key matching correctly', async () => {
    const target = { items: [{ type: 'x', key: '1', val: 'old' }, { type: 'x', key: '2', val: 'keep' }] };
    const result = await jsonbArrayUpsert(target, ['items'], ['type', 'key'], { type: 'x', key: '1', val: 'new' });
    expect(result.items[0].val).toBe('new');
    expect(result.items[1].val).toBe('keep');
  });

  test('creates the array when the path does not exist yet', async () => {
    const result = await jsonbArrayUpsert({}, ['items'], ['id'], { id: 'a' });
    expect(result.items).toEqual([{ id: 'a' }]);
  });

  test('works on a nested path', async () => {
    const target = { sub: { items: [{ id: 'a', v: 1 }] } };
    const result = await jsonbArrayUpsert(target, ['sub', 'items'], ['id'], { id: 'a', v: 2 });
    expect(result.sub.items).toEqual([{ id: 'a', v: 2 }]);
  });
});

describe('jsonb_array_update_in', () => {
  test('patches sub_path on the matching element, leaving others untouched', async () => {
    const target = { items: [{ id: 'a', status: 'old' }, { id: 'b', status: 'keep' }] };
    const result = await jsonbArrayUpdateIn(target, ['items'], 'id', 'a', ['status'], 'new');
    expect(result.items).toEqual([{ id: 'a', status: 'new' }, { id: 'b', status: 'keep' }]);
  });

  // Mongo's arrayFilters + positional $[elem] update patches every element
  // matching the filter, not just the first — this must match that exactly.
  test('patches ALL matching elements, not just the first', async () => {
    const target = { items: [{ id: 'a', status: 'old' }, { id: 'a', status: 'old' }, { id: 'b', status: 'keep' }] };
    const result = await jsonbArrayUpdateIn(target, ['items'], 'id', 'a', ['status'], 'new');
    expect(result.items).toEqual([{ id: 'a', status: 'new' }, { id: 'a', status: 'new' }, { id: 'b', status: 'keep' }]);
  });

  test('leaves the array unchanged when nothing matches', async () => {
    const target = { items: [{ id: 'a', status: 'old' }] };
    const result = await jsonbArrayUpdateIn(target, ['items'], 'id', 'zzz', ['status'], 'new');
    expect(result.items).toEqual([{ id: 'a', status: 'old' }]);
  });

  test('adds sub_path if the matching element does not already have it', async () => {
    const target = { items: [{ id: 'a' }] };
    const result = await jsonbArrayUpdateIn(target, ['items'], 'id', 'a', ['status'], 'new');
    expect(result.items).toEqual([{ id: 'a', status: 'new' }]);
  });
});

describe('jsonb_array_slice', () => {
  const ITEMS = { items: [0, 1, 2, 3, 4] };

  describe('2-arg form (end_idx is null, start_idx is n)', () => {
    test('positive n keeps the first n elements', async () => {
      const result = await jsonbArraySlice(ITEMS, ['items'], 2, null);
      expect(result.items).toEqual([0, 1]);
    });

    test('negative n keeps the last |n| elements', async () => {
      const result = await jsonbArraySlice(ITEMS, ['items'], -2, null);
      expect(result.items).toEqual([3, 4]);
    });

    test('n larger than the array length returns the whole array', async () => {
      const result = await jsonbArraySlice(ITEMS, ['items'], 100, null);
      expect(result.items).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('3-arg form (position, n)', () => {
    test('non-negative position takes n elements starting there', async () => {
      const result = await jsonbArraySlice(ITEMS, ['items'], 1, 2);
      expect(result.items).toEqual([1, 2]);
    });

    test('negative position counts from the end', async () => {
      const result = await jsonbArraySlice(ITEMS, ['items'], -2, 1);
      expect(result.items).toEqual([3]);
    });

    test('negative position beyond array length clamps to the start', async () => {
      const result = await jsonbArraySlice(ITEMS, ['items'], -100, 2);
      expect(result.items).toEqual([0, 1]);
    });

    test('position beyond array length returns an empty array', async () => {
      const result = await jsonbArraySlice(ITEMS, ['items'], 100, 2);
      expect(result.items).toEqual([]);
    });
  });
});
