import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { GroupRole } from '../models/membership.model';
import * as groupService from '../services/group.service';

const VALID_ROLES: GroupRole[] = ['owner', 'admin', 'member'];

function validateRoles(roles: unknown): roles is GroupRole[] {
  return Array.isArray(roles) && roles.length > 0 && roles.every((r) => VALID_ROLES.includes(r));
}

export async function listGroups(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const groups = await groupService.getGroupsForUser(req.userId!);
    res.json(groups);
  } catch (err) {
    next(err);
  }
}

export async function createGroup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    const group = await groupService.createGroup(name.trim(), req.userId!);
    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
}

export async function getGroup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const group = await groupService.getGroupById(req.params['id']);
    if (!group) {
      res.status(404).json({ message: 'Group not found' });
      return;
    }
    res.json(group);
  } catch (err) {
    next(err);
  }
}

export async function listMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const members = await groupService.getMembers(req.params['id']);
    res.json(members);
  } catch (err) {
    next(err);
  }
}

export async function addMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, roles } = req.body;
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ message: 'userId is required' });
      return;
    }
    if (!validateRoles(roles)) {
      res.status(400).json({ message: 'roles must be a non-empty array of valid group roles' });
      return;
    }
    const membership = await groupService.addMember(req.params['id'], userId, roles);
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
}

export async function updateMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { roles } = req.body;
    if (!validateRoles(roles)) {
      res.status(400).json({ message: 'roles must be a non-empty array of valid group roles' });
      return;
    }
    const membership = await groupService.updateMemberRoles(req.params['id'], req.params['userId'], roles);
    res.json(membership);
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await groupService.removeMember(req.params['id'], req.params['userId']);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
