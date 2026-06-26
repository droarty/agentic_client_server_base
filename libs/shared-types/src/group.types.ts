export type GroupRole = 'owner' | 'admin' | 'member';
export type ArtifactAccess = 'read' | 'write' | 'admin';

export interface Group {
  _id: string;
  name: string;
  parentGroupId?: string;
  ancestors: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  _id: string;
  userId: string;
  groupId: string;
  roles: GroupRole[];
  joinedAt: string;
}

export interface MembershipWithUser extends Membership {
  user: { _id: string; email: string };
}

export interface ArtifactPermission {
  groupId: string;
  access: ArtifactAccess;
}

export interface CreateGroupRequest {
  name: string;
  parentGroupId?: string;
}

export interface AddMemberRequest {
  userId: string;
  roles: GroupRole[];
}

export interface UpdateMemberRequest {
  roles: GroupRole[];
}
