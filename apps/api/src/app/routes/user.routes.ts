import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { getUsers, getMe, updateMe, updateUserRoles } from '../controllers/user.controller';

export const userRoutes = Router();

userRoutes.use(authMiddleware);

userRoutes.get('/', getUsers);
userRoutes.get('/me', getMe);
userRoutes.patch('/me', updateMe);
userRoutes.patch('/:id/roles', requireRole('admin'), updateUserRoles);
