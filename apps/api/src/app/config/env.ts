export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  MONGODB_URI: process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base',
  JWT_SECRET: process.env['JWT_SECRET'] || 'dev-secret-change-in-production',
  JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] || '7d',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:4200',
} as const;
