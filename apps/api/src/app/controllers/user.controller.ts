import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { getAllUsers, getUserById, updateUser, setUserRoles } from '../services/user.service';
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

export async function updateUserRoles(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { roles } = req.body;

    if (!Array.isArray(roles)) {
      res.status(400).json({ message: 'roles must be an array' });
      return;
    }

    const validRoles = ['user', 'author', 'admin'];
    const invalid = roles.filter((r: string) => !validRoles.includes(r));
    if (invalid.length > 0) {
      res.status(400).json({ message: `Invalid roles: ${invalid.join(', ')}` });
      return;
    }

    const user = await setUserRoles(id, roles);
    res.json(serializeUser(user));
  } catch (err) {
    next(err);
  }
}
