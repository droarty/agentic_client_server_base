export interface Env {
  STORAGE_BUCKET: R2Bucket;
}

const OBJECTS_PREFIX = '/objects/';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/objects') {
      const prefix = url.searchParams.get('prefix') ?? undefined;
      const listed = await env.STORAGE_BUCKET.list({ prefix });
      const objects = listed.objects.map((object) => ({
        key: object.key,
        size: object.size,
        uploadedAt: object.uploaded.toISOString(),
        etag: object.etag,
      }));
      return new Response(JSON.stringify(objects), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname.startsWith(OBJECTS_PREFIX)) {
      const key = decodeURIComponent(url.pathname.slice(OBJECTS_PREFIX.length));
      if (!key) {
        return new Response('Missing object key', { status: 400 });
      }

      if (request.method === 'PUT') {
        const contentType = request.headers.get('content-type') ?? undefined;
        await env.STORAGE_BUCKET.put(key, request.body, {
          httpMetadata: contentType ? { contentType } : undefined,
        });
        return new Response(null, { status: 204 });
      }

      if (request.method === 'GET') {
        const object = await env.STORAGE_BUCKET.get(key);
        if (!object) {
          return new Response('Not found', { status: 404 });
        }
        const headers = new Headers();
        if (object.httpMetadata?.contentType) {
          headers.set('content-type', object.httpMetadata.contentType);
        }
        return new Response(object.body, { headers });
      }

      if (request.method === 'DELETE') {
        await env.STORAGE_BUCKET.delete(key);
        return new Response(null, { status: 204 });
      }

      return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });
  },
};
