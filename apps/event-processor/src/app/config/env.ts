export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PROCESSOR_PORT: parseInt(process.env['PROCESSOR_PORT'] || '3001', 10),
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5433/agentic_client_server_base',
  REDIS_URL: process.env['REDIS_URL'] || 'redis://localhost:6379',
  AI_SERVICE_TYPE: (process.env['AI_SERVICE_TYPE'] || 'anthropic') as 'anthropic' | 'openai',
  ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] || '',
  OPENAI_API_KEY: process.env['OPENAI_API_KEY'] || '',
  INTERNAL_SERVICE_TOKEN: process.env['INTERNAL_SERVICE_TOKEN'] || '',
  // Duplicated from apps/api's env (same Google Cloud project) — needed here
  // to refresh a user's Google Photos access token before calling the
  // Picker API. See google-photos-picker.client.ts.
  GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'] || '',
  GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'] || '',
  // Object storage: 'wrangler-dev' routes through apps/r2-dev-gateway (a
  // local-only Worker run via `wrangler dev`) for local development;
  // 'r2' talks to the real Cloudflare R2 S3-compatible endpoint.
  STORAGE_BACKEND: (process.env['STORAGE_BACKEND'] || 'wrangler-dev') as 'wrangler-dev' | 'r2',
  R2_DEV_GATEWAY_URL: process.env['R2_DEV_GATEWAY_URL'] || 'http://localhost:8787',
  R2_ACCOUNT_ID: process.env['R2_ACCOUNT_ID'] || '',
  R2_ACCESS_KEY_ID: process.env['R2_ACCESS_KEY_ID'] || '',
  R2_SECRET_ACCESS_KEY: process.env['R2_SECRET_ACCESS_KEY'] || '',
  R2_BUCKET_NAME: process.env['R2_BUCKET_NAME'] || '',
} as const;

// A shared secret authenticates the gateway's calls to POST /internal/events.
// An empty token in production would make that endpoint effectively open —
// refuse to boot rather than silently run unauthenticated.
if (env.NODE_ENV === 'production' && !env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN must be set in production');
}

// STORAGE_BACKEND=wrangler-dev talks to a localhost-only dev gateway that
// doesn't exist in staging/prod — refuse to boot in production unless
// explicitly pointed at real R2 with full credentials, rather than silently
// falling back to an unreachable localhost URL.
if (env.NODE_ENV === 'production') {
  if (env.STORAGE_BACKEND !== 'r2') {
    throw new Error("STORAGE_BACKEND must be 'r2' in production");
  }
  const missingR2Vars = (['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'] as const).filter(
    (key) => !env[key]
  );
  if (missingR2Vars.length > 0) {
    throw new Error(`Missing required R2 env vars in production: ${missingR2Vars.join(', ')}`);
  }
}
