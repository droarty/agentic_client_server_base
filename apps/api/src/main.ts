import 'dotenv/config';
import { createApp } from './app/app';
import { connectDB } from './app/db/connect';
import { env } from './app/config/env';

async function bootstrap() {
  await connectDB();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`API server listening on port ${env.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
