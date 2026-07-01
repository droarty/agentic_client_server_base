import { Link } from 'react-router-dom';

interface Props {
  name?: string;
  id?: string;
}

export function GroupNavItem({ name, id }: Props) {
  if (!name || !id) return null;
  return (
    <Link
      to={`/group/${id}`}
      className="block px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
    >
      {name}
    </Link>
  );
}
