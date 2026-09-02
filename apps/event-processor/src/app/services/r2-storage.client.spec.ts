import { Readable } from 'stream';

jest.mock('axios');
jest.mock('@aws-sdk/client-s3');

import axios from 'axios';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { createWranglerDevStorageClient, createR2StorageClient, selectStorageClient } from './r2-storage.client';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedS3Client = S3Client as jest.MockedClass<typeof S3Client>;

describe('createWranglerDevStorageClient', () => {
  const httpMock = { get: jest.fn(), put: jest.fn(), delete: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(httpMock as never);
    mockedAxios.isAxiosError.mockImplementation((err: unknown): err is never => !!(err as { isAxiosError?: boolean })?.isAxiosError);
  });

  test('uploadObject PUTs the encoded key with the body and content type', async () => {
    httpMock.put.mockResolvedValue({});
    const client = createWranglerDevStorageClient();
    await client.uploadObject('a/b c.txt', Buffer.from('hello'), 'text/plain');
    expect(httpMock.put).toHaveBeenCalledWith('/objects/a%2Fb%20c.txt', Buffer.from('hello'), {
      headers: { 'content-type': 'text/plain' },
    });
  });

  test('getObject returns the response bytes as a Buffer', async () => {
    httpMock.get.mockResolvedValue({ data: new TextEncoder().encode('hello').buffer });
    const client = createWranglerDevStorageClient();
    const result = await client.getObject('key');
    expect(result).toEqual(Buffer.from('hello'));
  });

  test('getObject returns null on a 404', async () => {
    httpMock.get.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const client = createWranglerDevStorageClient();
    expect(await client.getObject('missing')).toBeNull();
  });

  test('getObject rethrows non-404 errors', async () => {
    const err = { isAxiosError: true, response: { status: 500 } };
    httpMock.get.mockRejectedValue(err);
    const client = createWranglerDevStorageClient();
    await expect(client.getObject('key')).rejects.toBe(err);
  });

  test('deleteObject DELETEs the encoded key', async () => {
    httpMock.delete.mockResolvedValue({});
    const client = createWranglerDevStorageClient();
    await client.deleteObject('a/b.txt');
    expect(httpMock.delete).toHaveBeenCalledWith('/objects/a%2Fb.txt');
  });

  test('listObjects passes the prefix and returns the parsed metadata', async () => {
    const objects = [{ key: 'a', size: 1, uploadedAt: '2026-01-01T00:00:00.000Z' }];
    httpMock.get.mockResolvedValue({ data: objects });
    const client = createWranglerDevStorageClient();
    const result = await client.listObjects('a/');
    expect(httpMock.get).toHaveBeenCalledWith('/objects', { params: { prefix: 'a/' } });
    expect(result).toEqual(objects);
  });
});

describe('createR2StorageClient', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    MockedS3Client.mockImplementation(() => ({ send: mockSend }) as never);
  });

  test('uploadObject sends a PutObjectCommand with the bucket, key, body, and content type', async () => {
    mockSend.mockResolvedValue({});
    const client = createR2StorageClient();
    await client.uploadObject('key', Buffer.from('hello'), 'text/plain');
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'key', Body: Buffer.from('hello'), ContentType: 'text/plain' })
    );
  });

  test('getObject streams the body back into a Buffer', async () => {
    mockSend.mockResolvedValue({ Body: Readable.from([Buffer.from('hel'), Buffer.from('lo')]) });
    const client = createR2StorageClient();
    const result = await client.getObject('key');
    expect(result).toEqual(Buffer.from('hello'));
  });

  test('getObject returns null when the key does not exist', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
    const client = createR2StorageClient();
    expect(await client.getObject('missing')).toBeNull();
  });

  test('deleteObject sends a DeleteObjectCommand for the key', async () => {
    mockSend.mockResolvedValue({});
    const client = createR2StorageClient();
    await client.deleteObject('key');
    expect(DeleteObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Key: 'key' }));
  });

  test('listObjects sends a ListObjectsV2Command and maps the contents', async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: 'a', Size: 3, LastModified: new Date('2026-01-01T00:00:00.000Z'), ETag: '"etag"' }],
    });
    const client = createR2StorageClient();
    const result = await client.listObjects('prefix/');
    expect(ListObjectsV2Command).toHaveBeenCalledWith(expect.objectContaining({ Prefix: 'prefix/' }));
    expect(result).toEqual([{ key: 'a', size: 3, uploadedAt: '2026-01-01T00:00:00.000Z', etag: '"etag"' }]);
  });
});

describe('selectStorageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("'r2' builds an S3-backed client", () => {
    MockedS3Client.mockImplementation(() => ({ send: jest.fn() }) as never);
    selectStorageClient('r2');
    expect(MockedS3Client).toHaveBeenCalledTimes(1);
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  test("'wrangler-dev' builds an axios-backed client", () => {
    mockedAxios.create.mockReturnValue({ get: jest.fn(), put: jest.fn(), delete: jest.fn() } as never);
    selectStorageClient('wrangler-dev');
    expect(mockedAxios.create).toHaveBeenCalledTimes(1);
    expect(MockedS3Client).not.toHaveBeenCalled();
  });
});
