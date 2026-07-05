import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GroupBreadcrumbItem } from '@agentic-client-server-base/shared-types';
import { apiGetGroupBreadcrumb } from '../services/api';

interface GroupBreadcrumbsProps {
  groupId: string;
}

const MAX_VISIBLE_GROUPS = 3;

function buildVisibleGroups(groups: GroupBreadcrumbItem[]): (GroupBreadcrumbItem | null)[] {
  if (groups.length <= MAX_VISIBLE_GROUPS) {
    return groups;
  }
  return [groups[0], null, groups[groups.length - 2], groups[groups.length - 1]];
}

export function GroupBreadcrumbs({ groupId }: GroupBreadcrumbsProps) {
  const [groups, setGroups] = useState<GroupBreadcrumbItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGroups(null);
    apiGetGroupBreadcrumb(groupId).then((data) => {
      if (!cancelled) {
        setGroups(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!groups) {
    return null;
  }

  const visibleGroups = buildVisibleGroups(groups);

  return (
    <nav className="group-breadcrumbs" aria-label="Breadcrumb">
      <Link to="/user">user</Link>
      {visibleGroups.map((group, i) => (
        <span key={group ? group._id : `ellipsis-${i}`}>
          <span className="breadcrumb-separator"> / </span>
          {group ? <Link to={`/group/${group._id}`}>{group.name}</Link> : <span>&hellip;</span>}
        </span>
      ))}
    </nav>
  );
}
