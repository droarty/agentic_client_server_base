import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './libs/db-schema/src/schema/index.ts',
  out: './libs/db-schema/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5433/agentic_client_server_base',
  },
});
