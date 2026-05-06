import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getUsers, getMe, updateMe } from '../controllers/user.controller';

export const userRoutes = Router();

userRoutes.use(authMiddleware);

userRoutes.get('/', getUsers);
userRoutes.get('/me', getMe);
userRoutes.patch('/me', updateMe);
