import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { getMembership } from '../services/group.service';
import {
  listGroups, createGroup, getGroup,
  listMembers, addMember, updateMember, removeMember,
  listSubgroups, getGroupDashboard,
} from '../controllers/group.controller';

export const groupRoutes = Router();

groupRoutes.use(authMiddleware);

groupRoutes.get('/',  listGroups);
groupRoutes.post('/', createGroup);

async function requireMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const membership = await getMembership(req.params['id'], req.userId!);
  if (!membership) {
    res.status(403).json({ message: 'Forbidden: not a member of this group' });
    return;
  }
  next();
}

async function requireAdminOrOwner(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const membership = await getMembership(req.params['id'], req.userId!);
  if (!membership || !membership.roles.some((r) => r === 'admin' || r === 'owner')) {
    res.status(403).json({ message: 'Forbidden: admin or owner role required' });
    return;
  }
  next();
}

groupRoutes.get('/:id/dashboard',   requireMember,       getGroupDashboard);
groupRoutes.get('/:id',             requireMember,       getGroup);
groupRoutes.get('/:id/subgroups',   requireMember,       listSubgroups);
groupRoutes.get('/:id/members',     requireMember,       listMembers);
groupRoutes.post('/:id/members',               requireAdminOrOwner, addMember);
groupRoutes.patch('/:id/members/:userId',      requireAdminOrOwner, updateMember);
groupRoutes.delete('/:id/members/:userId',     requireAdminOrOwner, removeMember);
