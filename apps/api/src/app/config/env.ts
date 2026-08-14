export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5433/agentic_client_server_base',
  JWT_SECRET: process.env['JWT_SECRET'] || 'dev-secret-change-in-production',
  JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] || '7d',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:4200',
  CLIENT_URL: process.env['CLIENT_URL'] || 'http://localhost:4200',
  GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'] || '',
  GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'] || '',
  GOOGLE_CALLBACK_URL: process.env['GOOGLE_CALLBACK_URL'] || 'http://localhost:3000/api/auth/google/callback',
  REDIS_URL: process.env['REDIS_URL'] || 'redis://localhost:6379',
  AI_SERVICE_TYPE: (process.env['AI_SERVICE_TYPE'] || 'anthropic') as 'anthropic' | 'openai',
  ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] || '',
  OPENAI_API_KEY: process.env['OPENAI_API_KEY'] || '',
  EVENT_PROCESSOR_URL: process.env['EVENT_PROCESSOR_URL'] || 'http://localhost:3001',
  INTERNAL_SERVICE_TOKEN: process.env['INTERNAL_SERVICE_TOKEN'] || '',
} as const;

// Shared secret the gateway attaches to its calls to the event-processor's
// POST /internal/events. An empty token in production would make that
// endpoint effectively open — refuse to boot rather than silently run
// unauthenticated. Both services must be configured with the same value.
if (env.NODE_ENV === 'production' && !env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN must be set in production');
}
