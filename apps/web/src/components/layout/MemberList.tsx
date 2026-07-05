import { GroupRole } from '@agentic-client-server-base/shared-types';
import { Button } from '@/components/ui/button';

interface MemberItem {
  _id: string;
  email: string;
  roles: GroupRole[];
}

interface Props {
  items?: MemberItem[];
  isAdmin?: boolean;
  onRemove?: (payload: { _id: string }) => void;
  onRoleChange?: (payload: { _id: string; role: GroupRole }) => void;
}

export function MemberList({ items = [], isAdmin = false, onRemove, onRoleChange }: Props) {
  if (items.length === 0) {
    return <p className="member-empty">No members yet.</p>;
  }

  return (
    <ul className="member-list">
      {items.map((member) => {
        const isOwner = member.roles.includes('owner');
        const isRowAdmin = member.roles.includes('admin');
        return (
          <li key={member._id} className="member-list-item">
            <span className="member-email">{member.email}</span>
            <span className="member-role"> ({member.roles.join(', ')})</span>
            {isAdmin && !isOwner && (
              <>
                {' '}
                <Button onClick={() => onRoleChange?.({ _id: member._id, role: isRowAdmin ? 'member' : 'admin' })}>
                  {isRowAdmin ? 'Demote to Member' : 'Promote to Admin'}
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
