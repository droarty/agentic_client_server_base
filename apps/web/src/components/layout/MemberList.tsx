import { GroupRole } from '@agentic-client-server-base/shared-types';
import { Button } from '@/components/ui/button';

interface MemberItem {
  _id: string;
  email: string;
  roles: GroupRole[];
}

interface Props {
  items?: MemberItem[];
  currentUserRoles?: GroupRole[];
  onRemove?: (payload: { _id: string }) => void;
  onRoleChange?: (payload: { _id: string; role: GroupRole }) => void;
}

export function MemberList({ items = [], currentUserRoles = [], onRemove, onRoleChange }: Props) {
  const canManage = currentUserRoles.includes('owner') || currentUserRoles.includes('admin');

  if (items.length === 0) {
    return <p className="member-empty">No members yet.</p>;
  }

  return (
    <ul className="member-list">
      {items.map((member) => {
        const isOwner = member.roles.includes('owner');
        const isAdmin = member.roles.includes('admin');
        return (
          <li key={member._id} className="member-list-item">
            <span className="member-email">{member.email}</span>
            <span className="member-role"> ({member.roles.join(', ')})</span>
            {canManage && !isOwner && (
              <>
                {' '}
                <Button onClick={() => onRoleChange?.({ _id: member._id, role: isAdmin ? 'member' : 'admin' })}>
                  {isAdmin ? 'Demote to Member' : 'Promote to Admin'}
                </Button>
                {' '}
                <Button onClick={() => onRemove?.({ _id: member._id })}>
                  Remove
                </Button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
