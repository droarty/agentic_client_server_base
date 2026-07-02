import { Link } from 'react-router-dom';

interface Props {
  name?: string;
  id?: string;
}

export function GroupNavItem({ name, id }: Props) {
  if (!name || !id) return null;
  return (
    <Link to={`/group/${id}`} className="group-nav">
      {name}
    </Link>
  );
}
