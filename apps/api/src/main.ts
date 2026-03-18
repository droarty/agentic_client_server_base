import 'dotenv/config';
import { createServer } from 'http';
import { createApp } from './app/app';
import { connectDB } from './app/db/connect';
import { UserEventManager } from './app/websocket/UserEventManager';
import { env } from './app/config/env';

async function bootstrap() {
  await connectDB();

  const app = createApp();
  const server = createServer(app);

  new UserEventManager(server);

  server.listen(env.PORT, () => {
    console.log(`API server listening on port ${env.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
