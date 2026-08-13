export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PROCESSOR_PORT: parseInt(process.env['PROCESSOR_PORT'] || '3001', 10),
  MONGODB_URI: process.env['MONGODB_URI'] || 'mongodb://localhost:27017/agentic_client_server_base',
  REDIS_URL: process.env['REDIS_URL'] || 'redis://localhost:6379',
  AI_SERVICE_TYPE: (process.env['AI_SERVICE_TYPE'] || 'anthropic') as 'anthropic' | 'openai',
  ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] || '',
  OPENAI_API_KEY: process.env['OPENAI_API_KEY'] || '',
  INTERNAL_SERVICE_TOKEN: process.env['INTERNAL_SERVICE_TOKEN'] || '',
} as const;

// A shared secret authenticates the gateway's calls to POST /internal/events.
// An empty token in production would make that endpoint effectively open —
// refuse to boot rather than silently run unauthenticated.
if (env.NODE_ENV === 'production' && !env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN must be set in production');
}
