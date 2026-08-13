import { createAccessLevelCache } from './access-level-cache';
import { AccessLevel } from './access-level';

const TTL_MS = 10 * 60 * 1000;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('first call invokes compute and returns its result', async () => {
  const cache = createAccessLevelCache(TTL_MS);
  const compute = jest.fn<Promise<AccessLevel>, []>().mockResolvedValue('write');
  const result = await cache.get('u1', 'ch1', compute);
  expect(result).toBe('write');
  expect(compute).toHaveBeenCalledTimes(1);
});

test('second call within TTL returns cached value without re-computing', async () => {
  const cache = createAccessLevelCache(TTL_MS);
  const compute = jest.fn<Promise<AccessLevel>, []>().mockResolvedValue('read');
  await cache.get('u1', 'ch1', compute);
  jest.advanceTimersByTime(TTL_MS - 1);
  const result = await cache.get('u1', 'ch1', compute);
  expect(result).toBe('read');
  expect(compute).toHaveBeenCalledTimes(1);
});

test('call after TTL expiry re-invokes compute and returns updated level', async () => {
  const cache = createAccessLevelCache(TTL_MS);
  const compute = jest.fn<Promise<AccessLevel>, []>()
    .mockResolvedValueOnce('read')
    .mockResolvedValueOnce('write');
  await cache.get('u1', 'ch1', compute);
  jest.advanceTimersByTime(TTL_MS + 1);
  const result = await cache.get('u1', 'ch1', compute);
  expect(result).toBe('write');
  expect(compute).toHaveBeenCalledTimes(2);
});

test('different userId for the same channel uses a separate cache entry', async () => {
  const cache = createAccessLevelCache(TTL_MS);
  const compute1 = jest.fn<Promise<AccessLevel>, []>().mockResolvedValue('admin');
  const compute2 = jest.fn<Promise<AccessLevel>, []>().mockResolvedValue('read');
  await cache.get('u1', 'ch1', compute1);
  await cache.get('u2', 'ch1', compute2);
  expect(compute1).toHaveBeenCalledTimes(1);
  expect(compute2).toHaveBeenCalledTimes(1);
});

test('same userId with a different channel uses a separate cache entry', async () => {
  const cache = createAccessLevelCache(TTL_MS);
  const compute1 = jest.fn<Promise<AccessLevel>, []>().mockResolvedValue('write');
  const compute2 = jest.fn<Promise<AccessLevel>, []>().mockResolvedValue('none');
  await cache.get('u1', 'ch1', compute1);
  await cache.get('u1', 'ch2', compute2);
  expect(compute1).toHaveBeenCalledTimes(1);
  expect(compute2).toHaveBeenCalledTimes(1);
});
