interface UserRecord {
  _id: string;
  email: string;
}

interface Props {
  users?: UserRecord[];
  onAddUser?: (payload: { users: UserRecord[] }) => void;
  [key: string]: unknown;
}

export function InviteUsers({ users = [], onAddUser }: Props) {
  const handleAdd = (user: UserRecord) => {
    if (onAddUser) {
      onAddUser({ users: [...users, user] });
    }
  };

  return (
    <div className="invite-users">
      <h4>Users</h4>
      {users.length === 0 ? (
        <p className="doc-empty">No users invited yet.</p>
      ) : (
        <ul className="user-list">
          {users.map((u) => (
            <li key={u._id} className="user-item">{u.email}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
