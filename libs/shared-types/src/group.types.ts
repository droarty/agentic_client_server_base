export type GroupRole = 'owner' | 'admin' | 'member';

export interface Group {
  _id: string;
  name: string;
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

export interface CreateGroupRequest {
  name: string;
}

export interface AddMemberRequest {
  userId: string;
  roles: GroupRole[];
}

export interface UpdateMemberRequest {
  roles: GroupRole[];
}
