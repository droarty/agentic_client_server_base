import express, { Application } from 'express';
import cors from 'cors';
import passport from 'passport';
import { authRoutes } from './routes/auth.routes';
import { userRoutes } from './routes/user.routes';
import { documentRoutes } from './routes/document.routes';
import { groupRoutes } from './routes/group.routes';
import { uploadRoutes } from './routes/upload.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { configurePassport } from './config/passport';
import { env } from './config/env';
import { authMiddleware, AuthRequest } from './middleware/auth.middleware';
import { StructuredAssetModel } from './models/structured-asset.model';

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
  app.use('/api/documents', uploadRoutes);

  app.get('/api/structured-assets', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const { category } = req.query as { category?: string };
      const filter = category ? { category } : {};
      const assets = await StructuredAssetModel
        .find(filter, { data: 0 })
        .sort({ category: 1, name: 1, assetVersion: -1 });
      res.json(assets);
    } catch (err) {
      next(err);
    }
  });

  app.use(errorMiddleware);

  return app;
}
