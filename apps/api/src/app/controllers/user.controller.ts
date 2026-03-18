import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { getAllUsers, getUserById, updateUser } from '../services/user.service';
import { serializeUser } from '../services/auth.service';

export async function getUsers(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json(serializeUser(user));
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const user = await updateUser(req.userId!, { email, currentPassword, newPassword });
    res.json(serializeUser(user));
  } catch (err) {
    next(err);
  }
}
