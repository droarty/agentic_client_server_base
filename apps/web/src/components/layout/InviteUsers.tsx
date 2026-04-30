import { useState } from 'react';

interface UserRecord {
  _id: string;
  email: string;
}

interface Props {
  users?: UserRecord[];
  allUsers?: UserRecord[];
  onAddUser?: (payload: { users: UserRecord[] }) => void;
  [key: string]: unknown;
}

export function InviteUsers({ users = [], allUsers = [], onAddUser }: Props) {
  const invitedIds = new Set(users.map((u) => u._id));
  const available = allUsers.filter((u) => !invitedIds.has(u._id));
  const [selectedId, setSelectedId] = useState('');

  const handleAdd = () => {
    const user = available.find((u) => u._id === selectedId);
    if (!user || !onAddUser) return;
    onAddUser({ users: [...users, user] });
    setSelectedId('');
  };

  return (
    <div className="invite-users">
      <h4>Users with access</h4>
      {users.length === 0 ? (
        <p className="doc-empty">No users invited yet.</p>
      ) : (
        <ul className="user-list">
          {users.map((u) => (
            <li key={u._id} className="user-item">{u.email}</li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <div className="invite-users__add">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="invite-users__select"
          >
            <option value="">Select a user…</option>
            {available.map((u) => (
              <option key={u._id} value={u._id}>{u.email}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedId}
            className="btn-secondary"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
