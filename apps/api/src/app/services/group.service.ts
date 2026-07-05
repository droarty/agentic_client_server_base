import { Types } from 'mongoose';
import { Group, IGroup } from '../models/group.model';
import { Membership, IMembership, GroupRole } from '../models/membership.model';

export async function createGroup(name: string, creatorUserId: string, parentGroupId?: string): Promise<IGroup> {
  let ancestors: Types.ObjectId[] = [];
  let parentId: Types.ObjectId | undefined;

  if (parentGroupId) {
    const parent = await Group.findById(parentGroupId, { ancestors: 1 });
    if (!parent) {
      const err = new Error('Parent group not found') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    parentId = parent._id as Types.ObjectId;
    ancestors = [...(parent.ancestors as Types.ObjectId[]), parentId];
  }

  const group = await Group.create({ name, parentGroupId: parentId ?? null, ancestors });
  await Membership.create({
    userId: new Types.ObjectId(creatorUserId),
    groupId: group._id,
    roles: ['owner'],
  });
  return group;
}

export async function getGroupsForUser(userId: string): Promise<IGroup[]> {
  const memberships = await Membership.find({ userId: new Types.ObjectId(userId) }, { groupId: 1 });
  const groupIds = memberships.map((m) => m.groupId);
  return Group.find({ _id: { $in: groupIds } }).sort({ createdAt: -1 });
}

export async function getSubgroups(parentGroupId: string): Promise<IGroup[]> {
  return Group.find({ parentGroupId: new Types.ObjectId(parentGroupId) }).sort({ createdAt: -1 });
}

export async function getGroupById(id: string): Promise<IGroup | null> {
  return Group.findById(id);
}

export async function getGroupBreadcrumb(id: string): Promise<{ _id: string; name: string }[]> {
  const group = await Group.findById(id, { name: 1, ancestors: 1 });
  if (!group) {
    const err = new Error('Group not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const ancestorIds = group.ancestors as Types.ObjectId[];
  const ancestorGroups = ancestorIds.length
    ? await Group.find({ _id: { $in: ancestorIds } }, { name: 1 })
    : [];
  const ancestorsById = new Map(ancestorGroups.map((g) => [(g._id as Types.ObjectId).toString(), g]));
  const orderedAncestors = ancestorIds
    .map((id) => ancestorsById.get(id.toString()))
    .filter((g) => g != null);

  return [...orderedAncestors, group].map((g) => ({
    _id: (g._id as Types.ObjectId).toString(),
    name: g.name,
  }));
}

export async function getMembership(groupId: string, userId: string): Promise<IMembership | null> {
  return Membership.findOne({
    groupId: new Types.ObjectId(groupId),
    userId:  new Types.ObjectId(userId),
  });
}

export async function getMembers(groupId: string) {
  return Membership.find({ groupId: new Types.ObjectId(groupId) }).populate<{
    userId: { _id: Types.ObjectId; email: string };
  }>('userId', '_id email');
}

export async function addMember(groupId: string, userId: string, roles: GroupRole[]): Promise<IMembership> {
  const existing = await getMembership(groupId, userId);
  if (existing) {
    const err = new Error('User is already a member') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }
  return Membership.create({
    userId:  new Types.ObjectId(userId),
    groupId: new Types.ObjectId(groupId),
    roles,
  });
}

export async function updateMemberRoles(groupId: string, userId: string, roles: GroupRole[]): Promise<IMembership> {
  const membership = await getMembership(groupId, userId);
  if (!membership) {
    const err = new Error('Membership not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  membership.roles = roles;
  await membership.save();
  return membership;
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const result = await Membership.deleteOne({
    groupId: new Types.ObjectId(groupId),
    userId:  new Types.ObjectId(userId),
  });
  if (result.deletedCount === 0) {
    const err = new Error('Membership not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
}
