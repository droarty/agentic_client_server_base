export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  MONGODB_URI: process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base',
  JWT_SECRET: process.env['JWT_SECRET'] || 'dev-secret-change-in-production',
  JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] || '7d',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:4200',
  CLIENT_URL: process.env['CLIENT_URL'] || 'http://localhost:4200',
  GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'] || '',
  GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'] || '',
  GOOGLE_CALLBACK_URL: process.env['GOOGLE_CALLBACK_URL'] || 'http://localhost:3000/api/auth/google/callback',
} as const;
