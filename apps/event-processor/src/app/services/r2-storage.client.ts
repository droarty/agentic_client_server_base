import axios from 'axios';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { env } from '../config/env';

export interface StorageObjectMetadata {
  key: string;
  size: number;
  uploadedAt: string;
  etag?: string;
}

export interface StorageClient {
  uploadObject(key: string, body: Buffer, contentType?: string): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix?: string): Promise<StorageObjectMetadata[]>;
}

// Backs onto apps/r2-dev-gateway (a local-only Cloudflare Worker run via
// `wrangler dev`) — the only way to reach Wrangler's local R2 emulation,
// since that emulation only exists inside a Workers runtime, not as a raw
// HTTP/S3 endpoint.
export function createWranglerDevStorageClient(): StorageClient {
  const http = axios.create({ baseURL: env.R2_DEV_GATEWAY_URL, timeout: 10000 });

  return {
    async uploadObject(key, body, contentType) {
      await http.put(`/objects/${encodeURIComponent(key)}`, body, {
        headers: contentType ? { 'content-type': contentType } : undefined,
      });
    },

    async getObject(key) {
      try {
        const { data } = await http.get<ArrayBuffer>(`/objects/${encodeURIComponent(key)}`, {
          responseType: 'arraybuffer',
        });
        return Buffer.from(data);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },

    async deleteObject(key) {
      await http.delete(`/objects/${encodeURIComponent(key)}`);
    },

    async listObjects(prefix) {
      const { data } = await http.get<StorageObjectMetadata[]>('/objects', { params: { prefix } });
      return data;
    },
  };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createR2StorageClient(): StorageClient {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    async uploadObject(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
    },

    async getObject(key) {
      try {
        const { Body } = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
        return await streamToBuffer(Body as Readable);
      } catch (err) {
        if (err instanceof Error && err.name === 'NoSuchKey') {
          return null;
        }
        throw err;
      }
    },

    async deleteObject(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
    },

    async listObjects(prefix) {
      const { Contents } = await s3.send(
        new ListObjectsV2Command({ Bucket: env.R2_BUCKET_NAME, Prefix: prefix })
      );
      return (Contents ?? []).map((object) => ({
        key: object.Key ?? '',
        size: object.Size ?? 0,
        uploadedAt: (object.LastModified ?? new Date()).toISOString(),
        etag: object.ETag,
      }));
    },
  };
}

export function selectStorageClient(backend: 'wrangler-dev' | 'r2'): StorageClient {
  return backend === 'r2' ? createR2StorageClient() : createWranglerDevStorageClient();
}

export const storageClient: StorageClient = selectStorageClient(env.STORAGE_BACKEND);

// StorageClient mirrors the R2Bucket API surface (all async) — URL
// construction is sync and has no R2Bucket equivalent, so it stays a
// standalone export rather than an interface method.
//
// wrangler-dev's gateway is a plain, unauthenticated HTTP server reachable
// from both event-processor and the browser at the same localhost URL in
// dev — no signed URL or proxy needed. Real R2 has no public URL without
// extra setup (custom domain / public bucket) that hasn't been configured,
// so fail loudly there rather than hand back a URL that won't actually load.
export function getStorageObjectUrl(key: string): string {
  if (env.STORAGE_BACKEND === 'wrangler-dev') {
    return `${env.R2_DEV_GATEWAY_URL}/objects/${encodeURIComponent(key)}`;
  }
  throw new Error("getStorageObjectUrl is not supported for the 'r2' backend yet");
}
