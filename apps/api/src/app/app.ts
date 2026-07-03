import express, { Application } from 'express';
import cors from 'cors';
import passport from 'passport';
import { authRoutes } from './routes/auth.routes';
import { userRoutes } from './routes/user.routes';
import { documentRoutes } from './routes/document.routes';
import { groupRoutes } from './routes/group.routes';
import { workflowRoutes } from './routes/workflow.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { configurePassport } from './config/passport';
import { env } from './config/env';

export function createApp(): Application {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  configurePassport();
  app.use(passport.initialize());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/workflow', workflowRoutes);

  app.use(errorMiddleware);

  return app;
}
